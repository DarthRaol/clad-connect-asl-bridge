/**
 * TemplateRecorder — capture reference poses for ASL fingerspelling.
 *
 * Shows a target letter, captures N normalized 78-dim samples per letter on a
 * pinch, and emits the whole set as JSON for Assets/Data/templates.json.
 *
 * ---------------------------------------------------------------------------
 * THREE THINGS THE OPERATOR NEEDS TO KNOW
 * ---------------------------------------------------------------------------
 *
 * 1. TWO HANDS BY DEFAULT. The hand that pinches is NOT the hand being
 *    recorded. Pinching is itself a handshape — if the signing hand pinched to
 *    trigger the capture, every sample would be a corrupted blend of the target
 *    letter and a pinch. So: sign with `signingHand`, pinch with `triggerHand`.
 *    For one-handed recording set `captureDelaySeconds` above 0 and set
 *    triggerHand === signingHand: pinch, release, re-form the letter, and the
 *    capture fires after the delay.
 *
 * 2. YOU MUST RE-FORM THE LETTER BETWEEN SAMPLES. The recorder will not accept
 *    a second sample until your hand has visibly left the pose. This is not
 *    fussiness — see the sampling note below. Drop the hand, shake it out, form
 *    the letter again, pinch again.
 *
 * 3. THIS SCRIPT CANNOT WRITE THE JSON FILE ITSELF. Lens runtime scripts are
 *    sandboxed — there is no filesystem API. Samples are held in memory,
 *    mirrored into persistent storage so a crash or restart does not lose the
 *    session, and printed to the log between TEMPLATES_BEGIN / TEMPLATES_END
 *    markers. Recover them with RunAndCollectLogsTool and write the file from
 *    there. Nothing is lost if the Lens is closed — reopening restores progress.
 *
 * ---------------------------------------------------------------------------
 * WHY THE SAMPLING RULES EXIST
 * ---------------------------------------------------------------------------
 *
 * These templates feed `perLandmarkDiscriminability`, whose Fisher ratio is
 * between-letter variance over WITHIN-letter variance. Anything that shrinks
 * within-letter variance inflates every ratio and produces thresholds that look
 * excellent here and are far too strict on a real hand. Two ways that happens:
 *
 *   FRAME REUSE. Keypoint.position is frame-cached by SIK (docs/JOINTS.md), so
 *   two captures in the same frame return byte-identical positions — within-
 *   letter variance of exactly zero. Every capture is therefore routed through
 *   UpdateEvent and gated on a frame counter, so no two samples can share a
 *   frame. This is a hard guarantee, not a heuristic.
 *
 *   HELD POSES. Pinching five times without moving measures sensor noise, not
 *   the variation a person actually produces re-forming a letter. That is the
 *   bigger error of the two, and it is what `requireReformBetweenSamples`
 *   prevents: after each capture the live pose must move at least
 *   `reformThreshold` away from what was just stored before the next sample is
 *   accepted. The live distance is shown on screen so the threshold can be
 *   tuned from what real re-forming actually produces.
 *
 * On completion each letter's within-variance is checked and a warning is
 * logged if it is near zero — that means duplicated or held samples, never
 * perfect tracking.
 *
 * Attach to any SceneObject. Wire `statusText` to a Text component the operator
 * can read.
 */

import {HandInputData} from "SpectaclesInteractionKit.lspkg/Providers/HandInputData/HandInputData"
import type {BaseHand} from "SpectaclesInteractionKit.lspkg/Providers/HandInputData/BaseHand"
import type {HandType} from "SpectaclesInteractionKit.lspkg/Providers/HandInputData/HandType"
import {FEATURE_DIM, LANDMARK_COUNT, LANDMARK_ORDER, normalizeTrackedHand} from "./LandmarkCapture"

/** Schema version written into templates.json. Bump on any shape change. */
const TEMPLATE_FORMAT_VERSION = 1

/** Key prefix for per-letter persistence in persistentStorageSystem. */
const STORE_PREFIX = "tpl_"

/** Decimal places kept per float. Values sit in roughly -3..3, so 4 is ample. */
const ROUND_FACTOR = 10000

/** How long the "RECORDED" confirmation stays up, in seconds. */
const CONFIRM_SECONDS = 0.9

