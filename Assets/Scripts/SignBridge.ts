/**
 * SignBridge — the end-to-end driver.
 *
 * One frame of the pipeline:
 *
 *   HandFeatureSource  (mock in Editor, live SIK on device)
 *     -> Classifier.classifyFrom   -> {letter, confidence, distance}
 *     -> HoldBuffer.push           -> a committed letter, or null
 *     -> PhraseController.submit   -> correct / wrong / ignored
 *     -> one SignPanelView
 *     -> updateSignPanels([inward, outward], view)
 *
 * plus PhraseController.update(getDeltaTime()) to drive the wrong-letter flash
 * expiry and the optional auto-advance.
 *
 * The view is built ONCE and handed to both panels, so the inward (signer) and
 * outward (reader) surfaces cannot disagree.
 */

import {HandInputData} from "SpectaclesInteractionKit.lspkg/Providers/HandInputData/HandInputData"
import type {BaseHand} from "SpectaclesInteractionKit.lspkg/Providers/HandInputData/BaseHand"
import type {HandType} from "SpectaclesInteractionKit.lspkg/Providers/HandInputData/HandType"
import {Classifier, ClassifierMode} from "./Classifier"
import {HoldBuffer} from "./HoldBuffer"
import {makeWeights} from "./LandmarkCapture"
import {
  getActiveHandFeatureSource,
  HandFeatureSource,
  LiveHandFeatureSource,
  MockHandInput,
  MockPoseStep
} from "./MockHandInput"
import {HandVisualizer} from "./HandVisualizer"
import {PhraseController} from "./PhraseController"
import {SignPanel, SignPanelView, updateSignPanels} from "./SignPanel"
import {extractNormalized, letterKeys, TemplatesFile} from "./TemplateFormat"

/** One step of a scripted mock playback. See SignBridge.playScript(). */
export type BridgeScriptStep = {
  /** Letter to emit, or null for an untracked frame. */
  letter: string | null
  /** Blend toward this second letter — used to manufacture low confidence. */
  blendWith?: string
  /** Blend factor 0..1. 0.5 sits equidistant, so the margin collapses to ~0. */
  blend?: number
  /** Scale the pose away from every template, to fail an absolute distance gate. */
  farScale?: number
  /** How many frames to hold this step. */
  frames: number
}

@component
export class SignBridge extends BaseScriptComponent {
  @ui.label("<b>Sign Bridge</b> — hand → classifier → hold → phrase → panels")
  @ui.separator
  @ui.group_start("Wiring")
  @input
  @hint("templates.json, recorded by TemplateRecorder. Without it nothing can be classified.")
  templatesAsset: Asset

  @input
  @hint("Signer-facing panel: target word, confidence bar, wrong-letter flash.")
  inwardPanel: SignPanel

  @input
  @hint("Reader-facing panel: the assembled text.")
  outwardPanel: SignPanel

  @input
  @allowUndefined
  @hint("Optional. When present, it is loaded with the template poses and replays them — Editor testing without hardware.")
  mockHandInput: MockHandInput

  @input
  @allowUndefined
  @hint("Optional. Draws the exact feature vector the classifier scores, as a hand between the panels.")
  handVisualizer: HandVisualizer

  @input
  @allowUndefined
  @hint("DEMO ONLY. A display-only pose file (Assets/Data/poses.demo.json) for the mock to replay INSTEAD of the templates. Its letters are NOT added to the classifier — they stay unrecognized on purpose. Leave unwired for normal runs.")
  demoPoseAsset: Asset
  @ui.group_end

  @ui.group_start("Audio")
  @input
  @allowUndefined
  @hint("Short chime on each committed letter. Set to LowLatency at start so it lands on the commit frame.")
  letterCommitAudio: AudioComponent

  @input
  @allowUndefined
  @hint("Played once when a phrase completes. Its duration sets the floor for autoAdvanceSeconds.")
  phraseCompleteAudio: AudioComponent

