/**
 * MockHandInput — synthetic hand features for Editor-side testing.
 *
 * Raw HandInputData does not fire in the Lens Studio Editor, so anything
 * downstream of hand tracking is untestable in preview without a stand-in.
 * This injects 78-dim feature vectors directly, letting the classifier and the
 * hold-buffer state machine run in preview with no hardware.
 *
 * ---------------------------------------------------------------------------
 * THE SEAM
 * ---------------------------------------------------------------------------
 *
 * The mock replaces the FEATURE VECTOR, not the TrackedHand. Faking a
 * TrackedHand would mean faking 26 Keypoints, each of which builds itself from
 * an ObjectTracking3D attachment point — brittle and pointless. Instead both
 * paths implement `HandFeatureSource`, so consumer code is identical:
 *
 *   const source = resolveHandFeatureSource(this.hand)   // mock in Editor,
 *   const features = source.getFeatures(this.scratch)    // live on device
 *   if (features === null) { ...hand not tracked... }
 *
 * ---------------------------------------------------------------------------
 * WHAT THE JITTER DOES AND DOES NOT MODEL
 * ---------------------------------------------------------------------------
 *
 * Jitter is gaussian noise added in FEATURE space, after normalization. Real
 * tracking noise happens in LANDMARK space, before it — so real noise is
 * correlated across dimensions in ways this does not reproduce. In particular,
 * jitter on the wrist or middleKnuckle would in reality rotate and rescale the
 * whole basis, moving every other landmark together; here each dimension is
 * perturbed independently.
 *
 * So this is good for "does the hold buffer settle under noise of roughly this
 * magnitude" and NOT good for "what is my true accuracy under tracking noise".
 * Treat a threshold tuned purely against mock jitter as provisional until it
 * has seen a real hand.
 *
 * By default the 6 structurally-constant dims are left un-jittered
 * (`preserveStructuralDims`), because `normalizeLandmarks` can never emit a
 * nonzero value there — jittering them would produce vectors off the valid
 * manifold and tune the classifier against input it will never see.
 *
 * Randomness is a seeded LCG, never Math.random(), so a scenario replays
 * identically. That matters for LEAF.
 */

import type {BaseHand} from "SpectaclesInteractionKit.lspkg/Providers/HandInputData/BaseHand"
import {FEATURE_DIM, L, normalizeTrackedHand} from "./LandmarkCapture"
import {extractNormalized as readNormalized, isReservedKey, letterKeys, TemplatesFile} from "./TemplateFormat"

/**
 * Anything that can produce a hand feature vector. Implemented by the live
 * SIK path and by this mock, so consumers never branch on which they have.
 */
export interface HandFeatureSource {
  /** False when there is no usable hand this frame. */
  isTracked(): boolean

  /**
   * The current frame's feature vector, or null when not tracked.
   * Stable within a frame: repeated calls return the same values.
   */
  getFeatures(out?: Float32Array): Float32Array | null

  /** Human-readable tag for logs and test assertions. */
  currentLabel(): string
}

/** One step in a scripted sequence. */
export type MockPoseStep = {
  /** Tag for logs and assertions, e.g. the letter this pose represents. */
  label?: string

  /**
   * The pose to emit, at least `FEATURE_DIM` long — or null to simulate the
   * hand being absent, which is how you exercise loss-of-tracking handling.
   */
  features: ArrayLike<number> | null

  /** How many frames to hold this step. Values below 1 are treated as 1. */
  frames: number
}

// Template-file schema lives in TemplateFormat; re-exported so existing
// importers of these names keep working.
export {extractNormalized} from "./TemplateFormat"
export type {TemplateSample, TemplatesFile} from "./TemplateFormat"

export type TemplateSequenceOptions = {
  /** Frames to hold each letter. Default 30. */
  framesPerPose?: number
  /** Frames of "no hand" inserted between letters. Default 10. Use 0 for none. */
  gapFrames?: number
  /** Restrict to these letters, in this order. Default: every letter present. */
  letters?: string[]
  /** Which recorded sample to use per letter. Default 0. Wraps if out of range. */
  sampleIndex?: number
}

