// Generates SYNTHETIC ASL templates by running parameterized hand poses through
// the same normalizeLandmarks math the Lens uses (LandmarkCapture.ts).
//
// NOT recorded data. A wiring fixture so the pipeline can be exercised in the
// Editor before a hardware session.
//
// Finger model is articulated, not binary extended/curled:
//   mcp/pip/dip  cumulative bend angles toward the palm side (+z)  -> partial curl
//   abd          abduction about the palm normal                   -> lateral separation
//   zs           out-of-plane shift growing along the chain        -> finger crossing
// Thumb is specified by a TIP TARGET in palm space, with the intermediate
// joints bowed along the chord, so thumb position relative to the finger
// knuckles is directly controllable (A vs S vs T, M vs N).
//
// Usage: node tools/gen-synthetic-templates.js [outputPath]
//        (omit outputPath to measure only, writing nothing)

const fs = require("fs");

const ORDER = ["wrist","thumbToWrist","thumbBaseJoint","thumbKnuckle","thumbMidJoint","thumbTip",
"indexToWrist","indexKnuckle","indexMidJoint","indexUpperJoint","indexTip",
"middleToWrist","middleKnuckle","middleMidJoint","middleUpperJoint","middleTip",
"ringToWrist","ringKnuckle","ringMidJoint","ringUpperJoint","ringTip",
"pinkyToWrist","pinkyKnuckle","pinkyMidJoint","pinkyUpperJoint","pinkyTip"];

const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const scl=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const len=a=>Math.sqrt(dot(a,a));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const EPS=1e-4, WRIST=0, IK=7, MK=12, PK=22, DEG=Math.PI/180;

// Mirror of normalizeLandmarks() in Assets/Scripts/LandmarkCapture.ts.
function normalize(pts){
  const w=pts[WRIST], mk=pts[MK], ik=pts[IK], pk=pts[PK];
  const fwd=sub(mk,w); const s=len(fwd); if(s<EPS) return null;
  const inv=1/s, y=scl(fwd,inv);
  const spread=sub(pk,ik);
  const perp=sub(spread, scl(y,dot(spread,y)));
  const pl=len(perp); if(pl<EPS) return null;
  const x=scl(perp,1/pl), z=cross(x,y);
  const out=[];
  for(let i=0;i<26;i++){const d=sub(pts[i],w);
    out.push(+(dot(d,x)*inv).toFixed(4), +(dot(d,y)*inv).toFixed(4), +(dot(d,z)*inv).toFixed(4));}
  return out;
}

// ---------------------------------------------------------------- skeleton --
const KNUCKLE = {index:[-2.0,8.2], middle:[0.0,9.0], ring:[2.0,8.6], pinky:[3.7,7.6]};
const SEG     = {index:[4.0,2.4,1.8], middle:[4.4,2.6,1.9], ring:[4.1,2.5,1.8], pinky:[3.2,1.9,1.5]};
const META    = {index:[-0.8,1.2,0], middle:[0,1.2,0], ring:[0.8,1.2,0], pinky:[1.5,1.1,0]};
const THUMB_BASE = [-2.2,2.6,0.8];   // thumbBaseJoint, the CMC-ish anchor
const THUMB_LEN  = 6.4;              // base -> tip along the chain
const THUMB_TO_WRIST = [-1.0,1.0,0.3];

// Bend presets: flexion at MCP / PIP / DIP, in degrees, applied cumulatively.
const P = {
  EXT:   {mcp: 4,  pip: 6,  dip: 4},   // straight, slight natural bow
  CLAW:  {mcp:28,  pip:38,  dip:22},   // C   - open curve, ~90 deg total
  RING:  {mcp:62,  pip:78,  dip:40},   // O/D/F - tip returns toward the thumb
  EFOLD: {mcp:74,  pip:86,  dip:44},   // E   - tighter than O, tips ride the thumb
  HOOK:  {mcp:40,  pip:92,  dip:56},   // X   - hooked, knuckle stays forward
  FIST:  {mcp:88,  pip:98,  dip:72}    // closed fist, tip lands on the palm
};

// Natural relaxed fan. Positive abduction points toward +x (pinky side).
const FAN = {index:-5, middle:0, ring:4, pinky:9};

