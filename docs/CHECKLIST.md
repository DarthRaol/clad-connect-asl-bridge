# ASL Bridge — Task Checklist

**Deadline: Sun Aug 30, 11:59 PM PT** = **Mon Aug 31, ~12:30 PM IST** (local).
Now: **Sat Aug 29.** The Fri Aug 28 kill date on recognition has **passed** with Phase 0 at 0/5,
so the decision is made: **ship with synthetic templates, honestly labelled.**

Status: **Phases 1, 2, 3 complete.** Working end-to-end pipeline, 5 mutation-verified LEAF
scenarios passing, two panels. **Phase 4 is effectively dead. All remaining effort goes to
Phase 5 — shipping.**

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

- [x] **CLAD** — `MockHandInput.ts` — `HandFeatureSource` interface (mock/live never branches),
      static pose / scripted sequence / seeded gaussian jitter, `preserveStructuralDims`,
      `loadFromTemplates`. ⚠️ uncommitted
      *Known gap: jitter is applied in feature space, after normalization, so it doesn't
      reproduce the correlated structure of real tracking noise. Fine for testing HoldBuffer
      smoothing; NOT valid for estimating accuracy. Raw landmarks are now stored (v2), so
      landmark-space jitter is possible later — deliberately deferred.*
- [x] **CLAD** — `TemplateFormat.ts` — shared schema, `NEGATIVE_KEY`, reserved-key rules
- [x] **CLAD** — `Classifier.ts` — k-NN, per-letter margin confidence, four variants,
      reserved keys excluded. *Known limit: margin is scale-free and cannot reject an
      out-of-vocabulary pose — needs the distance gate, which is uncalibrated.*
- [x] **CLAD** — `HoldBuffer.ts` — 18-frame window, both gates, `rearmFrames` run guard against
      spurious doubles, progress reaching 1.0. *`maxDistance` defaults to `Infinity` — the
      distance gate is INERT until `_NEGATIVE` samples calibrate it.*
- [x] **CLAD** — `PhraseController.ts` — state machine, wrong-letter flash, J/Z guard,
      `skipCurrentLetter()` escape hatch, tiered phrase list with 5 demo-safe entries
- [x] **CLAD** — `SignPanel.ts` — rich-text word, BackPlate confidence bar.
      *Caught at runtime: `FlexLayout.autoDiscoverItemsOnStart` must be false before building
      children — compiled clean, would have shipped a blank panel.*
- [ ] **CLAD** — Second panel instance, inward-facing. **Spec error found:** target word,
      confidence bar, and wrong-letter flash are signer feedback, but `faceOutward: true`
      points them away from the wearer. Outward = assembled text only.
- [ ] **CLAD** — **The driver.** Nothing wires the components together yet. First end-to-end
      run: source → Classifier → HoldBuffer → PhraseController → both panels.
- [ ] **You** — Legibility check against a realistic background. Specs renders additively;
      white on a bright wall washes out. Preview defaults to "Sunlit Room". Video-critical.
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

- [ ] **You** — Pick the demo phrase. **Two constraints, both hard:**
      1. **No A/S/T/M/N** — thumb-occluded and mutually confusable; worst tracking where the
         most precision is needed.
      2. **No double letters** — doubles depend on `rearmFrames`, which trades spurious doubles
         from tracking noise against missed genuine ones. Avoiding doubles removes the tuning
         risk from the video entirely.
      Note "HELLO" fails on the `LL`. **"HELP" is clean** on both counts. Decide before filming.
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
6. **A compile-clean bug caught only by running** — `FlexLayout.autoDiscoverItemsOnStart`
   defaults true and throws when children are added before init. Would have shipped a blank
   panel. Green compile, broken product.
7. **A spec error found by building it** — the panel was specified as outward-facing, but the
   target word, confidence bar, and wrong-letter flash are *signer* feedback. Split into two
   panels, one aimed at each person — which is a better answer to "Connect" than the original.
8. **⭐ The strongest artifact: a mutation-tested guard.** A spurious-double bug was identified
   by reasoning about the re-arm rule, fixed with a consecutive-frame run, guarded by a LEAF
   scenario — and then the fix was *reverted* to prove the test actually catches it:
   `FAILED: signbridge-no-spurious-double — Expected "0", Received "1"`.
   A green suite on first run is worth distrusting; this one was verified to be able to fail.
   **Lead the PROMPT_LOG.md narrative with this.**

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