/** Structurally constant feature dims — see LandmarkCapture. */
const STRUCTURAL_DIMS: readonly number[] = [
  L.WRIST * 3,
  L.WRIST * 3 + 1,
  L.WRIST * 3 + 2,
  L.MIDDLE_KNUCKLE * 3,
  L.MIDDLE_KNUCKLE * 3 + 1,
  L.MIDDLE_KNUCKLE * 3 + 2
]

/** Live SIK-backed source. The device path. */
export class LiveHandFeatureSource implements HandFeatureSource {
  constructor(private hand: BaseHand | null | undefined) {}

  isTracked(): boolean {
    return !!this.hand && this.hand.isTracked()
  }

  getFeatures(out?: Float32Array): Float32Array | null {
    return normalizeTrackedHand(this.hand, out)
  }

  currentLabel(): string {
    return "live"
  }
}

/**
 * Module-level active source. When a MockHandInput registers itself, every
 * consumer using `resolveHandFeatureSource` picks it up with no rewiring.
 */
let activeSource: HandFeatureSource | null = null

export function setActiveHandFeatureSource(source: HandFeatureSource | null): void {
  activeSource = source
}

export function getActiveHandFeatureSource(): HandFeatureSource | null {
  return activeSource
}

/**
 * The one call consumers should make. Returns the registered mock if there is
 * one, otherwise a live source wrapping the supplied hand.
 */
export function resolveHandFeatureSource(hand: BaseHand | null | undefined): HandFeatureSource {
  if (activeSource !== null) {
    return activeSource
  }
  return new LiveHandFeatureSource(hand)
}

@component
export class MockHandInput extends BaseScriptComponent implements HandFeatureSource {
  @input
  @hint("Register as the active feature source on start, so consumers pick this up automatically.")
  makeActive: boolean = true

  @input
  @hint("Advance one step-frame per UpdateEvent. Turn OFF to drive manually with advanceFrame() from a test.")
  autoAdvance: boolean = true

  @input
  @hint("Restart the sequence from the beginning when it ends.")
  loopSequence: boolean = true

  @input
  @hint("Standard deviation of gaussian noise added per dimension, in normalized units. 0 disables jitter.")
  jitterSigma: number = 0

  @input
  @hint("Seed for the noise generator. Same seed plus same sequence replays identically.")
  randomSeed: number = 1

  @input
  @hint("Leave the 6 structurally-constant dims un-jittered, keeping output on the valid manifold. Recommended ON.")
  preserveStructuralDims: boolean = true

  @input
  @hint("Blend from the last tracked pose into each new one over this many frames instead of snapping. 0 = off (shipped). Filming aid.")
  interpolateFrames: number = 0

  @input
  @allowUndefined
  @hint("Optional. Shows the current step label and frame, so preview state is visible at a glance.")
  statusText: Text

  private steps: MockPoseStep[] = []
  private stepIndex = 0
  private framesIntoStep = 0
  private playing = true
  private finished = false

  /** The frame's emitted vector, computed once and reused — mirrors SIK's frame caching. */
  private frameVector = new Float32Array(FEATURE_DIM)
  private frameVectorValid = false
  private frameTracked = false

  private rngState = 1
  private spareGaussian = 0
  private hasSpareGaussian = false

  /**
   * The pose the current step is sweeping away from. Holds the last *tracked*
   * step's vector, so a gap does not clear it — a hand lowered between letters
   * and raised again sweeps into the new shape rather than popping into it.
   */
  private blendFrom = new Float32Array(FEATURE_DIM)
  private hasBlendFrom = false

  onAwake() {
    this.resetRandom()

    this.createEvent("OnStartEvent").bind(() => {
      if (this.makeActive) {
        setActiveHandFeatureSource(this)
        print("MockHandInput: registered as the active hand feature source (Editor testing mode).")
      }
      this.rebuildFrame()
    })

    this.createEvent("UpdateEvent").bind(() => {
      if (this.autoAdvance) {
        this.advanceFrame()
      }
      this.updateStatusText()
    })
  }

