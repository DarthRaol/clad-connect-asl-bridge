# SIK Hand Keypoints — `TrackedHand`

Enumerated by reading the SpectaclesInteractionKit v2.0.0 type definitions directly,
not inferred from naming patterns.

**Sources read:**

- `Packages/SpectaclesInteractionKit.lspkg/Providers/HandInputData/BaseHand.ts` — the public interface
- `Packages/SpectaclesInteractionKit.lspkg/Providers/HandInputData/TrackedHand.ts` — the implementing class
- `Packages/SpectaclesInteractionKit.lspkg/Providers/HandInputData/LandmarkNames.ts` — the underlying landmark enum
- `Packages/SpectaclesInteractionKit.lspkg/Providers/HandInputData/Joints.ts` — the rig hierarchy
- `Packages/SpectaclesInteractionKit.lspkg/Providers/HandInputData/Keypoint.ts` — the `Keypoint` class

(These resolve at compile time via the unpacked mirror under
`Cache/TypeScript/Src/Packages/`; the `.lspkg` in `Packages/` is a packed archive.)

## Count: 26, not 21

`TrackedHand` exposes **26** individual `Keypoint` properties. The widely-cited "21 hand
keypoints" figure is the **MediaPipe** hand model (wrist + 4 joints × 5 fingers). SIK is
not MediaPipe: it adds a **`<finger>ToWrist`** keypoint per finger, giving
`wrist + 5 fingers × 5 keypoints = 26`.

This is confirmed three independent ways:

1. 26 `readonly ... : Keypoint` properties on the `BaseHand` interface.
2. 26 matching `readonly ...!: Keypoint` fields on `TrackedHand`, each assigned from a
   distinct `LandmarkName`.
3. `LandmarkName` has exactly 26 members (20 finger + `WRIST` + 5 `WRIST_TO_*`), and
   `points` is built as `wrist` + the five 5-element finger arrays.

## The 26 keypoints

Each row: the property on `TrackedHand`, the `LandmarkName` enum member it is assigned
from, and that member's string value (the rig joint name used by `createAttachmentPoint`).

### Wrist (1)

| Property | LandmarkName | String value |
|---|---|---|
| `wrist` | `WRIST` | `"wrist"` |

### Thumb (5)

| Property | LandmarkName | String value |
|---|---|---|
| `thumbToWrist` | `WRIST_TO_THUMB` | `"wrist_to_thumb"` |
| `thumbBaseJoint` | `THUMB_0` | `"thumb-0"` |
| `thumbKnuckle` | `THUMB_1` | `"thumb-1"` |
| `thumbMidJoint` | `THUMB_2` | `"thumb-2"` |
| `thumbTip` | `THUMB_3` | `"thumb-3"` |

### Index (5)

| Property | LandmarkName | String value |
|---|---|---|
| `indexToWrist` | `WRIST_TO_INDEX` | `"wrist_to_index"` |
| `indexKnuckle` | `INDEX_0` | `"index-0"` |
| `indexMidJoint` | `INDEX_1` | `"index-1"` |
| `indexUpperJoint` | `INDEX_2` | `"index-2"` |
| `indexTip` | `INDEX_3` | `"index-3"` |

### Middle (5)

| Property | LandmarkName | String value |
|---|---|---|
| `middleToWrist` | `WRIST_TO_MIDDLE` | `"wrist_to_mid"` |
| `middleKnuckle` | `MIDDLE_0` | `"mid-0"` |
| `middleMidJoint` | `MIDDLE_1` | `"mid-1"` |
| `middleUpperJoint` | `MIDDLE_2` | `"mid-2"` |
| `middleTip` | `MIDDLE_3` | `"mid-3"` |

### Ring (5)

| Property | LandmarkName | String value |
|---|---|---|
| `ringToWrist` | `WRIST_TO_RING` | `"wrist_to_ring"` |
| `ringKnuckle` | `RING_0` | `"ring-0"` |
| `ringMidJoint` | `RING_1` | `"ring-1"` |
| `ringUpperJoint` | `RING_2` | `"ring-2"` |
| `ringTip` | `RING_3` | `"ring-3"` |

### Pinky (5)