/** Ignore pinches this close together, to swallow accidental double-triggers. */
const PINCH_COOLDOWN_SECONDS = 0.35

/**
 * Mean per-dim within-letter variance below this is reported as suspicious.
 * Genuine re-forming variation lands orders of magnitude above it; duplicated
 * samples give exactly 0 and a held pose gives something very close to it.
 */
const WITHIN_VARIANCE_WARN = 1e-5

type RecorderState = "waiting" | "arming" | "confirming" | "finished"

@component
export class TemplateRecorder extends BaseScriptComponent {
  @input
  @hint("Letters to record, in order. J and Z are omitted by default: they are motion letters, not static handshapes.")
  letters: string = "ABCDEFGHIKLMNOPQRSTUVWXY"

  @input
  @hint("How many samples to capture per letter. 5-10 is a reasonable range.")
  samplesPerLetter: number = 5

  @input
  @hint("Large text the operator reads. Shows the target letter, the counter, and the RECORDED confirmation.")
  statusText: Text

  @input
  @hint("The hand that FORMS the letter. Its landmarks are what get recorded.")
  @widget(new ComboBoxWidget([new ComboBoxItem("right"), new ComboBoxItem("left")]))
  signingHand: string = "right"

  @input
  @hint("The hand that PINCHES to trigger a capture. Keep it different from signingHand — see the header comment.")
  @widget(new ComboBoxWidget([new ComboBoxItem("left"), new ComboBoxItem("right")]))
  triggerHand: string = "left"

  @input
  @hint("Seconds between the pinch and the capture. 0 = instant (two-hand mode). Set 2-3 for one-handed recording.")
  captureDelaySeconds: number = 0

  @input
  @hint(
    "Require the hand to leave the pose between samples. Leave ON — turning it off makes within-letter variance measure sensor noise only, which inflates Fisher ratios."
  )
  requireReformBetweenSamples: boolean = true

  @input
  @hint(
    "How far the live pose must move from the last capture before the next sample is accepted (Euclidean, normalized units). The live value is shown on screen — tune from what real re-forming produces."
  )
  reformThreshold: number = 0.6

  @input
  @allowUndefined
  @hint("Optional. Plays on each successful capture — useful when the operator is watching their hands, not the text.")
  confirmAudio: AudioComponent

  @input
  @hint("Reload samples saved in a previous session. Turn OFF to start a clean recording run.")
  resumePreviousSession: boolean = true

  private handProvider = HandInputData.getInstance()
  private signing: BaseHand
  private trigger: BaseHand

  /** letter -> array of samples, each a plain number[] of length FEATURE_DIM. */
  private samples: {[letter: string]: number[][]} = {}

  private letterList: string[] = []
  private letterIndex = 0
  private state: RecorderState = "waiting"
  private timer = 0
  private lastPinchTime = -999
  private lastMessage = ""

  /** Frame identity — SIK caches Keypoint.position per frame, so this matters. */
  private frameCounter = 0
  private lastCaptureFrame = -1
  private pendingCapture = false

  /** Re-form gate state. */
  private lastCapturedVector: Float32Array | null = null
  private reformSatisfied = true
  private liveDistance = 0

  /** Reused so the per-frame paths do not allocate. */
  private scratch = new Float32Array(FEATURE_DIM)
  private scratchLive = new Float32Array(FEATURE_DIM)

  onAwake() {
    // Handle acquisition belongs in onAwake; .add() subscriptions go in
    // OnStartEvent. See the SIK init-order rule.
    this.signing = this.handProvider.getHand(this.signingHand as HandType)
    this.trigger = this.handProvider.getHand(this.triggerHand as HandType)

    this.letterList = this.parseLetters(this.letters)
    if (this.letterList.length === 0) {
      this.setText("NO LETTERS CONFIGURED\nSet the 'letters' input.")
      return
    }
    if (this.samplesPerLetter < 1) {
      this.samplesPerLetter = 1
    }

    for (let i = 0; i < this.letterList.length; i++) {
      this.samples[this.letterList[i]] = []
    }

    if (this.resumePreviousSession) {
      this.loadFromStorage()
    } else {
      this.clearStorage()
    }

    this.letterIndex = this.firstIncompleteIndex()

    if (this.signingHand === this.triggerHand && this.captureDelaySeconds <= 0) {
      print(
        "TemplateRecorder WARNING: signingHand and triggerHand are the same and captureDelaySeconds is 0. " +
          "Every sample will record a pinch, not the target letter. Set captureDelaySeconds to 2-3, " +
          "or use the other hand to trigger."
      )
    }
    if (!this.requireReformBetweenSamples) {
      print(
        "TemplateRecorder WARNING: requireReformBetweenSamples is OFF. Samples of a held pose measure only " +
          "sensor noise, which shrinks within-letter variance and inflates Fisher ratios. Thresholds tuned " +
          "on this data will be too strict on device."
      )
    }

    this.createEvent("UpdateEvent").bind(() => {
      this.onUpdate()
    })

    this.createEvent("OnStartEvent").bind(() => {
      this.trigger.onPinchDown.add(() => {
        this.onTriggerPinch()
      })
      this.refreshPrompt()
      this.printHeader()
    })
  }

