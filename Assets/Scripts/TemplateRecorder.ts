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
import {
  FEATURE_DIM,
  LANDMARK_COUNT,
  LANDMARK_ORDER,
  normalizeLandmarks,
  normalizeTrackedHand,
  pointsFromTrackedHand
} from "./LandmarkCapture"
import {NEGATIVE_KEY} from "./TemplateFormat"

/**
 * What the operator is asked to do for each negative sample, cycled in order.
 *
 * Half the entries are transitions on purpose. A hand mid-way between two
 * letters is the pose that will actually cause spurious commits in real use —
 * it is a plausible-looking handshape that is not a letter, and it is what a
 * distance threshold most needs to be able to reject. Static non-letter poses
 * (rest, flat palm, pointing, fist) sit far from every template and are the
 * easy case; transitions are the hard one, so they get the most coverage.
 */
const NEGATIVE_PROMPTS: readonly string[] = [
  "MOVE between two letters\n(capture mid-transition)",
  "Hand at REST\n(relaxed, by your side)",
  "MOVE between two letters\n(different pair)",
  "FLAT PALM\n(fingers together, open)",
  "MOVE between two letters\n(capture mid-transition)",
  "POINTING\n(index out, others closed)",
  "MOVE between two letters\n(different pair)",
  "LOOSE FIST\n(not a tight S)",
  "MOVE between two letters\n(capture mid-transition)",
  "Hand MOVING\n(any casual motion)"
]

/** Schema version written into templates.json. Bump on any shape change. */
const TEMPLATE_FORMAT_VERSION = 2

/** Raw positions are 26 landmarks x (x, y, z), same layout as the feature vector. */
const RAW_DIM = LANDMARK_COUNT * 3

/**
 * One captured sample.
 *
 * BOTH representations are kept. The normalized vector is what the classifier
 * consumes; the raw world-space positions are what make the session
 * reprocessable. Discarding raw would be irreversible once the hand is gone —
 * it would foreclose jittering in landmark space (where tracking noise actually
 * lives, and where it is correlated across landmarks), re-normalizing against a
 * different basis if wrist->middleKnuckle proves weak, validating
 * normalizeLandmarks against real hands instead of synthetic input, and any
 * augmentation. 78 extra floats per sample is nothing against those options.
 */
