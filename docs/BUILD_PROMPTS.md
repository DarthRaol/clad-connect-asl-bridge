# ASL Bridge — Architecture + CLAD Prompt Script

Working document for the CLAD Summer Hackathon, Week 3 "Connect" (deadline **Aug 30, 11:59 PM PT**).

Two purposes: it's the build order, and it's the raw material for `docs/PROMPT_LOG.md`.

---

## Part 1 — The solution in detail

### What it is

One wearer, one non-wearer, no shared language. The wearer fingerspells; recognized letters
assemble into words on a panel **facing outward** so the other person can read them. A 3D reference
hand can be orbited when the wearer blanks on a letter.

Framed as what fingerspelling actually is in ASL — the tool for **names, places, and words with no
established sign** — not as an alphabet lesson.

Excluded: **J and Z** (both require motion).

### Components

| File | Role | Preview-testable |
|---|---|---|
| `HandProbe.ts` | Confirms joint availability; on-device sanity check | n/a |
| `LandmarkCapture.ts` | 21 joints → normalized 63-dim vector | Yes (via mock) |
| `TemplateRecorder.ts` | Capture samples per letter → JSON | **No — hardware** |
| `Assets/Data/templates.json` | The dataset | — |
| `Classifier.ts` | k-NN + confidence, swappable interface | Yes |
| `HoldBuffer.ts` | Temporal smoothing + hold-to-commit | Yes |
| `PhraseController.ts` | Letter sequence state machine | Yes |
| `SignPanel.ts` | Outward-facing text output | Yes |
| `ReferenceHand.ts` | Orbitable 3D handshape | Yes |
| `MockHandInput.ts` | Synthetic landmark injection | Yes — enables everything above |

### Normalization (the part that decides accuracy)

Raw joint positions are useless directly — they move with hand position, distance, and rotation.
Normalize into a hand-local frame:

1. **Origin** = `wrist.position`. The skill notes wrist is the stable joint; fingertips are jittery.
2. **Basis** — build an orthonormal frame from wrist→middle-knuckle (primary axis) and the
   knuckle spread (secondary axis). Cross product gives the third.
3. **Rotate** all 21 joints into that frame → rotation invariant.
4. **Scale** by the wrist→middle-knuckle distance → hand-size and camera-distance invariant.

Output: 21 × 3 = **63-dim vector**. This is the same normalization idea MediaPipe uses; the method
transfers even though their data does not.

### Classification

k-NN over stored templates. Distance = Euclidean over the 63-dim vector.

- **Confidence** = margin-based: `1 - (d_best / d_runnerup)`. A letter that's clearly nearest scores
  high; a letter tied with its neighbour scores low. This is better than raw distance because it
  surfaces exactly the A/S/T and M/N ambiguity instead of hiding it.
- Behind `classify(landmarks) -> {letter, confidence}` so the implementation can be swapped for a
  geometric heuristic if template data turns out thin.

### Hold-to-commit

Ring buffer of the last ~18 frames (~0.6 s at 30 fps). Commit a letter when it is the top candidate
across the whole window **and** mean confidence clears the threshold.

This does double duty: it kills jitter, it averages out the documented fingertip noise, and it reads
as patient coaching on video rather than a twitchy quiz.

**Chase forgiveness, not accuracy.** A strict classifier that rejects the user three times looks
broken on camera even when it is technically more correct.

### Known hard cases

**A / S / T** and **M / N** differ only by thumb placement — and the thumb is *occluded* in exactly
those handshapes, so tracking confidence is worst where precision matters most. This is one
compounding problem, not two independent ones.

Mitigation: curate the demo phrase to avoid the cluster. Record extra samples for them. Do not spend
the single hardware tuning pass discovering this.

---

## Part 2 — The prompt script

### Ground rules

- **One session, one cwd.** Start from `C:\Users\Raol\Documents\SPECS\ASL_Helper` and stay there.
  The whole story needs to live in a single transcript.
- **Name skills explicitly.** Judges should see CLAD-native workflow, not generic chat.
- **Do not hide failures.** Threshold tuning will genuinely fail first. That's the most valuable
  material in the log — it's what "closed loop" means.
- Verify before building on an assumption. Prompts 3 and 8 exist for exactly that reason.

### Phase 1 — Setup

**1.**
```
/lens-studio-router — I'm building a Spectacles Lens for the CLAD hackathon: an ASL
fingerspelling bridge that recognizes handshapes and displays recognized letters on an
outward-facing panel. Confirm project and MCP readiness before we start.
```

**2.**
```
/ensure-package-installed SpectaclesInteractionKit — then confirm it resolves by compiling
Assets/Scripts/HandProbe.ts.
```

**3.** *(verification, not construction — do not skip)*
```
Read the SIK HandInputData type definitions and enumerate the exact names of all 21 hand
keypoints available on TrackedHand. Don't infer them from naming patterns — read the actual
type definitions and list what's really there. Write the list to docs/JOINTS.md.
```

**4.**
```
/specs-leaf-install-packages — install LEAF so we can test the classifier without hardware.
```

