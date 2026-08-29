# How this was built

**Paste the block below on top of `docs/PROMPT_LOG.md` after `/export`.**

---

## Read this first

The single moment worth judging this log by: a **spurious-double bug found by reasoning about the re-arm rule** rather than by observing a failure. `HoldBuffer` re-armed on any single non-matching frame, so one dropped tracking frame mid-hold would re-arm and re-commit a letter the signer had signed once. Fixed by requiring N consecutive non-matching frames. Guarded by a LEAF scenario. Then **the fix was reverted to prove the guard fires**:

```
FAILED: signbridge-no-spurious-double
  Expected: "0" — Received: "1"
```

A test suite that is green on its first run has not yet demonstrated it can detect anything. That is the standard applied throughout.

Three other things the transcript shows being *measured* rather than asserted:

- **26 hand keypoints, not the widely-cited 21.** Enumerated from SIK's type definitions instead of trusting the documentation — which surfaced a thumb naming trap (`thumbKnuckle` is `THUMB_1`, `indexKnuckle` is `INDEX_0`) sitting in exactly the code that separates M/N/S/T.
- **A proven architectural limitation.** The feature normalization is rotation-invariant by construction, which erases the wrist orientation distinguishing G/Q, H/U and K/P in ASL. Not inferred — rotating a pose arbitrarily and re-normalizing returns distance `0.000e+0`. Documented and deferred rather than papered over.
- **A 24-letter synthetic set generated, measured, and rejected.** 12 of 24 letters failed a 1.5× separability gate, so it was not adopted and the shipped set stayed at 6. Adoption was gated on the number, not on the code compiling.

And two bugs that **compiled clean and failed only at runtime** — `FlexLayout.autoDiscoverItemsOnStart` (a blank panel) and `MeshBuilder.indexType` defaulting to `None` (an invisible hand). A green compile was never treated as evidence.

CLAD skills used: `/ls-clad:lens-studio-router`, `/ls-clad:ensure-package-installed`, `/ls-clad:specs-leaf-install-packages`, `specs-interaction-recipes`, `/specs-build-ui`, `/specs-leaf-write-scenarios`, `/ls-clad:specs-leaf-run-in-preview`.

**What to look for below:** the turns where a claim gets checked before it gets used — the Fisher-ratio validation against planted data, the rotation-invariance test, the separability gate that rejected its own output, and the corrections where a stated result turned out to be wrong and was retracted in place.

---

## Notes on using this header

- Target length is the block above — roughly 10 lines of substance. Do not expand it; a judge decides from this whether to read 2,000 lines of transcript.
- The mutation-test failure text must be quoted exactly. It is the strongest single artifact in the log.
- Keep the closing pointer. It tells a judge *what to look for* rather than summarizing what they are about to read, which is the difference between a header and a duplicate.
- If the transcript is re-exported after further work, re-check that the skill list still matches what was actually invoked.
