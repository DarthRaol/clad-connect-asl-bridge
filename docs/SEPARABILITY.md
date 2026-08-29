# Separability analysis

Why the shipped template set contains 6 letters and not 24.

Everything here is reproducible: `node tools/gen-synthetic-templates.js` prints the tables below and writes nothing unless given an output path.

---

## Method

**Metric.** For each letter, the *separability ratio* is:

```
nearest-other-letter distance   min Euclidean distance to any sample of any other letter
───────────────────────────── = ───────────────────────────────────────────────────────
 within-letter spread            mean pairwise distance among that letter's own samples
```

A ratio of 1.0 means the nearest other letter is no further away than the letter's own samples are from each other — the classes overlap. The gate is **1.5×**, chosen as the weakest pair that already worked in the shipped set.

**Data.** 5 samples per letter, generated from parameterized hand geometry, jittered by 0.22 cm in landmark space and re-normalized through the same `normalizeLandmarks` math the Lens uses. Distances are in the 78-dim normalized feature space.

**Model.** The finger model is articulated, not binary extended/curled:

| capability | mechanism |
|---|---|
| partial curl | `mcp`/`pip`/`dip` cumulative flexion angles |
| lateral separation | `abd` abduction about the palm normal |
| finger crossing | out-of-plane shift growing along the chain |
| thumb vs. knuckles | thumb given a tip target in palm space, joints bowed along the chord |

All four were needed. Under the previous binary model U, H and R collapsed to distance 0.000 for want of lateral separation and crossing.

---

## Result: 12 of 24 letters fail the gate

```
letter   within   nearest-other      ratio   verdict
  G      0.357      0.000 (Q)      0.00x   FAIL
  H      0.378      0.000 (U)      0.00x   FAIL
  K      0.452      0.000 (P)      0.00x   FAIL
  P      0.397      0.000 (K)      0.00x   FAIL
  Q      0.328      0.000 (G)      0.00x   FAIL
  U      0.356      0.000 (H)      0.00x   FAIL
  S      0.367      0.308 (N)      0.84x   FAIL
  M      0.319      0.281 (N)      0.88x   FAIL
  N      0.295      0.281 (M)      0.95x   FAIL
  V      0.339      0.339 (H)      1.00x   FAIL
  T      0.326      0.325 (N)      1.00x   FAIL
  R      0.360      0.365 (H)      1.01x   FAIL
  A      0.333      0.506 (T)      1.52x   pass
  O      0.406      0.620 (E)      1.53x   pass
  L      0.383      0.620 (G)      1.62x   pass
  X      0.388      0.643 (N)      1.66x   pass
  E      0.305      0.581 (N)      1.90x   pass
  D      0.400      1.101 (G)      2.75x   pass
  C      0.474      1.366 (B)      2.88x   pass
  I      0.341      1.058 (Y)      3.10x   pass
  B      0.401      1.365 (W)      3.40x   pass
  Y      0.292      1.058 (I)      3.63x   pass
  W      0.343      1.365 (B)      3.98x   pass
  F      0.327      1.460 (C)      4.46x   pass
```

### Worst 5 pairs

Pair ratio is the minimum inter-letter distance over the pooled within-letter spread of the two.

| pair | min distance | pooled spread | ratio |
|---|---|---|---|
| G–Q | 0.000 | 0.342 | 0.00× |
| H–U | 0.000 | 0.367 | 0.00× |
| K–P | 0.000 | 0.424 | 0.00× |
| M–N | 0.281 | 0.307 | 0.92× |
| N–S | 0.308 | 0.331 | 0.93× |

---

## The failures split into two different problems

Removing the jitter separates them. With no noise at all, these are the closest 12 pairs by pure pose geometry:

```
  G-Q     0.0000   IDENTICAL POSE — not separable at any noise level
  H-U     0.0000   IDENTICAL POSE — not separable at any noise level
  K-P     0.0000   IDENTICAL POSE — not separable at any noise level
  M-N     0.2811
  N-S     0.3078
  N-T     0.3254
  H-V     0.3390
  U-V     0.3390
  H-R     0.3646
  R-U     0.3646
  S-T     0.4009
  M-S     0.4497
```

### 3 pairs: architecturally impossible

**G/Q, H/U, K/P** are exactly zero. These letters differ *only* by wrist orientation in ASL:

- Q is G pointing down
- H is U held horizontal
- P is K pointing down

`normalizeLandmarks` builds its basis entirely from the hand itself — `+Y` along wrist→middleKnuckle, `+X` from the knuckle spread, `+Z` as their cross product. Every axis is intrinsic, so global orientation is removed by construction.