type Sample = {
  /** 78-dim normalized feature vector — what the classifier sees. */
  normalized: number[]
  /**
   * 78 raw world-space coordinates, x/y/z per landmark in LANDMARK_ORDER,
   * centimetres, exactly as SIK reported them. Null only for samples restored
   * from a pre-v2 session, which predate raw capture.
   */
  raw: number[] | null
}

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
  @hint(
    "Non-letter poses to capture after the letters, under the reserved _NEGATIVE key. They are NOT templates — they calibrate the rejection distance. 0 skips the phase; ~30 is a good target."
  )
  negativeSampleCount: number = 30

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

  /** letter -> captured samples, each holding both representations. */
  private samples: {[letter: string]: Sample[]} = {}

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

  /** So the storage-pressure warning fires once, not on every capture. */
  private storageWarningShown = false

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
    // Appended after parseLetters, never through it — parseLetters splits into
    // single characters, which would shred a multi-character reserved key.
    if (this.negativeSampleCount > 0) {
      this.letterList.push(NEGATIVE_KEY)
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

    // Read the landmarks ONCE and derive both representations from that single
    // read, so the raw positions and the feature vector provably describe the
    // same instant rather than two reads that merely ought to agree.
    const positions = pointsFromTrackedHand(this.signing)
    if (positions === null) {
      this.state = "waiting"
      this.setText(letter + "\n\nNO HAND SEEN\nHold your " + this.signingHand + " hand up, then pinch again.")
      print("TemplateRecorder: capture skipped for " + letter + " — landmarks unavailable.")
      return
    }

    const vector = normalizeLandmarks(positions, {mirror: this.signingHand === "left", out: this.scratch})
    if (vector === null) {
      this.state = "waiting"
      this.setText(letter + "\n\nPOSE UNREADABLE\nOpen your hand slightly and pinch again.")
      print("TemplateRecorder: capture skipped for " + letter + " — degenerate pose (see LandmarkCapture).")
      return
    }

    // Mark the frame BEFORE anything else can request another capture.
    this.lastCaptureFrame = this.frameCounter

    // scratch is reused every frame, so copy before storing.
    const normalized: number[] = new Array(FEATURE_DIM)
    for (let i = 0; i < FEATURE_DIM; i++) {
      normalized[i] = Math.round(vector[i] * ROUND_FACTOR) / ROUND_FACTOR
    }

    // Raw world-space positions, flattened x/y/z per landmark. Stored
    // unmodified — no mirroring, no wrist offset, no scaling — so every
    // downstream reprocessing choice stays open.
    const raw: number[] = new Array(RAW_DIM)
    for (let i = 0; i < LANDMARK_COUNT; i++) {
      const p = positions[i]
      const o = i * 3
      raw[o] = Math.round(p.x * ROUND_FACTOR) / ROUND_FACTOR
      raw[o + 1] = Math.round(p.y * ROUND_FACTOR) / ROUND_FACTOR
      raw[o + 2] = Math.round(p.z * ROUND_FACTOR) / ROUND_FACTOR
    }

    this.samples[letter].push({normalized: normalized, raw: raw})

    // Arm the re-form gate against exactly what was stored.
    if (this.lastCapturedVector === null) {
      this.lastCapturedVector = new Float32Array(FEATURE_DIM)
    }
    for (let i = 0; i < FEATURE_DIM; i++) {
      this.lastCapturedVector[i] = normalized[i]
    }
    this.reformSatisfied = false
    this.liveDistance = 0

    const count = this.samples[letter].length
    const target = this.targetFor(letter)
    this.saveLetterToStorage(letter)

    print("TemplateRecorder: RECORDED " + letter + " sample " + count + "/" + target)
    if (this.confirmAudio) {
      this.confirmAudio.play(1)
    }

    this.state = "confirming"
    this.timer = CONFIRM_SECONDS

    const title = letter === NEGATIVE_KEY ? "NON-LETTER" : letter
    if (count >= target) {
      this.setText(
        title + "\n\nRECORDED  " + count + "/" + target + (letter === NEGATIVE_KEY ? "\nPHASE COMPLETE" : "\nLETTER COMPLETE")
      )
      this.checkLetterQuality(letter)
      this.advanceLetter()
    } else {
      this.setText(title + "\n\nRECORDED  " + count + "/" + target)
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
    const negatives = this.samples[NEGATIVE_KEY] ? this.samples[NEGATIVE_KEY].length : 0
    const letterCount = this.letterList.length - (this.negativeSampleCount > 0 ? 1 : 0)
    this.setText(
      "ALL DONE\n\n" +
        total +
        " samples\n" +
        letterCount +
        " letters" +
        (negatives > 0 ? "\n+ " + negatives + " non-letter" : "")
    )
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
  private withinLetterVariance(list: Sample[]): number {
    const n = list ? list.length : 0
    if (n < 2) {
      return 0
    }
    let total = 0
    for (let d = 0; d < FEATURE_DIM; d++) {
      let sum = 0
      for (let s = 0; s < n; s++) {
        sum += list[s].normalized[d]
      }
      const mean = sum / n
      let sq = 0
      for (let s = 0; s < n; s++) {
        const e = list[s].normalized[d] - mean
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
    if (letter === NEGATIVE_KEY) {
      // Negatives are deliberately dissimilar poses, so their spread should be
      // LARGE. A small one means the same non-letter pose was captured over and
      // over, which cannot bound a rejection distance.
      print("TemplateRecorder: " + NEGATIVE_KEY + " within-set variance " + variance.toExponential(3) + ".")
      if (variance <= WITHIN_VARIANCE_WARN) {
        print(
          "TemplateRecorder WARNING: " +
            NEGATIVE_KEY +
            " samples are near-identical. Negatives must span rest, transitions, flat palm, pointing " +
            "and fist — one repeated pose calibrates nothing."
        )
      }
      return
    }
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
      const tail = list[list.length - 1].normalized
      if (this.lastCapturedVector === null) {
        this.lastCapturedVector = new Float32Array(FEATURE_DIM)
      }
      for (let i = 0; i < FEATURE_DIM; i++) {
        this.lastCapturedVector[i] = tail[i]
      }
      this.reformSatisfied = false
    }
    this.liveDistance = 0
    const target = this.targetFor(letter)
    print("TemplateRecorder: undo — " + letter + " now at " + list.length + "/" + target)
    this.state = "confirming"
    this.timer = CONFIRM_SECONDS
    this.setText((letter === NEGATIVE_KEY ? "NON-LETTER" : letter) + "\n\nUNDONE\n" + list.length + "/" + target)
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
          rawUnits: "cm_world",
          negativeKey: NEGATIVE_KEY,
          negativeCount: this.samples[NEGATIVE_KEY] ? this.samples[NEGATIVE_KEY].length : 0,
          letters: order,
          landmarkOrder: LANDMARK_ORDER
        })
    )
    // One line per sample per representation. Raw and normalized are emitted
    // on SEPARATE lines: combined they would run past 1300 chars, where a
    // single 78-float line stays around 550-800 and safely inside log limits.
    //   TPL|<letter>|<index>|<78 normalized>
    //   TPLRAW|<letter>|<index>|<78 raw world x,y,z per landmark, cm>
    for (let i = 0; i < order.length; i++) {
      const letter = order[i]
      const list = this.samples[letter]
      for (let s = 0; s < list.length; s++) {
        print("TPL|" + letter + "|" + s + "|" + list[s].normalized.join(","))
        if (list[s].raw !== null) {
          print("TPLRAW|" + letter + "|" + s + "|" + list[s].raw.join(","))
        }
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

    // Self-calibrating diversity check: negatives are deliberately different
    // poses, so they must vary MORE than repeats of a single letter do. No
    // magic number needed — the letters supply the reference.
    const negatives = this.samples[NEGATIVE_KEY]
    if (negatives && negatives.length >= 2) {
      const negativeVariance = this.withinLetterVariance(negatives)
      let letterTotal = 0
      let letterCount = 0
      for (let i = 0; i < order.length; i++) {
        const key = order[i]
        if (key === NEGATIVE_KEY) {
          continue
        }
        const list = this.samples[key]
        if (list && list.length >= 2) {
          letterTotal += this.withinLetterVariance(list)
          letterCount++
        }
      }
      if (letterCount > 0) {
        const meanLetterVariance = letterTotal / letterCount
        print(
          "TPLNEG|" +
            negatives.length +
            "|" +
            negativeVariance.toExponential(4) +
            "|meanLetterVar=" +
            meanLetterVariance.toExponential(4)
        )
        if (negativeVariance <= meanLetterVariance) {
          print(
            "TemplateRecorder WARNING: negative samples vary no more than repeats of a single letter " +
              "(" +
              negativeVariance.toExponential(3) +
              " vs " +
              meanLetterVariance.toExponential(3) +
              "). They are meant to span rest, transitions, flat palm, pointing and fist. As recorded " +
              "they will under-estimate how close a non-letter pose can get, giving a maxDistance that " +
              "is too tight."
          )
        }
      }
    } else if (this.negativeSampleCount > 0) {
      print(
        "TemplateRecorder: no negative samples captured. maxDistance cannot be calibrated from this " +
          "run — it would have to be guessed."
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
      return
    }

    // Keeping raw positions roughly doubles the stored bytes, so the cap is now
    // worth watching. Warn once per crossing rather than every capture.
    try {
      const used = store.getSizeInBytes()
      const max = store.getMaxSizeInBytes()
      if (max > 0) {
        const fraction = used / max
        if (fraction >= 0.8 && !this.storageWarningShown) {
          this.storageWarningShown = true
          print(
            "TemplateRecorder WARNING: persistent storage is " +
              Math.round(fraction * 100) +
              "% full (" +
              used +
              " / " +
              max +
              " bytes). Crash-resume may stop working before the run ends. The log dump is " +
              "unaffected — call dumpTemplates() early and often to be safe."
          )
        }
      }
    } catch (e) {
      // Size reporting is advisory; never let it break a capture.
    }
  }

  private loadFromStorage() {
    const store = global.persistentStorageSystem.store
    let restored = 0
    let legacy = 0
    for (let i = 0; i < this.letterList.length; i++) {
      const letter = this.letterList[i]
      const key = STORE_PREFIX + letter
      if (!store.has(key)) {
        continue
      }
      try {
        const parsed = JSON.parse(store.getString(key))
        if (parsed && parsed.length !== undefined) {
          const valid: Sample[] = []
          for (let s = 0; s < parsed.length; s++) {
            const entry = parsed[s]
            if (!entry) {
              continue
            }
            if (entry.length !== undefined) {
              // Pre-v2 shape: a bare normalized vector, no raw positions.
              if (entry.length === FEATURE_DIM) {
                valid.push({normalized: entry, raw: null})
                legacy++
              }
              continue
            }
            // v2 shape. Drop anything whose width does not match the layout.
            if (entry.normalized && entry.normalized.length === FEATURE_DIM) {
              const raw = entry.raw && entry.raw.length === RAW_DIM ? entry.raw : null
              if (raw === null) {
                legacy++
              }
              valid.push({normalized: entry.normalized, raw: raw})
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
    if (legacy > 0) {
      print(
        "TemplateRecorder WARNING: " +
          legacy +
          " restored sample(s) have no raw landmark positions — they predate format v" +
          TEMPLATE_FORMAT_VERSION +
          ". They still work for classification, but cannot be re-normalized, jittered in landmark " +
          "space, or augmented. Re-record them if you want those options."
      )
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
        (this.negativeSampleCount > 0
          ? ", then " + this.negativeSampleCount + " non-letter samples under " + NEGATIVE_KEY
          : "") +
        ". Re-form gate " +
        (this.requireReformBetweenSamples ? "ON at " + this.reformThreshold : "OFF") +
        ". JSON is printed between TEMPLATES_BEGIN and TEMPLATES_END when done."
    )
  }

  private refreshPrompt() {
    const letter = this.currentLetter()
    const count = this.samples[letter] ? this.samples[letter].length : 0
    const target = this.targetFor(letter)
    const remaining = this.letterList.length - this.letterIndex
    const negative = this.isNegativePhase()
    const title = negative ? "NON-LETTER" : letter

    if (!this.isReformSatisfied()) {
      this.setText(
        title +
          "\n\n" +
          count +
          " / " +
          target +
          (negative ? "\nCHANGE THE POSE\n(" : "\nRE-FORM THE LETTER\n(") +
          this.liveDistance.toFixed(2) +
          " / " +
          this.reformThreshold.toFixed(2) +
          ")"
      )
      return
    }

    if (negative) {
      this.setText(
        title +
          "\n\n" +
          count +
          " / " +
          target +
          "\n\n" +
          this.negativePrompt(count) +
          "\n\nPinch " +
          this.triggerHand +
          " to record"
      )
      return
    }

    this.setText(
      title +
        "\n\n" +
        count +
        " / " +
        target +
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

  /** Target sample count for a key — negatives have their own quota. */
  private targetFor(key: string): number {
    return key === NEGATIVE_KEY ? this.negativeSampleCount : this.samplesPerLetter
  }

  private isNegativePhase(): boolean {
    return this.currentLetter() === NEGATIVE_KEY
  }

  /** What the operator is asked to do for the next negative sample. */
  private negativePrompt(sampleIndex: number): string {
    return NEGATIVE_PROMPTS[sampleIndex % NEGATIVE_PROMPTS.length]
  }

  private firstIncompleteIndex(): number {
    for (let i = 0; i < this.letterList.length; i++) {
      const key = this.letterList[i]
      const list = this.samples[key]
      if (!list || list.length < this.targetFor(key)) {
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
