/**
 * LandmarkCapture — pose normalization for ASL fingerspelling.
 *
 * Turns 26 raw hand keypoint positions into a rotation- and scale-invariant
 * 78-dim feature vector suitable for handshape classification.
 *
 * The core function takes a plain `vec3[]` — NOT a TrackedHand — so the same
 * classifier runs against live hardware and against LEAF fixture poses in the
 * Editor, where raw HandInputData events do not fire. `pointsFromTrackedHand`
 * below is the only place that touches SIK types.
 *
 * Landmark names, ordering, and the thumb naming trap are taken from
 * docs/JOINTS.md, which was enumerated from the SIK v2.0.0 type definitions.
 */

import type {BaseHand} from "SpectaclesInteractionKit.lspkg/Providers/HandInputData/BaseHand"

/** SIK exposes 26 keypoints per hand, not the MediaPipe 21. See docs/JOINTS.md. */
export const LANDMARK_COUNT = 26

/** 26 landmarks x 3 axes. */
export const FEATURE_DIM = 78

/**
 * Landmark order, matching `TrackedHand.points` exactly:
 * wrist, then thumb, index, middle, ring, pinky — each finger running
 * wrist-ward to tip-ward.
 *
 * NOTE the thumb naming trap (docs/JOINTS.md): index/middle/ring/pinky use
 * Knuckle/MidJoint/UpperJoint/Tip for landmarks 0/1/2/3, but the thumb uses
 * BaseJoint/Knuckle/MidJoint/Tip. So `thumbKnuckle` is THUMB_1 while
 * `indexKnuckle` is INDEX_0 — the same word, a different landmark index.
 * There is no thumbUpperJoint and no indexBaseJoint.
 */
export const LANDMARK_ORDER: readonly string[] = [
  "wrist",
  "thumbToWrist",
  "thumbBaseJoint",
  "thumbKnuckle",
  "thumbMidJoint",
  "thumbTip",
  "indexToWrist",
  "indexKnuckle",
  "indexMidJoint",
  "indexUpperJoint",
  "indexTip",
  "middleToWrist",
  "middleKnuckle",
  "middleMidJoint",
  "middleUpperJoint",
  "middleTip",
  "ringToWrist",
  "ringKnuckle",
  "ringMidJoint",
  "ringUpperJoint",
  "ringTip",
  "pinkyToWrist",
  "pinkyKnuckle",
  "pinkyMidJoint",
  "pinkyUpperJoint",
  "pinkyTip"
]

/**
 * Indices into a landmark array. Only the ones the basis math needs are named;
 * use `LANDMARK_ORDER.indexOf(name)` for anything else (not on a hot path).
 */
export const enum L {
  WRIST = 0,
  THUMB_BASE_JOINT = 2,
  THUMB_KNUCKLE = 3,
  THUMB_TIP = 5,
  INDEX_KNUCKLE = 7,
  INDEX_TIP = 10,
  MIDDLE_KNUCKLE = 12,
  MIDDLE_TIP = 15,
  RING_KNUCKLE = 17,
  PINKY_KNUCKLE = 22,
  PINKY_TIP = 25
}

/**
 * Below this, a length is treated as degenerate. Positions are in centimetres;
 * a real wrist-to-middle-knuckle span is ~8-10 cm, so 1e-4 only catches
 * genuinely collapsed input.
 */
const EPSILON = 1e-4

export type NormalizeOptions = {
  /**
   * Mirror the frame across the palm plane, mapping a left hand into the same
   * canonical space as a right hand.
   *
   * The basis is built from hand anatomy, so a left and a right hand forming
   * the SAME letter produce feature vectors that differ in the sign of z (the
   * palm normal). A classifier trained on one chirality will not recognize the
   * other unless left-hand input is mirrored here first.
   *
   * Default false — pass `hand.handType === "left"` if you support both hands.
   */
  mirror?: boolean

  /**
   * Optional destination buffer, to avoid allocating 78 floats every frame.
   * Must hold at least FEATURE_DIM floats. Reused across calls when supplied.
   */
  out?: Float32Array
}