### Phase 2 — Recorder first

**5.**
```
/specs-interaction-recipes — I need the correct SIK init order before writing hand-tracking
code. Confirm what belongs in onAwake vs OnStartEvent.
```

**6.**
```
Write Assets/Scripts/LandmarkCapture.ts. It reads all 21 joints from TrackedHand and returns a
normalized 63-dim vector: origin at wrist, orthonormal basis from wrist->middle-knuckle and the
knuckle spread, scaled by wrist->middle-knuckle distance. Rotation and scale invariant. Use the
joint names from docs/JOINTS.md.
```

**7.**
```
Write Assets/Scripts/TemplateRecorder.ts — shows a target letter, captures N samples of the
normalized vector on pinch, and writes Assets/Data/templates.json keyed by letter. Include a
sample counter and a clear "recorded" confirmation, since the person running this won't be me.
```

### Phase 3 — Preview-testable core

**8.** *(the mocking layer — everything downstream depends on it)*
```
Raw HandInputData doesn't fire in the Lens Studio Editor, so I need a mocking layer. Write
Assets/Scripts/MockHandInput.ts that can inject synthetic 63-dim landmark vectors, so the
classifier and state machine are testable in preview without hardware.
```

**9.**
```
Write Assets/Scripts/Classifier.ts — k-NN over templates.json behind the interface
classify(landmarks) -> {letter, confidence}. Confidence is margin-based: 1 - (d_best/d_runnerup),
so ambiguous handshapes score low rather than picking a winner arbitrarily.
```

**10.**
```
Write Assets/Scripts/HoldBuffer.ts — ring buffer over the last ~18 frames. Commits a letter only
when it's the top candidate across the whole window and mean confidence clears a threshold.
```

**11.**
```
Write Assets/Scripts/PhraseController.ts — the state machine: current target word, letter index,
advance on commit, emit events for UI.
```

**12.**
```
/specs-build-ui — build the outward-facing SignPanel showing assembled text so the non-wearer
can read it, plus a confidence bar that fills continuously rather than showing pass/fail.
```

**13.**
```
/specs-leaf-write-scenarios — write scenarios driving PhraseController through MockHandInput:
a full word completing, a low-confidence input failing to commit, and a hold interrupted midway.
```

**14.**
```
/specs-leaf-run-in-preview — run them.
```

### Phase 4 — Hardware, one pass

**15.**
```
Templates are in from the device. Load them and report per-letter sample counts and the
distances between letter centroids. I want to know which letters are closest together before I
spend my one tuning pass.
```

**16.** *(this is the closed-loop moment — let it be messy in the log)*
```
Recognition on device is committing wrong letters for [X]. Here's the log output: [paste].
Diagnose and adjust thresholds, then tell me what to re-test.
```

### Phase 5 — Ship

**17.**
```
/verify-preview — capture the runtime view and confirm the panel and confidence bar render
correctly.
```

**18.**
```
Write README.md: what it is, why it fits "Connect", who it's for. State plainly that this is a
practice and fallback aid, not a replacement for interpreters, and that it does not translate
ASL — ASL has its own grammar and this reads fingerspelling only.
```

---

## Part 3 — The prompt log

The log is **primary evidence for 50% of the score**. Treat it as a deliverable, not an export.

### Capture

1. **In-session `/export`** at the end → commit as `docs/PROMPT_LOG.md`.
2. **Back up the raw transcript** — `~/.claude/projects/<cwd-mangled>/*.jsonl` → `docs/session-raw.jsonl`.
3. **Do NOT use `tee` or `script`.** TUI redraws produce unreadable ANSI on Windows.

### The part that actually scores

Raw transcripts are long and judges read the top first. **Hand-write a narrative header** on
`PROMPT_LOG.md`, roughly ten lines, covering:

- What was built and why fingerspelling is the honest scope
- Which CLAD skills were used and what each contributed
- **The verification steps** — prompt 3 (enumerating real joint names rather than inferring them)
  and prompt 8 (building the mock layer once the Editor limitation was confirmed). These show
  judgement, not just prompting.
- **One thing that failed and how it was corrected** — the threshold tuning at prompt 16. Do not
  clean this up. A log with no failures reads as a log with no loop.
- What LEAF proved without hardware, and what still needed the device

### What separates this from a chat transcript

- Named skills throughout
- A verification step that changed the plan (Editor limitation → mocking layer)
- Committed test files, not just claims of testing
- A visible failure and recovery
- An honest statement of what could not be tested in preview and why

---

## Cut list, in order

1. **Face-anchored transcript** — unverified API. Do not build. World-lock the panel instead.
2. **3D orbitable hand** — best 40 minutes if available, first to go if not.
3. **ASR leg** — hurts the "Connect" fit; cut only if hardware time evaporates.
4. **Never cut:** the repo, the LEAF tests, the prompt log.

## Kill date

**Friday.** If hardware access isn't confirmed and working by then, drop recognition and ship the
bridge with the preset phrase menu. Keeps the concept, the panels, the spatial story, and the
tests. Sunday-night pivots don't work.
