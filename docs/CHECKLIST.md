# ASL Bridge — Task Checklist

**Deadline: Sun Aug 30, 11:59 PM PT** = **Mon Aug 31, ~12:30 PM IST** (local).
Now: **Sat Aug 29, evening.** Roughly **40 hours left** for about **1.5 hours of work.**

**Phases 1–3 complete.** Phase 4 (hardware) is dead — no device materialized (confirmed: no
access at all), so we ship with synthetic templates, honestly labelled.

**Phase 5 status: 5A, 5B, 5C done.** README, SEPARABILITY, VIDEO_SHOTLIST and
PROMPT_LOG_HEADER written; repo public and renamed to `clad-connect-asl-bridge`; hero capture
retaken on Evening Room with both hands.

**Remaining: film (5D) → export + narrative (5E) → submit (5F).**
Video is capped at **60 seconds**, cut from 88 — shot 4 (wrong letter) dropped.

Legend: `[x]` done · `[ ]` todo · **You** / **CLAD** = who does it · ⏱ = rough time

---

## Phase 1 — Setup ✅ 6/6

- [x] Lens Studio **5.23.2** (read from `Lens Studio.exe` ProductVersion), CLAD setup, MCP live
- [x] `ls-clad` plugin (59 skills, current at `cfeb679`)
- [x] Git repo + GitHub remote, pushed
- [x] SpectaclesInteractionKit · SpectaclesUIKit · LEAF installed
- [x] `docs/JOINTS.md` — 26 keypoints enumerated from type definitions

---

## Phase 2 — Capture pipeline ✅

- [x] `HandProbe.ts` — joint availability probe
- [x] `LandmarkCapture.ts` — 26 → 78-dim normalization, mirroring, reduced/weighted variants,
      `perLandmarkVariance`, `perLandmarkDiscriminability` (Fisher, validated on planted data)
- [x] `TemplateRecorder.ts` — distinct-frame guarantee, re-form gate, `_NEGATIVE` mode,
      within-variance warnings, v2 raw-landmark storage
- [x] `TemplateFormat.ts` — shared schema, reserved-key rules

---

## Phase 3 — Preview-testable core ✅ CLOSED

- [x] `MockHandInput.ts` — `HandFeatureSource`, static/sequence/seeded-jitter, `preserveStructuralDims`
- [x] `Classifier.ts` — k-NN, per-letter margin confidence, four variants
- [x] `HoldBuffer.ts` — 18-frame window, both gates, `rearmFrames` run guard
- [x] `PhraseController.ts` — state machine, wrong-letter flash, J/Z guard, tiered phrase list
- [x] `SignPanel.ts` ×2 — outward (assembled text) + inward (target word, bar, flash)
- [x] `SignBridge.ts` — the driver; full chain running in preview
- [x] 6 LEAF scenarios, all passing, **mutation-verified**
- [x] `templates.synthetic.json` — **20 letters** (A B C D E F G I K L N O R S T U V W X Y), flagged
      synthetic. Adopted via the 12-seed LOO gate; 6-letter file kept as `templates.synthetic.6letter.json`.
      P dropped as K's orientation-collision partner.
- [x] `HandVisualizer.ts` — 26 joints + 25 bones rendered from the feature vector itself
- [x] Commit + phrase-complete SFX, wired with a duration-derived tail guard

---

## Phase 4 — Hardware pass ❌ NOT HAPPENING

Kept for the record. Would have been: dry run → record 24 letters + 30 negatives → run Fisher
→ pick variant by measurement → tune thresholds → wire ASR.

**Consequence to disclose in the README:** `maxDistance` stays `Infinity`, so the
out-of-vocabulary distance gate is built but inert. Recognition accuracy against real hands
is unverified.

---

## Phase 5 — Ship 🟨 1/9 — ALL REMAINING WORK

### 5A · Documentation ⏱ ~45 min

- [ ] **CLAD** — Write `README.md` ⏱ 20 min ← **everything else references this**
  - [ ] What it is — two panels, one aimed at each person
  - [ ] Why it fits **Connect** — face-to-face instead of routed through a phone
  - [ ] Why fingerspelling is the honest scope — names, places, no-established-sign words
  - [ ] How CLAD was used — name the skills, link `docs/PROMPT_LOG.md`
  - [ ] **Limitations, unhedged** — synthetic templates; `maxDistance` uncalibrated;
        phrase menu untested past one entry; J/Z excluded
  - [ ] **Framing** — practice/fallback aid, not a replacement for interpreters; does not
        translate ASL, reads fingerspelling only
  - [ ] Embed `docs/end-to-end-preview.png`
  - [ ] Note 6 LEAF scenarios + the mutation verification
- [ ] **CLAD** — `docs/TESTER_GUIDE.md` ⏱ 15 min — *optional now that Phase 4 is dead.
      Write it only if it costs nothing; it's evidence of planning, not a deliverable.*

### 5B · Repo hygiene ⏱ ~10 min — do while near a browser

- [ ] **You** — Open the repo in an **incognito window**. If it 404s it's private — fix now.
      A private repo is an invalid submission.