/**
 * Normalize 26 world-space keypoint positions into a 78-dim feature vector.
 *
 * Frame construction:
 *   origin  = wrist
 *   yAxis   = normalize(middleKnuckle - wrist)          along the hand
 *   spread  = pinkyKnuckle - indexKnuckle               across the knuckles
 *   xAxis   = normalize(spread orthogonalized vs yAxis)
 *   zAxis   = xAxis cross yAxis                         palm normal
 *   scale   = length(middleKnuckle - wrist)
 *
 * Each point is expressed in that basis and divided by `scale`, giving
 * invariance to where the hand is, how it is rotated, and how big it is.
 *
 * Two consequences worth knowing:
 *   - dims 0..2 (wrist) are always (0, 0, 0)
 *   - dims 36..38 (middleKnuckle) are always (0, 1, 0)
 * Those 6 dims carry no signal and can be sliced out before classification.
 *
 * @param points exactly `LANDMARK_COUNT` positions in `LANDMARK_ORDER` order
 * @returns the feature vector, or null if the pose is geometrically degenerate
 *          (collapsed hand, or knuckles collinear with the wrist axis)
 * @throws if `points` is not exactly `LANDMARK_COUNT` long — that is a wiring
 *         bug, not a tracking condition, and should fail loudly
 */
export function normalizeLandmarks(points: vec3[], options: NormalizeOptions = {}): Float32Array | null {
  if (!points || points.length !== LANDMARK_COUNT) {
    const got = points ? String(points.length) : "null"
    throw new Error(
      "LandmarkCapture: expected " +
        LANDMARK_COUNT +
        " points, got " +
        got +
        ". SIK exposes 26 keypoints per hand, not 21 — see docs/JOINTS.md."
    )
  }

  const wrist = points[L.WRIST]
  const middleKnuckle = points[L.MIDDLE_KNUCKLE]
  const indexKnuckle = points[L.INDEX_KNUCKLE]
  const pinkyKnuckle = points[L.PINKY_KNUCKLE]

  if (!wrist || !middleKnuckle || !indexKnuckle || !pinkyKnuckle) {
    return null
  }

  // Primary axis: up the hand. Its length is also the normalization scale.
  const forward = middleKnuckle.sub(wrist)
  const scale = forward.length
  if (scale < EPSILON) {
    return null
  }
  const invScale = 1 / scale
  const yAxis = forward.uniformScale(invScale)

  // Secondary reference: across the knuckles. Orthogonalize against yAxis
  // (Gram-Schmidt) so the basis stays orthonormal even as the fingers splay.
  const spread = pinkyKnuckle.sub(indexKnuckle)
  const spreadAlongY = yAxis.uniformScale(spread.dot(yAxis))
  const spreadPerp = spread.sub(spreadAlongY)
  const spreadPerpLength = spreadPerp.length
  if (spreadPerpLength < EPSILON) {
    // Knuckle line is collinear with the wrist axis — no stable palm plane.
    return null
  }
  const xAxis = spreadPerp.uniformScale(1 / spreadPerpLength)

  // Right-handed completion: Lens Studio's world is right-handed.
  const zAxis = xAxis.cross(yAxis)

  const out = options.out !== undefined ? options.out : new Float32Array(FEATURE_DIM)
  if (out.length < FEATURE_DIM) {
    throw new Error(
      "LandmarkCapture: out buffer must hold at least " + FEATURE_DIM + " floats, got " + out.length + "."
    )
  }

  // Mirroring flips the PALM NORMAL (z), not the across-palm axis (x).
  // Reflection M is orthogonal with det(M) = -1. xAxis and yAxis are built by
  // operations that commute with M, so d.dot(x) and d.dot(y) are unchanged by a
  // reflection. But zAxis = xAxis cross yAxis, and cross(Ma, Mb) = det(M) *
  // M(cross(a, b)) = -M(zAxis) — so only the z coordinate changes sign.
  // Verified numerically: reflecting a hand across x equals setting mirror=true
  // on the original, to 0.0 exact.
  const zScale = options.mirror === true ? -invScale : invScale

  for (let i = 0; i < LANDMARK_COUNT; i++) {
    const p = points[i]
    if (!p) {
      return null
    }
    const d = p.sub(wrist)
    const o = i * 3
    out[o] = d.dot(xAxis) * invScale
    out[o + 1] = d.dot(yAxis) * invScale
    out[o + 2] = d.dot(zAxis) * zScale
  }

  return out
}

