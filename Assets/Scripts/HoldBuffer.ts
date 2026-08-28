/**
 * HoldBuffer — temporal stabilization between the classifier and the display.
 *
 * A per-frame classifier flickers: adjacent letters swap on noise, and a hand
 * moving between two letters passes through poses that look like a third. This
 * holds a sliding window of recent frames and commits a letter only when the
 * window agrees, so a letter has to be held deliberately to be accepted.
 *
 * Default window is 18 frames — about 0.6s at 30fps. See `framesForSeconds`
 * if the device runs at a different rate.
 *
 * ---------------------------------------------------------------------------
 * WHY BOTH GATES
 * ---------------------------------------------------------------------------
 *
 * Margin confidence is scale-free: it says how much better the winner is than
 * the runner-up, and nothing about whether the pose resembles a letter at all.
 * A hand doing something that is not a letter can sit far from every template
 * and still be much nearer one than the rest, scoring high confidence on a
 * meaningless answer.
 *
 * So a frame must clear BOTH:
 *   confidence — the winner is clearly ahead of the runner-up
 *   distance   — the pose is actually close to that letter's templates
 *
 * `maxDistance` defaults to Infinity, which DISABLES the distance gate. That
 * is deliberate: the correct value can only come from the recorded separation
 * between letter and _NEGATIVE distances, and inventing one here would look
 * calibrated while being a guess. The constructor warns while it is unset.
 *
 * ---------------------------------------------------------------------------
 * HOW FRAMES ARE TREATED
 * ---------------------------------------------------------------------------
 *
 *   untracked  -> hard reset. The hand is gone; prior evidence is void.
 *   rejected   -> pushed as a null vote (failed the distance gate). It breaks
 *                 agreement but does NOT wipe the window, so one noisy frame
 *                 delays a commit rather than destroying 0.6s of good evidence.
 *   accepted   -> pushed as a vote for its letter, with its confidence.
 *
 * ---------------------------------------------------------------------------
 * DOUBLE LETTERS, AND WHY RE-ARMING IS NOT INSTANT
 * ---------------------------------------------------------------------------
 *
 * After committing, the buffer disarms so a held pose does not re-commit every
 * frame. Re-arming is what allows a deliberate double ("LL"), since
 * fingerspelled doubles are signed with a bounce between the two.
 *
 * But not every non-matching frame is a bounce. A momentary tracking dropout,
 * or a single misclassified frame mid-hold, looks identical to the start of one.
 * If either re-armed instantly, the window would refill with the still-held
 * letter and commit it again — a spurious double manufactured out of noise.
 *
 * So the two kinds of evidence are treated differently:
 *
 *   UNTRACKED  — unambiguous. The hand is genuinely gone. Re-arms immediately.
 *   REJECTED   — ambiguous. Could be a dropout or the start of a bounce.
 *   DIFFERENT  — ambiguous. Could be a misclassification or a real new letter.
 *
 * Both ambiguous kinds must occur `rearmFrames` times CONSECUTIVELY (default 3)
 * before the buffer re-arms. A matching frame resets that run to zero. A
 * deliberate bounce easily clears three frames; a one-frame glitch does not.
 */

import type {ClassificationResult} from "./Classifier"

/** Frames needed to cover a duration at a given frame rate. */
export function framesForSeconds(seconds: number, fps: number): number {
  const n = Math.round(seconds * fps)
  return n < 1 ? 1 : n
}

export type HoldBufferConfig = {
  /** Window length in frames. Default 18 (~0.6s at 30fps). */
  capacity?: number

  /**
   * Mean confidence the winning letter must reach, averaged over the frames
   * that voted for it. Default 0.3 — PROVISIONAL, set from real data.
   */
  minMeanConfidence?: number

  /**
   * Maximum template distance for a frame to count as a letter at all.
   * Default Infinity, which disables the gate. Set this from the measured
   * separation between letter and _NEGATIVE distances.
   */
  maxDistance?: number

  /**
   * Fraction of the window that must vote for the winner. Default 1.0 —
   * unanimous across the whole window. Lower it only with evidence.
   */
  requiredAgreement?: number

  /**
   * Consecutive ambiguous non-matching frames — rejected, or a different
   * letter — needed to re-arm after a commit. Default 3.
   *
   * This is what separates a deliberate bounce from a one-frame glitch. Too
   * low and tracking noise manufactures spurious doubles; too high and a real
   * double letter becomes hard to sign. An untracked frame bypasses this
   * entirely, since it is unambiguous.
   */
  rearmFrames?: number
}