  // -------------------------------------------------------------------------
  // Capture flow
  //
  // Every capture is deferred to UpdateEvent and gated on the frame counter,
  // so two samples can never share a frame — and therefore never share a
  // frame-cached Keypoint.position.
  // -------------------------------------------------------------------------

  private onTriggerPinch() {
    if (this.state === "finished") {
      // A pinch after completion re-emits the JSON, in case the log was missed.
      this.dumpTemplates()
      return
    }

    const now = getTime()
    if (now - this.lastPinchTime < PINCH_COOLDOWN_SECONDS) {
      return
    }
    this.lastPinchTime = now

    if (!this.isReformSatisfied()) {
      const letter = this.currentLetter()
      this.setText(
        letter +
          "\n\nRE-FORM THE LETTER\nHand has not left the last pose\n(" +
          this.liveDistance.toFixed(2) +
          " / " +
          this.reformThreshold.toFixed(2) +
          ")"
      )
      print(
        "TemplateRecorder: capture rejected for " +
          letter +
          " — hand has not left the previous pose (distance " +
          this.liveDistance.toFixed(3) +
          " < threshold " +
          this.reformThreshold.toFixed(3) +
          ")."
      )
      return
    }

    if (this.captureDelaySeconds > 0) {
      this.state = "arming"
      this.timer = this.captureDelaySeconds
      return
    }

    // Deferred rather than immediate: guarantees a distinct frame.
    this.pendingCapture = true
  }

  private onUpdate() {
    this.frameCounter++
    this.trackReformDistance()

    if (this.state === "arming") {
      this.timer -= getDeltaTime()
      if (this.timer <= 0) {
        this.pendingCapture = true
      } else {
        const secs = Math.ceil(this.timer)
        this.setText(this.currentLetter() + "\n\nHOLD STILL\n" + secs)
      }
    } else if (this.state === "confirming") {
      this.timer -= getDeltaTime()
      if (this.timer <= 0) {
        this.state = "waiting"
        this.refreshPrompt()
      }
    }

    if (this.pendingCapture && this.frameCounter !== this.lastCaptureFrame) {
      this.pendingCapture = false
      this.capture()
    }
  }

  /**
   * Distance from the live pose to the last stored sample, updated each frame.
   * Once it exceeds `reformThreshold` the hand has demonstrably left the pose
   * and the next capture is unlocked.
   */
  private trackReformDistance() {
    if (this.lastCapturedVector === null || this.reformSatisfied) {
      return
    }
    if (!this.signing.isTracked()) {
      return
    }
    const live = normalizeTrackedHand(this.signing, this.scratchLive)
    if (live === null) {
      return
    }
    let sum = 0
    for (let i = 0; i < FEATURE_DIM; i++) {
      const d = live[i] - this.lastCapturedVector[i]
      sum += d * d
    }
    this.liveDistance = Math.sqrt(sum)
    if (this.liveDistance >= this.reformThreshold) {
      this.reformSatisfied = true
      if (this.state === "waiting") {
        this.refreshPrompt()
      }
    }
  }

  private isReformSatisfied(): boolean {
    if (!this.requireReformBetweenSamples) {
      return true
    }
    return this.lastCapturedVector === null || this.reformSatisfied
  }

