// Writes Assets/Data/poses.demo.json — a DISPLAY-ONLY pose sequence.
//
// This file is NOT a template set. It is never loaded into the Classifier and
// must never be wired to SignBridge's templatesAsset. It exists so the demo can
// play handshapes the classifier does not know, in order to SHOW a limitation
// rather than assert one.
//
// The sequence is K then P. In ASL these differ only by wrist rotation, and
// LandmarkCapture's basis is built entirely from the hand, so orientation is
// erased before the classifier sees anything. Both letters therefore share one
// spec in the generator and, at sample 0 (which carries no jitter), produce
// byte-identical 78-dim vectors. The rendered skeleton is the same drawing
// twice — which is the point being demonstrated on camera.
//
// Usage: node tools/gen-demo-poses.js [outputPath]

const fs = require("fs");
const {buildHand, normalize, LETTERS, ORDER} = require("./gen-synthetic-templates.js");

const SEQUENCE = ["K", "P"];
const outPath = process.argv[2] || "Assets/Data/poses.demo.json";

const letters = {};
for (const ch of SEQUENCE) {
  if (!LETTERS[ch]) {
    console.log("No such static letter: " + ch);
    process.exit(2);
  }
  const pts = buildHand(LETTERS[ch]);
  const norm = normalize(pts);
  if (norm === null) {
    console.log("Degenerate pose for " + ch);
    process.exit(2);
  }
  letters[ch] = [{
    normalized: norm,
    raw: pts.reduce((a, b) => a.concat(b), []).map(v => +v.toFixed(4))
  }];
}

const out = {
  version: 2,
  _comment:
    "DISPLAY-ONLY POSE SEQUENCE — NOT A TEMPLATE SET. Wire this to SignBridge's " +
    "demoPoseAsset, never to templatesAsset. These letters are deliberately absent " +
    "from the classifier's candidate set; the sequence exists to demonstrate that K " +
    "and P are the same point in the feature space, not to recognize them.",
  displayOnly: true,
  synthetic: true,
  featureDim: 78, rawDim: 78, landmarkCount: 26, rawUnits: "cm_world",
  samplesPerLetter: 1, signingHand: "right", mirrored: false,
  landmarkOrder: ORDER,
  letters
};

fs.writeFileSync(outPath, JSON.stringify(out, null, 1));

// Prove the claim the fixture is built on, rather than asserting it.
const a = letters[SEQUENCE[0]][0].normalized;
const b = letters[SEQUENCE[1]][0].normalized;
let maxAbs = 0;
for (let i = 0; i < a.length; i++) maxAbs = Math.max(maxAbs, Math.abs(a[i] - b[i]));
let sq = 0;
for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; sq += d * d; }

console.log("wrote " + outPath + "  sequence=" + SEQUENCE.join(",") + "  samples=1 each");
console.log("K vs P  max per-dim difference : " + maxAbs.toExponential(3));
console.log("K vs P  euclidean distance     : " + Math.sqrt(sq).toExponential(3));
console.log(maxAbs === 0
  ? "IDENTICAL — the two poses are the same vector, so the skeleton draws the same hand twice."
  : "NOT identical — the demo would not show what it claims. Investigate before recording.");
process.exitCode = maxAbs === 0 ? 0 : 1;