function fingerChain(name, spec){
  const kx = KNUCKLE[name][0], ky = KNUCKLE[name][1];
  const L1 = SEG[name][0], L2 = SEG[name][1], L3 = SEG[name][2];
  const abd = (spec.abd !== undefined ? spec.abd : FAN[name]) * DEG;
  const zs  = spec.zs || 0;
  const u = [Math.sin(abd), Math.cos(abd), 0];   // long axis in the palm plane
  const n = [0,0,1];                             // flexion is toward the palm side
  const dir = t => add(scl(u, Math.cos(t)), scl(n, Math.sin(t)));

  const t1 = spec.mcp*DEG, t2 = t1 + spec.pip*DEG, t3 = t2 + spec.dip*DEG;
  const knuckle = [kx,ky,0];
  const mid   = add(knuckle, scl(dir(t1), L1));
  const upper = add(mid,     scl(dir(t2), L2));
  const tip   = add(upper,   scl(dir(t3), L3));
  // Crossing: out-of-plane displacement growing along the chain.
  const shift = f => [0,0,zs*f];
  return [knuckle, add(mid,shift(0.35)), add(upper,shift(0.75)), add(tip,shift(1.0))];
}

// Thumb from a tip target: joints sit along the chord, bowed out so the total
// chain length stays near THUMB_LEN however close the target is.
function thumbChain(tip){
  const chord = sub(tip, THUMB_BASE);
  const d = len(chord);
  if (d < EPS) throw new Error("degenerate thumb target");
  const c = scl(chord, 1/d);
  const slack = Math.max(0, THUMB_LEN*THUMB_LEN - d*d);
  const amp = Math.min(2.2, Math.sqrt(slack) * 0.55);
  // Bow away from the palm centre; orthogonalize against the chord.
  const bias = [-0.35, 0.25, 0.90];
  let bow = sub(bias, scl(c, dot(bias,c)));
  const bl = len(bow);
  bow = bl < EPS ? [0,0,1] : scl(bow, 1/bl);
  const at = t => add(add(THUMB_BASE, scl(chord,t)), scl(bow, amp*Math.sin(Math.PI*t)));
  return [at(0.0), at(0.40), at(0.72), at(1.0)];   // base, knuckle, mid, tip
}

function buildHand(spec){
  const p = new Array(26);
  p[0] = [0,0,0];
  p[1] = THUMB_TO_WRIST;
  const th = thumbChain(spec.thumb);
  p[2]=th[0]; p[3]=th[1]; p[4]=th[2]; p[5]=th[3];
  const bases = {index:6, middle:11, ring:16, pinky:21};
  const names = ["index","middle","ring","pinky"];
  for (let i=0;i<names.length;i++) {
    const f = names[i], b = bases[f];
    p[b] = META[f];
    const j = fingerChain(f, spec[f]);
    p[b+1]=j[0]; p[b+2]=j[1]; p[b+3]=j[2]; p[b+4]=j[3];
  }
  return p;
}

const F = (preset, extra) => Object.assign({}, P[preset], extra || {});