  @input
  @hint("Seconds to wait after completing a phrase before seating the next. 0 disables auto-advance. If below the completion sound's length it is raised, so the next phrase never starts under the tail.")
  @widget(new SliderWidget(0, 10, 0.25))
  autoAdvanceSeconds: number = 0

  @input
  @hint("Extra silence between the completion sound ending and the next phrase appearing.")
  @widget(new SliderWidget(0, 2, 0.05))
  autoAdvanceTailGap: number = 0.25
  @ui.group_end

  @ui.group_start("Classifier")
  @input
  @widget(new ComboBoxWidget([new ComboBoxItem("full"), new ComboBoxItem("reduced")]))
  @hint("Feature space distances are computed in. 'full' = 78 dims, 'reduced' = 57.")
  featureMode: string = "full"

  @input
  @widget(new SliderWidget(1, 5, 1))
  @hint("How many of a letter's nearest templates to average into its score.")
  k: number = 1

  @input
  @widget(new SliderWidget(1, 4, 0.25))
  @hint("Weight on the thumb landmarks — the M/N/S/T separator. 1 = uniform. Remember weights hit SQUARED distance, so 2 is 4x the influence.")
  thumbWeight: number = 1
  @ui.group_end
  @ui.group_start("Hold buffer")
  @input
  @widget(new SliderWidget(6, 40, 1))
  @hint("Window length in frames. 18 is about 0.6s at 30fps.")
  windowFrames: number = 18

  @input
  @widget(new SliderWidget(0, 1, 0.05))
  @hint("Mean confidence the winning letter must reach. PROVISIONAL until set from real data.")
  minMeanConfidence: number = 0.3

  @input
  @widget(new SliderWidget(0, 10, 0.1))
  @hint("Max template distance for a frame to count as a letter. 0 DISABLES the gate — calibrate from the _NEGATIVE separation.")
  maxDistance: number = 0

  @input
  @widget(new SliderWidget(1, 10, 1))
  @hint("Consecutive non-matching frames needed to re-arm after a commit. Separates a deliberate bounce from a one-frame glitch.")
  rearmFrames: number = 3
  @ui.group_end
  @ui.group_start("Session")
  @input
  @widget(new ComboBoxWidget([new ComboBoxItem("right"), new ComboBoxItem("left")]))
  @hint("The hand that signs. Ignored while a MockHandInput is the active source.")
  signingHand: string = "right"

  @input
  @hint("Log a line on every commit, wrong letter and phrase completion.")
  verbose: boolean = true
  @ui.group_end
  private handProvider = HandInputData.getInstance()
  private hand!: BaseHand
  private liveSource!: HandFeatureSource

  private classifier!: Classifier
  private holdBuffer!: HoldBuffer
  private phrases!: PhraseController

  /** Kept so playScript() can rebuild poses by letter name. */
  private templates: TemplatesFile | null = null

  private ready = false

  onAwake() {
    // getHand belongs in onAwake. Nothing here subscribes to a SIK event, so
    // there is no .add() that needs deferring to OnStartEvent.
    this.hand = this.handProvider.getHand(this.signingHand as HandType)
    this.liveSource = new LiveHandFeatureSource(this.hand)

    this.classifier = new Classifier({
      mode: this.featureMode as ClassifierMode,
      weights: this.thumbWeight !== 1 ? makeWeights({thumb: this.thumbWeight}) : null,
      k: this.k
    })

    this.holdBuffer = new HoldBuffer({
      capacity: this.windowFrames,
      minMeanConfidence: this.minMeanConfidence,
      // 0 in the Inspector means "no calibrated value yet" — pass Infinity so
      // HoldBuffer emits its own unset-gate warning rather than silently
      // rejecting every frame against a maxDistance of zero.
      maxDistance: this.maxDistance > 0 ? this.maxDistance : Infinity,
      rearmFrames: this.rearmFrames
    })

    this.phrases = new PhraseController()

    // Handles are acquired in onAwake; every .add() subscription belongs in
    // OnStartEvent. playbackMode is a plain property, so it is set here.
    if (this.letterCommitAudio) {
      // Defaults to LowPower, which trades latency for battery. The letter
      // chime is commit feedback and has to land on the frame the commit
      // happened, so it takes the latency-optimized path instead.
      this.letterCommitAudio.playbackMode = Audio.PlaybackMode.LowLatency
    }

    this.createEvent("OnStartEvent").bind(() => {
      this.loadTemplates()
      this.configureAudio()
      this.logConfiguration()
    })

    this.createEvent("UpdateEvent").bind(() => {
      this.onUpdate()
    })
  }