/**
 * Adapter: pull the raw positions out of a SIK hand.
 *
 * This is the seam between the hardware path and the fixture path. On device,
 * feed `normalizeLandmarks(pointsFromTrackedHand(hand))`. In the Editor, feed
 * `normalizeLandmarks(fixturePose)` with a literal array — no SIK involved,
 * because raw HandInputData does not fire in preview.
 *
 * `hand.points` is already in `LANDMARK_ORDER`: wrist, then the five finger
 * arrays. Keypoint.position is frame-cached by SIK, so repeated reads within
 * a frame are cheap.
 *
 * @returns positions, or null if the hand is not currently tracked
 */
export function pointsFromTrackedHand(hand: BaseHand | null | undefined): vec3[] | null {
  if (!hand || !hand.isTracked()) {
    return null
  }

  const keypoints = hand.points
  if (!keypoints || keypoints.length !== LANDMARK_COUNT) {
    return null
  }

  const positions: vec3[] = new Array(LANDMARK_COUNT)
  for (let i = 0; i < LANDMARK_COUNT; i++) {
    const kp = keypoints[i]
    if (!kp) {
      return null
    }
    positions[i] = kp.position
  }
  return positions
}

/**
 * Convenience for the hardware path: tracked hand straight to feature vector.
 * Mirrors automatically when the hand is the left one, so both chiralities
 * land in the same canonical space.
 *
 * @returns the feature vector, or null if untracked or degenerate
 */
export function normalizeTrackedHand(hand: BaseHand | null | undefined, out?: Float32Array): Float32Array | null {
  const positions = pointsFromTrackedHand(hand)
  if (positions === null || hand === null || hand === undefined) {
    return null
  }
  return normalizeLandmarks(positions, {mirror: hand.handType === "left", out: out})
}

// ===========================================================================
// Optional feature selection
//
// Everything above produces the full 78-dim vector and is unchanged. This
// section is additive: it lets you build a reduced and/or weighted vector so
// the two can be compared against real templates instead of assumed.
//
// Rationale for the reduced set — note the two claims are NOT equally certain:
//
//   PROVEN. 6 dims are structurally constant, by construction of the basis:
//   wrist is always (0,0,0) and middleKnuckle is always (0,1,0). They carry
//   zero information in any dataset. Verified numerically.
//
//   HYPOTHESIS. The 5 <finger>ToWrist landmarks are metacarpal points that sit
//   near-rigidly against the wrist and are expected to vary little between
//   handshapes. That is anatomically plausible but NOT verified here — it
//   depends on how SIK's rig actually places them. Measure it on your own
//   recorded templates with `perLandmarkVariance` before trusting it.
//
// Together those are 7 landmarks / 21 dims — about 27% of the vector. Under
// k-NN with Euclidean distance, dims that do not discriminate still contribute
// to every distance, so dropping genuinely dead ones sharpens the metric.
// ===========================================================================

/** Landmarks dropped by the reduced feature set, as original indices. */
export const DROPPED_LANDMARK_INDICES: readonly number[] = [
  L.WRIST, // 0  — structurally (0,0,0)
  1, // thumbToWrist   — metacarpal
  6, // indexToWrist   — metacarpal
  11, // middleToWrist  — metacarpal
  L.MIDDLE_KNUCKLE, // 12 — structurally (0,1,0)
  16, // ringToWrist    — metacarpal
  21 // pinkyToWrist   — metacarpal
]

/**
 * Landmarks kept by the reduced feature set, as original indices, in ascending
 * order. 19 landmarks: thumb 4, index 4, middle 3, ring 4, pinky 4.
 */
export const REDUCED_LANDMARK_INDICES: readonly number[] = [
  2, 3, 4, 5, // thumbBaseJoint, thumbKnuckle, thumbMidJoint, thumbTip
  7, 8, 9, 10, // indexKnuckle, indexMidJoint, indexUpperJoint, indexTip
  13, 14, 15, // middleMidJoint, middleUpperJoint, middleTip
  17, 18, 19, 20, // ringKnuckle, ringMidJoint, ringUpperJoint, ringTip
  22, 23, 24, 25 // pinkyKnuckle, pinkyMidJoint, pinkyUpperJoint, pinkyTip
]

/** 19 landmarks x 3 axes. */
export const REDUCED_DIM = 57

/** Names of the kept landmarks, aligned with `REDUCED_LANDMARK_INDICES`. */
export const REDUCED_LANDMARK_ORDER: readonly string[] = REDUCED_LANDMARK_INDICES.map(function (i) {
  return LANDMARK_ORDER[i]
})