  private capture() {
    const letter = this.currentLetter()

    if (!this.signing.isTracked()) {
      this.state = "waiting"
      this.setText(letter + "\n\nNO HAND SEEN\nHold your " + this.signingHand + " hand up, then pinch again.")
      print("TemplateRecorder: capture skipped for " + letter + " — signing hand not tracked.")
      return
    }

    const vector = normalizeTrackedHand(this.signing, this.scratch)
    if (vector === null) {
      this.state = "waiting"
      this.setText(letter + "\n\nPOSE UNREADABLE\nOpen your hand slightly and pinch again.")
      print("TemplateRecorder: capture skipped for " + letter + " — degenerate pose (see LandmarkCapture).")
      return
    }

    // Mark the frame BEFORE anything else can request another capture.
    this.lastCaptureFrame = this.frameCounter

    // scratch is reused every frame, so copy before storing.
    const stored: number[] = new Array(FEATURE_DIM)
    for (let i = 0; i < FEATURE_DIM; i++) {
      stored[i] = Math.round(vector[i] * ROUND_FACTOR) / ROUND_FACTOR
    }
    this.samples[letter].push(stored)

    // Arm the re-form gate against exactly what was stored.
    if (this.lastCapturedVector === null) {
      this.lastCapturedVector = new Float32Array(FEATURE_DIM)
    }
    for (let i = 0; i < FEATURE_DIM; i++) {
      this.lastCapturedVector[i] = stored[i]
    }
    this.reformSatisfied = false
    this.liveDistance = 0

    const count = this.samples[letter].length
    this.saveLetterToStorage(letter)

    print("TemplateRecorder: RECORDED " + letter + " sample " + count + "/" + this.samplesPerLetter)
    if (this.confirmAudio) {
      this.confirmAudio.play(1)
    }

    this.state = "confirming"
    this.timer = CONFIRM_SECONDS

    if (count >= this.samplesPerLetter) {
      this.setText(letter + "\n\nRECORDED  " + count + "/" + this.samplesPerLetter + "\nLETTER COMPLETE")
      this.checkLetterQuality(letter)
      this.advanceLetter()
    } else {
      this.setText(letter + "\n\nRECORDED  " + count + "/" + this.samplesPerLetter)
    }
  }

  private advanceLetter() {
    const next = this.firstIncompleteIndex()
    if (next === -1) {
      this.state = "finished"
      this.onAllComplete()
      return
    }
    this.letterIndex = next
    // New letter: nothing to re-form away from.
    this.lastCapturedVector = null
    this.reformSatisfied = true
    this.liveDistance = 0
  }

  private onAllComplete() {
    const total = this.totalSamples()
    this.setText("ALL DONE\n\n" + total + " samples\nacross " + this.letterList.length + " letters")
    print("TemplateRecorder: all letters complete.")
    this.dumpTemplates()
  }

  // -------------------------------------------------------------------------
  // Sample quality
  // -------------------------------------------------------------------------

  /**
   * Mean per-dimension variance across a letter's samples. This is the
   * denominator of the Fisher ratio — if it is near zero, every ratio computed
   * from this data will be inflated.
   */
  private withinLetterVariance(list: number[][]): number {
    const n = list ? list.length : 0
    if (n < 2) {
      return 0
    }
    let total = 0
    for (let d = 0; d < FEATURE_DIM; d++) {
      let sum = 0
      for (let s = 0; s < n; s++) {
        sum += list[s][d]
      }
      const mean = sum / n
      let sq = 0
      for (let s = 0; s < n; s++) {
        const e = list[s][d] - mean
        sq += e * e
      }
      total += sq / (n - 1)
    }
    return total / FEATURE_DIM
  }

  private checkLetterQuality(letter: string) {
    const list = this.samples[letter]
    if (!list || list.length < 2) {
      return
    }
    const variance = this.withinLetterVariance(list)
    if (variance <= WITHIN_VARIANCE_WARN) {
      print(
        "TemplateRecorder WARNING: letter " +
          letter +
          " has near-zero within-letter variance (" +
          variance.toExponential(3) +
          "). That means duplicated or held samples, not perfect tracking. Fisher ratios computed " +
          "from this letter will be inflated and any threshold tuned on them will be too strict on " +
          "device. Re-record " +
          letter +
          ": drop the hand fully between samples."
      )
    } else {
      print("TemplateRecorder: " + letter + " within-letter variance " + variance.toExponential(3) + " — OK.")
    }
  }