  // -------------------------------------------------------------------------
  // Setup
  // -------------------------------------------------------------------------

  /**
   * Subscribe the completion sound and reconcile auto-advance against its
   * length.
   *
   * The failure this guards against: autoAdvanceSeconds shorter than the
   * completion sound means the next phrase is seated — panels repainted, target
   * word swapped — while the previous phrase's sound is still playing, so the
   * audio reads as feedback about the NEW phrase. The floor is the measured
   * duration of whatever track is actually wired, not a constant, so replacing
   * the asset with a longer one cannot silently reintroduce the overlap.
   */
  private configureAudio(): void {
    if (this.phraseCompleteAudio) {
      this.phrases.onPhraseComplete.add(() => {
        this.phraseCompleteAudio.play(1)
      })
    }

    let advance = this.autoAdvanceSeconds > 0 ? this.autoAdvanceSeconds : 0
    if (advance > 0 && this.phraseCompleteAudio) {
      const floor = this.phraseCompleteAudio.duration + this.autoAdvanceTailGap
      if (advance < floor) {
        print(
          "SignBridge: autoAdvanceSeconds " +
            advance.toFixed(2) +
            "s is shorter than the completion sound (" +
            this.phraseCompleteAudio.duration.toFixed(2) +
            "s + " +
            this.autoAdvanceTailGap.toFixed(2) +
            "s gap). Raised to " +
            floor.toFixed(2) +
            "s so the next phrase does not start under the tail."
        )
        advance = floor
      }
    }
    this.phrases.setAutoAdvanceSeconds(advance)
  }

  /** Parse a JsonAsset into a TemplatesFile, or null with a named error. */
  private readTemplatesAsset(asset: Asset, label: string): TemplatesFile | null {
    try {
      return JSON.parse((asset as JsonAsset).getString()) as TemplatesFile
    } catch (e) {
      print("SignBridge ERROR: could not read " + label + " (" + e + ").")
      return null
    }
  }

  private loadTemplates(): void {
    if (!this.templatesAsset) {
      print("SignBridge ERROR: no templatesAsset wired. Nothing can be classified.")
      return
    }

    const parsed = this.readTemplatesAsset(this.templatesAsset, "templatesAsset")
    if (parsed === null) {
      return
    }

    this.templates = parsed
    const report = this.classifier.loadTemplates(parsed)
    print(
      "SignBridge: loaded " +
        report.letters +
        " letters / " +
        report.samples +
        " samples (" +
        this.classifier.describe() +
        ")."
    )

    if (report.letters === 0) {
      print(
        "SignBridge ERROR: templates.json contains no letters. Run TemplateRecorder on hardware first — " +
          "classify() will return null on every frame until it does."
      )
      return
    }

    // Refuse phrases the classifier cannot actually complete (J/Z are motion
    // letters and are never in a recorded set).
    this.phrases.setAvailableLetters(this.classifier.loadedLetters())
    const signable = this.phrases.signablePhrases()
    if (signable.length === 0) {
      print("SignBridge ERROR: no preset phrase is signable with the loaded letters.")
      return
    }
    this.phrases.setPhrases(signable)

    // Drive the mock from the same templates, so the Editor replays the exact
    // poses the classifier was loaded with.
    //
    // DEMO PATH: when demoPoseAsset is wired the mock replays THAT instead. The
    // classifier is deliberately not told about those poses — this is how a
    // handshape the Lens cannot recognize gets played on camera, so a
    // limitation can be shown rather than merely described. The separation is
    // the whole point: loadTemplates() above has already run against
    // templatesAsset and is not touched here, so the candidate set, the phrase
    // gating and unsignableLetters() all stay exactly as they were.
    if (this.mockHandInput) {
      let poses = parsed
      let source = "templates"
      if (this.demoPoseAsset) {
        const demo = this.readTemplatesAsset(this.demoPoseAsset, "demoPoseAsset")
        if (demo !== null) {
          poses = demo
          source = "DEMO POSES"
        }
      }
      this.mockHandInput.loadFromTemplates(poses, {framesPerPose: 30, gapFrames: 12})
      if (source !== "templates") {
        const shown = letterKeys(poses).join(",")
        print(
          "SignBridge: mock is replaying DEMO POSES (" + shown + "), not the template set. " +
            "The classifier still knows only [" + this.classifier.loadedLetters().join(",") + "] — " +
            "anything else is drawn but unrecognized, by design. Unwire demoPoseAsset for a normal run."
        )
      }
    }

    this.ready = true
  }