export type HoldState = {
  /** Leading letter in the window, or null when nothing leads. */
  candidate: string | null

  /** Fraction of the full window voting for `candidate`, 0..1. */
  agreement: number

  /** Mean confidence of the frames voting for `candidate`, 0..1. */
  meanConfidence: number

  /**
   * Overall progress toward a commit, 0..1 — what a confidence bar should
   * render. Reaches 1 exactly when agreement and confidence both meet their
   * thresholds, so the bar fills as a letter is held rather than snapping.
   */
  progress: number

  /** Frames currently in the window. */
  filled: number

  /** Window length. */
  capacity: number

  /** Frames in the window that failed the distance gate. */
  rejected: number

  /** False after a commit until enough non-matching frames re-arm the buffer. */
  armed: boolean

  /**
   * Consecutive ambiguous non-matching frames seen while disarmed. Reaches
   * `rearmFrames` to re-arm; a matching frame resets it to 0. Always 0 while
   * armed. Exposed for debugging a hold that will not re-commit.
   */
  nonMatchingRun: number

  /** The most recently committed letter, or null. */
  committed: string | null
}

export class HoldBuffer {
  private capacity: number
  private minMeanConfidence: number
  private maxDistance: number
  private requiredAgreement: number
  private rearmFrames: number

  /** Ring storage. A null letter is a rejected frame. */
  private letters: (string | null)[]
  private confidences: number[]
  private head = 0
  private filled = 0

  private armed = true
  private committed: string | null = null

  /** Consecutive ambiguous non-matching frames while disarmed. */
  private nonMatchingRun = 0

  /** Reused vote tallies, so the per-frame path does not allocate. */
  private tallyNames: string[] = []
  private tallyCounts: number[] = []
  private tallyConfidence: number[] = []