  onDestroy() {
    if (activeSource === this) {
      setActiveHandFeatureSource(null)
    }
  }

  // -------------------------------------------------------------------------
  // HandFeatureSource
  // -------------------------------------------------------------------------

  isTracked(): boolean {
    if (!this.frameVectorValid) {
      this.rebuildFrame()
    }
    return this.frameTracked
  }

  getFeatures(out?: Float32Array): Float32Array | null {
    if (!this.frameVectorValid) {
      this.rebuildFrame()
    }
    if (!this.frameTracked) {
      return null
    }
    if (out === undefined) {
      return this.frameVector
    }
    if (out.length < FEATURE_DIM) {
      throw new Error("MockHandInput.getFeatures: out buffer must hold at least " + FEATURE_DIM + " floats.")
    }
    for (let i = 0; i < FEATURE_DIM; i++) {
      out[i] = this.frameVector[i]
    }
    return out
  }

  currentLabel(): string {
    const step = this.currentStep()
    if (step === null) {
      return "empty"
    }
    if (step.features === null) {
      return step.label !== undefined ? step.label : "untracked"
    }
    return step.label !== undefined ? step.label : "pose" + this.stepIndex
  }

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  /** Emit one pose forever. The simplest possible setup. */
  setStaticPose(features: ArrayLike<number>, label?: string): void {
    this.validatePose(features, "setStaticPose")
    // Number.MAX_SAFE_INTEGER would overflow the frame counter over a long run;
    // a large finite hold plus looping is equivalent and safer.
    this.setSequence([{label: label !== undefined ? label : "static", features: features, frames: 1}], true)
  }

  /** Emit "no hand" forever. For testing loss-of-tracking paths. */
  setUntracked(): void {
    this.setSequence([{label: "untracked", features: null, frames: 1}], true)
  }

  /** Replace the sequence and restart it. */
  setSequence(steps: MockPoseStep[], loop?: boolean): void {
    if (!steps || steps.length === 0) {
      throw new Error("MockHandInput.setSequence: need at least one step.")
    }
    for (let i = 0; i < steps.length; i++) {
      if (steps[i].features !== null) {
        this.validatePose(steps[i].features, "setSequence step " + i)
      }
    }
    this.steps = steps
    if (loop !== undefined) {
      this.loopSequence = loop
    }
    this.reset()
  }

  /**
   * Build a sequence from a templates.json-shaped object, so the classifier can
   * be driven with the real recorded poses it will see on device.
   *
   * Between letters it emits `gapFrames` of "no hand", which is what makes the
   * state machine's commit-and-reset behavior observable.
   */
  loadFromTemplates(templates: TemplatesFile, options: TemplateSequenceOptions = {}): void {
    if (!templates || !templates.letters) {
      throw new Error("MockHandInput.loadFromTemplates: expected an object with a 'letters' map.")
    }
    const framesPerPose = options.framesPerPose !== undefined ? options.framesPerPose : 30
    const gapFrames = options.gapFrames !== undefined ? options.gapFrames : 10
    const sampleIndex = options.sampleIndex !== undefined ? options.sampleIndex : 0

    // Reserved keys (_NEGATIVE) are excluded unless asked for by name — a
    // negative sequence is useful for testing rejection, but it must never be
    // swept in as if it were a letter.
    const letters = options.letters !== undefined ? options.letters : letterKeys(templates)
    const steps: MockPoseStep[] = []

    for (let i = 0; i < letters.length; i++) {
      const letter = letters[i]
      const samples = templates.letters[letter]
      if (!samples || samples.length === 0) {
        print("MockHandInput: skipping " + letter + " — no samples in templates.")
        continue
      }
      if (isReservedKey(letter) && options.letters === undefined) {
        continue
      }
      const entry = samples[sampleIndex % samples.length]
      const features = readNormalized(entry)
      if (features === null) {
        print("MockHandInput: skipping " + letter + " — sample has no usable normalized vector.")
        continue
      }
      steps.push({label: letter, features: features, frames: framesPerPose})
      if (gapFrames > 0) {
        steps.push({label: "gap", features: null, frames: gapFrames})
      }
    }

    if (steps.length === 0) {
      throw new Error("MockHandInput.loadFromTemplates: no usable letters found.")
    }
    this.setSequence(steps)
    print("MockHandInput: loaded " + letters.length + " letters from templates (" + steps.length + " steps).")
  }