  private logConfiguration(): void {
    print("SignBridge: " + this.holdBuffer.describe())
    print("SignBridge: phrase " + this.phrases.describe())
    const source = getActiveHandFeatureSource()
    print("SignBridge: feature source = " + (source !== null ? "MOCK (" + source.currentLabel() + ")" : "live SIK"))
  }

  // -------------------------------------------------------------------------
  // The frame
  // -------------------------------------------------------------------------

  private onUpdate(): void {
    // Timed transitions run even before templates load, so a misconfigured
    // session still shows a stable panel instead of a frozen one.
    const dt = getDeltaTime()
    this.phrases.update(dt)

    if (this.ready) {
      // Resolved per frame rather than cached: MockHandInput registers itself
      // during ITS OnStartEvent, and script start order follows scene hierarchy
      // order, which this script must not depend on. Reading the module-level
      // active source costs nothing and allocates nothing — unlike calling
      // resolveHandFeatureSource(), which builds a LiveHandFeatureSource on
      // every miss.
      const active = getActiveHandFeatureSource()
      const source: HandFeatureSource = active !== null ? active : this.liveSource

      // Read the features ONCE and fan them out. classifyFrom() would call
      // source.getFeatures() internally; pulling that call up to here means the
      // visualizer draws the identical array the classifier scored, rather than
      // a second read that could drift from it. This is the only reason the
      // drawn hand can be trusted as evidence of what the classifier saw.
      const features = source.getFeatures()
      const result = features !== null ? this.classifier.classify(features) : null
      const committed = this.holdBuffer.push(result)

      if (this.handVisualizer) {
        // After push(), so the colour and the confidence bar read the same
        // post-commit state instead of disagreeing by one frame.
        this.handVisualizer.render(features, this.holdBuffer.getState(), committed, dt)
      }

      if (committed !== null) {
        // Fired from the commit EVENT, not from watching committed-letter state
        // change — same rule as the HandVisualizer pulse. Signing the same
        // letter twice in a row is two events and must be two chimes, and a
        // state-change check would swallow the second.
        if (this.letterCommitAudio) {
          this.letterCommitAudio.play(1)
        }
        const outcome = this.phrases.submit(committed)
        if (this.verbose) {
          const state = this.phrases.getState()
          if (outcome === "wrong") {
            print("SignBridge: WRONG — signed " + committed + ", expected " + state.currentLetter)
          } else if (outcome === "correct") {
            print("SignBridge: committed " + committed + " (" + Math.round(state.progress * 100) + "%)")
          }
        }
      }
    }

    updateSignPanels([this.inwardPanel, this.outwardPanel], this.buildView())
  }

