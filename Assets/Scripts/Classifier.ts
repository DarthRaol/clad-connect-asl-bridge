/**
 * Classifier — k-NN handshape recognition over recorded templates.
 *
 * Entry point is `classify(features) -> {letter, confidence}`. Confidence is
 * margin-based: `1 - (d_best / d_runnerUp)`, so a pose sitting between two
 * letters scores near zero instead of arbitrarily picking one.
 *
 * ---------------------------------------------------------------------------
 * WHAT "RUNNER-UP" MEANS HERE
 * ---------------------------------------------------------------------------
 *
 * The margin is between the best and second-best LETTER, not the first and
 * second nearest templates. Those are different things, and the distinction
 * matters: with several samples per letter, the two nearest templates are very
 * often both the SAME letter, which would drive the margin to ~0 on exactly
 * the confident cases — the opposite of what confidence should do.
 *
 * So scoring runs per letter: each letter's score is the mean of its `k`
 * nearest templates (k = 1 by default, i.e. its single closest sample). The
 * winner is the lowest-scoring letter; the runner-up is the next lowest. This
 * is the within-class variant of k-NN rather than the vote-among-k-neighbours
 * variant, chosen because it makes the margin well defined.
 *
 * ---------------------------------------------------------------------------
 * CONFIDENCE DOES NOT REJECT UNKNOWN POSES
 * ---------------------------------------------------------------------------
 *
 * The margin is scale-free — it ignores how far the query is from ANY letter.
 * A hand doing something that is not a letter at all can sit far from every
 * template yet still be much closer to one than the rest, producing high
 * confidence for a meaningless answer.
 *
 * `distance` (the winner's absolute score) is returned for exactly this reason.
 * A caller that needs to reject out-of-vocabulary poses must gate on BOTH:
 *
 *   result.confidence >= minConfidence && result.distance <= maxDistance
 *
 * Both thresholds should be set from real recorded data, not guessed.
 *
 * ---------------------------------------------------------------------------
 * FEATURE VARIANTS
 * ---------------------------------------------------------------------------
 *
 * The same transform is applied to templates at load time and to the query at
 * classify time — they are never allowed to diverge, because a distance
 * computed across two different feature spaces is meaningless. Configure once
 * at construction; to compare variants, build several classifiers over the same
 * file (see `buildVariants`).
 */

import {
  FEATURE_DIM,
  REDUCED_DIM,
  reduceFeatures,
  weightFeatures
} from "./LandmarkCapture"
import type {HandFeatureSource} from "./MockHandInput"
import {extractNormalized, isReservedKey, NEGATIVE_KEY, TemplatesFile} from "./TemplateFormat"

/** Which feature space distances are computed in. */
export type ClassifierMode = "full" | "reduced"

export type ClassifierConfig = {
  /** "full" = all 78 dims, "reduced" = the 57-dim set. Default "full". */
  mode?: ClassifierMode

  /**
   * Per-landmark weights, length 26, from `makeWeights`. Null for uniform.
   * Remember weights hit SQUARED distance quadratically — a weight of 2 is 4x
   * the influence.
   */
  weights?: readonly number[] | null

  /**
   * How many of a letter's nearest templates to average into its score.
   * Default 1 (nearest sample). Clamped to what each letter actually has.
   */
  k?: number
}

export type ClassificationResult = {
  /** Best-matching letter. */
  letter: string

  /**
   * Margin confidence in [0, 1]: `1 - d_best / d_runnerUp`. 1 means an exact
   * match with a distant runner-up; 0 means the top two letters are equally
   * close. Zero when there is only one letter loaded — with nothing to compare
   * against there is no margin evidence, so no confidence is claimed.
   */
  confidence: number

  /** The winner's absolute score. Gate on this to reject unknown poses. */
  distance: number

  /** Second-best letter, or null when only one letter is loaded. */
  runnerUp: string | null

  /** The runner-up's absolute score, or Infinity when there is none. */
  runnerUpDistance: number
}

export type LoadReport = {
  letters: number
  samples: number
  skipped: number
}

/** Below this a distance counts as zero, for the degenerate-margin guard. */
const DISTANCE_EPSILON = 1e-9

export class Classifier {
  private mode: ClassifierMode
  private weights: readonly number[] | null
  private k: number

  /** Dimensionality of the space distances are computed in. */
  private dim: number

  private letters: string[] = []
  private templates: {[letter: string]: Float32Array[]} = {}

  /** Reused per classify() so the per-frame path does not allocate. */
  private queryScratch: Float32Array
  private distanceScratch: number[] = []
  private letterScores: number[] = []

