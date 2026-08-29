# Demo video shot list

**Target: 75–90 seconds.** Structured so the strongest material lands last — the limitation demo and the mutation test are the two shots a judge will remember, so they come after the happy path, not before it.

Capture source is marked on every shot: **[P]** = Lens Studio preview panel, **[T]** = terminal / Claude Code session.

Record with `Win+Alt+R` → `C:\Users\Raol\Videos\Captures\`. One clean take beats five retries.

---

## 0:00–0:10 · The idea — [P]

**~10s.** Both panels visible, no hand yet.

Show the two surfaces and make the geometry obvious: the outward panel carries the assembled text for the person being spoken to, the inward panel carries the target word, the confidence bar and the flash for the wearer.

> "One pair of glasses, two surfaces — one aimed at each person. The signer gets feedback; the person across from them gets the text."

**Get right:** the shot has to read as *two* panels, not one. If the outward panel is edge-on or washed out, rotate the preview camera slightly before recording.

---

## 0:10–0:30 · Spelling LUKE — [P]

**~20s.** The core loop, uninterrupted.

Hand skeleton forms L → U → K → E. Per letter, in view:

- the skeleton holding a shape
- the confidence bar filling **continuously** toward the commit, not snapping
- the letter turning green in the target word
- the letter appearing on the outward panel
- the commit chime landing on the frame
- the skeleton pulsing green on commit

> "The hand you're seeing isn't an animation — it's the classifier's own input vector, drawn directly. Same array, same frame."

**Get right:** let at least one bar fill run its full length on camera. The continuous fill is the thing that distinguishes this from a binary threshold, and it is invisible if every commit is cut short.

---

## 0:30–0:40 · A wrong letter — [P]

**~10s.** Sign something that isn't the target.

Show the flash, the `signed X — expected Y` line, and then recovery — the index does *not* advance, the letter is re-signable, the demo keeps going.

> "A wrong letter is visible and recoverable. It doesn't silently pass and it doesn't dead-end the demo."

**Get right:** hold on the recovery, not just the flash. The point is that it continues.

---

## 0:40–0:50 · K and P are the same hand — [P]

**~10s.** The limitation, visible in four seconds.

Form K. Form P. The rendered skeleton is **identical**.

> "In ASL these differ by wrist rotation. The normalization is rotation-invariant by construction, so that difference is erased before the classifier ever sees it. Same for G/Q and H/U. Measured at distance zero — rotate a pose arbitrarily, re-normalize, you get zero."

**Get right:** cut between the two poses with no camera movement so the identity is unmistakable. If it looks like a slow morph the point is lost. This shot is the honest core of the submission — do not rush past it.

---

## 0:50–1:10 · The tests, and the test that fails — [T]

**~20s.** The strongest 20 seconds. Two beats.

**Beat one (~8s):** the LEAF suite passing — five scenarios, five green.

**Beat two (~12s):** revert the re-arm fix (`rearmFrames` 3 → 1) and re-run. `signbridge-no-spurious-double` **fails**:

```
FAILED: signbridge-no-spurious-double
  Expected: "0" — Received: "1"
```

> "A suite that's green on the first run tells you nothing. So the fix was reverted to prove the guard actually fires. That's a real spurious-double bug, and that's the test catching it."

**Get right:** the failure text must be legible at video resolution. Zoom the terminal font before recording. This is the shot that earns the process half of the score — give it the pixels.

---

## 1:10–1:20 · Close — [P] or [T]

**~10s.** State the scope plainly and stop.

> "Six letters, synthetic templates, one recording session away from real recognition. It reads fingerspelling — not ASL, which has its own grammar. It's a practice and fallback aid, not a replacement for an interpreter."

**Get right:** end on the limitation stated calmly. Do not close on a claim the build doesn't support.

---

## Pre-record checklist

- [ ] Preview device switched **off "Sunlit Room"** to something darker — Specs renders additively and white-on-bright washes out
- [ ] Outward panel text confirmed legible in the capture, not just the inward one
- [ ] Terminal font size raised before any **[T]** shot
- [ ] Audio levels checked — the commit chime is 0.09s and easy to lose under narration
- [ ] `templates.synthetic.json` in place (6 letters) and the Lens running without errors
- [ ] Full dry run once, silent, to confirm timings before recording with narration

## Timing summary

| segment | length | source |
|---|---|---|
| The idea | 10s | [P] |
| Spelling LUKE | 20s | [P] |
| Wrong letter | 10s | [P] |
| K and P identical | 10s | [P] |
| LEAF pass → mutation fail | 20s | [T] |
| Close | 10s | [P]/[T] |
| **total** | **80s** | |

10s of slack against the 90s ceiling. If a shot overruns, take it from "The idea" — never from the mutation test.