  /** One view, both panels — the reason they cannot drift. */
  private buildView(): SignPanelView {
    const phraseState = this.phrases.getState()
    const holdState = this.holdBuffer.getState()
    const isWrong = phraseState.status === "wrong"

    return {
      phrase: phraseState.phrase,
      letterStatus: phraseState.letterStatus,
      assembled: this.buildAssembled(phraseState.phrase, phraseState.letterStatus),
      progress: holdState.progress,
      candidate: holdState.candidate,
      wrongSigned: isWrong ? phraseState.wrongLetter : null,
      wrongExpected: isWrong ? phraseState.currentLetter : null,
      demoLabel: this.currentDemoLabel()
    }
  }

  /**
   * The pose label to print on the status line, or null on any normal run.
   *
   * Gated on `demoPoseAsset` being wired — not on a debug flag or on whether a
   * mock happens to be present — so the shipped experience cannot show this
   * even if a MockHandInput is left in the scene by accident.
   *
   * Returns null on untracked frames too: the mock labels its gap steps "gap",
   * and printing "DEMO POSE: gap" while no hand is drawn would be noise.
   */
  private currentDemoLabel(): string | null {
    if (!this.demoPoseAsset || !this.mockHandInput) {
      return null
    }
    const active = getActiveHandFeatureSource()
    if (active === null || !active.isTracked()) {
      return null
    }
    const label = active.currentLabel()
    return label && label !== "gap" && label !== "untracked" ? label : null
  }

  /**
   * What the reader sees: everything resolved so far. A skipped letter is still
   * shown — the reader wants the word, not an audit of how it was produced.
   */
  private buildAssembled(phrase: string, letterStatus: string[]): string {
    let out = ""
    for (let i = 0; i < phrase.length; i++) {
      const status = i < letterStatus.length ? letterStatus[i] : "pending"
      if (status === "done" || status === "skipped") {
        out += phrase[i]
      } else if (status === "unsignable") {
        // Spaces are only carried once something after them has been signed.
        out += phrase[i]
      } else {
        break
      }
    }
    return out
  }

  // -------------------------------------------------------------------------
  // Test surface — read-only state, plus deterministic mock playback
  //
  // This Lens has no interactables, so LEAF scenarios cannot drive it by
  // tapping anything. They drive the feature source and assert on state
  // instead, which is what these expose. Nothing here changes behaviour:
  // the getters return the same objects the panels already render from, and
  // playScript() only reconfigures the mock that is already the active source
  // in the Editor.
  // -------------------------------------------------------------------------

  /** Current phrase state — the object the panels render from. */
  getPhraseState() {
    return this.phrases.getState()
  }

  /** Current hold-buffer state, including progress and the re-arm run. */
  getHoldState() {
    return this.holdBuffer.getState()
  }

  /** The exact view handed to both panels this frame. */
  getView(): SignPanelView {
    return this.buildView()
  }

  /** False until templates load; every classify() returns null before then. */
  isReady(): boolean {
    return this.ready
  }

  /**
   * Rebuild the hold buffer with a different rejection distance.
   *
   * Needed to exercise the rejected-frame path at all: the gate is disabled by
   * default (Infinity), so without this no frame can ever be rejected.
   * Pass 0 or a negative value to disable it again.
   */
  setMaxDistance(maxDistance: number): void {
    this.holdBuffer = new HoldBuffer({
      capacity: this.windowFrames,
      minMeanConfidence: this.minMeanConfidence,
      maxDistance: maxDistance > 0 ? maxDistance : Infinity,
      rearmFrames: this.rearmFrames
    })
  }

  /** Letters the classifier can actually produce. */
  getLoadedLetters(): string[] {
    return this.classifier.loadedLetters()
  }

  /**
   * Letters in `phrase` that the loaded template set cannot produce.
   *
   * Exposed for the alphabet-coverage scenario: recognition and phrase gating
   * are two different guarantees, and a letter being absent from the templates
   * is only safe if the phrase layer also refuses to seat words needing it.
   */
  unsignableLetters(phrase: string): string[] {
    return this.phrases.unsignableLetters(phrase)
  }

