# ASL Bridge — Task Checklist

**Deadline: Sun Aug 30, 11:59 PM PT.** Today: Wed Aug 26. Kill date on recognition: **Fri Aug 28.**

Status as of last verification: **Phases 1–2 complete, Phase 3 not started.**
Roughly 9 of 33 tasks done — but Phase 3 is the bulk of the remaining code and is fully unblocked.

Legend: `[x]` done · `[ ]` todo · `[!]` blocked · **You** / **Friend** / **CLAD** = who does it

---

## Phase 0 — Unblock (external, not code)

Nothing here is code and everything downstream depends on it. **Most overdue section.**

- [ ] **You** — Message friend: when can you get the dev kit, hands-on or do they run builds,
      Spectacles 2024 or SPECS 27?
- [ ] **You** — Discord: does a Spectacles 2024 build qualify, or must submissions run SPECS 27?
- [ ] **You** — Discord: does submission require on-device footage, or are preview captures OK?
- [ ] **You** — Verify the GitHub repo is actually **public** (incognito window)
- [ ] **You** — Rename repo — it says `CLAD-Guide-hackathon`, but Guide (Week 2) closed Aug 23.
      Submitting to **Connect** (Week 3).

---

## Phase 1 — Setup ✅ COMPLETE

- [x] Lens Studio 5.23.1 + CLAD setup, MCP live
- [x] `ls-clad` plugin installed (59 skills, current at `cfeb679`)
- [x] Git repo + GitHub remote, pushed
- [x] SpectaclesInteractionKit installed
- [x] SpectaclesUIKit installed
- [x] LEAF installed
- [x] `docs/JOINTS.md` — 26 keypoints enumerated from type definitions (corrected the
      widely-cited "21", caught the thumb naming trap)

---

## Phase 2 — Capture pipeline ✅ CODE COMPLETE, ⚠️ UNCOMMITTED

- [x] `HandProbe.ts` — joint availability probe
- [x] `LandmarkCapture.ts` — 26 → 78-dim normalization, mirroring, reduced/weighted variants,
      `perLandmarkVariance`, `perLandmarkDiscriminability` (Fisher ratio, validated against
      planted ground truth)
- [x] `TemplateRecorder.ts` — distinct-frame guarantee, re-form gate, within-variance warnings
- [ ] **You** — ⚠️ **COMMIT AND PUSH.** All of the above is untracked. One disk failure loses it.

```bash
git add -A && git commit -m "Add landmark normalization, Fisher discriminability, template recorder" && git push
```

- [ ] **You** — Run `HandProbe` once in preview, record the result (expected: `not tracked`)
- [ ] **CLAD** — Write `docs/TESTER_GUIDE.md` for the hardware handoff

---

## Phase 3 — Preview-testable core ⬜ NOT STARTED — **DO THIS NEXT**

None of this needs hardware. This is the bulk of the remaining code and all of it is unblocked.

- [ ] **CLAD** — `MockHandInput.ts` — inject synthetic 78-dim vectors (prompt 8)
- [ ] **CLAD** — `Classifier.ts` — k-NN, margin-based confidence `1 - (d_best/d_runnerup)` (prompt 9)
- [ ] **CLAD** — `HoldBuffer.ts` — ~18-frame ring buffer, commit on stable top candidate (prompt 10)
- [ ] **CLAD** — `PhraseController.ts` — letter sequence state machine (prompt 11)
- [ ] **CLAD** — `SignPanel.ts` + confidence bar via `/specs-build-ui` (prompt 12)
- [ ] **CLAD** — LEAF scenarios: word completes, low-confidence rejects, hold interrupted (prompt 13)
- [ ] **CLAD** — `/specs-leaf-run-in-preview` — run them, commit passing tests (prompt 14)

**Optional, cut first if behind:**
- [ ] `ReferenceHand.ts` — orbitable 3D handshape (~40 min)

---

## Phase 4 — Hardware pass 🔒 BLOCKED on Phase 0

Design for **one** tuning round, not three.

- [!] **Friend** — Single-letter dry run first. Record ONE letter, send JSON, stop.
      Catches a wrong `reformThreshold` before 24 letters are wasted.
- [!] **Friend** — Record all 24 letters (J and Z excluded — motion letters).
      Extra samples for A/S/T/M/N.
- [!] **You** — Run `perLandmarkVariance` + `perLandmarkDiscriminability` on real templates.
      Settles the `ToWrist` question empirically. Check the TPLVAR table for any letter an order
      of magnitude below its neighbours.
- [!] **You + CLAD** — Pick full-vs-reduced, weighted-vs-unweighted by measurement, not assumption
- [!] **You + CLAD** — Threshold tuning on device (prompt 16). **Let this fail visibly in the log.**
- [ ] **CLAD** — Wire ASR (low-iteration; cut if hardware time evaporates)

---

## Phase 5 — Ship

- [ ] **You** — Pick the demo phrase. **Avoid A/S/T/M/N entirely.** Decide before filming.
- [ ] **CLAD** — `/verify-preview` — confirm panel + confidence bar render
- [ ] **CLAD** — `README.md` — what it is, why it fits "Connect", who it's for. Must state:
      practice/fallback aid, **not** a replacement for interpreters; does **not** translate ASL.
- [ ] **You** — Code freeze with real slack
- [ ] **You** — Record demo video (`Win+Alt+R` → `C:\Users\Raol\Videos\Captures\`).
      End on **LEAF tests passing + CLAD terminal** — that shot scores the 50% directly.
- [ ] **You** — `/export` → `docs/PROMPT_LOG.md`, back up raw JSONL.
      No `tee`/`script` (ANSI soup on Windows).
- [ ] **You** — Hand-write ~10-line narrative header on PROMPT_LOG.md. Judges read it first.
- [ ] **You** — Verify repo + video link both open in incognito
- [ ] **You** — Submit at lenslist.co/clad-summer-hackathon

---

## Prompt-log highlights so far

Material already worth citing in the narrative header — this is genuine closed-loop evidence:

1. **Verified rather than assumed** — enumerated 26 real keypoints from type definitions instead
   of trusting the docs' "21". Caught the thumb naming trap that would have silently
   misclassified M/N/S/T.
2. **Confirmed a platform limit, then designed around it** — raw `HandInputData` doesn't fire in
   the Editor, which is *why* the mocking layer exists.
3. **A hypothesis stated too confidently, then measured** — the `ToWrist` landmarks were assumed
   dead; `perLandmarkVariance` was built to test that instead of acting on it.
4. **A metric corrected** — pooled variance conflates between-letter signal with within-letter
   noise. Replaced with a Fisher ratio, validated against planted ground truth (pure-signal vs
   pure-noise landmarks separated by 4 orders of magnitude where pooled variance couldn't).
5. **Data-collection integrity** — frame-caching would have produced duplicate samples and a
   meaningless variance floor. Fixed at the recorder.

---

## Critical path

```
Message friend ──> dry run ──> record 24 letters ──> measure ──> tune ──> film
      ^
      └── still not done, and everything to the right of it is waiting
```

Meanwhile Phase 3 runs entirely in parallel and needs nothing from anyone.

## If Friday arrives with no hardware

Drop recognition. Ship the bridge with the preset phrase menu: keeps the concept, the panels,
the spatial story, and the LEAF tests. Loses the ML centerpiece.
**Sunday-night pivots don't work. Friday ones do.**