**Proof, not inference.** Take the U pose, apply an arbitrary rotation of (1.4, −0.7, 2.1) rad, re-normalize, and compare:

```
||normalize(U) − normalize(rotate(U))|| = 0.000e+0
```

Orientation is fully erased. Two letters that differ only by orientation are therefore the *same point* in feature space. No quantity of templates, no amount of tuning, and no classifier change can separate them — the information is gone before the classifier sees anything.

**The fix** is an orientation channel: append the palm normal in device space, taking the vector from 78 to 81 dims. That reintroduces exactly the discarded degree of freedom while keeping the handshape itself orientation-invariant. It is deferred, because it cannot be verified without recorded hands.

This limitation is visible in the running demo — form K, form P, and the rendered hand skeleton is identical, because the skeleton draws the feature vector.

### 9 letters: real signal, drowned by noise

**M, N, S, T, V, R** and their partners sit at 0.28–0.40 in pure pose distance, against a within-letter noise floor of 0.30–0.45 at 0.22 cm jitter. The differences are real; they are simply smaller than the noise.

These are recoverable:

- **Real templates** — recorded within-letter spread reflects genuine re-forming variation, and more importantly the *between*-letter distances are real anatomy rather than an approximation of it
- **More samples per letter** — 5 is enough to expose overlap, not enough to characterize a distribution
- **The thumb-weighted variant** — M, N, S, T and A differ almost entirely in thumb position. `FINGER_GROUPS.thumb` covers landmarks 1–5, so `makeWeights({thumb: w})` upweights 15 of the 78 dims (of which 4 landmarks, 12 dims, actually move between these letters — landmark 1 is the near-rigid `thumbToWrist` metacarpal). `perLandmarkDiscriminability` exists to pick `w` from measurement instead of guessing

None of that is worth doing against synthetic data. All of it becomes possible after one recording session.

---

## Largest passing subset

Greedily dropping the worst-separated letter until every survivor clears 1.5× yields 16:

```
keep (16): A B C D E F I L N O Q R V W X Y
drop  (8): G H K S M U T P
```

**This number is misleading and was not adopted.** It survives by keeping one arbitrary representative of each collapsed pair — it keeps Q and drops G, keeps V and drops U. A signer forming G would be shown Q. A set that is internally separable but externally mislabelled is worse than a smaller honest one.

---

## Why the shipped 6-letter set works

Partly because the *older* generator was geometrically wrong.

The previous model encoded only extended-vs-curled per finger. It could not express P as "K pointing down", so it gave P a distinct handshape instead — index extended, middle curled, pinky extended — which is not ASL P. That fiction is why K and P appeared separable:

| | shipped file (old model) | faithful model |
|---|---|---|
| K–P min distance | **1.577** | **0.000** |

The 7-letter fixture passed its separability check partly *because* it never modelled the orientation collision that makes the pair impossible.

Running the same measurement on the working set with the corrected model makes this explicit:

```
letter   within   nearest-other      ratio   verdict
  K      0.514      0.000 (P)      0.00x   FAIL
  P      0.322      0.000 (K)      0.00x   FAIL
  E      0.356      0.580 (O)      1.63x   pass
  U      0.325      0.594 (K)      1.83x   pass
  O      0.289      0.580 (E)      2.00x   pass
  C      0.370      1.656 (O)      4.48x   pass
  L      0.353      1.988 (O)      5.64x   pass
```

## Why P was dropped

P was a loaded classification candidate resting entirely on that error. No phrase needed it, and on real hardware a correctly-formed P is at distance 0 from K — so the shipped fixture carried a letter that could only ever be returned wrongly.

Removing it cost nothing measurable:

- `signablePhrases()` returns `[LUKE]` both before and after. Every other phrase in `DEFAULT_PHRASES` was already unsignable for reasons unrelated to P — PERU on R, HELP on H, SPECS on S, and so on. No phrase's only missing letter was P.
- Nearest-other distances barely moved:

| letter | before | after |
|---|---|---|
| L | 1.373 (P) | 1.373 (K) |
| C | 1.695 (P) | 1.714 (K) |
| U | 0.852 (K) | 0.852 (K) |
| K | 0.852 (U) | 0.852 (U) |
| E | 1.086 (O) | 1.086 (O) |
| O | 1.086 (E) | 1.086 (E) |

L's figure is a rounding coincidence rather than a no-op: L–P was 1.373078 and L–K is 1.373239.

Note that K's nearest confuser in the shipped file was never P — it was U, at 0.852. The exposure P created was on hardware, not in the fixture. It is now unreachable because P is not a candidate.

**Shipped set: L, U, K, E, C, O.** Six letters, 30 samples, runtime-confirmed.