  setJitter(sigma: number): void {
    this.jitterSigma = sigma
    this.invalidateFrame()
  }

  /** Reseed the noise generator. Call before a run for a reproducible replay. */
  setSeed(seed: number): void {
    this.randomSeed = seed
    this.resetRandom()
    this.invalidateFrame()
  }

  // -------------------------------------------------------------------------
  // Transport
  // -------------------------------------------------------------------------

  play(): void {
    this.playing = true
  }

  pause(): void {
    this.playing = false
  }

  /** Back to step 0, frame 0, with the RNG reseeded. Fully deterministic replay. */
  reset(): void {
    this.stepIndex = 0
    this.framesIntoStep = 0
    this.finished = false
    this.playing = true
    this.hasBlendFrom = false
    this.resetRandom()
    this.invalidateFrame()
    this.rebuildFrame()
  }

  /**
   * Advance exactly one frame. Called automatically when `autoAdvance` is on;
   * call it directly from a LEAF scenario for frame-exact control.
   */
  advanceFrame(): void {
    if (!this.playing || this.finished || this.steps.length === 0) {
      return
    }

    this.framesIntoStep++
    const step = this.currentStep()
    const hold = step !== null && step.frames > 1 ? step.frames : 1

    if (this.framesIntoStep >= hold) {
      // Remember the pose we are leaving so the next step can sweep out of it.
      // Untracked (gap) steps deliberately leave this untouched: there is no
      // hand to blend from, and the letter before the gap is the right origin.
      if (step !== null && step.features !== null) {
        for (let i = 0; i < FEATURE_DIM; i++) {
          this.blendFrom[i] = step.features[i]
        }
        this.hasBlendFrom = true
      }

      this.framesIntoStep = 0
      this.stepIndex++
      if (this.stepIndex >= this.steps.length) {
        if (this.loopSequence) {
          this.stepIndex = 0
        } else {
          this.stepIndex = this.steps.length - 1
          this.finished = true
        }
      }
    }

    this.invalidateFrame()
    this.rebuildFrame()
  }

  /** True once a non-looping sequence has run out. */
  isFinished(): boolean {
    return this.finished
  }

  stepCount(): number {
    return this.steps.length
  }

  currentStepIndex(): number {
    return this.stepIndex
  }

  // -------------------------------------------------------------------------
  // Frame construction
  // -------------------------------------------------------------------------

  private currentStep(): MockPoseStep | null {
    if (this.steps.length === 0) {
      return null
    }
    return this.steps[this.stepIndex]
  }

  private invalidateFrame(): void {
    this.frameVectorValid = false
  }

  /**
   * Compute this frame's vector once. Consumers calling getFeatures() several
   * times in a frame all see the same values — the same contract SIK's
   * frame-cached Keypoint.position provides.
   */
  private rebuildFrame(): void {
    this.frameVectorValid = true

    const step = this.currentStep()
    if (step === null || step.features === null) {
      this.frameTracked = false
      return
    }

    this.frameTracked = true
    const src = step.features
    const sigma = this.jitterSigma
    const t = this.blendWeight(step)

    if (t >= 1) {
      for (let i = 0; i < FEATURE_DIM; i++) {
        this.frameVector[i] = src[i]
      }
    } else {
      const from = this.blendFrom
      for (let i = 0; i < FEATURE_DIM; i++) {
        this.frameVector[i] = from[i] + (src[i] - from[i]) * t
      }
    }

    if (sigma > 0) {
      for (let i = 0; i < FEATURE_DIM; i++) {
        this.frameVector[i] += this.nextGaussian() * sigma
      }
    }

    // Pinned after both the blend and the jitter. A lerp between two on-manifold
    // vectors already lands on (0,0,0)/(0,1,0) exactly, so this is a no-op for
    // well-formed input — but it costs six writes and holds the invariant even
    // if an endpoint ever drifts off the manifold.
    if (this.preserveStructuralDims && (sigma > 0 || t < 1)) {
      // normalizeLandmarks can never emit anything but these exact values;
      // restoring them keeps mock output on the manifold real data occupies.
      for (let k = 0; k < STRUCTURAL_DIMS.length; k++) {
        const d = STRUCTURAL_DIMS[k]
        this.frameVector[d] = src[d]
      }
    }
  }