/** Original landmark indices belonging to each finger, for weighting by group. */
export const FINGER_GROUPS: {[finger: string]: readonly number[]} = {
  thumb: [1, 2, 3, 4, 5],
  index: [6, 7, 8, 9, 10],
  middle: [11, 12, 13, 14, 15],
  ring: [16, 17, 18, 19, 20],
  pinky: [21, 22, 23, 24, 25]
}

export type ReduceOptions = {
  /**
   * Per-landmark multipliers, length `LANDMARK_COUNT`, indexed by ORIGINAL
   * landmark index (so the same array works for full and reduced paths).
   * Build one with `makeWeights`. Omit for uniform weighting.
   *
   * IMPORTANT for k-NN: scaling a coordinate by w scales that landmark's
   * contribution to SQUARED Euclidean distance by w-squared. A weight of 2 is
   * 4x the distance influence, not 2x. Use sqrt(desired) if you are thinking
   * in distance-weight terms.
   */
  weights?: readonly number[] | null

  /** Optional destination buffer, to avoid per-frame allocation. */
  out?: Float32Array
}

/**
 * Build a length-26 weight array by name. Every landmark starts at 1.
 *
 * Keys may be:
 *   - "all"                  — baseline for every landmark
 *   - a finger group         — "thumb" | "index" | "middle" | "ring" | "pinky"
 *   - an exact landmark name — any entry in `LANDMARK_ORDER`, e.g. "thumbTip"
 *
 * Applied in that order, so a specific name overrides its group, and a group
 * overrides "all". An unrecognized key throws rather than being ignored — a
 * silently misspelled key would look like it worked and change nothing.
 *
 * Example — upweight the thumb, which is what separates M/N/S/T:
 *   makeWeights({thumb: 2})
 *   makeWeights({all: 1, thumb: 1.5, thumbTip: 3})
 */
export function makeWeights(spec: {[key: string]: number}): number[] {
  const weights: number[] = new Array(LANDMARK_COUNT)
  for (let i = 0; i < LANDMARK_COUNT; i++) {
    weights[i] = 1
  }
  if (!spec) {
    return weights
  }

  const keys = Object.keys(spec)

  // Pass 1: "all"
  for (let k = 0; k < keys.length; k++) {
    if (keys[k] === "all") {
      for (let i = 0; i < LANDMARK_COUNT; i++) {
        weights[i] = spec["all"]
      }
    }
  }

  // Pass 2: finger groups
  for (let k = 0; k < keys.length; k++) {
    const key = keys[k]
    const group = FINGER_GROUPS[key]
    if (group !== undefined) {
      for (let g = 0; g < group.length; g++) {
        weights[group[g]] = spec[key]
      }
    }
  }

  // Pass 3: exact landmark names, and validation
  for (let k = 0; k < keys.length; k++) {
    const key = keys[k]
    if (key === "all" || FINGER_GROUPS[key] !== undefined) {
      continue
    }
    const idx = LANDMARK_ORDER.indexOf(key)
    if (idx === -1) {
      throw new Error(
        "LandmarkCapture.makeWeights: unknown key '" +
          key +
          "'. Expected 'all', a finger group (thumb/index/middle/ring/pinky), " +
          "or a landmark name from LANDMARK_ORDER."
      )
    }
    weights[idx] = spec[key]
  }

  return weights
}

function validateWeights(weights: readonly number[] | null | undefined): void {
  if (weights !== null && weights !== undefined && weights.length !== LANDMARK_COUNT) {
    throw new Error(
      "LandmarkCapture: weights must have length " + LANDMARK_COUNT + " (one per landmark), got " + weights.length + "."
    )
  }
}

/**
 * Project a full 78-dim vector down to the 57-dim reduced set, optionally
 * applying per-landmark weights.
 *
 * The input is whatever `normalizeLandmarks` returned — reduction is a pure
 * projection, so the full path stays available for comparison.
 *
 * @param full a vector of at least `FEATURE_DIM` values
 * @returns a `REDUCED_DIM` vector
 */