  /** Euclidean distance between two letters' first templates. */
  distanceBetween(a: string, b: string): number {
    const pa = this.poseFor(a)
    const pb = this.poseFor(b)
    if (pa === null || pb === null) {
      return Infinity
    }
    let sum = 0
    for (let d = 0; d < pa.length && d < pb.length; d++) {
      const diff = pa[d] - pb[d]
      sum += diff * diff
    }
    return Math.sqrt(sum)
  }

  /** Distance from a letter's first template to its nearest other letter. */
  nearestOtherDistance(letter: string): number {
    let best = Infinity
    const letters = this.classifier.loadedLetters()
    for (let i = 0; i < letters.length; i++) {
      if (letters[i] === letter) {
        continue
      }
      const dist = this.distanceBetween(letter, letters[i])
      if (dist < best) {
        best = dist
      }
    }
    return best
  }

  /**
   * Drive the mock through an explicit script. Non-looping, so it ends in a
   * known state rather than wrapping mid-assertion.
   *
   * @returns false if the mock is absent or a named letter has no template
   */
  playScript(steps: BridgeScriptStep[]): boolean {
    if (!this.mockHandInput || !steps || steps.length === 0) {
      return false
    }

    const built: MockPoseStep[] = []
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]
      const frames = step.frames > 0 ? step.frames : 1

      if (step.letter === null) {
        built.push({label: "gap", features: null, frames: frames})
        continue
      }

      const base = this.poseFor(step.letter)
      if (base === null) {
        print("SignBridge.playScript: no template for '" + step.letter + "'.")
        return false
      }

      let features = base
      let label = step.letter

      if (step.blendWith !== undefined) {
        const other = this.poseFor(step.blendWith)
        if (other === null) {
          print("SignBridge.playScript: no template for '" + step.blendWith + "'.")
          return false
        }
        const t = step.blend !== undefined ? step.blend : 0.5
        const mixed: number[] = new Array(features.length)
        for (let d = 0; d < features.length; d++) {
          mixed[d] = base[d] * (1 - t) + other[d] * t
        }
        features = mixed
        label = step.letter + "~" + step.blendWith
      }

      if (step.farScale !== undefined && step.farScale !== 1) {
        // Push the pose off the manifold so it fails an absolute distance gate,
        // while leaving the structurally-constant dims alone so it stays a
        // well-formed vector.
        const scaled: number[] = new Array(features.length)
        for (let d = 0; d < features.length; d++) {
          const structural = d < 3 || (d >= 36 && d < 39)
          scaled[d] = structural ? features[d] : features[d] * step.farScale
        }
        features = scaled
        label = "far:" + label
      }

      built.push({label: label, features: features, frames: frames})
    }

    this.mockHandInput.setJitter(0)
    this.mockHandInput.setSequence(built, false)
    return true
  }

  /** First stored template vector for a letter, or null. */
  private poseFor(letter: string): number[] | null {
    if (this.templates === null || !this.templates.letters) {
      return null
    }
    const samples = this.templates.letters[letter]
    if (!samples || samples.length === 0) {
      return null
    }
    const normalized = extractNormalized(samples[0])
    if (normalized === null) {
      return null
    }
    const out: number[] = new Array(normalized.length)
    for (let i = 0; i < normalized.length; i++) {
      out[i] = normalized[i]
    }
    return out
  }

  // -------------------------------------------------------------------------
  // Public controls — wire to buttons later
  // -------------------------------------------------------------------------

  nextPhrase(): void {
    this.phrases.nextPhrase()
    this.holdBuffer.reset()
  }

  skipLetter(): void {
    this.phrases.skipCurrentLetter()
    this.holdBuffer.reset()
  }

  restart(): void {
    this.phrases.restart()
    this.holdBuffer.reset()
  }
}
