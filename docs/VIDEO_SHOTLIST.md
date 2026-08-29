# Demo video shot list

**Target: 75–90 seconds.** Ordered so the strongest material lands last — K/P identity, then the suite passing, then the suite *failing* when the fix is reverted. Those are the three a judge will remember.

Capture source is marked on every shot: **[P]** = Lens Studio preview panel, **[T]** = terminal / Claude Code session.

Record with `Win+Alt+R` → `C:\Users\Raol\Videos\Captures\`.

---

## Record in this order, not in presentation order

Shot 5 is the only one needing scene changes, and they are fiddly to undo. Record **1, 2, 3, 4, 8** in one pass with the scene in its default state, then make the change once, record **5**, then revert. Shots 6 and 7 are terminal captures and are independent of all of it.

| | shot | scene state |
|---|---|---|
| default | 1, 2, 3, 4, 8 | `demoPoseAsset` **unwired** · `showReferenceHand` **ON** |
| demo | 5 (K/P) | `demoPoseAsset` **wired** · `showReferenceHand` **OFF** |
| n/a | 6, 7 | terminal only |

---

## 1 · 0:00–0:12 · One surface aimed at each person — [P]

**~12s. A camera move, not a static shot.**

The outward panel's text is single-sided and backface-culled, so **both panels' text can never be legible in one frame** — that is the design working, not a framing problem. Watching the content *change* as the camera crosses between them communicates the idea far better than any static composition could.

Start on the wearer's side, hold ~4s on the target word, confidence bar and hands. Then move through to the reader's side and hold ~4s on the assembled text.

Preview camera positions, both verified:

```
wearer's side   setPosition (0, -11, -42)   lookAt (0, -11, -110)
reader's side   setPosition (0,   6, -150)  lookAt (0,   8, -110)
```

> "One pair of glasses, two surfaces. The signer sees their target and their progress. The person across from them sees only the finished text — and reads it right off the glasses."

**Get right:** move slowly and continuously; a cut would lose the whole point. The reader-side text is large, white and correctly unmirrored — do not rush past it, it's the payoff of the move.

**Setup:** default state. **Teardown:** none.

---

## 2 · 0:12–0:22 · Match the reference hand — [P]

**~10s. The most legible shot in the video — it needs no narration to be understood.**

Two hands side by side in the gap between the panels:

- **left, amber, thick bones** — the live hand, drawn from the exact vector the classifier is scoring
- **right, cyan, thin bones** — the reference: the target letter's stored template

A viewer understands "copy the one on the right" instantly. Let it sit in silence for a beat before saying anything.

> "The cyan hand is the letter you're being asked to make. The amber one is what the glasses are actually seeing. It brightens as the two converge."

**Get right:**

- **Shoot mid-word.** The reference hides itself when the phrase completes — no letter left to copy — so a completed LUKE leaves only one hand on screen.
- **The reference steps, it does not glide.** In the Editor the mock replays stored templates verbatim, so the live hand teleports between exact poses and the reference brightness jumps between levels. On hardware a real hand sweeps the intermediate distances and it ramps smoothly. Do not promise a glide the preview cannot show — sell the pairing, not the animation.

**Setup:** default state (`showReferenceHand` ON). **Teardown:** none.

---

## 3 · 0:22–0:38 · Spelling LUKE — [P]

**~16s.** The core loop, uninterrupted, from the wearer's side.

Per letter, in view: the skeleton holds a shape · the confidence bar fills **continuously** · the letter turns green in the target word · it appears on the outward panel · the commit chime lands on the frame · the skeleton pulses green.

> "The hand you're seeing isn't an animation — it's the classifier's own input vector, drawn directly. Same array, same frame."

**Get right:** let at least one bar fill run its full length on camera. The continuous fill is what distinguishes this from a binary threshold, and it is invisible if every commit is cut short.

**Setup:** default state. **Teardown:** none.

---

## 4 · 0:38–0:46 · A wrong letter — [P]

**~8s.** Sign something that isn't the target.

Show the flash, the `signed X — expected Y` line, then recovery — the index does **not** advance, the letter is re-signable, the demo keeps going.

> "A wrong letter is visible and recoverable. It doesn't silently pass and it doesn't dead-end the demo."

**Get right:** hold on the recovery, not just the flash. The point is that it continues.

**Setup:** default state. **Teardown:** none.

---

## 5 · 0:46–0:56 · K and P are the same hand — [P]

**~10s.** The honest core of the submission. Do not rush it.

Form K. Form P. The rendered skeleton is **identical** — and the status line names which pose is being injected, so no caption is needed:

```
DEMO POSE: K        DEMO POSE: P
```

> "In ASL these differ by wrist rotation. The normalization is rotation-invariant by construction, so that difference is erased before the classifier ever sees it. Same for G/Q and H/U. Measured at distance zero."

**Get right:** cut between the two with no camera movement, so the identity is unmistakable. If it reads as a slow morph, the point is lost.

**Setup — the only shot needing scene changes:**

1. Wire `SignBridge.demoPoseAsset` → `Assets/Data/poses.demo.json`
2. Set `SignBridge.showReferenceHand` → **OFF**

The reference hand must be off here. Nothing should compete with the two identical skeletons, and a target hand would imply the Lens is asking for one of these letters when neither is in its vocabulary.

**Teardown — do this before anything else:**

1. Unwire `demoPoseAsset`
2. Set `showReferenceHand` back **ON**

Every demo-mode run prints a loud reminder naming the poses and the real candidate set, so check the log if unsure which state you're in.

---

## 6 · 0:56–1:08 · The suite passing — [T]

**~12s.** Six LEAF scenarios, six green, run against the live Lens in preview.

Name what the last one covers, since it is the least obvious: `alphabet-coverage` asserts a defined behaviour for **all 26 letters** — six recognized end to end, eighteen absent and refused by phrase gating, J and Z excluded as motion letters.

**Setup:** default state — the coverage scenario reads the classifier's loaded letters, so a wired `demoPoseAsset` would be showing the wrong thing on screen while it ran.

---

## 7 · 1:08–1:22 · The test that fails — [T]

**~14s. The strongest fourteen seconds. Do not cut this for time.**

Revert a fix and re-run. Either mutation works; the re-arm one is the better story:

```
FAILED: signbridge-no-spurious-double
  Expected: "0" — Received: "1"