- [ ] **You** — Rename `CLAD-Guide-hackathon` → something Connect-flavoured
      (`clad-connect-asl-bridge`). Guide was Week 2 and closed Aug 23.
- [ ] **You** — `git remote set-url origin <new-url>` after renaming
- [ ] **You** — Confirm `.mcp.json` is still gitignored (it is) — no token in public history

### 5C · Visual pass ⏱ ~30 min

- [ ] **You** — Switch the preview device **off "Sunlit Room"** to something darker.
      Specs renders additively; white-on-bright washes out.
- [ ] **You/CLAD** — Confirm the **outward** panel's assembled text is legible. Never verified —
      the inward panel proves the class renders, so this is contrast, not logic.
- [ ] **CLAD** — `/verify-preview` for a clean capture with real content

### 5D · Demo video ⏱ ~45 min

- [x] **Demo phrase decided: LUKE** — the only entry `signablePhrases()` allows with synthetic
      templates, and conveniently a *name*, which is the pitch. No doubles, no A/S/T/M/N.
- [ ] **You** — Write a shot list before recording. One clean take beats five retries.
- [ ] **You** — Record with `Win+Alt+R` → saves to `C:\Users\Raol\Videos\Captures\`
  - [ ] Open on what it is and who it's for (~5s)
  - [ ] Show both panels — one faces each person
  - [ ] Spell **LUKE**, confidence bar filling, letters turning green
  - [ ] Show a wrong letter and the flash — recoverable, not a failure
  - [ ] **End on LEAF tests passing + the CLAD terminal** ← scores the 50% directly
- [ ] **You** — Upload, set link sharing to "Anyone with link — Viewer", **test in incognito**

### 5E · Prompt log ⏱ ~30 min — this is 50% of the score

- [ ] **You** — `/export` in the project session (do this **last**, after the final prompt)
- [ ] **You** — Save as `docs/PROMPT_LOG.md`
- [ ] **You** — **Hand-write the ~10-line narrative header.** Judges read this before the
      transcript. Lead with the mutation test.
- [ ] **You** — Re-copy the final transcript → `docs/session-raw.jsonl` (base64 already stripped)
- [ ] **You/CLAD** — **Reset all five filming aids** before the last commit:
      `SignBridge.demoPoseAsset` unwired · `startDelaySeconds` **0** · `loopDemo` **false** ·
      `showReferenceHand` **ON** · `MockHandInput.interpolateFrames` **0**.
      All five are recording conveniences; shipping any of them set changes first-run
      behaviour, and three of them make the LEAF suite fail. See `docs/VIDEO_SHOTLIST.md`.
- [ ] **You** — Commit and push

### 5F · Submit ⏱ ~15 min

- [ ] **You** — Repo link, video link, prompt log, description
- [ ] **You** — Verify **both** links open in incognito
- [ ] **You** — Submit at lenslist.co/clad-summer-hackathon **with hours to spare**, not at 12:20 PM

---

## Narrative header — the raw material

Eight genuine closed-loop moments, already banked. Pick the strongest four or five.

1. **⭐ Mutation-tested guard.** A spurious-double bug found by reasoning about the re-arm rule
   → fixed with a consecutive-frame run → guarded by a LEAF scenario → **the fix was reverted
   to prove the guard fires**: `FAILED: signbridge-no-spurious-double — Expected "0", Received
   "1"`. A green suite on first run is worth distrusting. **Lead with this.**
2. **Verified instead of assumed.** Enumerated 26 real keypoints from the type definitions
   rather than trusting the docs' widely-cited "21" — and caught a thumb naming trap
   (`thumbKnuckle` is `THUMB_1`, `indexKnuckle` is `INDEX_0`) sitting in exactly the code that
   separates M/N/S/T.
3. **A platform limit confirmed, then designed around.** Raw `HandInputData` doesn't fire in
   the Editor — which is *why* the mocking layer exists.
4. **A hypothesis stated too confidently, then measured.** The `ToWrist` landmarks were assumed
   dead weight; `perLandmarkVariance` was built to test that rather than act on it.
5. **A metric corrected.** Pooled variance conflates between-letter signal with within-letter
   noise. Replaced by a Fisher ratio, validated against planted ground truth — pure-signal and
   pure-noise landmarks separated by four orders of magnitude where pooled variance couldn't.
6. **Data-collection integrity.** Frame-caching would have produced duplicate samples and a
   meaningless variance floor. Caught and fixed at the recorder, before any data existed.
7. **A compile-clean bug caught only by running.** `FlexLayout.autoDiscoverItemsOnStart`
   defaults true and throws when children are added before init. Would have shipped a blank
   panel.
8. **A spec error found by building it.** The panel was specified outward-facing, but the
   target word, bar, and flash are *signer* feedback. Split into two panels, one per person —
   a better answer to "Connect" than the original spec.

---

## Order of operations

```
README ──> repo hygiene ──> visual pass ──> video ──> /export ──> narrative ──> submit
   ^                                                       ^
   everything references it              must be LAST -- captures the session
```

**Do not** start `/export` until the final prompt has been sent. Everything after it is lost
from the log.