| Property | LandmarkName | String value |
|---|---|---|
| `pinkyToWrist` | `WRIST_TO_PINKY` | `"wrist_to_pinky"` |
| `pinkyKnuckle` | `PINKY_0` | `"pinky-0"` |
| `pinkyMidJoint` | `PINKY_1` | `"pinky-1"` |
| `pinkyUpperJoint` | `PINKY_2` | `"pinky-2"` |
| `pinkyTip` | `PINKY_3` | `"pinky-3"` |

## Traps that break pattern-inferred code

These are the reasons this list had to be read rather than guessed.

**1. The thumb is named differently from every other finger.**
Other fingers use `Knuckle / MidJoint / UpperJoint / Tip` for landmarks 0/1/2/3. The thumb
uses `BaseJoint / Knuckle / MidJoint / Tip`. So `thumbKnuckle` is `THUMB_1`, while
`indexKnuckle` is `INDEX_0` — **the same word maps to a different landmark index.**
There is no `thumbUpperJoint`, and no `indexBaseJoint`.

**2. Middle is abbreviated `mid` in string values, not in property names.**
The property is `middleKnuckle` and the enum member is `MIDDLE_0`, but the underlying
string is `"mid-0"` and `WRIST_TO_MIDDLE` is `"wrist_to_mid"`. Only middle is abbreviated.

**3. `<finger>ToWrist` is not a per-finger joint on the finger.**
In `Joints.ts` the `wrist_to_*` nodes are children of `wrist` and parents of the finger
chain — they are the metacarpal split, not a knuckle. All five sit at the wrist end.

**4. `getKeypoint()` is private.** Lookup by `LandmarkName` at runtime is not part of the
public API. Use the named properties, or the array accessors below.

## Array accessors

Also on `TrackedHand`, useful for iteration:

| Accessor | Length | Order |
|---|---|---|
| `thumbFinger` | 5 | `thumbToWrist, thumbBaseJoint, thumbKnuckle, thumbMidJoint, thumbTip` |
| `indexFinger` | 5 | `indexToWrist, indexKnuckle, indexMidJoint, indexUpperJoint, indexTip` |
| `middleFinger` | 5 | `middleToWrist, middleKnuckle, middleMidJoint, middleUpperJoint, middleTip` |
| `ringFinger` | 5 | `ringToWrist, ringKnuckle, ringMidJoint, ringUpperJoint, ringTip` |
| `pinkyFinger` | 5 | `pinkyToWrist, pinkyKnuckle, pinkyMidJoint, pinkyUpperJoint, pinkyTip` |
| `points` | **26** | `wrist`, then thumb, index, middle, ring, pinky arrays in that order |

Each array runs **wrist-ward → tip-ward**. Note this is the opposite of the
`thumbLandmarks` / `indexLandmarks` / etc. constants in `LandmarkNames.ts`, which are
ordered tip-first (`_3, _2, _1, _0`) and omit the `wrist_to_*` entry.

## What a `Keypoint` gives you

From `Keypoint.ts`:

- `name: string` — the rig joint name
- `position: vec3` — world position, **cached per frame** via `FrameCache`
- `rotation: quat` — world rotation (not cached)
- `screenPosition: vec2` — world→screen via `WorldCameraFinderProvider`
- `right: vec3` — normalized right vector (`up` / `forward` follow in the same file)

## Notes for fingerspelling work

- **Normalize against `wrist`.** It is the stable origin; tips are the jittery end.
- **26 keypoints × 3 axes = 78 raw floats per hand per frame.** Reducing to
  wrist-relative, hand-scale-normalized coordinates before classification is worth doing.
- **The letters that will hurt are M, N, S, T** — they differ mainly by where the thumb
  crosses relative to the finger knuckles. Those distinctions live in
  `thumbTip` vs `indexKnuckle` / `middleKnuckle` / `ringKnuckle` relative positions, so
  the thumb's off-by-one naming (trap 1) is a live hazard in exactly the code that
  matters most.
- **J and Z are motion letters**, not static handshapes. A per-frame handshape classifier
  cannot represent them without a temporal buffer.
- `position` being frame-cached means repeated reads within one frame are cheap — no need
  to hoist keypoint positions into locals for performance.