  constructor(config: HoldBufferConfig = {}) {
    this.capacity = config.capacity !== undefined && config.capacity > 0 ? Math.floor(config.capacity) : 18
    this.minMeanConfidence = config.minMeanConfidence !== undefined ? config.minMeanConfidence : 0.3
    this.maxDistance = config.maxDistance !== undefined ? config.maxDistance : Infinity
    this.requiredAgreement =
      config.requiredAgreement !== undefined ? Math.max(0, Math.min(1, config.requiredAgreement)) : 1
    this.rearmFrames = config.rearmFrames !== undefined && config.rearmFrames >= 1 ? Math.floor(config.rearmFrames) : 3

    this.letters = new Array(this.capacity)
    this.confidences = new Array(this.capacity)
    this.reset()

    if (!isFinite(this.maxDistance)) {
      print(
        "HoldBuffer WARNING: maxDistance is unset, so the distance gate is DISABLED. Margin confidence " +
          "alone cannot reject a non-letter pose — a hand far from every template still scores high " +
          "confidence if it is nearer one than the rest. Calibrate maxDistance from the separation " +
          "between letter and _NEGATIVE distances before trusting commits."
      )
    }
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  /**
   * Feed one frame.
   *
   * @param result the classifier's output, or null when the hand is not
   *               tracked (which hard-resets the window)
   * @returns the letter committed on this frame, or null
   */
  push(result: ClassificationResult | null): string | null {
    if (result === null) {
      // Hand gone. Unambiguous evidence it left the pose, so this re-arms
      // immediately — no run required.
      this.reset()
      return null
    }

    const accepted = result.distance <= this.maxDistance
    this.write(accepted ? result.letter : null, accepted ? result.confidence : 0)

    if (!this.armed) {
      const matchesCommitted = accepted && result.letter === this.committed
      if (matchesCommitted) {
        // Still holding the same letter — any partial run was a glitch.
        this.nonMatchingRun = 0
      } else {
        // Ambiguous: a dropout, a misclassification, or a real bounce. Only a
        // sustained run distinguishes the last from the first two.
        this.nonMatchingRun++
        if (this.nonMatchingRun >= this.rearmFrames) {
          this.armed = true
          this.nonMatchingRun = 0
        }
      }
    }

    if (this.filled < this.capacity || !this.armed) {
      return null
    }

    const winner = this.tally()
    if (winner === null) {
      return null
    }

    const agreement = winner.count / this.capacity
    const meanConfidence = winner.confidenceTotal / winner.count

    if (agreement + 1e-9 < this.requiredAgreement || meanConfidence < this.minMeanConfidence) {
      return null
    }

    this.committed = winner.name
    this.armed = false
    this.nonMatchingRun = 0
    // Clear the window so the next letter is judged on fresh evidence only.
    this.clearWindow()
    return this.committed
  }

  /** Explicit alias for a frame with no hand. Equivalent to push(null). */
  pushUntracked(): void {
    this.push(null)
  }

  /** Empty the window and re-arm. Does not clear `committed`. */
  reset(): void {
    this.clearWindow()
    this.armed = true
    this.nonMatchingRun = 0
  }

  // -------------------------------------------------------------------------
  // Output
  // -------------------------------------------------------------------------

  /**
   * Current window state, for rendering progress toward a commit rather than a
   * binary committed/not.
   */
  getState(): HoldState {
    const winner = this.filled > 0 ? this.tally() : null

    let candidate: string | null = null
    let agreement = 0
    let meanConfidence = 0

    if (winner !== null) {
      candidate = winner.name
      agreement = winner.count / this.capacity
      meanConfidence = winner.confidenceTotal / winner.count
    }

    // Two independent factors, each normalized against its own threshold, so
    // the bar reaches full exactly when both are satisfied.
    const agreementTarget = this.requiredAgreement > 0 ? this.requiredAgreement : 1
    const agreementProgress = clamp01(agreement / agreementTarget)
    const confidenceProgress =
      this.minMeanConfidence > 0 ? clamp01(meanConfidence / this.minMeanConfidence) : meanConfidence > 0 ? 1 : 0

    // A commit clears the window in the same frame it fires, so the bar would
    // otherwise jump from partial straight to zero and never visibly complete.
    // Empty window + disarmed means a commit just happened: report full. The
    // next pushed frame refills the window and ends this condition.
    const justCommitted = this.filled === 0 && !this.armed && this.committed !== null

    let progress: number
    if (justCommitted) {
      progress = 1
    } else if (this.armed) {
      progress = agreementProgress * confidenceProgress
    } else {
      // Disarmed and still holding the committed pose: no progress is being
      // made toward another commit, and the bar should say so.
      progress = 0
    }

    return {
      candidate: candidate,
      agreement: agreement,
      meanConfidence: meanConfidence,
      progress: progress,
      filled: this.filled,
      capacity: this.capacity,
      rejected: this.countRejected(),
      armed: this.armed,
      nonMatchingRun: this.nonMatchingRun,
      committed: this.committed
    }
  }

  /** The most recently committed letter, or null. */
  lastCommitted(): string | null {
    return this.committed
  }

  /** Forget the last commit — e.g. after the caller consumes it. */
  clearCommitted(): void {
    this.committed = null
  }

  describe(): string {
    return (
      "window=" +
      this.capacity +
      " agreement>=" +
      this.requiredAgreement +
      " meanConf>=" +
      this.minMeanConfidence +
      " maxDist" +
      (isFinite(this.maxDistance) ? "<=" + this.maxDistance : "=off") +
      " rearm=" +
      this.rearmFrames
    )
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private clearWindow(): void {
    for (let i = 0; i < this.capacity; i++) {
      this.letters[i] = null
      this.confidences[i] = 0
    }
    this.head = 0
    this.filled = 0
  }

  private write(letter: string | null, confidence: number): void {
    this.letters[this.head] = letter
    this.confidences[this.head] = confidence
    this.head = (this.head + 1) % this.capacity
    if (this.filled < this.capacity) {
      this.filled++
    }
  }

  private countRejected(): number {
    let n = 0
    for (let i = 0; i < this.filled; i++) {
      if (this.letters[i] === null) {
        n++
      }
    }
    return n
  }

  /**
   * Most-voted letter in the window, with its vote count and summed confidence.
   * Rejected frames hold a null letter and are counted for nobody, so they
   * dilute agreement — which is exactly what should happen.
   */
  private tally(): {name: string; count: number; confidenceTotal: number} | null {
    let distinct = 0

    for (let i = 0; i < this.filled; i++) {
      const letter = this.letters[i]
      if (letter === null) {
        continue
      }
      let at = -1
      for (let t = 0; t < distinct; t++) {
        if (this.tallyNames[t] === letter) {
          at = t
          break
        }
      }
      if (at === -1) {
        at = distinct
        this.tallyNames[at] = letter
        this.tallyCounts[at] = 0
        this.tallyConfidence[at] = 0
        distinct++
      }
      this.tallyCounts[at]++
      this.tallyConfidence[at] += this.confidences[i]
    }

    if (distinct === 0) {
      return null
    }

    let bestAt = 0
    for (let t = 1; t < distinct; t++) {
      if (this.tallyCounts[t] > this.tallyCounts[bestAt]) {
        bestAt = t
      }
    }

    return {
      name: this.tallyNames[bestAt],
      count: this.tallyCounts[bestAt],
      confidenceTotal: this.tallyConfidence[bestAt]
    }
  }
}

function clamp01(value: number): number {
  if (!(value > 0)) {
    return 0
  }
  return value > 1 ? 1 : value
}