// ------------------------------------------------------------- the alphabet -
// 24 static letters. J and Z are excluded: both are defined by MOTION, not by a
// handshape, so no single-frame template can represent them.
const LETTERS = {
  A: {index:F("FIST"), middle:F("FIST"), ring:F("FIST"), pinky:F("FIST"),
      thumb:[-3.5,7.4,1.0]},                                  // thumb up the radial side
  B: {index:F("EXT",{abd:-1}), middle:F("EXT",{abd:0}), ring:F("EXT",{abd:1}), pinky:F("EXT",{abd:2}),
      thumb:[1.0,5.2,2.6]},                                   // four together, thumb across palm
  C: {index:F("CLAW",{abd:-3}), middle:F("CLAW",{abd:0}), ring:F("CLAW",{abd:3}), pinky:F("CLAW",{abd:7}),
      thumb:[-3.4,6.4,4.6]},                                  // open curve, thumb closes it below
  D: {index:F("EXT"), middle:F("RING"), ring:F("RING"), pinky:F("RING"),
      thumb:[-1.0,7.2,5.0]},                                  // thumb meets the curled middle tip
  E: {index:F("EFOLD"), middle:F("EFOLD"), ring:F("EFOLD"), pinky:F("EFOLD"),
      thumb:[0.4,4.4,3.2]},                                   // thumb lies under the folded tips
  F: {index:F("RING"), middle:F("EXT"), ring:F("EXT"), pinky:F("EXT"),
      thumb:[-2.2,6.6,5.0]},                                  // thumb pinches the index tip
  G: {index:F("EXT"), middle:F("FIST"), ring:F("FIST"), pinky:F("FIST"),
      thumb:[-4.2,7.6,0.6]},                                  // thumb parallel alongside the index
  H: {index:F("EXT",{abd:-1}), middle:F("EXT",{abd:0}), ring:F("FIST"), pinky:F("FIST"),
      thumb:[1.6,5.6,3.0]},                                   // two together (U held horizontal)
  I: {index:F("FIST"), middle:F("FIST"), ring:F("FIST"), pinky:F("EXT"),
      thumb:[0.6,5.4,2.8]},
  K: {index:F("EXT",{abd:-14}), middle:F("EXT",{abd:10}), ring:F("FIST"), pinky:F("FIST"),
      thumb:[-1.0,7.4,1.6]},                                  // thumb up between the two
  L: {index:F("EXT"), middle:F("FIST"), ring:F("FIST"), pinky:F("FIST"),
      thumb:[-7.8,4.4,1.4]},                                  // thumb out laterally
  M: {index:F("FIST"), middle:F("FIST"), ring:F("FIST"), pinky:F("FIST"),
      thumb:[2.6,5.0,2.6]},                                   // thumb under three, tip past the ring
  N: {index:F("FIST"), middle:F("FIST"), ring:F("FIST"), pinky:F("FIST"),
      thumb:[1.0,5.0,2.6]},                                   // thumb under two, tip past the middle
  O: {index:F("RING",{abd:-2}), middle:F("RING",{abd:0}), ring:F("RING",{abd:2}), pinky:F("RING",{abd:5}),
      thumb:[-1.2,7.0,5.0]},                                  // all four meet the thumb
  P: {index:F("EXT",{abd:-14}), middle:F("EXT",{abd:10}), ring:F("FIST"), pinky:F("FIST"),
      thumb:[-1.0,7.4,1.6]},                                  // K pointing down - same handshape
  Q: {index:F("EXT"), middle:F("FIST"), ring:F("FIST"), pinky:F("FIST"),
      thumb:[-4.2,7.6,0.6]},                                  // G pointing down - same handshape
  R: {index:F("EXT",{abd:11, zs:0.9}), middle:F("EXT",{abd:-9, zs:-0.4}), ring:F("FIST"), pinky:F("FIST"),
      thumb:[1.4,5.4,2.8]},                                   // index crossed over middle
  S: {index:F("FIST"), middle:F("FIST"), ring:F("FIST"), pinky:F("FIST"),
      thumb:[0.4,6.5,4.6]},                                   // thumb across the FRONT of the fist
  T: {index:F("FIST"), middle:F("FIST"), ring:F("FIST"), pinky:F("FIST"),
      thumb:[-1.0,5.2,2.8]},                                  // thumb between index and middle
  U: {index:F("EXT",{abd:-1}), middle:F("EXT",{abd:0}), ring:F("FIST"), pinky:F("FIST"),
      thumb:[1.6,5.6,3.0]},                                   // two together, upright
  V: {index:F("EXT",{abd:-14}), middle:F("EXT",{abd:8}), ring:F("FIST"), pinky:F("FIST"),
      thumb:[1.4,5.4,2.8]},                                   // two SPREAD - U vs V is lateral only
  W: {index:F("EXT",{abd:-12}), middle:F("EXT",{abd:0}), ring:F("EXT",{abd:12}), pinky:F("FIST"),
      thumb:[2.4,5.2,2.8]},
  X: {index:F("HOOK"), middle:F("FIST"), ring:F("FIST"), pinky:F("FIST"),
      thumb:[0.6,5.4,2.8]},
  Y: {index:F("FIST"), middle:F("FIST"), ring:F("FIST"), pinky:F("EXT"),
      thumb:[-7.6,4.2,1.6]}                                   // thumb out + pinky out
};

// The 7 that already measured clean, kept as the fallback set.
const WORKING_7 = ["L","U","K","E","C","O","P"];

// ------------------------------------------------------------------ sampling
let seed = 20260829;
const rnd = () => { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; };
const g = () => { const u=rnd()||1e-9, v=rnd(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); };

const SAMPLES = 5, JITTER_CM = 0.22;   // landmark-space jitter, then re-normalize

function generate(defs){
  const letters = {};
  const keys = Object.keys(defs);
  for (let i=0;i<keys.length;i++) {
    const ch = keys[i], spec = defs[ch];
    const base = buildHand(spec);
    const arr = [];
    for (let s = 0; s < SAMPLES; s++) {
      const jittered = base.map((pt, idx) =>
        idx === 0 ? pt : pt.map(c => c + (s === 0 ? 0 : g() * JITTER_CM)));
      const norm = normalize(jittered);
      if (!norm) { console.log("degenerate", ch, s); continue; }
      arr.push({ normalized: norm, raw: jittered.reduce((a,b)=>a.concat(b),[]).map(v => +v.toFixed(4)) });
    }
    letters[ch] = arr;
  }
  return letters;
}

// --------------------------------------------------------------- measurement
const dist=(a,b)=>{let s=0;for(let i=0;i<78;i++){const x=a[i]-b[i];s+=x*x}return Math.sqrt(s)};