  /**
   * How far this frame has swept from `blendFrom` toward the step's own pose.
   * 1 means "fully arrived", which is every frame when interpolation is off.
   *
   * The ramp is (n + 1) / (blend + 1), so frame 0 has already moved off the
   * previous pose — re-emitting it would stall the sweep for a frame — and the
   * frame right after the blend window sits exactly on the target.
   */
  private blendWeight(step: MockPoseStep): number {
    const blend = this.blendLength(step)
    if (blend <= 0 || this.framesIntoStep >= blend) {
      return 1
    }
    return (this.framesIntoStep + 1) / (blend + 1)
  }

  /** Blend frames actually usable for this step, after clamping. */
  private blendLength(step: MockPoseStep): number {
    if (!this.hasBlendFrom) {
      return 0
    }
    const requested = Math.floor(this.interpolateFrames)
    // Written as !(x > 0), not (x <= 0), so NaN takes this branch. A scene whose
    // component predates this input supplies `undefined`, and Math.floor of that
    // is NaN — under a `<= 0` test it would fall through to the clamp below and
    // silently blend the entire step. The off switch has to hold for absent input.
    if (!(requested > 0)) {
      return 0
    }
    // Always leave at least one frame sitting on the pure target pose. A step
    // shorter than the blend window would otherwise spend its entire life
    // mid-sweep, and the classifier would never once see the letter it is
    // supposed to be holding.
    const room = (step.frames > 1 ? step.frames : 1) - 1
    return requested < room ? requested : room
  }

  private updateStatusText(): void {
    if (!this.statusText) {
      return
    }
    const step = this.currentStep()
    const hold = step !== null && step.frames > 1 ? step.frames : 1
    this.statusText.text =
      "MOCK  " +
      this.currentLabel() +
      "\nstep " +
      (this.stepIndex + 1) +
      "/" +
      this.steps.length +
      "  frame " +
      (this.framesIntoStep + 1) +
      "/" +
      hold +
      (this.jitterSigma > 0 ? "\njitter " + this.jitterSigma : "") +
      (this.frameTracked ? "" : "\n(no hand)")
  }

  // -------------------------------------------------------------------------
  // Deterministic randomness — never Math.random(), so replays are exact
  // -------------------------------------------------------------------------

  private resetRandom(): void {
    // Zero is a fixed point for this LCG; nudge it off.
    this.rngState = this.randomSeed >>> 0 || 1
    this.hasSpareGaussian = false
    this.spareGaussian = 0
  }

  /** Numerical Recipes LCG. Uniform in [0, 1). */
  private nextUniform(): number {
    this.rngState = (Math.imul(this.rngState, 1664525) + 1013904223) >>> 0
    return this.rngState / 4294967296
  }

  /** Box-Muller, keeping the second value for the next call. */
  private nextGaussian(): number {
    if (this.hasSpareGaussian) {
      this.hasSpareGaussian = false
      return this.spareGaussian
    }
    let u = this.nextUniform()
    const v = this.nextUniform()
    if (u < 1e-12) {
      u = 1e-12
    }
    const mag = Math.sqrt(-2 * Math.log(u))
    const angle = 2 * Math.PI * v
    this.spareGaussian = mag * Math.sin(angle)
    this.hasSpareGaussian = true
    return mag * Math.cos(angle)
  }

  private validatePose(features: ArrayLike<number> | null, where: string): void {
    if (!features || features.length < FEATURE_DIM) {
      throw new Error(
        "MockHandInput." +
          where +
          ": pose must have at least " +
          FEATURE_DIM +
          " values, got " +
          (features ? String(features.length) : "null") +
          "."
      )
    }
  }
}