export function reduceFeatures(full: ArrayLike<number>, options: ReduceOptions = {}): Float32Array {
  if (!full || full.length < FEATURE_DIM) {
    throw new Error(
      "LandmarkCapture.reduceFeatures: expected at least " +
        FEATURE_DIM +
        " values, got " +
        (full ? String(full.length) : "null") +
        "."
    )
  }
  validateWeights(options.weights)

  const out = options.out !== undefined ? options.out : new Float32Array(REDUCED_DIM)
  if (out.length < REDUCED_DIM) {
    throw new Error("LandmarkCapture.reduceFeatures: out buffer must hold at least " + REDUCED_DIM + " floats.")
  }

  const weights = options.weights
  for (let k = 0; k < REDUCED_LANDMARK_INDICES.length; k++) {
    const landmark = REDUCED_LANDMARK_INDICES[k]
    const src = landmark * 3
    const dst = k * 3
    const w = weights ? weights[landmark] : 1
    out[dst] = full[src] * w
    out[dst + 1] = full[src + 1] * w
    out[dst + 2] = full[src + 2] * w
  }
  return out
}

/**
 * Apply per-landmark weights to a full 78-dim vector, keeping all dims.
 *
 * Exists so the four combinations — full/reduced x unweighted/weighted — can
 * all be measured against the same templates.
 */
export function weightFeatures(full: ArrayLike<number>, options: ReduceOptions = {}): Float32Array {
  if (!full || full.length < FEATURE_DIM) {
    throw new Error(
      "LandmarkCapture.weightFeatures: expected at least " +
        FEATURE_DIM +
        " values, got " +
        (full ? String(full.length) : "null") +
        "."
    )
  }
  validateWeights(options.weights)

  const out = options.out !== undefined ? options.out : new Float32Array(FEATURE_DIM)
  if (out.length < FEATURE_DIM) {
    throw new Error("LandmarkCapture.weightFeatures: out buffer must hold at least " + FEATURE_DIM + " floats.")
  }

  const weights = options.weights
  for (let i = 0; i < LANDMARK_COUNT; i++) {
    const o = i * 3
    const w = weights ? weights[i] : 1
    out[o] = full[o] * w
    out[o + 1] = full[o + 1] * w
    out[o + 2] = full[o + 2] * w
  }
  return out
}

/**
 * Measure how much each landmark actually varies across a set of samples.
 *
 * This is the tool for settling the ToWrist hypothesis with data instead of
 * assumption. Feed it every recorded template across ALL letters: a landmark
 * with near-zero variance across different handshapes is contributing nothing
 * to discrimination and is a candidate to drop; one with high variance is
 * carrying signal.
 *
 * @param samples full-length (78-dim) vectors
 * @returns length-`LANDMARK_COUNT` array, mean per-axis variance per landmark
 */
export function perLandmarkVariance(samples: ArrayLike<number>[]): number[] {
  const result: number[] = new Array(LANDMARK_COUNT)
  for (let i = 0; i < LANDMARK_COUNT; i++) {
    result[i] = 0
  }
  const n = samples ? samples.length : 0
  if (n < 2) {
    return result
  }

  for (let axis = 0; axis < LANDMARK_COUNT * 3; axis++) {
    let sum = 0
    for (let s = 0; s < n; s++) {
      sum += samples[s][axis]
    }
    const mean = sum / n
    let sq = 0
    for (let s = 0; s < n; s++) {
      const d = samples[s][axis] - mean
      sq += d * d
    }
    // Sample variance; the three axes of a landmark are averaged together.
    result[(axis / 3) | 0] += sq / (n - 1) / 3
  }
  return result
}

/** Below this, a mean square is treated as zero. Features are O(1)-scaled. */
const VARIANCE_EPSILON = 1e-12