function measure(letters){
  const keys = Object.keys(letters);
  const N = k => letters[k].map(s => s.normalized);
  const within = {};
  for (let a=0;a<keys.length;a++) {
    const S = N(keys[a]); let sum=0, n=0;
    for (let i=0;i<S.length;i++) for (let j=i+1;j<S.length;j++){ sum+=dist(S[i],S[j]); n++; }
    within[keys[a]] = n ? sum/n : 0;
  }
  const pairs = [];
  for (let a=0;a<keys.length;a++) for (let b=a+1;b<keys.length;b++){
    const A=N(keys[a]), B=N(keys[b]);
    let best=Infinity;
    for (let i=0;i<A.length;i++) for (let j=0;j<B.length;j++){ const v=dist(A[i],B[j]); if (v<best) best=v; }
    const spread = (within[keys[a]] + within[keys[b]]) / 2 || 1e-9;
    pairs.push({a:keys[a], b:keys[b], d:best, spread, ratio: best/spread});
  }
  const perLetter = keys.map(k => {
    let best=Infinity, bk="";
    for (let i=0;i<pairs.length;i++) {
      const p = pairs[i];
      if (p.a===k && p.d<best) { best=p.d; bk=p.b; }
      if (p.b===k && p.d<best) { best=p.d; bk=p.a; }
    }
    return {letter:k, within:within[k], nearest:best, other:bk, ratio: best/(within[k]||1e-9)};
  });
  return {perLetter, pairs};
}

function report(title, letters, gate){
  const m = measure(letters);
  console.log("\n=== " + title + " (" + Object.keys(letters).length + " letters, gate " + gate + "x) ===");
  console.log("letter   within   nearest-other      ratio   verdict");
  const sorted = m.perLetter.slice().sort((p,q)=>p.ratio-q.ratio);
  for (let i=0;i<sorted.length;i++) {
    const r = sorted[i];
    console.log("  " + r.letter.padEnd(5) + r.within.toFixed(3).padStart(7) +
      r.nearest.toFixed(3).padStart(11) + " (" + r.other + ")" +
      r.ratio.toFixed(2).padStart(10) + "x   " + (r.ratio >= gate ? "pass" : "FAIL"));
  }
  const failures = m.perLetter.filter(r => r.ratio < gate);
  console.log("\nworst 5 pairs (min inter-letter distance / pooled within-letter spread):");
  const wp = m.pairs.slice().sort((x,y)=>x.ratio-y.ratio).slice(0,5);
  for (let i=0;i<wp.length;i++) {
    const p = wp[i];
    console.log("  " + p.a + "-" + p.b + "   d=" + p.d.toFixed(3) +
      "   spread=" + p.spread.toFixed(3) + "   " + p.ratio.toFixed(2) + "x");
  }
  console.log("\nfailures: " + (failures.length ? failures.map(f=>f.letter+"("+f.ratio.toFixed(2)+"x)").join(" ") : "none"));
  return failures;
}

// Greedily drop the worst-separated letter until every survivor clears the
// gate. Not an optimal max-clique, but it answers "what would actually ship".
function largestPassingSubset(letters, gate){
  const live = Object.assign({}, letters);
  const dropped = [];
  for (;;) {
    const keys = Object.keys(live);
    if (keys.length < 2) break;
    const m = measure(live);
    const worst = m.perLetter.slice().sort((p,q)=>p.ratio-q.ratio)[0];
    if (worst.ratio >= gate) break;
    dropped.push(worst.letter + "(" + worst.ratio.toFixed(2) + "x vs " + worst.other + ")");
    delete live[worst.letter];
  }
  return {kept: Object.keys(live), dropped};
}

const GATE = 1.5;
const seven = {};
for (let i=0;i<WORKING_7.length;i++) seven[WORKING_7[i]] = LETTERS[WORKING_7[i]];

const gen7  = generate(seven);
const gen24 = generate(LETTERS);

report("BASELINE: current working set, new articulated model", gen7, GATE);
const f24 = report("CANDIDATE: full 24 static letters", gen24, GATE);

const subset = largestPassingSubset(gen24, GATE);
console.log("\n=== largest subset clearing " + GATE + "x (greedy prune) ===");
console.log("  keep (" + subset.kept.length + "): " + subset.kept.join(" "));
console.log("  drop (" + subset.dropped.length + "): " + subset.dropped.join(" "));

const outPath = process.argv[2];
if (outPath) {
  const out = {
    version: 2,
    _comment: "SYNTHETIC WIRING FIXTURE - NOT RECORDED DATA. Generated by tools/gen-synthetic-templates.js from parameterized ASL hand geometry run through the same normalizeLandmarks math the Lens uses. Exists so the end-to-end pipeline can be exercised in the Editor before a hardware recording session. Replace wholesale with TemplateRecorder output; do not tune thresholds against this.",
    synthetic: true,
    featureDim: 78, rawDim: 78, landmarkCount: 26, rawUnits: "cm_world",
    samplesPerLetter: SAMPLES, signingHand: "right", mirrored: false,
    landmarkOrder: ORDER,
    letters: gen24
  };
  fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
  console.log("\nwrote " + outPath);
} else {
  console.log("\n(measure-only run; no file written)");
}