  constructor(config: ClassifierConfig = {}) {
    this.mode = config.mode !== undefined ? config.mode : "full"
    this.weights = config.weights !== undefined ? config.weights : null
    this.k = config.k !== undefined && config.k > 0 ? Math.floor(config.k) : 1
    this.dim = this.mode === "reduced" ? REDUCED_DIM : FEATURE_DIM
    this.queryScratch = new Float32Array(this.dim)
  }

  // -------------------------------------------------------------------------
  // Loading
  // -------------------------------------------------------------------------

  /**
   * Load templates. Accepts both v1 (bare normalized arrays) and v2
   * (`{normalized, raw}` objects) sample shapes via `extractNormalized`.
   *
   * Replaces any previously loaded templates.
   */
  loadTemplates(file: TemplatesFile): LoadReport {
    if (!file || !file.letters) {
      throw new Error("Classifier.loadTemplates: expected an object with a 'letters' map.")
    }

    this.letters = []
    this.templates = {}
    let sampleCount = 0
    let skipped = 0
    let widest = 0

    const keys = Object.keys(file.letters)
    let reserved = 0
    for (let i = 0; i < keys.length; i++) {
      const letter = keys[i]

      // Reserved keys are calibration data, never classification candidates.
      // Letting _NEGATIVE through would make "not a letter" a possible answer.
      if (isReservedKey(letter)) {
        reserved++
        continue
      }

      const rawSamples = file.letters[letter]
      if (!rawSamples || rawSamples.length === 0) {
        continue
      }

      const transformed: Float32Array[] = []
      for (let s = 0; s < rawSamples.length; s++) {
        const normalized = extractNormalized(rawSamples[s])
        if (normalized === null) {
          skipped++
          continue
        }
        // Same transform as the query path — never allowed to diverge.
        transformed.push(this.transform(normalized, new Float32Array(this.dim)))
      }

      if (transformed.length === 0) {
        continue
      }
      this.letters.push(letter)
      this.templates[letter] = transformed
      sampleCount += transformed.length
      if (transformed.length > widest) {
        widest = transformed.length
      }
    }

    this.distanceScratch = new Array(widest)
    this.letterScores = new Array(this.letters.length)

    if (skipped > 0) {
      print("Classifier: skipped " + skipped + " unusable sample(s) while loading templates.")
    }
    if (reserved > 0) {
      const negatives = file.letters[NEGATIVE_KEY]
      print(
        "Classifier: excluded " +
          reserved +
          " reserved key(s) from classification" +
          (negatives ? " (" + NEGATIVE_KEY + ": " + negatives.length + " calibration samples)" : "") +
          "."
      )
    }
    if (this.letters.length === 1) {
      print(
        "Classifier WARNING: only one letter loaded. Every classification will report confidence 0, " +
          "because margin confidence needs a runner-up to measure against."
      )
    }

    return {letters: this.letters.length, samples: sampleCount, skipped: skipped}
  }

  /** Convenience for a JSON string. */
  loadFromJsonString(json: string): LoadReport {
    return this.loadTemplates(JSON.parse(json) as TemplatesFile)
  }

  /**
   * Convenience for a JsonAsset wired into the scene:
   *   `@input templatesAsset: JsonAsset` then `classifier.loadFromJsonAsset(this.templatesAsset)`
   */
  loadFromJsonAsset(asset: JsonAsset): LoadReport {
    if (!asset) {
      throw new Error("Classifier.loadFromJsonAsset: asset is null.")
    }
    return this.loadFromJsonString(asset.getString())
  }

  // -------------------------------------------------------------------------
  // Classification
  // -------------------------------------------------------------------------

  /**
   * Classify a full-length (78-dim) feature vector.
   *
   * The input is always the FULL vector regardless of mode — reduction is
   * applied internally, so callers never have to know which variant this
   * instance runs.
   *
   * @returns the result, or null if no templates are loaded
   */
  classify(features: ArrayLike<number>): ClassificationResult | null {
    if (this.letters.length === 0) {
      return null
    }
    if (!features || features.length < FEATURE_DIM) {
      throw new Error(
        "Classifier.classify: expected at least " +
          FEATURE_DIM +
          " values, got " +
          (features ? String(features.length) : "null") +
          "."
      )
    }

    const query = this.transform(features, this.queryScratch)

    let bestIndex = -1
    let bestScore = Infinity
    let runnerIndex = -1
    let runnerScore = Infinity

    for (let i = 0; i < this.letters.length; i++) {
      const score = this.letterScore(this.templates[this.letters[i]], query)
      this.letterScores[i] = score
      if (score < bestScore) {
        runnerScore = bestScore
        runnerIndex = bestIndex
        bestScore = score
        bestIndex = i
      } else if (score < runnerScore) {
        runnerScore = score
        runnerIndex = i
      }
    }

    let confidence = 0
    if (runnerIndex !== -1) {
      if (runnerScore <= DISTANCE_EPSILON) {
        // Both letters sit essentially on top of the query — no way to choose.
        confidence = 0
      } else {
        confidence = 1 - bestScore / runnerScore
        if (confidence < 0) {
          confidence = 0
        } else if (confidence > 1) {
          confidence = 1
        }
      }
    }

    return {
      letter: this.letters[bestIndex],
      confidence: confidence,
      distance: bestScore,
      runnerUp: runnerIndex === -1 ? null : this.letters[runnerIndex],
      runnerUpDistance: runnerIndex === -1 ? Infinity : runnerScore
    }
  }

