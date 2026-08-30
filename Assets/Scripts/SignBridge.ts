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
import {Button} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
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
  @hint("Optional. A SECOND HandVisualizer showing the target letter's template pose — what the signer is copying. Style it dimmer and thinner than the live hand so the two are never confusable.")
  referenceHandVisualizer: HandVisualizer

  @input
  @hint("Show the reference (target) hand. Turn off for the K/P orientation shot, where a second hand would distract from the two live poses being identical.")
  showReferenceHand: boolean = true

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

  @ui.group_start("Speech flow")
  @input
  @hint("Idle screen with a START button, then speech-to-text, then spelling. Off = legacy behaviour: spelling starts immediately on load.")
  enableFlow: boolean = true

  @input
  @hint("Preview-only stand-in transcript. The editor cannot run AsrModule, so pinching START shows 'SIMULATED INPUT: <this>' and uses it verbatim — labelled as simulated, never presented as ASR.")
  simulatedTranscript: string = "LUKE"

  @input
  @hint("How long the finished word stays up before returning to the idle screen. Ignored while loopDemo is on.")
  @widget(new SliderWidget(1, 10, 0.5))
  flowCompleteHoldSeconds: number = 4
  @ui.group_end

  @ui.group_start("Filming aids")
  @ui.label("Recording conveniences, NOT product behaviour. Both default to shipped behaviour; set them back to 0 / off before committing.")
  @input
  @hint("Hold the mock idle for this long after load, so recording can start before anything happens. 0 = shipped behaviour: the mock plays immediately.")
  @widget(new SliderWidget(0, 15, 0.5))
  startDelaySeconds: number = 0

  @input
  @hint("Restart the phrase and the mock sequence after completion so a take can loop. Off = shipped behaviour: the demo stops on the finished word.")
  loopDemo: boolean = false

  @input
  @hint("Pause between loop cycles. Long enough that the completion chime finishes and the finished word is readable before the reset.")
  @widget(new SliderWidget(0.5, 8, 0.25))
  loopPauseSeconds: number = 2.5
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

  // Reference-hand state. The pose and its distance scale are recomputed only
  // when the target letter changes — nearestOtherDistance() walks every
  // template pair and has no business running per frame.
  private referenceLetter: string | null = null
  private referencePose: number[] | null = null
  private referenceScale = 1

  // Speech-flow state. "spelling" is the pass-through state in which the
  // classify pipeline runs; every other state feeds the pipeline untracked
  // frames, exactly like the filming-aid hold. With enableFlow off the state
  // is pinned to "spelling" and none of this exists behaviourally.
  private flowState: "idle" | "listening" | "spelling" | "complete" = "spelling"
  private flowRoot: SceneObject | null = null
  private flowButtonObject: SceneObject | null = null
  private flowStatusText: Text | null = null
  private listenTimer = 0
  private completeTimer = 0
  private asrActive = false

  // Filming-aid state. All inert while startDelaySeconds is 0 and loopDemo is
  // off, which is the shipped configuration.
  private sinceReady = 0
  private started = false
  private loopPending = false
  private loopTimer = 0

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
      if (this.enableFlow) {
        this.buildFlowScreen()
        this.enterIdle(null)
      }
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

  /**
   * Draw the target letter's template pose, tinted by how close the live hand
   * is to it.
   *
   * The pose comes from `templates[letter][0]` — the same array the classifier
   * scores against — so the reference hand is literally the thing being
   * matched, not an illustration of it.
   *
   * MATCH QUALITY. Raw distance is meaningless on its own: 0.6 is close for one
   * letter and far for another, because letters sit at different densities in
   * the feature space. So it is normalized against that letter's own
   * nearest-other-letter distance — the point at which some other letter
   * becomes the better answer. quality 1 means "on the pose", quality 0 means
   * "far enough that another letter wins". That makes the brightening mean the
   * same thing for every letter.
   *
   * The scale is cached per target letter, since nearestOtherDistance() walks
   * every template pair and must not run per frame.
   */
  private updateReferenceHand(features: ArrayLike<number> | null): void {
    if (!this.referenceHandVisualizer) {
      return
    }
    // On the flow's idle/listening screens there is no spelling task, so a
    // target hand (even dim) would float over the idle UI implying one.
    if (this.enableFlow && (this.flowState === "idle" || this.flowState === "listening")) {
      this.referenceHandVisualizer.renderReference(null, 0)
      return
    }
    if (!this.showReferenceHand || this.templates === null) {
      this.referenceHandVisualizer.renderReference(null, 0)
      return
    }

    const target = this.phrases.getState().currentLetter
    if (target === null) {
      // Phrase complete or idle: nothing to copy, so show nothing.
      this.referenceHandVisualizer.renderReference(null, 0)
      this.referenceLetter = null
      return
    }

    if (target !== this.referenceLetter) {
      this.referenceLetter = target
      this.referencePose = this.poseFor(target)
      const scale = this.nearestOtherDistance(target)
      // Guard the degenerate case: a single loaded letter has no "other", and
      // an orientation-collision partner sits at distance 0. Either would make
      // the quality ramp divide by zero and flicker.
      this.referenceScale = scale > 1e-4 && isFinite(scale) ? scale : 1
    }

    if (this.referencePose === null) {
      this.referenceHandVisualizer.renderReference(null, 0)
      return
    }

    let quality = 0
    if (features !== null) {
      const d = this.distanceTo(features, this.referencePose)
      // Exponential falloff, not a linear ramp clamped at the scale.
      //
      // A linear `1 - d/scale` is degenerate in practice: measured against the
      // shipped templates it returns exactly 1.00 when the pose matches and
      // exactly 0.00 for every other letter, because every inter-letter
      // distance already exceeds the scale. That makes the reference hand a
      // binary light rather than the "you are getting closer" signal it is for.
      //
      // This halves brightness every `scale` of distance, so quality is 1 on
      // the pose, 0.5 at the point another letter becomes equally good, and
      // fades smoothly beyond — always non-zero, always moving.
      quality = Math.exp(-Math.LN2 * (d / this.referenceScale))
    }
    this.referenceHandVisualizer.renderReference(this.referencePose, quality)
  }

  /** Euclidean distance between a live feature vector and a template pose. */
  private distanceTo(a: ArrayLike<number>, b: ArrayLike<number>): number {
    const n = Math.min(a.length, b.length)
    let sum = 0
    for (let i = 0; i < n; i++) {
      const d = a[i] - b[i]
      sum += d * d
    }
    return Math.sqrt(sum)
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
      if (this.startDelaySeconds > 0) {
        // loadFromTemplates -> setSequence -> reset() leaves the mock playing,
        // so the hold has to be applied after it, not before.
        this.mockHandInput.pause()
      }
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
      // ---- filming aids -------------------------------------------------
      // Both branches below are no-ops in the shipped configuration
      // (startDelaySeconds 0, loopDemo off): `started` flips true on the first
      // frame and `loopPending` never arms.
      this.sinceReady += dt

      if (!this.started && (this.startDelaySeconds <= 0 || this.sinceReady >= this.startDelaySeconds)) {
        this.started = true
        if (this.mockHandInput) {
          // reset() rewinds to step 0 AND sets playing = true, so the sequence
          // begins from its first pose the moment the hold expires rather than
          // resuming wherever it was paused.
          this.mockHandInput.reset()
        }
      }

      if (this.loopPending) {
        this.loopTimer -= dt
        if (this.loopTimer <= 0) {
          this.beginLoopCycle()
        }
      }

      if (this.enableFlow) {
        this.updateFlow(dt)
      }

      // Idle means "produce no input this frame". The pipeline is fed an
      // untracked frame rather than skipped, so HoldBuffer stays reset and the
      // hands hide — a clean, still start rather than a frozen pose that would
      // keep filling the window and commit on its own. The speech-flow states
      // other than "spelling" hold the pipeline the same way.
      if (!this.started || this.loopPending || (this.enableFlow && this.flowState !== "spelling")) {
        this.holdBuffer.push(null)
        if (this.handVisualizer) {
          this.handVisualizer.render(null, this.holdBuffer.getState(), null, dt)
        }
        this.updateReferenceHand(null)
        updateSignPanels([this.inwardPanel, this.outwardPanel], this.buildView())
        return
      }

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

      // Last, and deliberately AFTER submit(): a commit that advances the
      // target must move the reference hand in the same frame the letter turns
      // green, or the signer is shown the letter they just finished.
      this.updateReferenceHand(features)

      // Arm the loop on the frame the phrase completes. The mock is paused
      // rather than left running, so the finished word sits still and the
      // completion chime lands over a static frame instead of over the next
      // letter's pose.
      if (this.loopDemo && !this.loopPending && this.phrases.getState().status === "complete") {
        this.loopPending = true
        this.loopTimer = this.loopPauseSeconds
        if (this.mockHandInput) {
          this.mockHandInput.pause()
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
    // restart() is the entry point LEAF's resetBridge() and the loop use, and
    // both mean "spell now" — so it doubles as the flow's jump-to-spelling.
    // Without this, a Lens that boots into the idle screen would feed every
    // scenario untracked frames until it timed out.
    if (this.enableFlow) {
      this.flowState = "spelling"
      this.setFlowScreenVisible(false)
      this.setSpellingContentVisible(true)
    }
    this.phrases.restart()
    this.holdBuffer.reset()
    // Drop the cached reference target so the pose and its distance scale are
    // refetched. Without this, a restart back to the SAME letter the cache
    // already holds would leave the reference hand hidden or stale.
    this.referenceLetter = null
    this.referencePose = null
    // A manual restart cancels any pending loop — otherwise a scenario calling
    // restart() mid-countdown would be reset again underneath itself.
    this.loopPending = false
    this.loopTimer = 0
  }

  /**
   * Begin another cycle of a looping take.
   *
   * PhraseController.restart() reseats the same phrase through setPhrase(),
   * which rebuilds letterStatus to all-pending and zeroes index, mistakes,
   * mistakesOnCurrentLetter, skipped and wrongLetter — so the loop starts from
   * a genuinely clean state, not a partially cleared one. restart() also clears
   * the reference cache, which is what brings the target hand back after the
   * completed phrase had hidden it.
   */
  private beginLoopCycle(): void {
    this.restart()
    if (this.mockHandInput) {
      this.mockHandInput.reset()
    }
    if (this.verbose) {
      print("SignBridge: loop restart — '" + this.phrases.getState().phrase + "' from the top.")
    }
  }

  // -------------------------------------------------------------------------
  // Speech flow: idle -> listening -> spelling -> complete -> idle
  //
  // Only the screen state machine lives here. The spelling half is entirely
  // PhraseController's — this code seats a phrase and gets out of the way.
  // -------------------------------------------------------------------------

  /** Per-frame flow transitions. Runs every frame while enableFlow is on. */
  private updateFlow(dt: number): void {
    if (this.flowState === "listening" && this.listenTimer > 0) {
      // Editor-only simulated path. The device path is event-driven and never
      // arms this timer.
      this.listenTimer -= dt
      if (this.listenTimer <= 0) {
        this.handleTranscript(this.simulatedTranscript, true)
      }
      return
    }

    if (this.flowState === "spelling") {
      // loopDemo owns completion while it is on — the loop restarts the phrase
      // and the flow must not yank it back to idle mid-take.
      if (!this.loopDemo && this.phrases.getState().status === "complete") {
        this.flowState = "complete"
        this.completeTimer = this.flowCompleteHoldSeconds
      }
      return
    }

    if (this.flowState === "complete") {
      this.completeTimer -= dt
      if (this.completeTimer <= 0) {
        this.enterIdle("SPELLED '" + this.phrases.getState().phrase + "'")
      }
    }
  }

  /** Show the idle screen. `note` is a line about how we got here, or null. */
  private enterIdle(note: string | null): void {
    this.flowState = "idle"
    this.asrActive = false
    this.listenTimer = 0
    this.setSpellingContentVisible(false)
    this.setFlowScreenVisible(true)
    if (this.flowButtonObject) {
      this.flowButtonObject.enabled = true
    }
    if (this.flowStatusText) {
      this.flowStatusText.text = note !== null ? note : "PINCH START, THEN SAY A WORD"
      this.flowStatusText.textFill.color = new vec4(0.75, 0.78, 0.82, 1)
    }
  }

  /** The START button's pinch handler. */
  private beginListening(): void {
    if (this.flowState !== "idle") {
      return
    }
    this.flowState = "listening"
    if (this.flowButtonObject) {
      this.flowButtonObject.enabled = false
    }

    if (global.deviceInfoSystem.isEditor()) {
      // The editor cannot run AsrModule, so this is a stand-in — and it says
      // so on screen. Same rule as the DEMO POSE label: the substitution is
      // visible, not passed off as a microphone. Do NOT relabel this as
      // listening/ASR; honesty about the fake middle step is the point.
      if (this.flowStatusText) {
        this.flowStatusText.text = "SIMULATED INPUT: " + this.simulatedTranscript.toUpperCase()
        this.flowStatusText.textFill.color = new vec4(1, 0.72, 0.18, 1)
      }
      // Long enough to READ on camera — the label is the honesty mechanism,
      // and a flash too quick to read defeats it.
      this.listenTimer = 2.5
      if (this.verbose) {
        print("SignBridge: flow listening (EDITOR) — simulated transcript '" + this.simulatedTranscript + "'.")
      }
      return
    }

    this.startDeviceAsr()
  }

  /** Device path: real AsrModule transcription. Spectacles only. */
  private startDeviceAsr(): void {
    let asr: AsrModule | null = null
    try {
      asr = require("LensStudio:AsrModule") as AsrModule
    } catch (e) {
      asr = null
    }
    if (asr === null) {
      this.enterIdle("SPEECH UNAVAILABLE ON THIS DEVICE")
      return
    }

    if (this.flowStatusText) {
      this.flowStatusText.text = "LISTENING…"
      this.flowStatusText.textFill.color = new vec4(0.35, 0.95, 0.85, 1)
    }

    const options = AsrModule.AsrTranscriptionOptions.create()
    options.silenceUntilTerminationMs = 1000
    options.onTranscriptionUpdateEvent.add((ev) => {
      if (!ev.isFinal) {
        if (this.flowStatusText && ev.text.length > 0) {
          this.flowStatusText.text = "LISTENING… " + ev.text.toUpperCase()
        }
        return
      }
      this.asrActive = false
      asr.stopTranscribing()
      this.handleTranscript(ev.text, false)
    })
    options.onTranscriptionErrorEvent.add((code) => {
      this.asrActive = false
      this.enterIdle("SPEECH ERROR (" + code + ") — TRY AGAIN")
    })
    this.asrActive = true
    asr.startTranscribing(options)
  }

  /**
   * Validate a transcript against what the classifier can actually spell.
   * Everything funnels through unsignableLetters()/setPhrase() — the same
   * gate the phrase menu uses — so speech cannot seat a word the 6-letter
   * template set cannot recognize.
   */
  private handleTranscript(raw: string, simulated: boolean): void {
    const word = (raw !== null && raw !== undefined ? raw : "")
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
    if (this.verbose) {
      print("SignBridge: flow transcript " + (simulated ? "(SIMULATED) " : "") + "'" + raw + "' -> '" + word + "'")
    }
    if (word.length === 0) {
      this.enterIdle("DIDN'T CATCH THAT — TRY AGAIN")
      return
    }

    const missing = this.phrases.unsignableLetters(word)
    if (missing.length > 0) {
      this.enterIdle("CAN'T SPELL '" + word + "' YET — MISSING " + missing.join(" "))
      return
    }

    if (!this.seatPhrase(word)) {
      // unsignableLetters() said yes but setPhrase() refused — J/Z or another
      // guard fired. Surface it rather than dead-ending.
      this.enterIdle("CAN'T SPELL '" + word + "' YET")
      return
    }

    if (this.verbose) {
      print("SignBridge: flow spelling '" + word + "'.")
    }
  }

  /**
   * Seat an arbitrary word as the active phrase and reset the pipeline so
   * spelling starts from the top. Goes through the same setPhrase() gate as
   * the speech flow, so a word needing letters the classifier does not have is
   * refused (returns false). restart() re-seats the phrase (setPhrase is
   * idempotent on a clean phrase), clears the hold buffer and the
   * reference-hand cache, and flips the speech flow to "spelling".
   *
   * Public for the speech flow and for LEAF scenarios — the alphabet-demo
   * scenario uses it to seat the full loaded letter set as one word.
   */
  seatPhrase(word: string): boolean {
    if (!this.phrases.setPhrase(word)) {
      return false
    }
    this.restart()
    if (this.mockHandInput) {
      this.mockHandInput.reset()
    }
    return true
  }

  /** Build the idle screen: title, START button, status line. */
  private buildFlowScreen(): void {
    const root = global.scene.createSceneObject("FlowIdleScreen")
    root.setParent(this.getSceneObject())
    // In front of the inward panel plane (z -110) so it cannot z-fight it.
    root.getTransform().setWorldPosition(new vec3(0, -13, -106))
    this.flowRoot = root

    this.flowText(root, "ASL BRIDGE", 52, new vec4(1, 1, 1, 1), new vec3(0, 2.5, 0))
    this.flowStatusText = this.flowText(
      root,
      "PINCH START, THEN SAY A WORD",
      30,
      new vec4(0.75, 0.78, 0.82, 1),
      new vec3(0, -0.6, 0)
    )

    const buttonObj = global.scene.createSceneObject("FlowStartButton")
    buttonObj.setParent(root)
    buttonObj.getTransform().setLocalPosition(new vec3(0, -5.5, 0))
    this.flowButtonObject = buttonObj
    const button = buttonObj.createComponent(Button.getTypeName()) as Button
    button.size = new vec3(12, 4.2, 1.6)
    // NOTE: the panels' plates were deliberately stripped of their
    // Interactables (they are readouts). This button is the ONE interactive
    // object in the Lens, and its Interactable comes from the UIKit Button
    // itself — do not "clean" it the way the plates were cleaned.
    button.onTriggerUp.add(() => {
      this.beginListening()
    })

    this.flowText(buttonObj, "START", 34, new vec4(1, 1, 1, 1), new vec3(0, 0, 1.2))
  }

  private flowText(parent: SceneObject, value: string, size: number, color: vec4, offset: vec3): Text {
    const so = global.scene.createSceneObject("FlowText")
    so.setParent(parent)
    so.getTransform().setLocalPosition(offset)
    const t = so.createComponent("Component.Text") as Text
    t.text = value
    t.size = size
    t.textFill.color = color
    t.horizontalAlignment = HorizontalAlignment.Center
    t.verticalAlignment = VerticalAlignment.Center
    return t
  }

  private setFlowScreenVisible(on: boolean): void {
    if (this.flowRoot !== null && this.flowRoot.enabled !== on) {
      this.flowRoot.enabled = on
    }
  }

  /**
   * Hide the spelling surfaces (panels + the live hand's caption) while the
   * idle/listening screens are up, so the two screens never overprint. The
   * reference hand hides via updateReferenceHand's own flow check, and the live
   * rig hides itself on the untracked frames the hold state feeds it.
   */
  private setSpellingContentVisible(on: boolean): void {
    const panels = [this.inwardPanel, this.outwardPanel]
    for (let i = 0; i < panels.length; i++) {
      if (panels[i]) {
        const so = panels[i].getSceneObject()
        if (so.enabled !== on) {
          so.enabled = on
        }
      }
    }
    if (this.handVisualizer && this.handVisualizer.labelObject) {
      this.handVisualizer.labelObject.enabled = on
    }
    if (this.referenceHandVisualizer && this.referenceHandVisualizer.labelObject && !on) {
      this.referenceHandVisualizer.labelObject.enabled = false
    }
  }
}