```

The second, if you prefer it — break phrase gating by making `unsignableLetters()` return `[]`:

```
FAILED: signbridge-alphabet-coverage
  Expected: "> -1" — Received: "-1"
```

> "A suite that's green on its first run tells you nothing. So the fix was reverted to prove the guard actually fires. That's a real spurious-double bug, and that's the test catching it."

**Get right:** the failure text must be legible at video resolution. Raise the terminal font before recording. This is the shot that earns the process half of the score — give it the pixels.

**Teardown:** restore the reverted line and re-run to confirm green before you stop recording, or you will forget.

---

## 8 · 1:22–1:28 · Close — [P] or [T]

**~6s.** State the scope plainly and stop.

> "Six letters, synthetic templates, one recording session away from real recognition. It reads fingerspelling — not ASL, which has its own grammar. A practice and fallback aid, not a replacement for an interpreter."

**Get right:** end on the limitation stated calmly. Do not close on a claim the build doesn't support.

---

## Pre-record checklist

- [ ] Preview device on **Evening Room**, not Sunlit Room — Specs renders additively, and two captures in this project produced phantom defects because they were under-exposed
- [ ] `demoPoseAsset` **unwired** and `showReferenceHand` **ON** before shots 1–4 and 8
- [ ] Terminal font size raised before shots 6 and 7
- [ ] Audio levels checked — the commit chime is 0.09 s and easy to lose under narration
- [ ] `templates.synthetic.json` in place (6 letters: L U K E C O), Lens running with no errors
- [ ] One silent dry run to confirm timings before recording with narration

## Timing summary

| # | segment | length | source |
|---|---|---|---|
| 1 | One surface each — camera move | 12s | [P] |
| 2 | Match the reference hand | 10s | [P] |
| 3 | Spelling LUKE | 16s | [P] |
| 4 | Wrong letter | 8s | [P] |
| 5 | K and P identical | 10s | [P] |
| 6 | LEAF suite passing | 12s | [T] |
| 7 | Mutation test failing | 14s | [T] |
| 8 | Close | 6s | [P]/[T] |
| | **total** | **88s** | |

Two seconds under the 90 s ceiling. If a shot overruns, take it from **1** or **3** — never from 5, 6 or 7.