  /**
   * Classify whatever the source is currently producing. This is the call that
   * keeps mock and live paths identical — the classifier never learns which
   * one it has.
   *
   * @returns null when the hand is not tracked, or no templates are loaded
   */
  classifyFrom(source: HandFeatureSource): ClassificationResult | null {
    if (!source) {
      return null
    }
    const features = source.getFeatures()
    if (features === null) {
      return null
    }
    return this.classify(features)
  }

  // -------------------------------------------------------------------------
  // Introspection
  // -------------------------------------------------------------------------

  /** Letters currently loaded, in scoring order. */
  loadedLetters(): string[] {
    return this.letters.slice()
  }

  /** Scores from the most recent classify(), aligned with `loadedLetters()`. */
  lastScores(): number[] {
    return this.letterScores.slice()
  }

  /** Short tag naming this variant, e.g. "reduced+weighted k=1". */
  describe(): string {
    return this.mode + (this.weights ? "+weighted" : "+unweighted") + " k=" + this.k + " dim=" + this.dim
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /**
   * A letter's score: the mean of its `k` smallest template distances.
   * k is clamped to how many samples the letter actually has.
   */
  private letterScore(samples: Float32Array[], query: Float32Array): number {
    const n = samples.length
    for (let s = 0; s < n; s++) {
      this.distanceScratch[s] = this.euclidean(samples[s], query)
    }

    const take = this.k < n ? this.k : n
    if (take === 1) {
      let min = Infinity
      for (let s = 0; s < n; s++) {
        if (this.distanceScratch[s] < min) {
          min = this.distanceScratch[s]
        }
      }
      return min
    }

    // Partial selection: n is a handful of samples, so this beats a full sort.
    let total = 0
    for (let pick = 0; pick < take; pick++) {
      let min = Infinity
      let minAt = -1
      for (let s = 0; s < n; s++) {
        if (this.distanceScratch[s] < min) {
          min = this.distanceScratch[s]
          minAt = s
        }
      }
      total += min
      this.distanceScratch[minAt] = Infinity
    }
    return total / take
  }

  private euclidean(a: Float32Array, b: Float32Array): number {
    let sum = 0
    for (let i = 0; i < this.dim; i++) {
      const d = a[i] - b[i]
      sum += d * d
    }
    return Math.sqrt(sum)
  }

  /**
   * The single feature transform. Applied to templates at load and to queries
   * at classify, so the two can never end up in different spaces.
   */
  private transform(src: ArrayLike<number>, out: Float32Array): Float32Array {
    if (this.mode === "reduced") {
      return reduceFeatures(src, {weights: this.weights, out: out})
    }
    if (this.weights !== null) {
      return weightFeatures(src, {weights: this.weights, out: out})
    }
    for (let i = 0; i < FEATURE_DIM; i++) {
      out[i] = src[i]
    }
    return out
  }
}

/**
 * Build the four feature variants over one template file, for empirical
 * comparison. Each is independently loaded, so they can be scored side by side
 * against the same held-out samples.
 *
 * @param weights weights to use for the two weighted variants, from `makeWeights`
 */
export function buildVariants(
  file: TemplatesFile,
  weights: readonly number[],
  k?: number
): {[name: string]: Classifier} {
  const configs: {[name: string]: ClassifierConfig} = {
    "full+unweighted": {mode: "full", weights: null, k: k},
    "full+weighted": {mode: "full", weights: weights, k: k},
    "reduced+unweighted": {mode: "reduced", weights: null, k: k},
    "reduced+weighted": {mode: "reduced", weights: weights, k: k}
  }

  const built: {[name: string]: Classifier} = {}
  const names = Object.keys(configs)
  for (let i = 0; i < names.length; i++) {
    const classifier = new Classifier(configs[names[i]])
    classifier.loadTemplates(file)
    built[names[i]] = classifier
  }
  return built
}