  // -------------------------------------------------------------------------
  // Public controls — call these from a button, or from the Logger if needed
  // -------------------------------------------------------------------------

  /** Drop the most recent sample for the current letter. For fumbled captures. */
  undoLastSample() {
    const letter = this.currentLetter()
    const list = this.samples[letter]
    if (!list || list.length === 0) {
      this.setText(letter + "\n\nNOTHING TO UNDO")
      this.state = "confirming"
      this.timer = CONFIRM_SECONDS
      return
    }
    list.pop()
    this.saveLetterToStorage(letter)
    // Re-arm against the new tail, or clear the gate if none is left.
    if (list.length === 0) {
      this.lastCapturedVector = null
      this.reformSatisfied = true
    } else {
      const tail = list[list.length - 1]
      if (this.lastCapturedVector === null) {
        this.lastCapturedVector = new Float32Array(FEATURE_DIM)
      }
      for (let i = 0; i < FEATURE_DIM; i++) {
        this.lastCapturedVector[i] = tail[i]
      }
      this.reformSatisfied = false
    }
    this.liveDistance = 0
    print("TemplateRecorder: undo — " + letter + " now at " + list.length + "/" + this.samplesPerLetter)
    this.state = "confirming"
    this.timer = CONFIRM_SECONDS
    this.setText(letter + "\n\nUNDONE\n" + list.length + "/" + this.samplesPerLetter)
  }

  /** Skip the current letter and move on. Leaves whatever was captured. */
  skipLetter() {
    if (this.letterIndex + 1 >= this.letterList.length) {
      this.state = "finished"
      this.onAllComplete()
      return
    }
    this.letterIndex++
    this.lastCapturedVector = null
    this.reformSatisfied = true
    this.liveDistance = 0
    this.state = "waiting"
    this.refreshPrompt()
  }

  /** Re-print the full JSON. Safe to call at any time. */
  dumpTemplates() {
    const order = this.letterList
    print("TEMPLATES_BEGIN")
    print(
      "TPLMETA|" +
        JSON.stringify({
          version: TEMPLATE_FORMAT_VERSION,
          featureDim: FEATURE_DIM,
          landmarkCount: LANDMARK_COUNT,
          samplesPerLetter: this.samplesPerLetter,
          signingHand: this.signingHand,
          mirrored: this.signingHand === "left",
          reformRequired: this.requireReformBetweenSamples,
          reformThreshold: this.reformThreshold,
          letters: order,
          landmarkOrder: LANDMARK_ORDER
        })
    )
    // One line per sample. A single 78-float line is ~550 chars, which stays
    // well inside log line limits; one blob for the whole set would not.
    for (let i = 0; i < order.length; i++) {
      const letter = order[i]
      const list = this.samples[letter]
      for (let s = 0; s < list.length; s++) {
        print("TPL|" + letter + "|" + s + "|" + list[s].join(","))
      }
    }
    print("TEMPLATES_END")

    // Quality report — the Fisher denominator, per letter, in one place.
    let suspicious = 0
    for (let i = 0; i < order.length; i++) {
      const letter = order[i]
      const list = this.samples[letter]
      if (!list || list.length < 2) {
        continue
      }
      const variance = this.withinLetterVariance(list)
      const flag = variance <= WITHIN_VARIANCE_WARN ? "  <-- SUSPICIOUS" : ""
      if (variance <= WITHIN_VARIANCE_WARN) {
        suspicious++
      }
      print("TPLVAR|" + letter + "|" + list.length + "|" + variance.toExponential(4) + flag)
    }
    if (suspicious > 0) {
      print(
        "TemplateRecorder WARNING: " +
          suspicious +
          " letter(s) have near-zero within-letter variance. Those samples are duplicated or held, " +
          "not independently re-formed. Fisher ratios will be inflated — re-record them before tuning " +
          "any threshold."
      )
    }
    print(
      "TemplateRecorder: " + this.totalSamples() + " samples emitted. Copy the block above into Assets/Data/templates.json."
    )
  }

  // -------------------------------------------------------------------------
  // Persistence — survives a crash or restart mid-session
  // -------------------------------------------------------------------------

  private saveLetterToStorage(letter: string) {
    const store = global.persistentStorageSystem.store
    try {
      store.putString(STORE_PREFIX + letter, JSON.stringify(this.samples[letter]))
    } catch (e) {
      print("TemplateRecorder: could not persist " + letter + " (" + e + "). In-memory samples are unaffected.")
    }
  }

