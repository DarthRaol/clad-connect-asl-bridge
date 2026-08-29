(function(){
// Characterises what the classifier ACTUALLY does across all 24 static letters,
// as opposed to what the separability gate predicts.
//
// These are two different questions and this tool reports both, because they
// disagree in informative ways:
//
//   GATE      nearest-other-letter distance / within-letter spread, against a
//             1.5x threshold. A geometry measure. Says "these classes overlap".
//
//   LOO       leave-one-out k-NN: classify every sample against every template
//             EXCEPT itself, using the same scoring as Assets/Scripts/Classifier.ts.
//             A behaviour measure. Says "this is what would actually be returned".
//
// A letter can fail the gate and still classify correctly, when its own samples
// remain nearest despite the classes overlapping. Conflating the two would
// overstate the failure. So the expected-failure set below is pinned from
// OBSERVED behaviour, and this script exits non-zero if reality drifts from it —
// which is what makes the numbers quoted in docs/SEPARABILITY.md and README.md
// a claim under test rather than a snapshot that silently goes stale.
//
// Usage: node tools/characterize-alphabet.js [LETTERS]
//        LETTERS: optional subset, e.g. ABCDEFILMNORSTVWXY. Restricting the
//        set is not cosmetic — removing a letter removes it as a competitor,
//        so accuracy is only meaningful for the set actually shipped.

const {generate, measure, LETTERS, SAMPLES} = require("./gen-synthetic-templates.js");

const SUBSET = (process.argv[2] || "").toUpperCase().replace(/[^A-Z]/g, "");
const DEFS = {};
for (const k of Object.keys(LETTERS)) {
  if (SUBSET === "" || SUBSET.indexOf(k) >= 0) DEFS[k] = LETTERS[k];
}
if (SUBSET !== "") {
  const missing = SUBSET.split("").filter(c => !LETTERS[c]);
  if (missing.length) { console.log("Not static letters: " + missing.join(" ")); process.exit(2); }
}

const K = 1;                 // matches SignBridge's shipped k
const GATE = 1.5;
const DIM = 78;

function dist(a, b) {
  let s = 0;
  for (let i = 0; i < DIM; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
}

/**
 * Score one query against one letter's templates: mean of the k nearest.
 * Mirrors Classifier.letterScore().
 */
function letterScore(samples, query) {
  const ds = samples.map(s => dist(s, query)).sort((x, y) => x - y);
  const n = Math.min(K, ds.length);
  if (n === 0) return Infinity;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += ds[i];
  return sum / n;
}

/**
 * Classify `query`, excluding the sample at (excludeLetter, excludeIndex).
 * Confidence is the per-LETTER margin, as in Classifier.classify().
 */
function classify(letters, query, excludeLetter, excludeIndex) {
  const scored = [];
  const keys = Object.keys(letters);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    let pool = letters[k].map(s => s.normalized);
    if (k === excludeLetter) {
      pool = pool.filter((_, idx) => idx !== excludeIndex);
    }
    if (pool.length === 0) continue;
    scored.push({letter: k, d: letterScore(pool, query)});
  }
  scored.sort((a, b) => a.d - b.d);
  const best = scored[0], runner = scored[1];
  const confidence = runner && runner.d > 0 ? 1 - best.d / runner.d : 1;
  return {letter: best.letter, distance: best.d, runnerUp: runner ? runner.letter : null, confidence};
}

// ---------------------------------------------------------------------------

const letters = generate(DEFS);
const keys = Object.keys(letters).sort();
const gate = measure(letters);
const gateByLetter = {};
for (const r of gate.perLetter) gateByLetter[r.letter] = r;

const rows = [];
for (const k of keys) {
  const samples = letters[k];
  let correct = 0;
  const confusedWith = {};
  let confSum = 0;
  for (let i = 0; i < samples.length; i++) {
    const r = classify(letters, samples[i].normalized, k, i);
    confSum += r.confidence;
    if (r.letter === k) correct++;
    else confusedWith[r.letter] = (confusedWith[r.letter] || 0) + 1;
  }
  const wrong = Object.keys(confusedWith).sort((a, b) => confusedWith[b] - confusedWith[a]);
  rows.push({
    letter: k,
    correct,
    total: samples.length,
    topConfusion: wrong.length ? wrong[0] : null,
    confusedWith,
    meanConfidence: confSum / samples.length,
    gateRatio: gateByLetter[k].ratio,
    gateNearest: gateByLetter[k].other
  });
}

console.log("Leave-one-out k-NN over " + keys.length + " letters (k=" + K + ", dim=" + DIM + ")");
if (SUBSET !== "") console.log("subset: " + keys.join(""));
console.log("GATE = separability ratio vs " + GATE + "x   LOO = samples classified as themselves\n");
console.log("letter   LOO      gate      nearest   returned instead");
for (const r of rows.slice().sort((a, b) => a.correct - b.correct || a.gateRatio - b.gateRatio)) {
  const loo = r.correct + "/" + r.total;
  const conf = r.topConfusion
    ? Object.keys(r.confusedWith).map(x => x + "x" + r.confusedWith[x]).join(" ")
    : "-";
  console.log(
    "  " + r.letter.padEnd(6) +
    loo.padEnd(9) +
    (r.gateRatio.toFixed(2) + "x").padStart(6) + "    " +
    r.gateNearest.padEnd(9) +
    conf
  );
}

const misclassified = rows.filter(r => r.correct < r.total).map(r => r.letter);
const perfect = rows.filter(r => r.correct === r.total).map(r => r.letter);
const gateFailures = rows.filter(r => r.gateRatio < GATE).map(r => r.letter);

console.log("\nLOO perfect        (" + perfect.length + "): " + perfect.join(" "));
console.log("LOO misclassified  (" + misclassified.length + "): " + (misclassified.join(" ") || "none"));
console.log("gate failures      (" + gateFailures.length + "): " + gateFailures.join(" "));

// The two measures are not the same set, and that is the point.
const gateOnly = gateFailures.filter(l => misclassified.indexOf(l) < 0);
console.log(
  "\nFail the gate but still classify correctly (" + gateOnly.length + "): " + (gateOnly.join(" ") || "none")
);
console.log("  -> classes overlap, but each letter's own samples stay nearest.");
console.log("  -> real templates would decide these; synthetic geometry cannot.");

// ---------------------------------------------------------------- pinned ----
// Observed behaviour, pinned so the documented claims cannot go stale silently.
// Update these deliberately, alongside the docs, never to make a run pass.
const EXPECTED_MISCLASSIFIED = ["G", "H", "K", "P", "Q", "U"];
const EXPECTED_GATE_FAILURES = ["G", "H", "K", "M", "N", "P", "Q", "R", "S", "T", "U", "V"];

function same(a, b) {
  return a.length === b.length && a.slice().sort().join(",") === b.slice().sort().join(",");
}

let ok = true;
if (SUBSET !== "") {
  // Subset run: this is an ADOPTION GATE, not a drift check. The pinned sets
  // describe the full 24 and say nothing about a subset, so the only question
  // is whether every included letter classifies to itself.
  // Run the gate across many jitter draws, not one.
  //
  // A single draw is not evidence: letters consume the RNG in key order, so a
  // different subset gives every letter a different sample, and a letter that
  // sits on the M/N decision boundary can score 5/5 on one draw and 4/5 on the
  // next. Shipping on one lucky draw is exactly the mistake this whole
  // measurement exercise exists to avoid. A letter is adoptable only if it is
  // 5/5 on EVERY seed.
  const SEEDS = 12;
  const failCount = {};
  const confusedInto = {};
  for (const k of keys) failCount[k] = 0;

  for (let s = 0; s < SEEDS; s++) {
    const draw = generate(DEFS, 20260829 + s * 7919);
    for (const k of keys) {
      const samples = draw[k];
      for (let i = 0; i < samples.length; i++) {
        const r = classify(draw, samples[i].normalized, k, i);
        if (r.letter !== k) {
          failCount[k]++;
          confusedInto[k] = confusedInto[k] || {};
          confusedInto[k][r.letter] = (confusedInto[k][r.letter] || 0) + 1;
        }
      }
    }
  }

  const total = SEEDS * SAMPLES;
  console.log("\nADOPTION GATE: 5/5 to itself on every one of " + SEEDS + " jitter draws");
  console.log("letter   misclassified / " + total + "    into");
  const unstable = [];
  for (const k of keys) {
    const bad = failCount[k];
    if (bad > 0) unstable.push(k);
    const into = confusedInto[k]
      ? Object.keys(confusedInto[k]).map(x => x + "x" + confusedInto[k][x]).join(" ")
      : "-";
    console.log("  " + k.padEnd(8) + String(bad).padStart(3) + " / " + total + "            " + into);
  }

  const pass = unstable.length === 0;
  console.log("\n" + (pass
    ? "GATE PASSED - all " + keys.length + " letters classify to themselves on every draw."
    : "GATE FAILED (" + unstable.length + "): " + unstable.join(" ") +
      " misclassify on at least one draw."));
  process.exitCode = pass ? 0 : 1;
  return;
}
if (!same(misclassified, EXPECTED_MISCLASSIFIED)) {
  console.log("\nDRIFT: misclassified set changed");
  console.log("  expected: " + EXPECTED_MISCLASSIFIED.join(" "));
  console.log("  observed: " + (misclassified.join(" ") || "none"));
  ok = false;
}
if (!same(gateFailures, EXPECTED_GATE_FAILURES)) {
  console.log("\nDRIFT: gate-failure set changed");
  console.log("  expected: " + EXPECTED_GATE_FAILURES.join(" "));
  console.log("  observed: " + (gateFailures.join(" ") || "none"));
  console.log("  -> README.md says 12 of 24 fail. Update it, or fix the model.");
  ok = false;
}

console.log("\n" + (ok ? "PASS - observed behaviour matches the documented claims." : "FAIL - see drift above."));
process.exitCode = ok ? 0 : 1;

})();