/**
 * Per-landmark Fisher ratio: between-letter variance over within-letter
 * variance. This is the discriminability measure — `perLandmarkVariance`
 * answers a different question and both are worth having.
 *
 * Pooled variance cannot separate the two things that make a landmark move:
 * genuinely differing between handshapes (signal) and jittering under tracking
 * noise (harm). A noisy landmark scores high on pooled variance and still
 * degrades k-NN, because the noise inflates every distance. The Fisher ratio
 * puts those on opposite sides of the division:
 *
 *   high  — moves a lot BETWEEN letters, holds still WITHIN one. Real signal.
 *   ~1    — between-letter spread is no larger than the noise floor. Useless.
 *   low   — jitters within a letter more than it separates letters. Actively
 *           harmful under Euclidean distance; a candidate to drop or downweight.
 *
 * Standard one-way ANOVA decomposition, per axis:
 *   SS_B = sum over letters of n_c * (mean_c - grandMean)^2   df = C - 1
 *   SS_W = sum over letters, samples of (x - mean_c)^2        df = N - C
 *   F    = (SS_B / df_B) / (SS_W / df_W)
 *
 * The three axes of a landmark are pooled by summing their sums-of-squares
 * before dividing (a trace-based aggregation), rather than averaging three
 * separate F ratios. That matters: averaging lets one axis with a near-zero
 * within-variance blow the landmark's score up on its own, while pooling only
 * reports a huge ratio when the landmark is quiet on all three axes.
 *
 * Feed this the `letters` map straight out of templates.json.
 *
 * @param samplesByLetter letter -> full-length (78-dim) samples for that letter
 * @returns length-`LANDMARK_COUNT` Fisher ratios. Returns all zeros when there
 *          are fewer than 2 letters, or when no letter has 2+ samples (no
 *          within-letter estimate is possible). A landmark that is constant
 *          everywhere yields 0, not NaN. A landmark with real between-letter
 *          spread and exactly zero within-letter noise yields Infinity, which
 *          in practice means duplicated samples rather than perfect tracking.
 */
export function perLandmarkDiscriminability(samplesByLetter: {[letter: string]: ArrayLike<number>[]}): number[] {
  const result: number[] = new Array(LANDMARK_COUNT)
  for (let i = 0; i < LANDMARK_COUNT; i++) {
    result[i] = 0
  }
  if (!samplesByLetter) {
    return result
  }

  // Keep only letters that actually carry samples.
  const allKeys = Object.keys(samplesByLetter)
  const letters: string[] = []
  for (let k = 0; k < allKeys.length; k++) {
    const list = samplesByLetter[allKeys[k]]
    if (list && list.length > 0) {
      letters.push(allKeys[k])
    }
  }

  const classCount = letters.length
  if (classCount < 2) {
    // Nothing to discriminate between.
    return result
  }

  let totalSamples = 0
  for (let c = 0; c < classCount; c++) {
    const list = samplesByLetter[letters[c]]
    for (let i = 0; i < list.length; i++) {
      if (!list[i] || list[i].length < FEATURE_DIM) {
        throw new Error(
          "LandmarkCapture.perLandmarkDiscriminability: letter '" +
            letters[c] +
            "' sample " +
            i +
            " has " +
            (list[i] ? String(list[i].length) : "null") +
            " values, expected at least " +
            FEATURE_DIM +
            "."
        )
      }
    }
    totalSamples += list.length
  }

  const dfBetween = classCount - 1
  const dfWithin = totalSamples - classCount
  if (dfWithin <= 0) {
    // Every letter has exactly one sample — no within-letter noise estimate.
    return result
  }

  const axisCount = LANDMARK_COUNT * 3
  const ssBetween = new Float64Array(axisCount)
  const ssWithin = new Float64Array(axisCount)

  for (let axis = 0; axis < axisCount; axis++) {
    let grandTotal = 0
    for (let c = 0; c < classCount; c++) {
      const list = samplesByLetter[letters[c]]
      for (let i = 0; i < list.length; i++) {
        grandTotal += list[i][axis]
      }
    }
    const grandMean = grandTotal / totalSamples

    for (let c = 0; c < classCount; c++) {
      const list = samplesByLetter[letters[c]]
      let sum = 0
      for (let i = 0; i < list.length; i++) {
        sum += list[i][axis]
      }
      const classMean = sum / list.length

      const between = classMean - grandMean
      ssBetween[axis] += list.length * between * between

      for (let i = 0; i < list.length; i++) {
        const within = list[i][axis] - classMean
        ssWithin[axis] += within * within
      }
    }
  }

  for (let lm = 0; lm < LANDMARK_COUNT; lm++) {
    let bSum = 0
    let wSum = 0
    for (let a = 0; a < 3; a++) {
      bSum += ssBetween[lm * 3 + a]
      wSum += ssWithin[lm * 3 + a]
    }
    const msBetween = bSum / dfBetween
    const msWithin = wSum / dfWithin

    if (msWithin <= VARIANCE_EPSILON) {
      // No measurable noise: either the landmark is constant everywhere (no
      // signal either -> 0), or it separates letters with zero jitter.
      result[lm] = msBetween <= VARIANCE_EPSILON ? 0 : Infinity
    } else {
      result[lm] = msBetween / msWithin
    }
  }

  return result
}