  private loadFromStorage() {
    const store = global.persistentStorageSystem.store
    let restored = 0
    for (let i = 0; i < this.letterList.length; i++) {
      const letter = this.letterList[i]
      const key = STORE_PREFIX + letter
      if (!store.has(key)) {
        continue
      }
      try {
        const parsed = JSON.parse(store.getString(key))
        if (parsed && parsed.length !== undefined) {
          // Drop anything whose width does not match the current feature layout.
          const valid: number[][] = []
          for (let s = 0; s < parsed.length; s++) {
            if (parsed[s] && parsed[s].length === FEATURE_DIM) {
              valid.push(parsed[s])
            }
          }
          this.samples[letter] = valid
          restored += valid.length
        }
      } catch (e) {
        print("TemplateRecorder: ignoring unreadable saved data for " + letter + " (" + e + ")")
      }
    }
    if (restored > 0) {
      print("TemplateRecorder: resumed previous session — " + restored + " samples restored.")
    }
  }

  private clearStorage() {
    const store = global.persistentStorageSystem.store
    for (let i = 0; i < this.letterList.length; i++) {
      const key = STORE_PREFIX + this.letterList[i]
      if (store.has(key)) {
        store.remove(key)
      }
    }
    print("TemplateRecorder: starting a clean run — previous saved samples cleared.")
  }

  // -------------------------------------------------------------------------
  // Display helpers
  // -------------------------------------------------------------------------

  /** Startup banner in the log, so a session's settings are self-documenting. */
  private printHeader() {
    print(
      "TemplateRecorder ready — " +
        this.letterList.length +
        " letters x " +
        this.samplesPerLetter +
        " samples. Sign with the " +
        this.signingHand +
        " hand, pinch with the " +
        this.triggerHand +
        " hand" +
        (this.captureDelaySeconds > 0 ? " (capture delayed " + this.captureDelaySeconds + "s)" : "") +
        ". Re-form gate " +
        (this.requireReformBetweenSamples ? "ON at " + this.reformThreshold : "OFF") +
        ". JSON is printed between TEMPLATES_BEGIN and TEMPLATES_END when done."
    )
  }

  private refreshPrompt() {
    const letter = this.currentLetter()
    const count = this.samples[letter] ? this.samples[letter].length : 0
    const remaining = this.letterList.length - this.letterIndex

    if (!this.isReformSatisfied()) {
      this.setText(
        letter +
          "\n\n" +
          count +
          " / " +
          this.samplesPerLetter +
          "\nRE-FORM THE LETTER\n(" +
          this.liveDistance.toFixed(2) +
          " / " +
          this.reformThreshold.toFixed(2) +
          ")"
      )
      return
    }

    this.setText(
      letter +
        "\n\n" +
        count +
        " / " +
        this.samplesPerLetter +
        "\nPinch " +
        this.triggerHand +
        " to record\n(" +
        remaining +
        " letters left)"
    )
  }

  private setText(message: string) {
    if (message === this.lastMessage) {
      return
    }
    this.lastMessage = message
    if (this.statusText) {
      this.statusText.text = message
    }
  }

  private currentLetter(): string {
    return this.letterList[this.letterIndex]
  }

  private firstIncompleteIndex(): number {
    for (let i = 0; i < this.letterList.length; i++) {
      const list = this.samples[this.letterList[i]]
      if (!list || list.length < this.samplesPerLetter) {
        return i
      }
    }
    return -1
  }

  private totalSamples(): number {
    let n = 0
    for (let i = 0; i < this.letterList.length; i++) {
      const list = this.samples[this.letterList[i]]
      n += list ? list.length : 0
    }
    return n
  }

  private parseLetters(raw: string): string[] {
    const seen: {[k: string]: boolean} = {}
    const out: string[] = []
    if (!raw) {
      return out
    }
    const upper = raw.toUpperCase()
    for (let i = 0; i < upper.length; i++) {
      const ch = upper[i]
      if (ch === " " || ch === "," || ch === "\n" || ch === "\t") {
        continue
      }
      if (seen[ch]) {
        continue
      }
      seen[ch] = true
      out.push(ch)
    }
    return out
  }
}
