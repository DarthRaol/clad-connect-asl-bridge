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

> **Note on this export.** The transcript below begins after a context compaction partway
> through the build, so the earliest turns are summarized rather than verbatim. Everything
> referenced above appears in full below.

---

# CLAD prompt log

 ▐▛███▛█   Claude Code v2.1.240
▝▜██████▀  Opus 5 · Claude Max
  ▝▝ ▝▝    ~\Documents\SPECS\ASL_Helper

 ▎ [✻] [✻] [✻] · Share Claude Code and earn $10 in usage credits · /passes

> /compact                                                                      
  ⎿  Compacted (ctrl+o to see full summary)
  ⎿  Read AGENTS.md (94 lines)
  ⎿  Read ..\..\..\AppData\Local\Temp\claude\C--Users-Raol-Documents-SPECS-ASL-H
     elper\01f60bc4-e254-4cec-8de0-7f8ba4771284\scratchpad\strip.js (46 lines)
  ⎿  Read ..\..\..\AppData\Local\Temp\claude\C--Users-Raol-Documents-SPECS-ASL-H
     elper\01f60bc4-e254-4cec-8de0-7f8ba4771284\scratchpad\images.js (44 lines)
  ⎿  Read Assets\Scripts\LeafIndex.ts (35 lines)
  ⎿  Read Assets\Scripts\SignBridgeNoSpuriousDoubleScenario.ts (60 lines)

> Extend the synthetic template generator to all 24 static letters (J and Z     
  stay excluded --                                                              
  motion letters). The current finger model only encodes extended vs curled,    
  which is why U, H                                                             
  and R collapsed to distance 0.000. It needs:                                  
                                                                                
  - lateral finger separation      (U vs V)                                     
  - finger crossing                (R)                                          
  - thumb position relative to the finger knuckles  (A vs S vs T, M vs N)       
  - partial curl                   (C, O, E)                                    
                                                                                
  Then gate adoption on measurement, not on it compiling. Report every letter's 
  nearest-other-letter distance over its within-letter spread, and list the     
  worst 5 pairs.                                                                
                                                                                
  Adopt the 24-letter set ONLY if every letter clears a separability ratio of   
  1.5x -- the                                                                   
  weakest pair in the current working set. If any letter fails, report which    
  and keep                                                                      
  templates.synthetic.json at 7 letters. I'd rather ship 7 that work than 24    
  that misclassify                                                              
  on camera.                                                                    
                                                                                
  Keep the existing 7-letter file intact as a fallback either way.              

● I'll start by finding the existing synthetic generator and the current
  7-letter file.

  Searched for 1 pattern, read 1 file, listed 1 directory, ran 1 shell command (ctrl+o to expand)

● Found it — scratchpad/gen.js, a binary extended/curled finger model. That's
  exactly why U/H/R collapsed. Let me write a proper articulated model with the
  four capabilities you listed.

  Ran 1 shell command (ctrl+o to expand)

● Heredoc quoting bit again — using Write instead.

● Write(tools\gen-synthetic-templates.js)
  ⎿  Wrote 289 lines to tools\gen-synthetic-templates.js
       1 // Generates SYNTHETIC ASL templates by running parameterized ha
       2 // the same normalizeLandmarks math the Lens uses (LandmarkCaptu
         re.ts).
       4 // NOT recorded data. A wiring fixture so the pipeline can be ex
       5 // Editor before a hardware session.
       6 //
       8 //   mcp/pip/dip  cumulative bend angles toward the palm side (+
         z)  -> partial curl
             -> lateral separation
             -> finger crossing
     … +393 lines (ctrl+o to expand)

  Ran 1 shell command (ctrl+o to expand)

● Gate fails hard — and the baseline run surfaced something about the existing
  file. Let me separate "geometrically identical poses" from "real difference
  drowned by noise", and check the shipped P.

  Ran 1 shell command (ctrl+o to expand)

● Confirmed structural, not a modelling artifact. Adding the
  maximal-passing-subset calculation so the report says what would ship.

● Update(tools\gen-synthetic-templates.js)
  ⎿  Added 17 lines
      261    return failures;
      262  }
      263  
      264 +// Greedily drop the worst-separated letter until every surviv
          +or clears the                                                 
      265 +// gate. Not an optimal max-clique, but it answers "what would
          + actually ship".                                              
      266 +function largestPassingSubset(letters, gate){                 
      267 +  const live = Object.assign({}, letters);                    
      268 +  const dropped = [];                                         
      269 +  for (;;) {                                                  
      270 +    const keys = Object.keys(live);                           
      271 +    if (keys.length < 2) break;                               
      272 +    const m = measure(live);                                  
      273 +    const worst = m.perLetter.slice().sort((p,q)=>p.ratio-q.ra
          +tio)[0];                                                      
      274 +    if (worst.ratio >= gate) break;                           
      275 +    dropped.push(worst.letter + "(" + worst.ratio.toFixed(2) +
          + "x vs " + worst.other + ")");                                
      276 +    delete live[worst.letter];                                
      277 +  }                                                           
      278 +  return {kept: Object.keys(live), dropped};                  
      279 +}                                                             
      280 +                                                              
      281  const GATE = 1.5;
      282  const seven = {};
      283  for (let i=0;i<WORKING_7.length;i++) seven[WORKING_7[i]] = LET
           TERS[WORKING_7[i]];

● Update(tools\gen-synthetic-templates.js)
  ⎿  Added 5 lines
      288  report("BASELINE: current working set, new articulated model",
            gen7, GATE);
      289  const f24 = report("CANDIDATE: full 24 static letters", gen24,
            GATE);
      290  
      291 +const subset = largestPassingSubset(gen24, GATE);             
      292 +console.log("\n=== largest subset clearing " + GATE + "x (gree
          +dy prune) ===");                                              
      293 +console.log("  keep (" + subset.kept.length + "): " + subset.k
          +ept.join(" "));                                               
      294 +console.log("  drop (" + subset.dropped.length + "): " + subse
          +t.dropped.join(" "));                                         
      295 +                                                              
      296  const outPath = process.argv[2];
      297  if (outPath) {
      298    const out = {

  Ran 1 shell command (ctrl+o to expand)

● Measurement is in. Not adopting the 24-letter set — 12 of 24 fail the 1.5×
  gate. templates.synthetic.json is untouched at 7 letters.

  What the new model does

  tools/gen-synthetic-templates.js replaces the binary extended/curled flag with
  an articulated chain:

  ┌─────────────┬───────────────────────────────────────────────────────────┐
  │ capability  │                         mechanism                         │
  ├─────────────┼───────────────────────────────────────────────────────────┤
  │ partial     │ mcp/pip/dip cumulative flexion angles → presets           │
  │ curl        │ EXT/CLAW/RING/EFOLD/HOOK/FIST                             │
  ├─────────────┼───────────────────────────────────────────────────────────┤
  │ lateral     │ abd abduction about the palm normal (U −1/0 vs V −14/+8)  │
  │ separation  │                                                           │
  ├─────────────┼───────────────────────────────────────────────────────────┤
  │ finger      │ zs out-of-plane shift growing along the chain (R: index   │
  │ crossing    │ +11°/+0.9, middle −9°/−0.4)                               │
  ├─────────────┼───────────────────────────────────────────────────────────┤
  │ thumb vs    │ thumb given a tip target in palm space, joints bowed      │
  │ knuckles    │ along the chord (A [-3.5,7.4,1.0], S [0.4,6.5,4.6], T     │
  │             │ [-1.0,5.2,2.8], M [2.6,5.0,2.6], N [1.0,5.0,2.6])         │
  └─────────────┴───────────────────────────────────────────────────────────┘

  All four work — U/V now separate at 0.339 where they were 0.000, R is distinct
  from both.

  Separability, all 24 (nearest-other ÷ within-letter spread)

  FAIL  G 0.00x(Q)  H 0.00x(U)  K 0.00x(P)  P 0.00x(K)  Q 0.00x(G)  U 0.00x(H)
        S 0.84x(N)  M 0.88x(N)  N 0.95x(M)  V 1.00x(H)  T 1.00x(N)  R 1.01x(H)
  pass  A 1.52x  O 1.53x  L 1.62x  X 1.66x  E 1.90x  D 2.75x  C 2.88x
        I 3.10x  B 3.40x  Y 3.63x  W 3.98x  F 4.46x

  Worst 5 pairs:

  ┌──────┬───────┬───────────────┬───────┐
  │ pair │   d   │ pooled spread │ ratio │
  ├──────┼───────┼───────────────┼───────┤
  │ G–Q  │ 0.000 │ 0.342         │ 0.00× │
  ├──────┼───────┼───────────────┼───────┤
  │ H–U  │ 0.000 │ 0.367         │ 0.00× │
  ├──────┼───────┼───────────────┼───────┤
  │ K–P  │ 0.000 │ 0.424         │ 0.00× │
  ├──────┼───────┼───────────────┼───────┤
  │ M–N  │ 0.281 │ 0.307         │ 0.92× │
  ├──────┼───────┼───────────────┼───────┤
  │ N–S  │ 0.308 │ 0.331         │ 0.93× │
  └──────┴───────┴───────────────┴───────┘

  The three zero pairs are the feature space, not the model

  G/Q, H/U, K/P differ only by wrist orientation in real ASL. LandmarkCapture
  builds its basis entirely from the hand itself, so orientation is erased.
  Verified rather than assumed — rotating the U pose by an arbitrary (1.4, −0.7,
  2.1) rad and re-normalizing gives distance 0.000e+0. No amount of template
  quality fixes this; it needs an orientation channel (e.g. palm normal in
  device space) appended to the vector.

  The other nine are real-but-drowned: noiseless pose distances are 0.28–0.40
  against a within-letter noise floor of 0.30–0.45 at 0.22 cm jitter. Those are
  recoverable with real templates, more samples, or the thumb-weighted feature
  variant.

  One thing this exposed about the shipped file

  The current templates.synthetic.json has K–P at distance 1.577 — it passes
  only because the old model gave P an extended pinky, which is not ASL P. With
  a faithful P the pair is 0.000. So the 7-letter fallback is 6 real letters
  plus one fiction; a signer forming actual P on device will not match that
  template. LUKE and CHLOE are unaffected, PERU is not.

  Greedy pruning to the gate yields 16 letters (A B C D E F I L N O Q R V W X 
  Y), but that's misleading — it survives by keeping one arbitrary
  representative per collapsed pair, so a signer forming G would be shown Q.

  The generator is new and uncommitted; nothing under Assets/Data/ was modified.

✻ Cooked for 7m 7s

※ recap: Goal: an ASL fingerspelling Lens for Snap Specs. I extended the synthetic template generator to 24 letters, but 12 failed the 1.5x separability gate, so templates.synthetic.json stays at 7. Next: decide whether to commit the new generator. (disable recaps in /config)

> Also drop P from templates.synthetic.json. It's K's orientation-collision     
  partner and is                                                                
  loaded as a classification candidate even though no phrase needs it -- so     
  signing K can return                                                          
  P. Removing it means the demo doesn't depend on the old generator's geometric 
  error.                                                                        
                                                                                
  Confirm LUKE, and any other phrase signablePhrases() still allows, survives   
  with L/U/K/E/C/O.                                                             

  Searched for 2 patterns, ran 2 shell commands (ctrl+o to expand)
● No phrase regresses — every other phrase is missing a letter besides P.
  Writing the change.

  Searched for 1 pattern, called lens-studio 6 times, ran 1 shell command (ctrl+o to expand)

● All five pass. Confirming at runtime that P is actually gone from the
  candidate set.

  Called lens-studio (ctrl+o to expand)

● P is dropped and verified end to end.

  Change: Assets/Data/templates.synthetic.json now holds L U K E C O — 6 letters
  / 30 samples. Nothing else touched.

  Phrase survival — no regression. signablePhrases() returns [LUKE] both before
  and after. I checked every entry in DEFAULT_PHRASES against the post-drop
  letter set; not one was gated on P alone:

  RIO   R,I      CHLOE  H        PERU   P,R      HELP   H,P
  AR    A,R      CLAD   A,D      FRIEND F,R,I,N,D
  HELLO H        SPECS  S,P      SNAP   S,N,A,P  NAME   N,A,M
  THANK YOU  T,H,A,N,Y           GOOD MORNING  G,D,M,R,N,I

  PERU and HELP were already unsignable on R and H respectively, so losing P
  costs nothing that wasn't already out.

  Runtime confirmation (preview refresh, post-change):

  SignBridge: loaded 6 letters / 30 samples (full+unweighted k=1 dim=78).
  MockHandInput: loaded 6 letters from templates (12 steps).
  SignBridge: phrase 'LUKE' [1/1] signing at 0 mistakes=0

  [1/1] is signablePhrases() — exactly one phrase seated, LUKE. All 5 LEAF
  scenarios pass after the change: completes-word, no-spurious-double,
  low-confidence, interrupted-hold, wrong-letter.

  Distance effects. K's nearest confuser was never P in the shipped file — it
  was U at 0.852, unchanged. What moved is small:

  ┌────────┬───────────┬───────────┐
  │ letter │  before   │   after   │
  ├────────┼───────────┼───────────┤
  │ L      │ 1.373 (P) │ 1.373 (K) │
  ├────────┼───────────┼───────────┤
  │ C      │ 1.695 (P) │ 1.714 (K) │
  └────────┴───────────┴───────────┘

  L's figure is a coincidence of rounding, not a no-op — L–P was 1.373078 and
  L–K is 1.373239. The no-spurious-double scenario derives maxDistance from
  nearestOtherDistance("L"), so its gate shifts by 0.00008 and it still passes.

  One correction to my framing last turn: I said removing P removes a dependence
  on the old generator's error, and that's right, but the specific failure mode
  you named — signing K returning P — wasn't live in the fixture, since shipped
  K–P sat at 1.577 while K–U sat at 0.852. The real exposure was on hardware,
  where a correctly-formed P is at distance 0 from K. That's now impossible to
  hit because P isn't a candidate.

  Uncommitted: the modified templates.synthetic.json, the new
  tools/gen-synthetic-templates.js, and the pre-existing docs/CHECKLIST.md.
  Commit cd95762 is still unpushed.

✻ Crunched for 2m 17s

※ recap: Goal is the ASL fingerspelling Lens for Specs. The 24-letter synthetic set failed the 1.5x separability gate, so templates.synthetic.json now holds six letters and LUKE still runs green in all five LEAF scenarios. Next: commit and push the pending changes. (disable recaps in /config)

> MockHandInput already produces 26 landmark positions per frame. Render them   
  as a visible hand                                                             
  in world space: small spheres at each joint, lines along the finger chains    
  using                                                                         
  LANDMARK_ORDER, positioned between the two panels.                            
                                                                                
  Drive it from the same frame data the classifier consumes, so what the viewer 
  sees IS the                                                                   
  input -- not a separate animation. Color the hand to reflect HoldBuffer state 
  (neutral while                                                                
  searching, warming as progress rises, confirmed on commit) so the commit is   
  visible on the                                                                
  hand itself, not only on the bar.                                             

● Let me look at what MockHandInput actually emits, how the panels were built,
  and what mesh APIs are available.

  Searched for 1 pattern, ran 7 shell commands (ctrl+o to expand)

● Cached scene file is stale (predates the panels). Reading the live scene.

  Searched for 1 pattern, called lens-studio, ran 3 shell commands (ctrl+o to expand)

● Panels sit at y=8 (outward) and y=-16 (inward), both z=-110. Let me check the
  exact APIs I'll drive this from.

  Searched for 1 pattern, ran 3 shell commands (ctrl+o to expand)

● Everything I need is confirmed. Writing the visualizer — MeshBuilder
  primitives (no asset-preset guesswork), 26 joints + 25 bones derived from
  FINGER_GROUPS.

● Write(Assets\Scripts\HandVisualizer.ts)
  ⎿  Wrote 377 lines to Assets\Scripts\HandVisualizer.ts
       1 /**
       3  *
       4  * The 78-dim feature vector is 26 landmarks x 3 axes in the han
       5  * normalized frame (origin at the wrist, +Y along wrist->middle
         Knuckle, unit
         s — this script
       7  * reshapes them and draws them. It does not animate a separate 
       8  * re-read the hand, and does not smooth: SignBridge hands it th
         e exact
      10  *
     … +423 lines (ctrl+o to expand)

● Now wiring it into the driver so it consumes the identical array.

● Update(Assets\Scripts\HandVisualizer.ts)
  ⎿  Added 4 lines
      238        )
      239      )
      240      this.rig = root
      241 +    // Start hidden: until render() supplies real landmarks ev
          +ery joint would                                               
      242 +    // sit at the origin with an unset scale, which reads as a
          + blob.                                                        
      243 +    root.enabled = false                                      
      244 +    this.visible = false                                      
      245  
      246      for (let i = 0; i < LANDMARK_COUNT; i++) {
      247        const obj = global.scene.createSceneObject("joint_" + LA
           NDMARK_ORDER[i])

● Update(Assets\Scripts\SignBridge.ts)  ⎿  Added 5 lines
      69    @allowUndefined
      70    @hint("Optional. When present, it is loaded with the template
           poses and replays them — Editor testing without hardware.")
      71    mockHandInput: MockHandInput
      72 +                                                               
      73 +  @input                                                       
      74 +  @allowUndefined                                              
      75 +  @hint("Optional. Draws the exact feature vector the classifie
         +r scores, as a hand between the panels.")                      
      76 +  handVisualizer: HandVisualizer                               
      77    @ui.group_end
      78    @ui.group_start("Classifier")
      79    @input

● Update(Assets\Scripts\SignBridge.ts)
  ⎿  Added 1 line
      30    MockHandInput,
      31    MockPoseStep
      32  } from "./MockHandInput"
      33 +import {HandVisualizer} from "./HandVisualizer"                
      34  import {PhraseController} from "./PhraseController"
      35  import {SignPanel, SignPanelView, updateSignPanels} from "./Sig
          nPanel"
      36  import {extractNormalized, TemplatesFile} from "./TemplateForma
          t"

● Update(Assets\Scripts\SignBridge.ts)
  ⎿  Added 2 lines, removed 1 line
      242    private onUpdate(): void {
      243      // Timed transitions run even before templates load, so a 
           misconfigured
      244      // session still shows a stable panel instead of a frozen 
           one.
      245 -    this.phrases.update(getDeltaTime())                       
      245 +    const dt = getDeltaTime()                                 
      246 +    this.phrases.update(dt)                                   
      247  
      248      if (this.ready) {
      249        // Resolved per frame rather than cached: MockHandInput 
           registers itself

● Update(Assets\Scripts\SignBridge.ts)
  ⎿  Added 13 lines, removed 1 line
      255        const active = getActiveHandFeatureSource()
      256        const source: HandFeatureSource = active !== null ? acti
           ve : this.liveSource
      257  
      258 -      const result = this.classifier.classifyFrom(source)     
      258 +      // Read the features ONCE and fan them out. classifyFrom
          +() would call                                                 
      259 +      // source.getFeatures() internally; pulling that call up
          + to here means the                                            
      260 +      // visualizer draws the identical array the classifier s
          +cored, rather than                                            
      261 +      // a second read that could drift from it. This is the o
          +nly reason the                                                
      262 +      // drawn hand can be trusted as evidence of what the cla
          +ssifier saw.                                                  
      263 +      const features = source.getFeatures()                   
      264 +      const result = features !== null ? this.classifier.class
          +ify(features) : null                                          
      265        const committed = this.holdBuffer.push(result)
      266  
      267 +      if (this.handVisualizer) {                              
      268 +        // After push(), so the colour and the confidence bar 
          +read the same                                                 
      269 +        // post-commit state instead of disagreeing by one fra
          +me.                                                           
      270 +        this.handVisualizer.render(features, this.holdBuffer.g
          +etState(), committed, dt)                                     
      271 +      }                                                       
      272 +                                                              
      273        if (committed !== null) {
      274          const outcome = this.phrases.submit(committed)
      275          if (this.verbose) {

  Called lens-studio 5 times, ran 1 shell command (ctrl+o to expand)

● MeshBuilder rejects the mesh — likely the index type. Checking.

  Ran 1 shell command (ctrl+o to expand)

● Confirmed — indexType defaults to None, so the index buffer was rejected.
  Fixing both builders.

  Called lens-studio 2 times, ran 1 shell command (ctrl+o to expand)

● Clean run — 26 joints, 25 bones. Now let me actually look at it.

  Called lens-studio (ctrl+o to expand)

● It renders and it's live — amber warming, LUKE with L/U committed,
  wrong-letter flash active. Placement needs a nudge: the hand's wrist is
  landing right on the inward panel's top edge. Tightening scale and raising it
  into the gap.

  Called lens-studio 2 times (ctrl+o to expand)

● Green commit pulse, clean gap placement. Let me confirm the null path didn't
  regress and re-run the suite, since I restructured the classify call.

  Searched for 1 pattern, called lens-studio 6 times (ctrl+o to expand)

● All five scenarios still pass, and that last capture caught the third colour
  state.

  What was built

  Assets/Scripts/HandVisualizer.ts — 26 joint spheres + 25 bones, drawn from the
  feature vector itself.

  It is the input, structurally, not by convention. classifyFrom(source)
  internally did source.getFeatures() then classify(features). I pulled that
  call up into SignBridge.onUpdate so the read happens once and fans out:

  const features = source.getFeatures()
  const result = features !== null ? this.classifier.classify(features) : null
  const committed = this.holdBuffer.push(result)
  if (this.handVisualizer) {
    this.handVisualizer.render(features, this.holdBuffer.getState(), committed,
  dt)
  }

  Same Float32Array reference to both. No second read to drift, no
  interpolation, no cached pose. The 78-dim vector is 26×3 positions in the
  hand's normalized frame, so drawing it is a reshape — f[3i], f[3i+1], f[3i+2],
  scaled and centred on the middle knuckle.

  The skeleton comes from FINGER_GROUPS, so it's wrist → ToWrist → Knuckle → Mid
  → Upper → Tip per finger, 25 bones. Reordering LANDMARK_ORDER can't leave it
  silently drawing the wrong topology.

  Bones are placed by rotating a unit box (y ∈ [0,1]) with quat.rotationFromTo,
  scaled to bone length — zero-length bones collapse rather than feeding an
  undefined vector to the rotation.

  Colour, all three states observed:

  ┌─────────────────┬────────────────────────────────────┬────────────────┐
  │      state      │              trigger               │      seen      │
  ├─────────────────┼────────────────────────────────────┼────────────────┤
  │ neutral blue    │ tracked, progress ~0               │ last capture   │
  ├─────────────────┼────────────────────────────────────┼────────────────┤
  │ warming amber   │ lerp(neutral, warm, hold.progress) │ first capture  │
  ├─────────────────┼────────────────────────────────────┼────────────────┤
  │ confirmed green │ commitEvent !== null, held 0.45 s  │ second capture │
  └─────────────────┴────────────────────────────────────┴────────────────┘

  The pulse is driven by HoldBuffer.push()'s return value, not by watching
  hold.committed change — so a letter committed twice in a row still pulses the
  second time. render() is called after push(), so the hand and the confidence
  bar read the same post-commit state instead of disagreeing by a frame.

  One bug, found by running it

  MeshBuilder.indexType defaults to MeshIndexType.None, which silently
  invalidates any appended index buffer — updateMesh() threw Mesh is not valid.
  Compile passed; only the runtime log caught it. Fixed in both builders,
  comment left at each site.

  Placement

  Object at [0, -2.5, -110], rig offset +2 on Z so it sits in front of the panel
  plane. First attempt at y=-4, handScale 5.5 put the wrist on the inward
  panel's top edge; now handScale 5 spans roughly y −7.5…2.5, inside the ~13 cm
  gap between the outward panel (y=8) and inward panel (y=−16). Scale, radius,
  thickness, colours and offset are all @inputs.

  Untracked frames hide the rig rather than ghosting the last pose — the gaps in
  the mock's playback are real gaps in the input, and showing them is the
  honest behaviour.

  Worth knowing

  Because it draws the normalized vector, the hand always appears in the same
  canonical orientation no matter how the source hand is rotated — that's not a
  rendering shortcut, it's the classifier's actual view. It makes last turn's
  finding directly visible: sign K and sign P and the drawn hand is identical,
  because the feature space has already thrown the wrist rotation away.

  New scene assets: Assets/Render/HandJointMat, HandBoneMat (Unlit), plus the
  HandVisualizer object. Everything from this turn and the last two is still
  uncommitted, and cd95762 remains unpushed.

✻ Crunched for 8m 46s

※ recap: Goal is the ASL fingerspelling Lens for the CLAD hackathon. The hand visualizer now renders live between the panels and all five LEAF scenarios pass. Next action is committing the visualizer, generator, and template changes, then pushing. (disable recaps in /config)

> Wire the two new SFX into SignBridge. Assets/GeneratedSFX/letter_commit.wav   
  and                                                                           
  phrase_complete.wav already exist and are verified.                           
                                                                                
  Add two AudioComponent @inputs. Play letter_commit when HoldBuffer.push()     
  returns a committed                                                           
  letter, and phrase_complete on PhraseController's onPhraseComplete event.     
                                                                                
  Two things to get right:                                                      
  - phrase_complete is 1.77s. If autoAdvanceSeconds is ever non-zero, make sure 
  the next phrase                                                               
    doesn't start under the tail.                                               
  - The letter chime fires on the commit event, not on watching state change -- 
  same rule as the                                                              
    HandVisualizer pulse, so a repeated letter still sounds the second time.    
                                                                                
  Use LowLatency playback mode for letter_commit; it needs to land on the       
  frame.                                                                        

  Searched for 2 patterns, listed 1 directory, called lens-studio, ran 5 shell commands (ctrl+o to expand)
● Adding the setter so the auto-advance delay is reachable from where the audio
  lives.

● Update(Assets\Scripts\PhraseController.ts)
  ⎿  Added 13 lines
      257    }
      258  
      259    /** Replace the preset menu and seat its first entry. */
      260 +  /**                                                         
      261 +   * Change the delay between completing a phrase and seating 
          +the next one.                                                 
      262 +   * Zero disables auto-advance entirely.                     
      263 +   *                                                          
      264 +   * Exposed as a setter, not just a constructor option, becau
          +se the caller that                                            
      265 +   * knows the right value is the one holding the completion S
          +FX — it cannot                                                
      266 +   * know the audio's duration until the track has loaded, whi
          +ch is after this                                              
      267 +   * controller is constructed.                               
      268 +   */                                                         
      269 +  setAutoAdvanceSeconds(seconds: number): void {              
      270 +    this.autoAdvanceSeconds = seconds > 0 ? seconds : 0       
      271 +  }                                                           
      272 +                                                              
      273    setPhrases(phrases: string[]): void {
      274      if (!phrases || phrases.length === 0) {
      275        throw new Error("PhraseController.setPhrases: need at le
           ast one phrase.")

  Ran 1 shell command (ctrl+o to expand)

● Update(Assets\Scripts\SignBridge.ts)
  ⎿  Added 23 lines
       76    @hint("Optional. Draws the exact feature vector the classifi
           er scores, as a hand between the panels.")
       77    handVisualizer: HandVisualizer
       78    @ui.group_end
       79 +                                                              
       80 +  @ui.group_start("Audio")                                    
       81 +  @input                                                      
       82 +  @allowUndefined                                             
       83 +  @hint("Short chime on each committed letter. Set to LowLaten
          +cy at start so it lands on the commit frame.")                
       84 +  letterCommitAudio: AudioComponent                           
       85 +                                                              
       86 +  @input                                                      
       87 +  @allowUndefined                                             
       88 +  @hint("Played once when a phrase completes. Its duration set
          +s the floor for autoAdvanceSeconds.")                         
       89 +  phraseCompleteAudio: AudioComponent                         
       90 +                                                              
       91 +  @input                                                      
       92 +  @hint("Seconds to wait after completing a phrase before seat
          +ing the next. 0 disables auto-advance. If below the completion
          + sound's length it is raised, so the next phrase never starts 
          +under the tail.")                                             
       93 +  @widget(new SliderWidget(0, 10, 0.25))                      
       94 +  autoAdvanceSeconds: number = 0                              
       95 +                                                              
       96 +  @input                                                      
       97 +  @hint("Extra silence between the completion sound ending and
          + the next phrase appearing.")                                 
       98 +  @widget(new SliderWidget(0, 2, 0.05))                       
       99 +  autoAdvanceTailGap: number = 0.25                           
      100 +  @ui.group_end                                               
      101 +                                                              
      102    @ui.group_start("Classifier")
      103    @input
      104    @widget(new ComboBoxWidget([new ComboBoxItem("full"), new Co
           mboBoxItem("reduced")]))

  Ran 1 shell command (ctrl+o to expand)

● Update(Assets\Scripts\SignBridge.ts)
  ⎿  Added 10 lines
      183  
      184      this.phrases = new PhraseController()
      185  
      186 +    // Handles are acquired in onAwake; every .add() subscript
          +ion belongs in                                                
      187 +    // OnStartEvent. playbackMode is a plain property, so it i
          +s set here.                                                   
      188 +    if (this.letterCommitAudio) {                             
      189 +      // Defaults to LowPower, which trades latency for batter
          +y. The letter                                                 
      190 +      // chime is commit feedback and has to land on the frame
          + the commit                                                   
      191 +      // happened, so it takes the latency-optimized path inst
          +ead.                                                          
      192 +      this.letterCommitAudio.playbackMode = Audio.PlaybackMode
          +.LowLatency                                                   
      193 +    }                                                         
      194 +                                                              
      195      this.createEvent("OnStartEvent").bind(() => {
      196        this.loadTemplates()
      197 +      this.configureAudio()                                   
      198        this.logConfiguration()
      199      })
      200  

● Update(Assets\Scripts\SignBridge.ts)
  ⎿  Added 39 lines
      207    // Setup
      208    // ---------------------------------------------------------
           ----------------
      209  
      210 +  /**                                                         
      211 +   * Subscribe the completion sound and reconcile auto-advance
          + against its                                                  
      212 +   * length.                                                  
      213 +   *                                                          
      214 +   * The failure this guards against: autoAdvanceSeconds short
          +er than the                                                   
      215 +   * completion sound means the next phrase is seated — panels
          + repainted, target                                            
      216 +   * word swapped — while the previous phrase's sound is still
          + playing, so the                                              
      217 +   * audio reads as feedback about the NEW phrase. The floor i
          +s the measured                                                
      218 +   * duration of whatever track is actually wired, not a const
          +ant, so replacing                                             
      219 +   * the asset with a longer one cannot silently reintroduce t
          +he overlap.                                                   
      220 +   */                                                         
      221 +  private configureAudio(): void {                            
      222 +    if (this.phraseCompleteAudio) {                           
      223 +      this.phrases.onPhraseComplete.add(() => {               
      224 +        this.phraseCompleteAudio.play(1)                      
      225 +      })                                                      
      226 +    }                                                         
      227 +                                                              
      228 +    let advance = this.autoAdvanceSeconds > 0 ? this.autoAdvan
          +ceSeconds : 0                                                 
      229 +    if (advance > 0 && this.phraseCompleteAudio) {            
      230 +      const floor = this.phraseCompleteAudio.duration + this.a
          +utoAdvanceTailGap                                             
      231 +      if (advance < floor) {                                  
      232 +        print(                                                
      233 +          "SignBridge: autoAdvanceSeconds " +                 
      234 +            advance.toFixed(2) +                              
      235 +            "s is shorter than the completion sound (" +      
      236 +            this.phraseCompleteAudio.duration.toFixed(2) +    
      237 +            "s + " +                                          
      238 +            this.autoAdvanceTailGap.toFixed(2) +              
      239 +            "s gap). Raised to " +                            
      240 +            floor.toFixed(2) +                                
      241 +            "s so the next phrase does not start under the tai
          +l."                                                           
      242 +        )                                                     
      243 +        advance = floor                                       
      244 +      }                                                       
      245 +    }                                                         
      246 +    this.phrases.setAutoAdvanceSeconds(advance)               
      247 +  }                                                           
      248 +                                                              
      249    private loadTemplates(): void {
      250      if (!this.templatesAsset) {
      251        print("SignBridge ERROR: no templatesAsset wired. Nothin
           g can be classified.")

● Update(Assets\Scripts\SignBridge.ts)
  ⎿  Added 7 lines
      343        }
      344  
      345        if (committed !== null) {
      346 +        // Fired from the commit EVENT, not from watching comm
          +itted-letter state                                            
      347 +        // change — same rule as the HandVisualizer pulse. Sig
          +ning the same                                                 
      348 +        // letter twice in a row is two events and must be two
          + chimes, and a                                                
      349 +        // state-change check would swallow the second.       
      350 +        if (this.letterCommitAudio) {                         
      351 +          this.letterCommitAudio.play(1)                      
      352 +        }                                                     
      353          const outcome = this.phrases.submit(committed)
      354          if (this.verbose) {
      355            const state = this.phrases.getState()

  Called lens-studio 3 times (ctrl+o to expand)

● Both tracks loaded cleanly. Now proving the auto-advance clamp actually fires
  rather than assuming it.

  Called lens-studio 2 times (ctrl+o to expand)

● Clamp fires, and the runtime-reported 1.77 s matches my WAV-header calculation
  of 1.774 s independently. Restoring the shipped default.

  Called lens-studio 6 times (ctrl+o to expand)

● Both SFX are wired and verified.

  What plays, and from where

  letter_commit fires inside the committed !== null branch in onUpdate — the
  return value of HoldBuffer.push(), exactly where the HandVisualizer pulse is
  triggered:

  if (committed !== null) {
    if (this.letterCommitAudio) { this.letterCommitAudio.play(1) }
    const outcome = this.phrases.submit(committed)

  It's the event, not a watched state change, so a repeated letter sounds twice.
  Playback mode is set in onAwake (a plain property, not a subscription):

  this.letterCommitAudio.playbackMode = Audio.PlaybackMode.LowLatency

  phrase_complete subscribes to PhraseController.onPhraseComplete in
  OnStartEvent, per the project's SIK init rule — handles in onAwake, .add() in
  OnStartEvent.

  The tail guard

  autoAdvanceSeconds was not actually reachable: SignBridge constructed new 
  PhraseController() with no config, so it was pinned to 0 and the constraint
  you asked for had nowhere to live. I made it real rather than writing a guard
  against an unreachable value:

  - added PhraseController.setAutoAdvanceSeconds() (additive; the constructor
    option still works)
  - added autoAdvanceSeconds and autoAdvanceTailGap @inputs on SignBridge,
    defaulting to 0 and 0.25 s — shipped behaviour is unchanged, auto-advance
    still off
  - configureAudio() raises any non-zero value below
    phraseCompleteAudio.duration + tailGap

  The floor reads the wired track's runtime duration, not a constant, so
  swapping in a longer completion sound can't silently reintroduce the overlap.

  Verified by temporarily setting it to 0.5 s:

  SignBridge: autoAdvanceSeconds 0.50s is shorter than the completion sound
  (1.77s + 0.25s gap). Raised to 2.02s so the next phrase does not start under
  the tail.

  The runtime's 1.77 s agrees with the value I computed independently from the
  WAV header (data=312952 B ÷ (44100 × 2ch × 2B) = 1.774 s; letter_commit is
  0.090 s). I set it back to 0 afterwards.

  Scene

  Two new objects, SFX Letter Commit and SFX Phrase Complete, one AudioComponent
  each with its track assigned — separate objects rather than two components on
  one, so the @component: references are unambiguous. Runtime log confirms both
  loaded:

  [AudioPlayer] Open audio file: .../letter_commit 2.wav
  [AudioPlayer] Open audio file: .../phrase_complete 2.wav

  All five LEAF scenarios pass, no runtime errors.

  Worth knowing: on a phrase's final letter both sounds fire in the same frame —
  the 0.09 s chime under the start of the 1.77 s completion cue. That reads as
  intended, but if you want the chime suppressed on the last letter it's a
  one-line check against outcome and the resulting status.

  Still uncommitted: this turn's changes plus the HandVisualizer and template
  work from the previous two, and cd95762 remains unpushed.

✻ Brewed for 3m 21s

※ recap: Goal is the ASL fingerspelling Lens for the CLAD hackathon. Both SFX are now wired and verified, with all five LEAF scenarios passing. Next action is committing the last three turns of work, which is still uncommitted.

> Write four documents. Read docs/CHECKLIST.md first -- it has the phase status 
  and the                                                                       
  closed-loop material. Be accurate and don't inflate anything; verify claims   
  against the code                                                              
  rather than restating this prompt.                                            
                                                                                
  === 1. README.md ===                                                          
                                                                                
  Write it as a FINDINGS document, not a feature list. Most hackathon READMEs   
  say what the thing                                                            
  does; this one should also say what building it revealed.                     
                                                                                
  WHAT IT IS: an ASL fingerspelling bridge for Spectacles. The wearer           
  fingerspells; recognized                                                      
  letters assemble on a panel facing OUTWARD so the person across from them can 
  read it. A                                                                    
  second panel faces the wearer with the target word, a confidence bar, and     
  wrong-letter                                                                  
  feedback. A 3D hand skeleton renders the classifier's own input in real time. 
  One surface                                                                   
  aimed at each person.                                                         
                                                                                
  WHY IT FITS "CONNECT": two people who don't share a language, one pair of     
  glasses, and the                                                              
  conversation stays face to face instead of routed through a phone screen.     
                                                                                
  WHY FINGERSPELLING: it's what signers actually use for names, places, and     
  words with no                                                                 
  established sign -- which is why the demo spells a name. Not an alphabet      
  lesson.                                                                       
                                                                                
  HOW IT WORKS: 26 SIK keypoints -> 78-dim normalized feature vector -> k-NN    
  with per-letter                                                               
  margin confidence -> 18-frame hold buffer with a re-arm run guard -> phrase   
  state machine ->                                                              
  two panels + hand visualizer + audio.                                         
                                                                                
  WHAT BUILDING IT REVEALED (give this real space):                             
  - SIK exposes 26 keypoints, not the widely-cited 21. Verified from type       
  definitions. The                                                              
    thumb is named differently from every other finger -- thumbKnuckle is       
  THUMB_1 while                                                                 
    indexKnuckle is INDEX_0 -- an off-by-one sitting in exactly the code that   
  separates M/N/S/T.                                                            
  - The normalization is rotation-invariant by construction, which ERASES the   
  wrist orientation                                                             
    distinguishing G/Q, H/U, and K/P in ASL. Proven, not assumed: rotating a U  
  pose by an                                                                    
    arbitrary rotation and re-normalizing gives distance 0.000. Visible in the  
  demo -- sign K and                                                            
    sign P and the rendered hand is identical. Fix is an orientation channel    
  (78 -> 81 dims),                                                              
    deferred as unverifiable without recorded hands.                            
  - Pooled variance cannot tell signal from noise. Replaced with a Fisher       
  ratio, validated on                                                           
    planted data where pooled variance scored a pure-noise landmark and a       
  pure-signal landmark                                                          
    within 30% of each other while Fisher separated them by four orders of      
  magnitude.                                                                    
  - A 24-letter synthetic set was generated and REJECTED: 12 of 24 failed a     
  1.5x separability                                                             
    gate. Shipping 6 that work beat 24 that misclassify.                        
  - Bugs that compiled clean and failed only at runtime:                        
  FlexLayout.autoDiscoverItemsOnStart                                           
    (would have shipped a blank panel), MeshBuilder.indexType defaulting to     
  None (silently                                                                
    invalidated the index buffer). A green compile proved nothing.              
                                                                                
  LIMITATIONS -- own section, unhedged, no softening language:                  
  - One-directional. ASR was never wired; there is no speech-to-text leg.       
  - Templates are synthetic geometry, not recorded hands. The pipeline is       
  verified end to end;                                                          
    recognition accuracy against real hands is NOT verified.                    
  - 6 letters (L U K E C O). J and Z excluded as motion letters.                
  - maxDistance is uncalibrated, so the out-of-vocabulary distance gate is      
  built but inert.                                                              
  - The orientation limitation above.                                           
  - Phrase menu untested beyond one entry.                                      
  - A hardware recording session is the entire gap between this and a working   
  recognizer. The                                                               
    recorder, including a _NEGATIVE calibration mode, is built and unused.      
                                                                                
  FRAMING: a practice and fallback aid, not a replacement for interpreters. It  
  does not                                                                      
  translate ASL -- ASL has its own grammar and this reads fingerspelling only.  
                                                                                
  Embed docs/end-to-end-preview.png. Link docs/PROMPT_LOG.md and                
  docs/SEPARABILITY.md.                                                         
                                                                                
  === 2. docs/SEPARABILITY.md ===                                               
                                                                                
  The full 24-letter separability table, the worst-5 pairs, and the split       
  between the 3                                                                 
  architecturally-impossible pairs (G/Q, H/U, K/P -- orientation erased by the  
  feature space)                                                                
  and the 9 real-but-drowned ones (0.28-0.40 signal against a 0.30-0.45 noise   
  floor at 0.22cm                                                               
  jitter; recoverable with real templates, more samples, or the thumb-weighted  
  variant).                                                                     
                                                                                
  Include the rotation proof. Include why the shipped 6-letter file works       
  partly BECAUSE the                                                            
  older generator was geometrically wrong -- it never modelled K and P as       
  orientation variants.                                                         
  Include why P was dropped from the candidate set.                             
                                                                                
  === 3. docs/VIDEO_SHOTLIST.md ===                                             
                                                                                
  A 75-90 second shot list, timed, structured so the strongest material lands   
  last:                                                                         
  - ~10s: the idea. Two panels, one aimed at each person.                       
  - ~20s: hand skeleton forming L-U-K-E, panels responding, confidence bar      
  filling, chime.                                                               
  - ~10s: a wrong letter -- the flash, recoverable not fatal.                   
  - ~10s: form K, form P -- IDENTICAL skeleton. The limitation, visible in four 
  seconds.                                                                      
  - ~20s: LEAF suite passing, then the mutation test FAILING when the fix is    
  reverted.                                                                     
  - ~10s: close.                                                                
  Note which are preview captures and which are terminal captures.              
                                                                                
  === 4. docs/PROMPT_LOG_HEADER.md ===                                          
                                                                                
  A ~10-line narrative header to paste on top of PROMPT_LOG.md after /export.   
  Written for a                                                                 
  judge who will read it before the transcript and decide from it whether to    
  read further.                                                                 
                                                                                
  Lead with the mutation test: a spurious-double bug found by reasoning about   
  the re-arm rule,                                                              
  fixed with a consecutive-frame run, guarded by a LEAF scenario, and then the  
  fix REVERTED to                                                               
  prove the guard fires -- "FAILED: signbridge-no-spurious-double, Expected 0,  
  Received 1". A                                                                
  green suite on first run is worth distrusting.                                
                                                                                
  Then: verified-not-assumed (26 keypoints), the proven orientation limitation, 
  the                                                                           
  measurement-gated rejection of the 24-letter set, and the compile-clean bugs. 
                                                                                
  Name the CLAD skills used. Point at what to look for in the transcript rather 
  than                                                                          
  summarizing it.                                                               

  Read 1 file (ctrl+o to expand)

● Reading the checklist done. Now verifying the claims I'm about to write
  against the actual code and re-running the Fisher validation.

  Ran 2 shell commands (ctrl+o to expand)

● Fisher claim checks out precisely (pooled 5.330 vs 4.084 — 30.5% apart; Fisher
  16827.6 vs 1.395 — 12,000×). Checking versions and the skills actually
  invoked.

  Ran 3 shell commands (ctrl+o to expand)

● Claims verified. Writing the four documents.
● Write(README.md)
  ⎿  Wrote 168 lines to README.md
      1 # ASL Fingerspelling Bridge
      2 
      3 A Spectacles Lens that reads fingerspelling and puts the result w
        here the other person can see it.
      4 
      6 
      7 ![End-to-end run in preview: LUKE in progress with a wrong-letter
         flash](docs/end-to-end-preview.png)
      8 
      9 ---
     … +267 lines (ctrl+o to expand)

● Write(docs\SEPARABILITY.md)
  ⎿  Wrote 195 lines to docs\SEPARABILITY.md
      1 # Separability analysis
      2 
      3 Why the shipped template set contains 6 letters and not 24.
      4 
      5 Everything here is reproducible: `node tools/gen-synthetic-templa
        n output path.
      6 
      7 ---
      8 
      9 ## Method
     … +248 lines (ctrl+o to expand)

● Write(docs\VIDEO_SHOTLIST.md)
  ⎿  Wrote 116 lines to docs\VIDEO_SHOTLIST.md
      1 # Demo video shot list
      3 **Target: 75–90 seconds.** Structured so the strongest material l
        ands last — the limitation demo and the mutation test are the two
         shots a judge will remember, so they come after the happy path, 
      4 
      5 Capture source is marked on every shot: **[P]** = Lens Studio pre
      6 
      7 Record with `Win+Alt+R` → `C:\Users\Raol\Videos\Captures\`. One c
        lean take beats five retries.
      9 ---
     … +147 lines (ctrl+o to expand)

● Write(docs\PROMPT_LOG_HEADER.md)
  ⎿  Wrote 37 lines to docs\PROMPT_LOG_HEADER.md
      1 # How this was built
      3 **Paste the block below on top of `docs/PROMPT_LOG.md` after `/ex
        port`.**
      5 ---
      7 ## Read this first
      8 
        bug found by reasoning about the re-arm rule** rather than by obs
        erving a failure. `HoldBuffer` re-armed on any single non-matchin
        re-commit a letter the signer had signed once. Fixed by requiring
        hen **the fix was reverted to prove the guard fires**:
     … +63 lines (ctrl+o to expand)

● Update(docs\SEPARABILITY.md)
  ⎿  Added 1 line, removed 1 line
      126  
      127  - **Real templates** — recorded within-letter spread reflects 
           genuine re-forming variation, and more importantly the *betwee
           n*-letter distances are real anatomy rather than an approximat
           ion of it
      128  - **More samples per letter** — 5 is enough to expose overlap,
            not enough to characterize a distribution
      129 -- **The thumb-weighted variant** — M, N, S, T and A differ alm
          -ost entirely in thumb position, which is 12 of 78 dims. `makeW
          -eights({thumb: w})` upweights exactly those dims; `perLandmark
          -Discriminability` exists to pick `w` from measurement instead 
          -of guessing                                                   
      129 +- **The thumb-weighted variant** — M, N, S, T and A differ alm
          +ost entirely in thumb position. `FINGER_GROUPS.thumb` covers l
          +andmarks 1–5, so `makeWeights({thumb: w})` upweights 15 of the
          + 78 dims (of which 4 landmarks, 12 dims, actually move between
          + these letters — landmark 1 is the near-rigid `thumbToWrist` m
          +etacarpal). `perLandmarkDiscriminability` exists to pick `w` f
          +rom measurement instead of guessing                           
      130  
      131  None of that is worth doing against synthetic data. All of it 
           becomes possible after one recording session.
      132  

● Four documents written. All claims re-verified against the code rather than
  restated from the brief.

  README.md — findings-first. The "What building it revealed" section is the
  bulk: 26-vs-21 keypoints and the thumb naming trap, the rotation-invariance
  limitation with the 0.000e+0 proof, the Fisher replacement with the measured
  table, the rejected 24-letter set, and the two compile-clean runtime bugs.
  Limitations are their own section, stated flat.

  docs/SEPARABILITY.md — full 24-letter table, worst-5 pairs, the split between
  the 3 architecturally impossible pairs and the 9 drowned ones, the rotation
  proof, why the shipped set works partly because the old generator was wrong
  (K–P 1.577 vs 0.000), and why P was dropped.

  docs/VIDEO_SHOTLIST.md — 80s across six shots with 10s slack, [P]/[T] marked
  per shot, strongest material last (K/P identity at 0:40, mutation failure at
  0:50).

  docs/PROMPT_LOG_HEADER.md — ~10 lines leading with the mutation test and its
  exact failure string, then the three measured-not-assumed items, the skills,
  and a pointer to what to look for.

  Corrections made against the brief

  The brief said pooled variance scored the two landmarks "within 30% of each
  other" and Fisher separated them "by four orders of magnitude." I re-ran the
  validation rather than quoting it — both hold: pooled 5.330 vs 4.084 (30.5%
  apart), Fisher 16827.557 vs 1.395 (12,000×). Written with the actual figures.

  One thing I tightened rather than repeated: I'd previously described the
  M/N/S/T thumb difference as "12 of 78 dims," which is right for the moving
  joints but wrong for what makeWeights({thumb: w}) touches —
  FINGER_GROUPS.thumb is landmarks 1–5, so it weights 15 dims including the
  near-rigid thumbToWrist. SEPARABILITY.md now states both numbers.

  Three things to know

  - docs/PROMPT_LOG.md doesn't exist yet. README and the header both point at
    it; it's created by /export, which the checklist correctly sequences last.
    The links will resolve once it lands.
  - docs/end-to-end-preview.png predates the hand visualizer and the audio. It
    shows the panels with L U K green and the wrong-letter flash — accurate, but
    the README leads on the hand skeleton as a headline feature and the
    embedded image doesn't show one. Worth a fresh capture before submitting;
    say the word and I'll take it.
  - docs/CHECKLIST.md is now stale in one place — it records
    templates.synthetic.json as 7 letters; it's 6 since P was dropped. I left
    your working doc alone rather than editing it.

  Lens Studio version: I couldn't read LensStudio.exe's ProductVersion from this
  shell, so I wrote "5.23" without the patch digit rather than trusting the
  checklist's 5.23.1 against my earlier note of 5.23.2.

✻ Baked for 4m 27s

> Retake docs/end-to-end-preview.png. The current one predates the hand         
  visualizer and the                                                            
  audio, and the README now leads on the skeleton.                              
                                                                                
  Capture mid-word with the hand visible and clearly hand-shaped, LUKE          
  partially complete                                                            
  (green committed letters), the confidence bar mid-fill, and the hand in its   
  warming amber                                                                 
  state -- so one image shows the input, the classifier's read, and both panels 
  at once.                                                                      
                                                                                
  Switch the preview device off "Sunlit Room" first. Specs renders additively   
  and the current                                                               
  capture is under-exposed; you already misread the header centering off a dark 
  capture once.                                                                 
  This is also the legibility check for the outward panel's assembled text,     
  which has never been                                                          
  confirmed readable.                                                           
                                                                                
  Same filename so the README link doesn't change.                              

● Lens Studio version confirmed as 5.23.2 from your checklist edit — correcting
  the README's "5.23" while I'm here.

● Update(README.md)
  ⎿  Added 1 line, removed 1 line
      165  docs/               JOINTS.md · SEPARABILITY.md · PROMPT_LOG.m
           d · VIDEO_SHOTLIST.md
      166  ```
      167  
      168 -Built on Lens Studio 5.23 with SpectaclesInteractionKit, Spect
          -aclesUIKit and LEAF.                                          
      168 +Built on Lens Studio 5.23.2 with SpectaclesInteractionKit, Spe
          +ctaclesUIKit and LEAF.                                        

  Called lens-studio 2 times (ctrl+o to expand)

● "Evening Room" — same indoor framing as Sunlit Room, darker ground for
  additive rendering.

  Called lens-studio 2 times (ctrl+o to expand)

● Much better contrast, but the Evening Room camera sits back — content is low
  in frame and the hand was hidden on a gap frame. Let me reframe.

  Called lens-studio 2 times (ctrl+o to expand)

● Before the hero shot — the outward panel faces the opposite direction, so let
  me settle its legibility from the reader's side, which is the never-verified
  checklist item.

  Called lens-studio 2 times (ctrl+o to expand)

● Outward panel confirmed legible — large, white, and correctly unmirrored from
  the reader's side. That closes checklist item 5C. Now the wearer-side hero
  frame.

  Called lens-studio 3 times (ctrl+o to expand)

● L is green, U-K-E pending — partial. Hand was hidden on a gap frame; capturing
  again.

  Called lens-studio (ctrl+o to expand)

● Both landed on gap frames (hand hidden ~29% of frames) and the phrase
  completed. Refreshing and capturing in quick succession.

  Called lens-studio 2 times (ctrl+o to expand)
● Three misses is too improbable — checking whether the visualizer is actually
  running rather than guessing at timing.

  Called lens-studio (ctrl+o to expand)

● Visualizer builds fine and no errors, so this is either gap frames or framing.
  Testing directly by disabling the untracked-hide.

  Called lens-studio 2 times (ctrl+o to expand)

● Confirmed — those were all gap frames; the hand renders exactly where
  predicted. Now hunting the target state: green committed letters, bar
  mid-fill, amber hand.

  Called lens-studio 3 times (ctrl+o to expand)

● The post-refresh capture returned a stale frame. Timing the capture properly
  instead.

  Called lens-studio 2 times, ran 1 shell command (ctrl+o to expand)

● L and U green, K flashing — partial. Hand caught mid commit-pulse though;
  retrying for the amber warming phase.

  Called lens-studio 3 times, ran 1 shell command (ctrl+o to expand)

● Amber, bar mid-fill, L 78% — but the phrase completed. One more attempt for
  partial-green plus amber together.

  Called lens-studio 2 times, ran 1 shell command (ctrl+o to expand)

● The preview advances in discrete steps per capture, so the exact partial+amber
  overlap isn't reachable. Taking the amber frame and verifying before
  overwriting.

  Read 1 file, called lens-studio (ctrl+o to expand)

● Full-resolution frame captured. Cropping the dead space, then restoring the
  setting I changed.

  Read 1 file, called lens-studio, ran 1 shell command (ctrl+o to expand)

● Retaken and saved to the same path — docs/end-to-end-preview.png, 1392×1340.

  What's in it: amber warming hand skeleton clearly hand-shaped, SIGNING header,
  LUKE in green, live classifier read E 83%, both panel bodies, on the darker
  Evening Room ground.

  Two things you should decide on

  1. The confidence bar renders wrong, and the new image shows it. There's a
  thin bright fill across the text column, and then a separate pale rounded bar
  sitting at roughly 18 cm right of panel centre — outside the text column
  entirely, hard against the panel's right edge. That is not a lighting
  artifact; it's mispositioned geometry. It was invisible in the old
  under-exposed Sunlit Room capture, which is exactly the kind of thing your
  "you already misread the header centering off a dark capture" warning was
  about — the darker ground surfaced a real defect. I did not touch SignPanel to
  fix it; say the word and I'll trace it.

  2. The phrase is complete, not partial. I could not get partial-green and
  amber in the same frame. The preview does not free-run — it advances in
  discrete steps per capture, and the reachable states after a refresh are
  quantised: one settled state (L·U green, K flashing red, hand green mid
  commit-pulse, bar low), then the next capture jumps to (LUKE complete, hand
  amber, bar mid-fill). The amber/mid-fill state you asked for and the partial
  state don't co-occur in any frame I could reach. I chose amber + mid-fill +
  hand-shaped over partial, since three of your four criteria beat one. Nine
  attempts; I stopped rather than keep burning turns.

  Outward panel legibility — confirmed, and it's good

  This closes checklist item 5C, which had never been verified. From the
  reader's side the assembled text renders large, white, and correctly 
  unmirrored — faceOutward's 180° root rotation does not mirror the glyphs. It
  is comfortably the most legible element in the scene.

  It also settles something structural: the two panels' text can never both be 
  legible in one frame. The outward text is single-sided and backface-culled, so
  from the wearer's viewpoint it isn't merely dim, it isn't drawn. Your "both
  panels at once" requirement is geometrically unsatisfiable in a single capture
  — that's the design working, not a framing failure. The delivered image shows
  both panel bodies plus all the inward content. If you want the outward LUKE
  in the README too, the options are a second image or a two-pane composite
  under the same filename; I didn't assume either.

  Diagnostic worth keeping

  Three consecutive captures showed no hand at all. Rather than keep re-rolling
  I tested it by flipping hideWhenUntracked off — the hand appeared exactly
  where I'd predicted it would be, which confirmed the misses were untracked gap
  frames (~29% of frames) and not a framing or render fault. I set 
  hideWhenUntracked back to true, so shipped behaviour is unchanged and the
  README's claim that gaps show as gaps still holds.

  Preview left on Evening Room as asked. The preview camera is repositioned to
  frame the panels; that's a view-only setting, not project state.

✻ Cooked for 7m 47s

※ recap: Goal is shipping the ASL fingerspelling bridge for the CLAD hackathon; docs are written and the preview hero image is retaken and saved. Next: decide whether to fix the mispositioned confidence bar that the new capture exposed.

> gimme a git description to push                                               

  Ran 2 shell commands (ctrl+o to expand)

● Everything code-side is already committed and pushed (3cc260f, 994d324).
  What's outstanding is just the docs batch plus the retaken capture.

  Commit message:

  Add README findings doc, separability analysis, and demo materials

  README is written as a findings document rather than a feature list —
  what building it revealed sits alongside what it does.

  - README.md — what it is, why fingerspelling is the honest scope, the
    pipeline, and five findings: SIK exposes 26 keypoints not the cited 21
    (plus the thumb naming trap in exactly the code separating M/N/S/T);
    rotation-invariant normalization erases the wrist orientation
    distinguishing G/Q, H/U and K/P; Fisher ratio replacing pooled
    variance, validated on planted data; the 24-letter synthetic set
    generated and rejected on measurement; two bugs that compiled clean
    and failed only at runtime. Limitations stated unhedged.

  - docs/SEPARABILITY.md — full 24-letter table, worst-5 pairs, the split
    between 3 architecturally impossible pairs and 9 drowned in noise, the
    rotation proof, and why P was dropped from the candidate set.

  - docs/VIDEO_SHOTLIST.md — 80s shot list, strongest material last.
  - docs/PROMPT_LOG_HEADER.md — narrative header to paste after /export.

  - docs/end-to-end-preview.png — retaken on Evening Room with the hand
    visualizer and audio in place. Also confirms the outward panel's
    assembled text is legible from the reader's side, never previously
    verified.

  Known issue surfaced by the darker capture: the inward panel's
  confidence bar renders offset right of the text column. Not fixed here.

  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01AFfF3VFVvbL5Hm2ixsnXz3

  Commands:

  git add README.md docs/
  git commit -F- <<'EOF'
  <paste message above>
  EOF
  git push

  Two notes: docs/CHECKLIST.md carries your own edits (Lens Studio 5.23.2, the
  6-letter line, the HandVisualizer and SFX rows) and gets swept in by git add 
  docs/ — that's fine, but drop it from the add if you'd rather keep it out of a
  docs-titled commit. And I mentioned the confidence-bar defect in the message
  deliberately; if you'd rather not ship a known-issue line in the commit that
  introduces the README, cut the last paragraph — it's still in my report to you
  either way.

  Want me to run it?

✻ Worked for 41s

※ recap: You're shipping the ASL fingerspelling Lens for the CLAD hackathon, and the code is committed and pushed with the four new docs and retaken preview image still uncommitted. Next action: say the word and I'll run the commit and push.

> can we make the bar filling UI better                                         
● Let me look at how the bar is actually built before changing it.

  Called lens-studio 5 times, ran 2 shell commands (ctrl+o to expand)

● The runtime data corrects me: the bar is not mispositioned.

  BarTrack  centre x=0.00   half-width 17.80  (35.6 cm wide)
  BarFill   centre x=-5.93  half-width 11.87  (23.7 cm, spans -17.8 → +5.9)

  Fill is correctly left-anchored at 67% of the track. What I read as "a bar
  offset to the right" was the unfilled remainder of the track — geometry is
  right, the two just don't read as one object. I'll retract that from the
  commit message. Now let me see what I can actually restyle.

  Ran 4 shell commands (ctrl+o to expand)

● RoundedRectangle exposes backgroundColor, cornerRadius, opacity, and border —
  so the bar can be coloured. Checking how BackPlate wraps it.

  Ran 2 shell commands (ctrl+o to expand)

● Now implementing. Colour the fill to match the hand visualizer's state, pill
  the corners, and make the track read as a track.

● Update(Assets\Scripts\SignPanel.ts)
  ⎿  Added 1 line
      33   */
      34  
      35  import {BackPlate} from "SpectaclesUIKit.lspkg/Scripts/BackPlat
          e"
      36 +import {RoundedRectangle} from "SpectaclesUIKit.lspkg/Scripts/V
         +isuals/RoundedRectangle/RoundedRectangle"                      
      37  import {FlexItem} from "SpectaclesUIKit.lspkg/Scripts/Component
          s/Layout2D/Flex/FlexItem"
      38  import {FlexLayout} from "SpectaclesUIKit.lspkg/Scripts/Compone
          nts/Layout2D/Flex/FlexLayout"
      39  import {

  Ran 1 shell command (ctrl+o to expand)

● Update(Assets\Scripts\SignPanel.ts)
  ⎿  Added 29 lines, removed 2 lines
      206  
      207    @input
      208    @widget(new SliderWidget(0.4, 2.5, 0.1))
      209 -  @hint("Height of the confidence bar.")                      
      210 -  barHeight: number = 1.2                                     
      209 +  @hint("Height of the confidence bar. Corner radius follows i
          +t, so the bar is always a pill.")                             
      210 +  barHeight: number = 1.8                                     
      211 +                                                              
      212 +  @input                                                      
      213 +  @widget(new SliderWidget(0.3, 1, 0.05))                     
      214 +  @hint("Bar width as a fraction of the panel's inner width. B
          +elow 1 keeps the bar inside the text column instead of running
          + edge to edge.")                                              
      215 +  barWidthFraction: number = 0.72                             
      216    @ui.group_end
      217 +                                                              
      218 +  @ui.group_start("Confidence bar colour")                    
      219 +  @input                                                      
      220 +  @widget(new ColorWidget())                                  
      221 +  @hint("Fill colour while progress is low. Matches HandVisual
          +izer's neutral, so the bar and the hand agree.")              
      222 +  barNeutralColor: vec4 = new vec4(0.36, 0.58, 0.88, 1)       
      223 +                                                              
      224 +  @input                                                      
      225 +  @widget(new ColorWidget())                                  
      226 +  @hint("Fill colour as progress approaches a commit. Matches 
          +HandVisualizer's warming amber.")                             
      227 +  barWarmColor: vec4 = new vec4(1, 0.72, 0.18, 1)             
      228 +                                                              
      229 +  @input                                                      
      230 +  @widget(new ColorWidget())                                  
      231 +  @hint("Fill colour on the commit frame, when progress reache
          +s 1.")                                                        
      232 +  barConfirmColor: vec4 = new vec4(0.24, 0.94, 0.46, 1)       
      233 +                                                              
      234 +  @input                                                      
      235 +  @widget(new ColorWidget())                                  
      236 +  @hint("Unfilled track. Needs enough alpha to read as an empt
          +y bar rather than as nothing.")                               
      237 +  barTrackColor: vec4 = new vec4(1, 1, 1, 0.16)               
      238 +  @ui.group_end                                               
      239    @ui.group_start("Labels")
      240    @input
      241    @hint("Small caption above the target word. Empty string hid
           es it.")

● Update(Assets\Scripts\SignPanel.ts)
  ⎿  Added 5 lines
      291    private barTrack!: BackPlate
      292    private barFill!: BackPlate
      293    private barFillObject!: SceneObject
      294 +  // BackPlate keeps its RoundedRectangle private and exposes 
          +only `style`,                                                 
      295 +  // which has no tint. The RoundedRectangle sits on the same 
          +SceneObject, so                                               
      296 +  // fetch it directly — that is what actually carries backgro
          +undColor.                                                     
      297 +  private barTrackRect: RoundedRectangle | null = null        
      298 +  private barFillRect: RoundedRectangle | null = null         
      299  
      300    // --- render state ----------------------------------------
           ---------------
      301    private phrase = ""

● Now the build and the per-frame update.

● Update(Assets\Scripts\SignPanel.ts)
  ⎿  Added 5 lines, removed 1 line
      370      // Confidence bar. Track and fill are plain children of th
           e item, not laid
      371      // out, so their local positions are ours to control.
      372      if (this.showConfidenceBar) {
      373 +      const barWidth = inner * clamp01(this.barWidthFraction) 
      374 +      const radius = this.barHeight / 2                       
      375        this.flexChild(content, {w: inner, h: this.barHeight}, c
           hild => {
      376          const trackObject = this.obj(child, "BarTrack")
      377          this.barTrack = trackObject.createComponent(BackPlate.
           getTypeName()) as BackPlate
      378          this.barTrack.onInitialized.add(() => {
      379            this.barTrack.style = "dark"
      378 -          this.barTrack.size = new vec2(inner, this.barHeight)
      380 +          this.barTrack.size = new vec2(barWidth, this.barHeig
          +ht)                                                           
      381 +          this.barTrackRect = this.styleRect(trackObject, radi
          +us, this.barTrackColor)                                       
      382          })
      383  
      384          // Created after the track, so the DFS paints the fill
            over it.
     ...
      386          this.barFill = this.barFillObject.createComponent(Back
           Plate.getTypeName()) as BackPlate
      387          this.barFill.onInitialized.add(() => {
      388            this.barFill.style = "default"
      389 +          this.barFillRect = this.styleRect(this.barFillObject
          +, radius, this.barNeutralColor)                               
      390            this.setProgress(0, null)
      391          })
      392        })

● Update(Assets\Scripts\SignPanel.ts)
  ⎿  Added 13 lines, removed 2 lines
      464      }
      465  
      466      const inner = this.panelWidth - this.padding * 2
      467 +    const barWidth = inner * clamp01(this.barWidthFraction)   
      468      const p = clamp01(progress)
      468 -    const width = inner * p                                   
      469 +    // Never let the fill shrink below its own corner radius: 
          +a pill narrower                                               
      470 +    // than its diameter renders as a wedge, which reads as a 
          +glitch at the                                                 
      471 +    // very start of every hold.                              
      472 +    const width = Math.max(barWidth * p, p > 0 ? this.barHeigh
          +t : 0)                                                        
      473  
      474      if (width < MIN_VISIBLE_FILL_CM) {
      475        this.barFillObject.enabled = false
     ...
      478        this.barFill.size = new vec2(width, this.barHeight)
      479        // Grow from the left edge: a BackPlate is centred on it
           s object, so the
      480        // object slides left by half the width it is missing.
      477 -      this.barFillObject.getTransform().setLocalPosition(new v
          -ec3(-(inner - width) / 2, 0, BAR_FILL_Z))                     
      481 +      this.barFillObject.getTransform().setLocalPosition(new v
          +ec3(-(barWidth - width) / 2, 0, BAR_FILL_Z))                  
      482      }
      483  
      484 +    // Colour carries the same three states as the hand skelet
          +on, so the two                                                
      485 +    // surfaces never disagree about what the hold buffer is d
          +oing.                                                         
      486 +    if (this.barFillRect !== null) {                          
      487 +      this.barFillRect.backgroundColor =                      
      488 +        p >= 0.999 ? this.barConfirmColor : mixColor(this.barN
          +eutralColor, this.barWarmColor, p)                            
      489 +    }                                                         
      490 +                                                              
      491      // Only narrate the candidate when no wrong-letter flash o
           wns the line.
      492      if (this.wrongSigned === null && this.statusText) {
      493        if (candidate !== null && p > 0) {

  Ran 1 shell command (ctrl+o to expand)

● Update(Assets\Scripts\SignPanel.ts)
  ⎿  Added 6 lines
      144  }
      145  
      146  /** vec4 colour to the `#rrggbb` form rich-text markup expects
           . */
      147 +/** Componentwise blend, for the confidence bar's neutral -> w
          +arm ramp. */                                                  
      148 +function mixColor(a: vec4, b: vec4, t: number): vec4 {        
      149 +  const k = clamp01(t)                                        
      150 +  return new vec4(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k
          +, a.z + (b.z - a.z) * k, a.w + (b.w - a.w) * k)               
      151 +}                                                             
      152 +                                                              
      153  function toHex(c: vec4): string {
      154    const ch = (v: number) => {
      155      let n = Math.round(clamp01(v) * 255)

● Update(Assets\Scripts\SignPanel.ts)
  ⎿  Added 21 lines
      585    // Composition helpers
      586    // ---------------------------------------------------------
           ----------------
      587  
      588 +  /**                                                         
      589 +   * Reach past BackPlate to the RoundedRectangle it builds, a
          +nd make it a                                                  
      590 +   * tintable pill.                                           
      591 +   *                                                          
      592 +   * BackPlate exposes only `style` ("default" | "dark" | "sim
          +ple"), which has                                              
      593 +   * no tint, and keeps its RoundedRectangle private — but the
          + component sits on                                            
      594 +   * the same SceneObject, so it can be fetched. Gradient is d
          +isabled because                                               
      595 +   * `backgroundColor` is only honoured for a solid fill; leav
          +ing the style's                                               
      596 +   * gradient on would silently ignore every colour set here. 
      597 +   */                                                         
      598 +  private styleRect(host: SceneObject, cornerRadius: number, c
          +olor: vec4): RoundedRectangle | null {                        
      599 +    const rect = host.getComponent(RoundedRectangle.getTypeNam
          +e()) as RoundedRectangle | null                               
      600 +    if (rect === null || rect === undefined) {                
      601 +      return null                                             
      602 +    }                                                         
      603 +    rect.gradient = false                                     
      604 +    rect.cornerRadius = cornerRadius                          
      605 +    rect.backgroundColor = color                              
      606 +    return rect                                               
      607 +  }                                                           
      608 +                                                              
      609    private obj(parent: SceneObject, name: string, position?: ve
           c3): SceneObject {
      610      const sceneObject = global.scene.createSceneObject(name)
      611      sceneObject.setParent(parent)

  Called lens-studio (ctrl+o to expand)

● Compiles. The scene has barHeight stored at the old 1.2, so updating it there.

  Called lens-studio 3 times (ctrl+o to expand)

● Geometry confirms: track 25.63 cm (0.72 × 35.6 inner), height 1.8 cm, fill
  left-edge-aligned at −12.816. Let me look at it.

  Called lens-studio (ctrl+o to expand)
● That's a real improvement — reads as one pill now, amber fill against a
  visible track, matching the hand. Let me confirm the other two colour states
  and the low-progress guard.

  Called lens-studio (ctrl+o to expand)

● Empty track renders cleanly as a pill at progress 0, hand green on commit.
  Running the suite since setProgress geometry changed.

  Called lens-studio 2 times (ctrl+o to expand)

● Both pass. Let me grab a fresh hero frame since the README's image now shows
  the old bar.

  Read 1 file, called lens-studio (ctrl+o to expand)

● Done, and it's a genuine improvement — but the first thing to correct:

  I was wrong about the bar being broken

  Runtime introspection showed the geometry was always correct — track centred
  at x=0, fill left-anchored, growing right. What I read as "a bar offset to the
  right" in the dark capture was simply the unfilled remainder of the track.
  There was no defect.

  Drop the last paragraph from the commit message I gave you — the "Known
  issue... confidence bar renders offset right" line is false and shouldn't ship
  in the repo.

  What was actually wrong: it read badly, not incorrectly

  Four things fixed in SignPanel.ts:

  ┌────────┬────────────────────────────┬───────────────────────────────────┐
  │ change │           before           │               after               │
  ├────────┼────────────────────────────┼───────────────────────────────────┤
  │ height │ 1.2 cm at 35.6 cm wide — a │ 1.8 cm, barHeight/2 corner radius │
  │        │  30:1 hairline             │  → a pill                         │
  ├────────┼────────────────────────────┼───────────────────────────────────┤
  │ width  │ full inner width, edge to  │ barWidthFraction 0.72 → sits      │
  │        │ edge                       │ inside the text column            │
  ├────────┼────────────────────────────┼───────────────────────────────────┤
  │        │ style: "dark",             │ explicit barTrackColor at 0.16    │
  │ track  │ near-invisible on dark     │ alpha — reads as an empty bar     │
  │        │ ground                     │                                   │
  ├────────┼────────────────────────────┼───────────────────────────────────┤
  │ fill   │ flat white, unrelated to   │ lerps neutral blue → amber, green │
  │        │ state                      │  at commit                        │
  └────────┴────────────────────────────┴───────────────────────────────────┘

  The colour ramp uses the same three constants as HandVisualizer, so the bar
  and the hand can't disagree about what the hold buffer is doing — one glance
  tells you the same thing twice.

  The tint required getting past a real API constraint. BackPlate exposes only
  style ("default" | "dark" | "simple"), which has no tint, and keeps its
  RoundedRectangle private. But the RoundedRectangle sits on the same
  SceneObject, so getComponent reaches it — and it carries backgroundColor,
  cornerRadius, opacity, border. One trap: backgroundColor is only honoured for
  a solid fill, so gradient must be turned off first or every colour set is
  silently ignored. That's noted at the call site.

  Also added a guard so the fill never renders narrower than its own corner
  radius — a pill thinner than its diameter draws as a wedge, which would have
  flickered at the start of every hold.

  Verified

  Runtime geometry after the change:
  BarTrack  half-width 12.816  →  25.63 cm  =  35.6 inner × 0.72 ✓
  BarFill   half-width  9.968  →  19.94 cm,  left edge at −12.816  = track's
  left edge ✓
  both      half-height  0.900  →  1.8 cm ✓

  All three colour states seen on screen: amber fill at 89% with the track
  remainder visible, empty track at progress 0, and the neutral blue hand.
  signbridge-completes-word and signbridge-wrong-letter-does-not-advance both
  pass — the latter matters because the wrong-letter flash shares statusText
  with setProgress.

  One loose end: docs/end-to-end-preview.png still shows the old hairline bar.
  Want me to retake it? It took about ten captures last time because the preview
  only advances one state per capture, so I'd rather you decide than spend that
  unasked.

✻ Churned for 5m 43s

※ recap: We're finishing the ASL fingerspelling Lens for the CLAD hackathon; docs are written and the confidence bar UI is now improved and verified. Next: decide whether I retake docs/end-to-end-preview.png, which still shows the old bar.

> i wanna have a test where we are verifying A-Z                                

● Straight answer first: A–Z recognition can't be verified — only 6 letters have
  templates (L U K E C O), and J/Z are motion letters with no single-frame
  representation at all. Any test claiming to verify recognition across A–Z
  would be asserting against data that doesn't exist.

  What can be tested is real and worth having, but there are two genuinely
  different tests here and they lead to different work.

● User answered Claude's questions:
  ⎿  · Which A–Z test do you want? → Both

● Both it is. Let me read the existing test surface so the new scenario uses the
  same machinery.

  Ran 3 shell commands (ctrl+o to expand)

● Update(Assets\Scripts\SignBridge.ts)
  ⎿  Added 11 lines
      454      return this.classifier.loadedLetters()
      455    }
      456  
      457 +  /**                                                         
      458 +   * Letters in `phrase` that the loaded template set cannot p
          +roduce.                                                       
      459 +   *                                                          
      460 +   * Exposed for the alphabet-coverage scenario: recognition a
          +nd phrase gating                                              
      461 +   * are two different guarantees, and a letter being absent f
          +rom the templates                                             
      462 +   * is only safe if the phrase layer also refuses to seat wor
          +ds needing it.                                                
      463 +   */                                                         
      464 +  unsignableLetters(phrase: string): string[] {               
      465 +    return this.phrases.unsignableLetters(phrase)             
      466 +  }                                                           
      467 +                                                              
      468    /** Euclidean distance between two letters' first templates.
            */
      469    distanceBetween(a: string, b: string): number {
      470      const pa = this.poseFor(a)

● Now the coverage scenario.

● Write(Assets\Scripts\SignBridgeAlphabetCoverageScenario.ts)
  ⎿  Wrote 132 lines to
     Assets\Scripts\SignBridgeAlphabetCoverageScenario.ts
       1 /**
         ed for.
       3  *
         lphabet. Only
       5  * six letters have templates, so only six can be recognized; th
       6  * that the other twenty are pinned to a defined, safe behaviour
          instead of
       8  *
       9  * Each letter falls into exactly one of three buckets, and the 
      10  * if any letter falls into none or into more than one:
     … +157 lines (ctrl+o to expand)

  Called lens-studio 2 times, ran 1 shell command (ctrl+o to expand)

● Passing on the first run isn't evidence yet. Mutation-testing it against the
  exact regression it claims to guard — breaking phrase gating.

  Called lens-studio 2 times, ran 1 shell command (ctrl+o to expand)

● Guard fires. Capturing the exact failure text before reverting.

  Called lens-studio (ctrl+o to expand)

● Captured: AssertionError: Expected: "> -1" — Received: "-1". Note the log also
  shows phrase 'LUKE' [1/14] under mutation — gating collapsed and all 14
  phrases became seatable. Reverting.

  Called lens-studio 2 times, ran 1 shell command (ctrl+o to expand)

● LEAF half done and mutation-verified. Now the Node characterisation — first
  making the generator importable rather than duplicating its model.

  Ran 1 shell command (ctrl+o to expand)
● Now the characterisation tool.

● Write(tools\characterize-alphabet.js)
  ⎿  Wrote 162 lines to tools\characterize-alphabet.js
       1 // Characterises what the classifier ACTUALLY does across all 24
       2 // as opposed to what the separability gate predicts.
       3 //
          because they
       5 // disagree in informative ways:
       7 //   GATE      nearest-other-letter distance / within-letter spr
         ead, against a
         lasses overlap".
       9 //
          every template
     … +195 lines (ctrl+o to expand)

  Ran 1 shell command (ctrl+o to expand)

● Result is clean — but it exposed a reproducibility flaw I should fix before
  pinning anything.

  Ran 1 shell command (ctrl+o to expand)

● CLI and tool now agree. But the reproducible numbers differ from what I wrote
  in the docs — updating them.

  Ran 4 shell commands (ctrl+o to expand)

● Adding the new scenario to the README's test table, then a final suite check.

  Called lens-studio 2 times, ran 1 shell command (ctrl+o to expand)

● Both delivered.

  1. LEAF coverage contract — signbridge-alphabet-coverage

  Partitions all 26 letters into three buckets and asserts the partition is
  total and disjoint (recognized + absent + motion === 26), so no letter can be
  silently unaccounted for:

  ┌────────────┬──────────┬─────────────────────────────────────────────────┐
  │   bucket   │ letters  │                    asserted                     │
  ├────────────┼──────────┼─────────────────────────────────────────────────┤
  │            │ L U K E  │ driven through mock → classifier → hold buffer; │
  │ RECOGNIZED │ C O      │  must commit itself (committed === ch), not a   │
  │            │          │ neighbour                                       │
  ├────────────┼──────────┼─────────────────────────────────────────────────┤
  │ ABSENT     │ 18       │ never in the loaded set and reported by         │
  │            │ others   │ unsignableLetters()                             │
  ├────────────┼──────────┼─────────────────────────────────────────────────┤
  │ MOTION     │ J Z      │ excluded by rule, never loadable                │
  └────────────┴──────────┴─────────────────────────────────────────────────┘

  It also checks the reverse direction — every loaded letter must be a real
  non-motion letter of A–Z, so a template set carrying _NEGATIVE or junk would
  fail rather than pass unnoticed.

  Mutation-tested, per the project's own standard. Making unsignableLetters()
  return [] — precisely the regression the scenario claims to guard, where
  templates change but phrase gating doesn't — produced:

  FAILED: signbridge-alphabet-coverage - AssertionError: Expected: "> -1" -
  Received: "-1"

  The log also showed phrase 'LUKE' [1/14] under mutation: gating collapsed and
  all 14 phrases became seatable, including ones needing J. Reverted,
  recompiled, passes again.

  One additive method on SignBridge (unsignableLetters) was needed to reach the
  phrase layer.

  2. Node characterisation — tools/characterize-alphabet.js

  Leave-one-out k-NN across all 24 static letters, same scoring as
  Classifier.ts. The gate and the classifier disagree, and the disagreement is 
  the finding:

  - 6 misclassify: G H K P Q U. Every single misclassification is into that
    letter's orientation partner — P→K, Q→G, U→H at 5/5; K→P, H→U, G→Q
    partially, jitter deciding. Nothing else in the alphabet is ever confused.
    That's the orientation collapse appearing in behaviour, not just geometry.
  - 6 fail the gate but classify 5/5: M N R S T V. Classes overlap, yet each
    letter's own samples stay nearest. Calling these failures overstates it;
    calling them fine understates it.

  Both sets are pinned; the tool exits non-zero on drift, so the
  README/SEPARABILITY numbers are a claim under test.

  Two things I had to fix to make that honest

  The generator wasn't reproducible. generate() shared one LCG stream, so
  generating the 7-letter set first shifted the jitter for the 24-letter set —
  the CLI and the new tool reported different ratios for identical geometry. Now
  the seed resets per call. I'd have been pinning numbers that didn't match the
  docs.

  That changed published numbers, so I corrected the docs rather than pinning to
  the new ones and leaving the old ones standing: the 24-letter table, the
  worst-5 pairs (M–N and N–S are out; H–V 0.82× and U–V 0.86× are in), the noise
  floor (0.30–0.45 → 0.29–0.54), and the greedy subset (now keeps P and U,
  drops K, H, V, R). The headline claim — 12 of 24 fail — is unchanged, as is
  the 7-letter baseline table.

  README now says six scenarios and documents both mutation tests.

  Suite green: alphabet-coverage, no-spurious-double, completes-word all pass
  after the revert; characterize-alphabet.js exits 0.

✻ Crunched for 6m 38s

※ recap: We're finishing the ASL fingerspelling Lens for the CLAD hackathon; the A–Z coverage test and alphabet characterisation tool are done, docs updated, suite green. Next: commit and push the docs plus test work, message ready when you are.

> Generate an 18-letter template set: all 24 static letters minus G, H, K, P,   
  Q, U (the six                                                                 
  orientation-collision letters that characterize-alphabet.js shows             
  misclassifying into their                                                     
  partners).                                                                    
                                                                                
  Gate adoption on leave-one-out CLASSIFICATION accuracy, not the 1.5x          
  separability ratio --                                                         
  the characterization showed the ratio is a conservative proxy that rejects    
  letters which                                                                 
  classify 5/5. Require every included letter to classify to itself 5/5.        
                                                                                
  If any letter fails, report which and keep the 6-letter set. Keep             
  templates.synthetic.json                                                      
  intact as fallback either way. Then report which DEFAULT_PHRASES become       
  signable, and re-run                                                          
  the full LEAF suite -- alphabet-coverage asserts the RECOGNIZED bucket, so it 
  must be updated                                                               
  to match whatever ships.                                                      

● Building the 18-letter set and gating on LOO accuracy. First, subset support
  in both tools.

  Ran 1 shell command (ctrl+o to expand)

● Heredoc mangled two escaped newlines. Fixing.

  Ran 2 shell commands (ctrl+o to expand)

● Heredoc escaping is fighting me again — using the Edit tool for exact literal
  replacement.

● Update(tools\characterize-alphabet.js)
  ⎿  Added 1 line, removed 2 lines
      163    // Subset run: this is an ADOPTION GATE, not a drift check. 
           The pinned sets
      164    // describe the full 24 and say nothing about a subset, so t
           he only question
      165    // is whether every included letter classifies to itself.
      166 -  console.log("                                               
      167 -ADOPTION GATE: every letter must classify 5/5 to itself");    
      166 +  console.log("\nADOPTION GATE: every letter must classify 5/5
          + to itself");                                                 
      167    const failed = rows.filter(r => r.correct < r.total);
      168    for (const r of rows) {
      169      console.log("  " + r.letter + "  " + r.correct + "/" + r.t
           otal +

● Update(tools\characterize-alphabet.js)
  ⎿  Added 1 line, removed 2 lines
      170        (r.correct === r.total ? "  pass" : "  FAIL -> " + r.top
           Confusion));
      171    }
      172    const pass = failed.length === 0;
      173 -  console.log("                                               
      174 -" + (pass                                                     
      173 +  console.log("\n" + (pass                                    
      174      ? "GATE PASSED - all " + rows.length + " letters classify 
           to themselves 5/5."
      175      : "GATE FAILED (" + failed.length + "): " + failed.map(r =
           > r.letter).join(" ")));
      176    process.exitCode = pass ? 0 : 1;

  Ran 1 shell command (ctrl+o to expand)

● The 18-letter gate fails on N (4/5, misclassifying into M). But note N was 5/5
  in the 24-letter run — the difference is which jitter draw each letter gets.
  That means the result may be luck, so let me test it across many seeds before
  concluding.

● Update(tools\gen-synthetic-templates.js)
  ⎿  Added 8 lines, removed 2 lines
      188  
      189  const SAMPLES = 5, JITTER_CM = 0.22;   // landmark-space jitte
           r, then re-normalize
      190  
      191 -function generate(defs){                                      
      191 +function generate(defs, seedOverride){                        
      192    // Reset the stream so a call is reproducible regardless of 
           what ran
      193    // before it. Without this, generating the 7-letter set firs
           t shifted the
      194    // jitter for the 24-letter set, and the CLI and characteris
           ation tool
      195    // reported different ratios for identical geometry.
      196 -  seed = SEED;                                                
      196 +  //                                                          
      197 +  // NOTE: letters consume the stream in key order, so changin
          +g WHICH letters                                               
      198 +  // are generated changes the draw every letter receives. Two
          + runs over                                                    
      199 +  // different subsets are therefore different samples of the 
          +same geometry,                                                
      200 +  // not the same samples filtered — which is why an adoption 
          +decision has to                                               
      201 +  // be taken across several seeds rather than from one draw. 
      202 +  seed = seedOverride !== undefined ? seedOverride : SEED;    
      203    const letters = {};
      204    const keys = Object.keys(defs);
      205    for (let i=0;i<keys.length;i++) {

● Update(tools\characterize-alphabet.js)
  ⎿  Added 44 lines, removed 8 lines
      163    // Subset run: this is an ADOPTION GATE, not a drift check. 
           The pinned sets
      164    // describe the full 24 and say nothing about a subset, so t
           he only question
      165    // is whether every included letter classifies to itself.
      166 -  console.log("\nADOPTION GATE: every letter must classify 5/5
          - to itself");                                                 
      167 -  const failed = rows.filter(r => r.correct < r.total);       
      168 -  for (const r of rows) {                                     
      169 -    console.log("  " + r.letter + "  " + r.correct + "/" + r.t
          -otal +                                                        
      170 -      (r.correct === r.total ? "  pass" : "  FAIL -> " + r.top
          -Confusion));                                                  
      166 +  // Run the gate across many jitter draws, not one.          
      167 +  //                                                          
      168 +  // A single draw is not evidence: letters consume the RNG in
          + key order, so a                                              
      169 +  // different subset gives every letter a different sample, a
          +nd a letter that                                              
      170 +  // sits on the M/N decision boundary can score 5/5 on one dr
          +aw and 4/5 on the                                             
      171 +  // next. Shipping on one lucky draw is exactly the mistake t
          +his whole                                                     
      172 +  // measurement exercise exists to avoid. A letter is adoptab
          +le only if it is                                              
      173 +  // 5/5 on EVERY seed.                                       
      174 +  const SEEDS = 12;                                           
      175 +  const failCount = {};                                       
      176 +  const confusedInto = {};                                    
      177 +  for (const k of keys) failCount[k] = 0;                     
      178 +                                                              
      179 +  for (let s = 0; s < SEEDS; s++) {                           
      180 +    const draw = generate(DEFS, 20260829 + s * 7919);         
      181 +    for (const k of keys) {                                   
      182 +      const samples = draw[k];                                
      183 +      for (let i = 0; i < samples.length; i++) {              
      184 +        const r = classify(draw, samples[i].normalized, k, i);
      185 +        if (r.letter !== k) {                                 
      186 +          failCount[k]++;                                     
      187 +          confusedInto[k] = confusedInto[k] || {};            
      188 +          confusedInto[k][r.letter] = (confusedInto[k][r.lette
          +r] || 0) + 1;                                                 
      189 +        }                                                     
      190 +      }                                                       
      191 +    }                                                         
      192    }
      172 -  const pass = failed.length === 0;                           
      193 +                                                              
      194 +  const total = SEEDS * SAMPLES;                              
      195 +  console.log("\nADOPTION GATE: 5/5 to itself on every one of 
          +" + SEEDS + " jitter draws");                                 
      196 +  console.log("letter   misclassified / " + total + "    into"
          +);                                                            
      197 +  const unstable = [];                                        
      198 +  for (const k of keys) {                                     
      199 +    const bad = failCount[k];                                 
      200 +    if (bad > 0) unstable.push(k);                            
      201 +    const into = confusedInto[k]                              
      202 +      ? Object.keys(confusedInto[k]).map(x => x + "x" + confus
          +edInto[k][x]).join(" ")                                       
      203 +      : "-";                                                  
      204 +    console.log("  " + k.padEnd(8) + String(bad).padStart(3) +
          + " / " + total + "            " + into);                      
      205 +  }                                                           
      206 +                                                              
      207 +  const pass = unstable.length === 0;                         
      208    console.log("\n" + (pass
      174 -    ? "GATE PASSED - all " + rows.length + " letters classify 
          -to themselves 5/5."                                           
      175 -    : "GATE FAILED (" + failed.length + "): " + failed.map(r =
          -> r.letter).join(" ")));                                      
      209 +    ? "GATE PASSED - all " + keys.length + " letters classify 
          +to themselves on every draw."                                 
      210 +    : "GATE FAILED (" + unstable.length + "): " + unstable.joi
          +n(" ") +                                                      
      211 +      " misclassify on at least one draw."));                 
      212    process.exitCode = pass ? 0 : 1;
      213    return;
      214  }

  Ran 1 shell command (ctrl+o to expand)
● Confirmed across 12 draws (60 samples/letter): N fails 1/60, everything else
  0/60. Let me check the obvious alternative and compute phrase impact.

  Ran 1 shell command (ctrl+o to expand)

● Decision is clear. Confirming nothing shipped changed, then re-running the
  suite.

  Called lens-studio 6 times, ran 1 shell command (ctrl+o to expand)

● Not adopted — the 18-letter set fails the gate on N. templates.synthetic.json
  is untouched at 6 letters (L U K E C O).

  The gate result

  Your instinct about the 1.5× ratio was right: switching to LOO accuracy admits
  M, R, S, T, V, which the ratio rejected while they classify perfectly. But it
  caught N.

  letter   misclassified / 60    into
    N         1 / 60            Mx1
    all 17 others               0 / 60

  One caveat that changed how I ran this. The first single-draw run also failed
  on N (4/5) — but N had scored 5/5 in the 24-letter run, which looked
  contradictory. It isn't: letters consume the RNG in key order, so generating
  18 letters gives every letter a different jitter sample than generating 24. A
  single draw is therefore not evidence, and shipping on one lucky draw is
  exactly the mistake this measurement exists to prevent. I parameterised the
  seed and made the gate run 12 independent draws (60 samples/letter). N still
  fails — once, marginally, into M. That is the honest answer: N sits on the M/N
  decision boundary, and which side a sample lands on is luck.

  Per your rule, one failure means keep the 6-letter set.

  The consequence you should see before deciding anything else

  The 18-letter set would have killed LUKE. U and K are both
  orientation-collision letters, so removing them removes the demo phrase:

  ┌────────────────┬──────────┬──────────────────────────────────────────────┐
  │      set       │ signable │                   phrases                    │
  ├────────────────┼──────────┼──────────────────────────────────────────────┤
  │ 6 (shipped)    │ 1/14     │ LUKE                                         │
  ├────────────────┼──────────┼──────────────────────────────────────────────┤
  │ 18 (candidate) │ 5/14     │ RIO, AR, CLAD, FRIEND, NAME — LUKE needs U,K │
  ├────────────────┼──────────┼──────────────────────────────────────────────┤
  │ 17 (minus N)   │ 3/14     │ RIO, AR, CLAD                                │
  └────────────────┴──────────┴──────────────────────────────────────────────┘

  Adopting 18 would have meant re-cutting the video shot list, the README hero
  image, and the demo narrative around RIO. Worth knowing that the trade isn't
  "6 letters → 18 letters", it's "LUKE → RIO plus four more words".

  The alternative, measured

  17 letters (18 minus N) passes cleanly — GATE PASSED - all 17 letters classify
  to themselves on every draw, exit 0. It costs FRIEND and NAME, leaving RIO,
  AR, CLAD. I did not adopt it, since your rule was explicit and it still trades
  LUKE away, but the measurement is there if you want it.

  LEAF suite — all 6 green

  alphabet-coverage · completes-word · low-confidence-never-commits ·
  interrupted-hold · wrong-letter-does-not-advance · no-spurious-double

  alphabet-coverage needed no update: it derives the RECOGNIZED bucket from
  getLoadedLetters() at runtime rather than hardcoding letters, so it asserts
  whatever ships and would have adapted automatically had the 18-set been
  adopted. The full-24 drift check also still exits 0, so the README and
  SEPARABILITY numbers remain accurate.

  Tool changes only (tools/); no shipped Assets data changed this turn.

✻ Brewed for 3m 56s

※ recap: We're shipping an ASL fingerspelling Lens for the CLAD hackathon; docs, tests and UI are done. The 18-letter template set failed its gate on N, so we kept the 6-letter set. Next: decide whether to commit and push the outstanding docs and test work.

> The video needs a K/P side-by-side to show the orientation collapse, but P    
  was dropped from                                                              
  templates.synthetic.json so the mock has no P pose to play.                   
                                                                                
  Add a demo-only path: let MockHandInput load a pose sequence from the         
  24-letter generator                                                           
  output (or a small separate fixture) WITHOUT adding those letters to the      
  Classifier's template                                                         
  set. The visualizer draws whatever vector it's given; the classifier's        
  candidate set stays at                                                        
  6 letters and unsignableLetters() still reports P as absent.                  
                                                                                
  Then produce a two-pose sequence -- K, then P -- so the capture shows the     
  identical rendered                                                            
  skeleton. Confirm the LEAF alphabet-coverage scenario still passes, since it  
  derives                                                                       
  RECOGNIZED from getLoadedLetters() and must not pick these up.                

  Ran 1 shell command (ctrl+o to expand)

● Building the demo fixture from the faithful model — K and P sample 0 are
  unjittered, so they should be byte-identical.

● Write(tools\gen-demo-poses.js)
  ⎿  Wrote 72 lines to tools\gen-demo-poses.js
       1 // Writes Assets/Data/poses.demo.json — a DISPLAY-ONLY pose sequ
       2 //
         Classifier and
       4 // must never be wired to SignBridge's templatesAsset. It exists
       5 // play handshapes the classifier does not know, in order to SHO
       6 // rather than assert one.
       8 // The sequence is K then P. In ASL these differ only by wrist r
         otation, and
         rientation is
         efore share one
     … +86 lines (ctrl+o to expand)

  Ran 1 shell command (ctrl+o to expand)

● Byte-identical vectors. Now the decoupled load path in SignBridge.

● Update(Assets\Scripts\SignBridge.ts)
  ⎿  Added 5 lines
      75    @allowUndefined
      76    @hint("Optional. Draws the exact feature vector the classifie
          r scores, as a hand between the panels.")
      77    handVisualizer: HandVisualizer
      78 +                                                               
      79 +  @input                                                       
      80 +  @allowUndefined                                              
      81 +  @hint("DEMO ONLY. A display-only pose file (Assets/Data/poses
         +.demo.json) for the mock to replay INSTEAD of the templates. It
         +s letters are NOT added to the classifier — they stay unrecogni
         +zed on purpose. Leave unwired for normal runs.")               
      82 +  demoPoseAsset: Asset                                         
      83    @ui.group_end
      84  
      85    @ui.group_start("Audio")

● Update(Assets\Scripts\SignBridge.ts)
  ⎿  Added 26 lines, removed 1 line
      298  
      299      // Drive the mock from the same templates, so the Editor r
           eplays the exact
      300      // poses the classifier was loaded with.
      301 +    //                                                        
      302 +    // DEMO PATH: when demoPoseAsset is wired the mock replays
          + THAT instead. The                                            
      303 +    // classifier is deliberately not told about those poses —
          + this is how a                                                
      304 +    // handshape the Lens cannot recognize gets played on came
          +ra, so a                                                      
      305 +    // limitation can be shown rather than merely described. T
          +he separation is                                              
      306 +    // the whole point: loadTemplates() above has already run 
          +against                                                       
      307 +    // templatesAsset and is not touched here, so the candidat
          +e set, the phrase                                             
      308 +    // gating and unsignableLetters() all stay exactly as they
          + were.                                                        
      309      if (this.mockHandInput) {
      302 -      this.mockHandInput.loadFromTemplates(parsed, {framesPerP
          -ose: 30, gapFrames: 12})                                      
      310 +      let poses = parsed                                      
      311 +      let source = "templates"                                
      312 +      if (this.demoPoseAsset) {                               
      313 +        const demo = this.readTemplatesAsset(this.demoPoseAsse
          +t, "demoPoseAsset")                                           
      314 +        if (demo !== null) {                                  
      315 +          poses = demo                                        
      316 +          source = "DEMO POSES"                               
      317 +        }                                                     
      318 +      }                                                       
      319 +      this.mockHandInput.loadFromTemplates(poses, {framesPerPo
          +se: 30, gapFrames: 12})                                       
      320 +      if (source !== "templates") {                           
      321 +        const shown = letterKeys(poses).join(",")             
      322 +        print(                                                
      323 +          "SignBridge: mock is replaying DEMO POSES (" + shown
          + + "), not the template set. " +                              
      324 +            "The classifier still knows only [" + this.classif
          +ier.loadedLetters().join(",") + "] — " +                      
      325 +            "anything else is drawn but unrecognized, by desig
          +n. Unwire demoPoseAsset for a normal run."                    
      326 +        )                                                     
      327 +      }                                                       
      328      }
      329  
      330      this.ready = true

  Called lens-studio 4 times, ran 2 shell commands (ctrl+o to expand)

● Exactly the separation intended — classifier still [C,E,K,L,O,U], phrase still
  LUKE [1/1], mock replaying K,P. Now the critical check.

  Called lens-studio (ctrl+o to expand)

● Passes — P still absent from RECOGNIZED. Let me capture the demo sequence.

  Read 2 files, called lens-studio 4 times, ran 3 shell commands (ctrl+o to expand)

● Both frames show an identical skeleton. Confirming the rest of the suite is
  unaffected.

  Called lens-studio 2 times (ctrl+o to expand)

● K step (left) and P step (right) from the demo sequence. Identical skeleton —
  the only differences are the confidence bar fill and the resulting hand tint,
  because the hold window resets across the gap between poses.

  ›       ~\AppData\Local\Temp\claude\C--Users-Raol-Documents-SPECS-ASL- (676.9K
  [image] Helper\01f60bc4-e254-4cec-8de0-7f8ba4771284\scratchpad\pose_K.B)
          png
  ›       ~\AppData\Local\Temp\claude\C--Users-Raol-Documents-SPECS-ASL- (676.7K
  [image] Helper\01f60bc4-e254-4cec-8de0-7f8ba4771284\scratchpad\pose_P.B)
          png

● Demo path built and the separation holds.

  The fixture

  tools/gen-demo-poses.js → Assets/Data/poses.demo.json, containing K and P from
  the faithful 24-letter model at sample 0 (unjittered). The tool proves its
  own premise rather than asserting it:

  K vs P  max per-dim difference : 0.000e+0
  K vs P  euclidean distance     : 0.000e+0
  IDENTICAL — the two poses are the same vector, so the skeleton draws the same
  hand twice.

  It exits non-zero if that ever stops being true, so the demo can't silently
  start showing two different hands.

  The decoupling

  New optional demoPoseAsset on SignBridge. loadTemplates() still runs against
  templatesAsset and is untouched; only the mock's playback source is swapped.
  Runtime confirms the separation:

  SignBridge: loaded 6 letters / 30 samples
  MockHandInput: loaded 2 letters from templates (4 steps)
  SignBridge: mock is replaying DEMO POSES (K,P), not the template set.
    The classifier still knows only [C,E,K,L,O,U] — anything else is drawn
    but unrecognized, by design. Unwire demoPoseAsset for a normal run.
  SignBridge: phrase 'LUKE' [1/1] signing at 0 mistakes=0

  Candidate set unchanged, phrase gating unchanged, P still absent.

  signbridge-alphabet-coverage passes with the demo asset wired — it derives
  RECOGNIZED from getLoadedLetters(), which reads the classifier, not the mock,
  so the demo poses can't leak into the assertion. completes-word and
  no-spurious-double also pass (playScript builds poses from templatesAsset, so
  it's unaffected by the mock sequence).

  I also factored the asset parsing into readTemplatesAsset(asset, label) so
  both paths report errors under their own input name rather than one blaming
  the other.

  What the capture actually shows

  Both frames above are the same skeleton, joint for joint. The only differences
  are the bar (27% vs 6%) and the tint that follows it — progress drops between
  them because the hold window clears across the untracked gap, which is itself
  evidence the two frames are different steps rather than one step captured
  twice.

  Worth noting: the classifier returns U for both, at 27% and 6% confidence. It
  doesn't claim K or P — it can't, since neither the faithful K nor P matches
  the shipped (old-generator) K template, and low confidence is the correct
  response to a pose it doesn't have.

  One thing that will bite you on camera

  You cannot tell from the render which letter is playing — that's precisely the
  point being demonstrated, but it means the two shots are visually
  indistinguishable, so the video needs an external caption ("now K" / "now P")
  for the point to land. Otherwise it just looks like the same clip twice.

  If you'd rather the Lens carry that itself, MockHandInput.currentLabel()
  already returns "K" / "P", and SignBridge could surface it on the inward
  panel's status line while demoPoseAsset is wired — a self-labelling shot, no
  caption needed. Small change; say the word and I'll add it.

  Everything this turn is uncommitted: tools/gen-demo-poses.js,
  Assets/Data/poses.demo.json, the SignBridge edits, and the scene wiring.

✻ Churned for 4m 3s
※ recap: You're shipping the ASL fingerspelling Lens for the CLAD hackathon, and I just built the K/P demo path proving the orientation collapse on camera. Next: decide whether the Lens should label which pose is playing, since the two shots look identical.

> Surface MockHandInput.currentLabel() on the inward panel's status line, but   
  ONLY while                                                                    
  demoPoseAsset is wired -- so a normal run is unchanged and this can't leak    
  into the shipped                                                              
  experience.                                                                   
                                                                                
  Something like "DEMO POSE: K" so it reads unambiguously as the input label,   
  not as a                                                                      
  classification result. That distinction matters: the classifier returns U at  
  low confidence                                                                
  for both poses, and the shot must not look like the Lens is claiming to       
  recognize K.                                                                  

  Ran 2 shell commands (ctrl+o to expand)

● Now the change — view field, panel rendering, and the bridge only populating
  it in demo mode.

● Update(Assets\Scripts\SignPanel.ts)
  ⎿  Added 14 lines
      123    wrongSigned: string | null
      124    /** Letter that was expected during a wrong-letter flash, el
           se null. */
      125    wrongExpected: string | null
      126 +                                                              
      127 +  /**                                                         
      128 +   * DEMO ONLY. Label of the pose being INJECTED this frame, n
          +ever a                                                        
      129 +   * classification result.                                   
      130 +   *                                                          
      131 +   * Null on every normal run, which is the entire point — Sig
          +nBridge populates                                             
      132 +   * it only while `demoPoseAsset` is wired, so this cannot re
          +ach the shipped                                               
      133 +   * experience. When set it takes over the status line and is
          + rendered as                                                  
      134 +   * "DEMO POSE: X", deliberately worded so a viewer reads it 
          +as the input being                                            
      135 +   * fed in rather than as something the Lens recognized. The 
          +classifier's own                                              
      136 +   * reading of these poses is a low-confidence U, and a shot 
          +that let that sit                                             
      137 +   * next to a "K" would imply a recognition the Lens is not m
          +aking.                                                        
      138 +   */                                                         
      139 +  demoLabel?: string | null                                   
      140  }
      141  
      142  /**

● Update(Assets\Scripts\SignPanel.ts)
  ⎿  Added 10 lines
      441      // After the wrong-letter branch: setProgress leaves the s
           tatus line alone
      442      // while a flash owns it.
      443      this.setProgress(view.progress, view.candidate)
      444 +                                                              
      445 +    // Demo override, last so it wins the status line outright
          +. In demo mode the                                            
      446 +    // line's job is to name the INPUT, and a flash or a candi
          +date readout                                                  
      447 +    // sharing it would reintroduce exactly the ambiguity the 
          +label exists to                                               
      448 +    // remove. Panels with showStatusLine off — the outward on
          +e — have no                                                   
      449 +    // statusText and are untouched.                          
      450 +    if (view.demoLabel !== undefined && view.demoLabel !== nul
          +l && this.statusText) {                                       
      451 +      this.statusText.text = "DEMO POSE: " + view.demoLabel   
      452 +      this.statusText.textFill.color = this.captionColor      
      453 +    }                                                         
      454    }
      455  
      456    // ---------------------------------------------------------
           ----------------

  Ran 1 shell command (ctrl+o to expand)

● Update(Assets\Scripts\SignBridge.ts)
  ⎿  Added 24 lines, removed 1 line
      414        progress: holdState.progress,
      415        candidate: holdState.candidate,
      416        wrongSigned: isWrong ? phraseState.wrongLetter : null,
      417 -      wrongExpected: isWrong ? phraseState.currentLetter : nul
          -l                                                             
      417 +      wrongExpected: isWrong ? phraseState.currentLetter : nul
          +l,                                                            
      418 +      demoLabel: this.currentDemoLabel()                      
      419      }
      420    }
      421  
      422    /**
      423 +   * The pose label to print on the status line, or null on an
          +y normal run.                                                 
      424 +   *                                                          
      425 +   * Gated on `demoPoseAsset` being wired — not on a debug fla
          +g or on whether a                                             
      426 +   * mock happens to be present — so the shipped experience ca
          +nnot show this                                                
      427 +   * even if a MockHandInput is left in the scene by accident.
      428 +   *                                                          
      429 +   * Returns null on untracked frames too: the mock labels its
          + gap steps "gap",                                             
      430 +   * and printing "DEMO POSE: gap" while no hand is drawn woul
          +d be noise.                                                   
      431 +   */                                                         
      432 +  private currentDemoLabel(): string | null {                 
      433 +    if (!this.demoPoseAsset || !this.mockHandInput) {         
      434 +      return null                                             
      435 +    }                                                         
      436 +    const active = getActiveHandFeatureSource()               
      437 +    if (active === null || !active.isTracked()) {             
      438 +      return null                                             
      439 +    }                                                         
      440 +    const label = active.currentLabel()                       
      441 +    return label && label !== "gap" && label !== "untracked" ?
          + label : null                                                 
      442 +  }                                                           
      443 +                                                              
      444 +  /**                                                         
      445     * What the reader sees: everything resolved so far. A skipp
           ed letter is still
      446     * shown — the reader wants the word, not an audit of how it
            was produced.
      447     */

  Called lens-studio 3 times, ran 1 shell command (ctrl+o to expand)

● DEMO POSE: K. Now the P step.

  Called lens-studio, ran 1 shell command (ctrl+o to expand)

● Landed on a gap frame — label correctly suppressed and hand hidden, which
  validates that path. Capturing again for P.

  Called lens-studio (ctrl+o to expand)

● DEMO POSE: P — identical skeleton, identical bar, only the label differs. Now
  the critical check: that a normal run is untouched.

  Called lens-studio 3 times, ran 1 shell command (ctrl+o to expand)

● Normal run confirmed — loaded 6 letters from templates (12 steps), no demo
  line. Verifying the status line visually.

  Called lens-studio (ctrl+o to expand)

● Both states verified. Running the suite after the panel change.

  Called lens-studio 2 times (ctrl+o to expand)

● Done. The shot now labels itself.

  What it looks like

  Two frames from the sequence — identical skeleton, identical bar, identical
  everything except one line:

  SIGNING                 SIGNING
    L U K E                 L U K E
    [====        ]          [====        ]
  DEMO POSE: K            DEMO POSE: P

  The wording is deliberate: DEMO POSE: names the input being injected, so it
  can't be read as a recognition claim. The classifier's own answer for both
  poses is U at low confidence, and the demo label takes over the status line
  outright rather than sharing it — a U 27% readout sitting next to a K label
  would reintroduce exactly the ambiguity you're guarding against.

  How it's gated

  private currentDemoLabel(): string | null {
    if (!this.demoPoseAsset || !this.mockHandInput) return null
    const active = getActiveHandFeatureSource()
    if (active === null || !active.isTracked()) return null
    const label = active.currentLabel()
    return label && label !== "gap" && label !== "untracked" ? label : null
  }

  Gated on demoPoseAsset being wired — not on a debug flag, not on a mock merely
  being present in the scene — so a stray MockHandInput can't surface it.
  demoLabel is optional on SignPanelView and null on every normal run.

  It also lands inward-only for free: the outward panel has showStatusLine: 
  false and therefore no statusText, so the demo label is structurally incapable
  of reaching the reader-facing surface.

  Verified both ways, not just the happy one

  ┌─────────────────┬───────────────────────────────────────────────────────┐
  │      state      │                        result                         │
  ├─────────────────┼───────────────────────────────────────────────────────┤
  │ demoPoseAsset   │ DEMO POSE: K / DEMO POSE: P, identical skeletons      │
  │ wired           │                                                       │
  ├─────────────────┼───────────────────────────────────────────────────────┤
  │ gap frame       │ label suppressed, hand hidden — no DEMO POSE: gap     │
  │ between poses   │ noise                                                 │
  ├─────────────────┼───────────────────────────────────────────────────────┤
  │ demoPoseAsset   │ MockHandInput: loaded 6 letters from templates (12    │
  │ unwired         │ steps), status line back to the normal wrong-letter   │
  │                 │ flash signed E — expected K, no demo line anywhere    │
  └─────────────────┴───────────────────────────────────────────────────────┘

  The gap case was worth catching: the mock labels its untracked steps "gap",
  and without the filter the panel would have read DEMO POSE: gap against an
  empty space.

  alphabet-coverage and wrong-letter-does-not-advance both pass — the latter
  matters because the demo label writes to the same statusText the flash owns.

  One thing I decided, so you can overrule it

  I left demoPoseAsset unwired. Your framing was that this must not leak into
  the shipped experience, and the worst outcome is submitting a Lens stuck in
  demo mode playing only K and P. So the committed default is the normal run.

  To turn it on for recording, set it in the Inspector, or:

  demoPoseAsset → Assets/Data/poses.demo.json

  Every run in demo mode prints a loud reminder naming the poses and the real
  candidate set, so it's hard to forget you're in it.

  Uncommitted: tools/gen-demo-poses.js, Assets/Data/poses.demo.json, the
  SignPanel/SignBridge edits, and the scene wiring.

✻ Sautéed for 3m 3s

※ recap: You're shipping the ASL fingerspelling Lens for the CLAD hackathon, and the K/P demo shot is now built and self-labelling. Next: wire demoPoseAsset to poses.demo.json, record the video, then commit the docs and demo work.

> Add a reference hand. Instantiate a second HandVisualizer fed the template    
  vector for                                                                    
  PhraseController's current target letter (templates[letter][0]) instead of    
  the live feature                                                              
  source. Update it when the target advances.                                   
                                                                                
  Make it visually unmistakable as the TARGET, not the user's hand -- dimmer,   
  cooler tint, or                                                               
  thinner bones. The two must never be confusable at a glance.                  
                                                                                
  Place it beside the live hand, both in the gap between the panels, with       
  enough separation to                                                          
  read as two hands rather than one doubled.                                    
                                                                                
  Colour it by match quality using the classifier's distance to that specific   
  letter -- so as the                                                           
  user's hand approaches the target pose, the reference responds. That makes    
  "you're getting                                                               
  closer" visible on the thing they're copying.                                 
                                                                                
  Keep it optional via an @input, defaulting on, so it can be disabled for the  
  K/P shot.                                                                     

  Ran 1 shell command (ctrl+o to expand)

● Factoring the pose drawing out so a reference path can reuse it.

● Update(Assets\Scripts\HandVisualizer.ts)
  ⎿  Added 44 lines
      317        this.visible = true
      318      }
      319  
      320 +    this.drawPose(features)                                   
      321 +    this.applyColor(hold)                                     
      322 +  }                                                           
      323 +                                                              
      324 +  /**                                                         
      325 +   * Draw a fixed pose tinted by how well the live hand matche
          +s it — the                                                    
      326 +   * REFERENCE path.                                          
      327 +   *                                                          
      328 +   * Deliberately separate from render(): a reference hand sho
          +ws a target, not                                              
      329 +   * an input, so it must never take its colour from HoldBuffe
          +r state. Its                                                  
      330 +   * colour answers one question only — how close is the user'
          +s hand to THIS                                                
      331 +   * pose — and it has no commit pulse, because a reference ha
          +nd cannot commit.                                             
      332 +   *                                                          
      333 +   * @param features the target letter's template vector      
      334 +   * @param quality 0 = far from this pose, 1 = on it         
      335 +   */                                                         
      336 +  renderReference(features: ArrayLike<number> | null, quality:
          + number): void {                                              
      337 +    if (this.rig === null) {                                  
      338 +      return                                                  
      339 +    }                                                         
      340 +    const usable = features !== null && features.length >= LAN
          +DMARK_COUNT * 3                                               
      341 +    if (!usable) {                                            
      342 +      if (this.visible) {                                     
      343 +        this.rig.enabled = false                              
      344 +        this.visible = false                                  
      345 +      }                                                       
      346 +      return                                                  
      347 +    }                                                         
      348 +    if (!this.visible) {                                      
      349 +      this.rig.enabled = true                                 
      350 +      this.visible = true                                     
      351 +    }                                                         
      352 +                                                              
      353 +    this.drawPose(features)                                   
      354 +                                                              
      355 +    const q = quality < 0 ? 0 : quality > 1 ? 1 : quality     
      356 +    const color = mixColor(this.matchFarColor, this.matchNearC
          +olor, q)                                                      
      357 +    this.jointMaterial.mainPass.baseColor = color             
      358 +    const d = this.boneDimming                                
      359 +    this.boneMaterial.mainPass.baseColor = new vec4(color.x * 
          +d, color.y * d, color.z * d, color.w)                         
      360 +  }                                                           
      361 +                                                              
      362 +  /** Write one 78-dim vector into the joint and bone transfor
          +ms. */                                                        
      363 +  private drawPose(features: ArrayLike<number>): void {       
      364      const s = this.handScale
      365      // middleKnuckle sits at (0,1,0) in normalized space; subt
           racting it centres
      366      // the hand on the rig origin instead of hanging it off th
           e wrist.

● Update(Assets\Scripts\HandVisualizer.ts)  ⎿  Removed 2 lines
      401        t.setLocalRotation(quat.rotationFromTo(this.up, new vec3
           (dx / length, dy / length, dz / length)))
      402        t.setLocalScale(new vec3(thick, length, thick))
      403      }
      404 -                                                              
      405 -    this.applyColor(hold)                                     
      404    }
      405  
      406    private applyColor(hold: HoldState): void {

● Update(Assets\Scripts\HandVisualizer.ts)
  ⎿  Added 12 lines
      202    boneDimming: number = 0.55
      203    @ui.group_end
      204  
      205 +  @ui.group_start("Reference hand colour")                    
      206 +  @input                                                      
      207 +  @widget(new ColorWidget())                                  
      208 +  @hint("REFERENCE INSTANCE ONLY. Colour when the live hand is
          + far from this pose. Keep it dim and cool so the reference nev
          +er competes with the live hand for attention.")               
      209 +  matchFarColor: vec4 = new vec4(0.30, 0.42, 0.52, 0.55)      
      210 +                                                              
      211 +  @input                                                      
      212 +  @widget(new ColorWidget())                                  
      213 +  @hint("REFERENCE INSTANCE ONLY. Colour when the live hand is
          + on this pose. The reference brightening is the 'you're gettin
          +g closer' signal.")                                           
      214 +  matchNearColor: vec4 = new vec4(0.35, 0.95, 0.85, 1)        
      215 +  @ui.group_end                                               
      216 +                                                              
      217    @ui.group_start("Behaviour")
      218    @input
      219    @hint("Hide the rig on untracked frames. On means the gaps i
           n the input are visible as gaps — recommended, since the point
            is to show the real input.")

● Now the SignBridge side — target tracking and match quality.

● Update(Assets\Scripts\SignBridge.ts)
  ⎿  Added 9 lines
      78  
      79    @input
      80    @allowUndefined
      81 +  @hint("Optional. A SECOND HandVisualizer showing the target l
         +etter's template pose — what the signer is copying. Style it di
         +mmer and thinner than the live hand so the two are never confus
         +able.")                                                        
      82 +  referenceHandVisualizer: HandVisualizer                      
      83 +                                                               
      84 +  @input                                                       
      85 +  @hint("Show the reference (target) hand. Turn off for the K/P
         + orientation shot, where a second hand would distract from the 
         +two live poses being identical.")                              
      86 +  showReferenceHand: boolean = true                            
      87 +                                                               
      88 +  @input                                                       
      89 +  @allowUndefined                                              
      90    @hint("DEMO ONLY. A display-only pose file (Assets/Data/poses
          .demo.json) for the mock to replay INSTEAD of the templates. It
          s letters are NOT added to the classifier — they stay unrecogni
          zed on purpose. Leave unwired for normal runs.")
      91    demoPoseAsset: Asset
      92    @ui.group_end

● Update(Assets\Scripts\SignBridge.ts)
  ⎿  Added 5 lines
      387          this.handVisualizer.render(features, this.holdBuffer.g
           etState(), committed, dt)
      388        }
      389  
      390 +      // After submit(), so a commit that advances the target 
          +updates the                                                   
      391 +      // reference in the SAME frame the letter turns green — 
          +otherwise the                                                 
      392 +      // signer sees the old target for one frame after succee
          +ding at it.                                                   
      393 +      this.updateReferenceHand(features)                      
      394 +                                                              
      395        if (committed !== null) {
      396          // Fired from the commit EVENT, not from watching comm
           itted-letter state
      397          // change — same rule as the HandVisualizer pulse. Sig
           ning the same

  Ran 1 shell command (ctrl+o to expand)

● Update(Assets\Scripts\SignBridge.ts)
  ⎿  Removed 5 lines
      387          this.handVisualizer.render(features, this.holdBuffer.g
           etState(), committed, dt)
      388        }
      389  
      390 -      // After submit(), so a commit that advances the target 
          -updates the                                                   
      391 -      // reference in the SAME frame the letter turns green — 
          -otherwise the                                                 
      392 -      // signer sees the old target for one frame after succee
          -ding at it.                                                   
      393 -      this.updateReferenceHand(features)                      
      394 -                                                              
      390        if (committed !== null) {
      391          // Fired from the commit EVENT, not from watching comm
           itted-letter state
      392          // change — same rule as the HandVisualizer pulse. Sig
           ning the same

● Update(Assets\Scripts\SignBridge.ts)
  ⎿  Added 5 lines
      405            }
      406          }
      407        }
      408 +                                                              
      409 +      // Last, and deliberately AFTER submit(): a commit that 
          +advances the                                                  
      410 +      // target must move the reference hand in the same frame
          + the letter turns                                             
      411 +      // green, or the signer is shown the letter they just fi
          +nished.                                                       
      412 +      this.updateReferenceHand(features)                      
      413      }
      414  
      415      updateSignPanels([this.inwardPanel, this.outwardPanel], th
           is.buildView())

● Now the reference update method itself.

● Update(Assets\Scripts\SignBridge.ts)
  ⎿  Added 70 lines
      260      this.phrases.setAutoAdvanceSeconds(advance)
      261    }
      262  
      263 +  /**                                                         
      264 +   * Draw the target letter's template pose, tinted by how clo
          +se the live hand                                              
      265 +   * is to it.                                                
      266 +   *                                                          
      267 +   * The pose comes from `templates[letter][0]` — the same arr
          +ay the classifier                                             
      268 +   * scores against — so the reference hand is literally the t
          +hing being                                                    
      269 +   * matched, not an illustration of it.                      
      270 +   *                                                          
      271 +   * MATCH QUALITY. Raw distance is meaningless on its own: 0.
          +6 is close for one                                            
      272 +   * letter and far for another, because letters sit at differ
          +ent densities in                                              
      273 +   * the feature space. So it is normalized against that lette
          +r's own                                                       
      274 +   * nearest-other-letter distance — the point at which some o
          +ther letter                                                   
      275 +   * becomes the better answer. quality 1 means "on the pose",
          + quality 0 means                                              
      276 +   * "far enough that another letter wins". That makes the bri
          +ghtening mean the                                             
      277 +   * same thing for every letter.                             
      278 +   *                                                          
      279 +   * The scale is cached per target letter, since nearestOther
          +Distance() walks                                              
      280 +   * every template pair and must not run per frame.          
      281 +   */                                                         
      282 +  private updateReferenceHand(features: ArrayLike<number> | nu
          +ll): void {                                                   
      283 +    if (!this.referenceHandVisualizer) {                      
      284 +      return                                                  
      285 +    }                                                         
      286 +    if (!this.showReferenceHand || this.templates === null) { 
      287 +      this.referenceHandVisualizer.renderReference(null, 0)   
      288 +      return                                                  
      289 +    }                                                         
      290 +                                                              
      291 +    const target = this.phrases.getState().currentLetter      
      292 +    if (target === null) {                                    
      293 +      // Phrase complete or idle: nothing to copy, so show not
          +hing.                                                         
      294 +      this.referenceHandVisualizer.renderReference(null, 0)   
      295 +      this.referenceLetter = null                             
      296 +      return                                                  
      297 +    }                                                         
      298 +                                                              
      299 +    if (target !== this.referenceLetter) {                    
      300 +      this.referenceLetter = target                           
      301 +      this.referencePose = this.poseFor(target)               
      302 +      const scale = this.nearestOtherDistance(target)         
      303 +      // Guard the degenerate case: a single loaded letter has
          + no "other", and                                              
      304 +      // an orientation-collision partner sits at distance 0. 
          +Either would make                                             
      305 +      // the quality ramp divide by zero and flicker.         
      306 +      this.referenceScale = scale > 1e-4 && isFinite(scale) ? 
          +scale : 1                                                     
      307 +    }                                                         
      308 +                                                              
      309 +    if (this.referencePose === null) {                        
      310 +      this.referenceHandVisualizer.renderReference(null, 0)   
      311 +      return                                                  
      312 +    }                                                         
      313 +                                                              
      314 +    let quality = 0                                           
      315 +    if (features !== null) {                                  
      316 +      const d = this.distanceTo(features, this.referencePose) 
      317 +      quality = 1 - d / this.referenceScale                   
      318 +    }                                                         
      319 +    this.referenceHandVisualizer.renderReference(this.referenc
          +ePose, quality)                                               
      320 +  }                                                           
      321 +                                                              
      322 +  /** Euclidean distance between a live feature vector and a t
          +emplate pose. */                                              
      323 +  private distanceTo(a: ArrayLike<number>, b: ArrayLike<number
          +>): number {                                                  
      324 +    const n = Math.min(a.length, b.length)                    
      325 +    let sum = 0                                               
      326 +    for (let i = 0; i < n; i++) {                             
      327 +      const d = a[i] - b[i]                                   
      328 +      sum += d * d                                            
      329 +    }                                                         
      330 +    return Math.sqrt(sum)                                     
      331 +  }                                                           
      332 +                                                              
      333    /** Parse a JsonAsset into a TemplatesFile, or null with a n
           amed error. */
      334    private readTemplatesAsset(asset: Asset, label: string): Tem
           platesFile | null {
      335      try {

  Ran 1 shell command (ctrl+o to expand)

● Update(Assets\Scripts\SignBridge.ts)
  ⎿  Added 7 lines
      173  
      174    private ready = false
      175  
      176 +  // Reference-hand state. The pose and its distance scale are
          + recomputed only                                              
      177 +  // when the target letter changes — nearestOtherDistance() w
          +alks every                                                    
      178 +  // template pair and has no business running per frame.     
      179 +  private referenceLetter: string | null = null               
      180 +  private referencePose: number[] | null = null               
      181 +  private referenceScale = 1                                  
      182 +                                                              
      183    onAwake() {
      184      // getHand belongs in onAwake. Nothing here subscribes to 
           a SIK event, so
      185      // there is no .add() that needs deferring to OnStartEvent
           .

  Called lens-studio (ctrl+o to expand)

● Scene: second visualizer with its own materials, and both hands offset to read
  as a pair.

  Called lens-studio 2 times (ctrl+o to expand)

● Two visualizers built, no errors. Let me look at it.

  Called lens-studio (ctrl+o to expand)

● Two clearly distinct hands. Let me verify the quality ramp numerically rather
  than trusting the colour.

  Ran 1 shell command (ctrl+o to expand)

● The ramp is correct but degenerate in the Editor: quality is only ever exactly
  1.00 or 0.00, because the mock replays template samples verbatim — so
  "getting closer" is invisible. Fixing the falloff.

● Update(Assets\Scripts\SignBridge.ts)
  ⎿  Added 12 lines, removed 1 line
      321      let quality = 0
      322      if (features !== null) {
      323        const d = this.distanceTo(features, this.referencePose)
      324 -      quality = 1 - d / this.referenceScale                   
      324 +      // Exponential falloff, not a linear ramp clamped at the
          + scale.                                                       
      325 +      //                                                      
      326 +      // A linear `1 - d/scale` is degenerate in practice: mea
          +sured against the                                             
      327 +      // shipped templates it returns exactly 1.00 when the po
          +se matches and                                                
      328 +      // exactly 0.00 for every other letter, because every in
          +ter-letter                                                    
      329 +      // distance already exceeds the scale. That makes the re
          +ference hand a                                                
      330 +      // binary light rather than the "you are getting closer"
          + signal it is for.                                            
      331 +      //                                                      
      332 +      // This halves brightness every `scale` of distance, so 
          +quality is 1 on                                               
      333 +      // the pose, 0.5 at the point another letter becomes equ
          +ally good, and                                                
      334 +      // fades smoothly beyond — always non-zero, always movin
          +g.                                                            
      335 +      quality = Math.exp(-Math.LN2 * (d / this.referenceScale)
          +)                                                             
      336      }
      337      this.referenceHandVisualizer.renderReference(this.referenc
           ePose, quality)
      338    }

  Ran 1 shell command (ctrl+o to expand)

● Real gradient now — 1.00 on the pose, exactly 0.50 where another letter
  becomes equally good, tapering after. Recompiling and checking on screen.

  Called lens-studio 3 times (ctrl+o to expand)

● Two hands, unmistakably different weights and tints, reading as a pair.
  Running the suite.

  Called lens-studio 3 times (ctrl+o to expand)
● Reference hand is in and driven by real match quality.

  What was built

  A second HandVisualizer instance, ReferenceHand, fed templates[letter][0] for
  PhraseController's current target — the same array the classifier scores
  against, so it's literally the thing being matched rather than an illustration
  of it.

  New renderReference(features, quality) path on HandVisualizer, deliberately
  separate from render(): a reference hand shows a target, not an input, so it
  must never take colour from HoldBuffer state and has no commit pulse — a
  reference hand can't commit. The pose-writing code is factored into a shared
  drawPose() so both paths draw identically.

  Updated after phrases.submit(), so a commit that advances the target moves the
  reference in the same frame the letter turns green, instead of showing the
  letter you just finished for one extra frame.

  Distinguishing the two

  ┌───────────┬────────────────────────┬────────────────────────────────────┐
  │           │       live hand        │             reference              │
  ├───────────┼────────────────────────┼────────────────────────────────────┤
  │ joints    │ 0.38 cm                │ 0.24 cm                            │
  ├───────────┼────────────────────────┼────────────────────────────────────┤
  │ bones     │ 0.23 cm                │ 0.12 cm                            │
  ├───────────┼────────────────────────┼────────────────────────────────────┤
  │ tint      │ warm amber / green     │ cool cyan, dim at low match        │
  ├───────────┼────────────────────────┼────────────────────────────────────┤
  │ materials │ HandJointMat /         │ separate RefHandJointMat /         │
  │           │ HandBoneMat            │ RefHandBoneMat                     │
  └───────────┴────────────────────────┴────────────────────────────────────┘

  Separate materials matter — sharing them would have tinted both hands
  identically and defeated the whole thing. Positions moved to x = −9 (live) and
  x = +9 (reference), 18 cm apart in the same panel gap.

  The match ramp — and a fix it needed

  Distance alone is meaningless across letters, so quality is normalised against
  that letter's own nearest-other-letter distance: the point where a different
  letter becomes the better answer. Same meaning for every letter.

  My first implementation was 1 − d/scale, and measuring it against the shipped
  templates showed it was degenerate — exactly 1.00 on the pose and exactly 0.00
  for every other letter, because every inter-letter distance already exceeds
  the scale. That's a binary light, not the "getting closer" signal you asked
  for. Replaced with an exponential falloff, 2^(−d/scale):

  target U  scale=0.852
     U  d=0.000  quality=1.000
     K  d=0.852  quality=0.500     <- another letter is now equally good
     E  d=1.597  quality=0.273
     L  d=1.762  quality=0.238
     C  d=2.093  quality=0.182

  Halves every scale of distance: 1 on the pose, 0.5 at the crossover, always
  non-zero and always moving.

  Worth flagging: in the Editor the mock replays template samples verbatim, so
  the live hand teleports between exact poses rather than sweeping toward them.
  You'll see the reference step between brightness levels, not glide. On
  hardware, a hand physically approaching a pose sweeps the intermediate
  distances and it will glide.

  Optional, defaulting on

  showReferenceHand (@input, default true). Turning it off calls
  renderReference(null, 0), which hides the rig — so for the K/P shot you get
  the single live hand with nothing competing for attention. It also hides
  itself automatically when the phrase completes, since there's no letter left
  to copy.

  alphabet-coverage, completes-word and no-spurious-double all pass — the first
  is the real stress test, since it restarts and changes target 6 times,
  exercising the cached-scale invalidation path.

  Uncommitted, along with everything from the last several turns.

✻ Sautéed for 4m 38s

※ recap: We're building the ASL fingerspelling Lens for the CLAD hackathon, and just added a reference target hand beside the live one, driven by match quality. Everything passes but nothing since commit 994d324 is committed yet, so committing and pushing is next.

> Diagnose the confidence bar before changing it. In the inward SignPanel at    
  runtime, print for                                                            
  both BarTrack and BarFill:                                                    
                                                                                
  - getTransform().getLocalPosition() and getWorldPosition()                    
  - the BackPlate's .size                                                       
  - the parent FlexItem's resolved rect/size                                    
  - panelWidth, padding, inner, and barWidth as computed at                     
  SignPanel.ts:393-397                                                          
                                                                                
  Two hypotheses to separate:                                                   
                                                                                
  1. The FlexItem's local origin is its edge, not its centre -- the same        
  structure flagged on the                                                      
     header at SignPanel.ts:396 and :405, where both plates are plain children  
  at (0,0,0). A                                                                 
     BackPlate is centre-anchored, so it would land half a width off.           
  2. The flex child is created at width inner while the plates are sized        
  barWidth = inner*0.72.                                                        
     inner/2 on a 40cm panel is close to the observed ~18cm offset.             
                                                                                
  Report the numbers before proposing a fix. If (1) holds, apply the skill's    
  pattern -- put a                                                              
  FlexItem on the plate object itself rather than parenting a plain child --    
  rather than                                                                   
  hand-tuning an offset, since a magic offset would break at a different        
  panelWidth.                                                                   

● Before I add anything: two turns ago I retracted the offset claim after
  runtime bounds showed the geometry was correct. But you've asked for a fuller
  measurement, and it will settle it definitively — so let me take it. First,
  what's actually at the cited lines now.

  Ran 1 shell command (ctrl+o to expand)

● Adding a temporary diagnostic that prints exactly what you asked for.

● Update(Assets\Scripts\SignPanel.ts)
  ⎿  Error editing file

  Ran 1 shell command (ctrl+o to expand)

● Update(Assets\Scripts\SignPanel.ts)
  ⎿  Added 51 lines
      619     * `backgroundColor` is only honoured for a solid fill; leav
           ing the style's
      620     * gradient on would silently ignore every colour set here.
      621     */
      622 +  /**                                                         
      623 +   * TEMPORARY DIAGNOSTIC — remove once the bar geometry quest
          +ion is settled.                                               
      624 +   * Dumps the numbers needed to tell a centre-anchoring bug f
          +rom a sizing one.                                             
      625 +   */                                                         
      626 +  debugBar(tag: string): void {                               
      627 +    const inner = this.panelWidth - this.padding * 2          
      628 +    const barWidth = inner * clamp01(this.barWidthFraction)   
      629 +    print(                                                    
      630 +      "[" + tag + "] panelWidth=" + this.panelWidth +         
      631 +        " padding=" + this.padding +                          
      632 +        " inner=" + inner +                                   
      633 +        " barWidthFraction=" + this.barWidthFraction +        
      634 +        " barWidth=" + barWidth +                             
      635 +        " barHeight=" + this.barHeight                        
      636 +    )                                                         
      637 +    const dump = (name: string, plate: BackPlate | null, obj: 
          +SceneObject | null) => {                                      
      638 +      if (!plate || !obj) {                                   
      639 +        print("[" + tag + "] " + name + ": MISSING")          
      640 +        return                                                
      641 +      }                                                       
      642 +      const t = obj.getTransform()                            
      643 +      const lp = t.getLocalPosition()                         
      644 +      const wp = t.getWorldPosition()                         
      645 +      const sz = plate.size                                   
      646 +      print(                                                  
      647 +        "[" + tag + "] " + name +                             
      648 +          "  local=(" + lp.x.toFixed(3) + ", " + lp.y.toFixed(
          +3) + ", " + lp.z.toFixed(3) + ")" +                           
      649 +          "  world=(" + wp.x.toFixed(3) + ", " + wp.y.toFixed(
          +3) + ", " + wp.z.toFixed(3) + ")" +                           
      650 +          "  size=(" + sz.x.toFixed(3) + ", " + sz.y.toFixed(3
          +) + ")"                                                       
      651 +      )                                                       
      652 +      const parent = obj.getParent()                          
      653 +      if (parent) {                                           
      654 +        const pt = parent.getTransform()                      
      655 +        const plp = pt.getLocalPosition()                     
      656 +        const pwp = pt.getWorldPosition()                     
      657 +        const fi = parent.getComponent(FlexItem.getTypeName())
          + as FlexItem | null                                           
      658 +        print(                                                
      659 +          "[" + tag + "]   parent '" + parent.name + "'" +    
      660 +            " local=(" + plp.x.toFixed(3) + ", " + plp.y.toFix
          +ed(3) + ", " + plp.z.toFixed(3) + ")" +                       
      661 +            " world=(" + pwp.x.toFixed(3) + ", " + pwp.y.toFix
          +ed(3) + ", " + pwp.z.toFixed(3) + ")" +                       
      662 +            (fi                                               
      663 +              ? "  FlexItem overrideW=" + fi.overrideWidth + "
          + overrideH=" + fi.overrideHeight +                            
      664 +                " grow=" + fi.flexGrow                        
      665 +              : "  (no FlexItem)")                            
      666 +        )                                                     
      667 +      }                                                       
      668 +    }                                                         
      669 +    dump("BarTrack", this.barTrack, this.barTrack ? this.barTr
          +ack.getSceneObject() : null)                                  
      670 +    dump("BarFill", this.barFill, this.barFillObject)         
      671 +  }                                                           
      672 +                                                              
      673    private styleRect(host: SceneObject, cornerRadius: number, c
           olor: vec4): RoundedRectangle | null {
      674      const rect = host.getComponent(RoundedRectangle.getTypeNam
           e()) as RoundedRectangle | null
      675      if (rect === null || rect === undefined) {

● Update(Assets\Scripts\SignBridge.ts)
  ⎿  Added 7 lines
      498        // target must move the reference hand in the same frame
            the letter turns
      499        // green, or the signer is shown the letter they just fi
           nished.
      500        this.updateReferenceHand(features)
      501 +                                                              
      502 +      // TEMPORARY DIAGNOSTIC — remove with SignPanel.debugBar
          +(). Frame 45 so                                               
      503 +      // the flex layout has resolved; frame 0 would read pre-
          +layout values.                                                
      504 +      this.debugFrame++                                       
      505 +      if (this.debugFrame === 45 && this.inwardPanel) {       
      506 +        this.inwardPanel.debugBar("BARDIAG inward")           
      507 +      }                                                       
      508      }
      509  
      510      updateSignPanels([this.inwardPanel, this.outwardPanel], th
           is.buildView())

  Called lens-studio 2 times, ran 1 shell command (ctrl+o to expand)

● Numbers are in. Both hypotheses are refuted — and the data says exactly why.

  Ran 1 shell command (ctrl+o to expand)

● Now removing the temporary instrumentation.

  Ran 1 shell command (ctrl+o to expand)

● Compile check, plus a stray doc comment I displaced earlier when adding
  mixColor.

● Update(Assets\Scripts\SignPanel.ts)
  ⎿  Added 1 line, removed 1 line
      157    }
      158  }
      159  
      160 -/** vec4 colour to the `#rrggbb` form rich-text markup expects
          -. */                                                          
      160  /** Componentwise blend, for the confidence bar's neutral -> w
           arm ramp. */
      161  function mixColor(a: vec4, b: vec4, t: number): vec4 {
      162    const k = clamp01(t)
      163    return new vec4(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k
           , a.z + (b.z - a.z) * k, a.w + (b.w - a.w) * k)
      164  }
      165  
      166 +/** vec4 colour to the `#rrggbb` form rich-text markup expects
          +. */                                                          
      167  function toHex(c: vec4): string {
      168    const ch = (v: number) => {
      169      let n = Math.round(clamp01(v) * 255)

  Called lens-studio 2 times (ctrl+o to expand)

● The numbers

  panelWidth=40  padding=2.2  inner=35.6  barWidthFraction=0.72  barWidth=25.632
   barHeight=1.8

  BarTrack  local=(  0.000, 0.000, 0.000)  world=( 0.000, -18.300, -109.380)
  size=(25.632, 1.800)
    parent 'Item'  local=(0.000, -2.300, 0.020)  world=(0.000, -18.300,
  -109.380)
                   FlexItem overrideW=35.600  overrideH=1.800  grow=0

  BarFill   local=(-10.680, 0.000, 0.050)  world=(-10.680, -18.300, -109.330)
  size=( 4.272, 1.800)
    parent 'Item'  (same Item, same transform)

  Both hypotheses are refuted

  (1) FlexItem origin is its edge — NO. The parent Item resolves to world x = 
  0.000, dead centre of the panel. BarTrack sits at local (0,0,0) and lands at
  world x = 0.000 with a symmetric 25.632 width. If the item's origin were its
  left edge, a centre-anchored BackPlate would have landed at x ≈ +17.8 (half of
  inner). It didn't. The origin is the centre, and the plain-child-at-(0,0,0)
  pattern is correct here.

  (2) Child at inner while plates are barWidth — TRUE but harmless. The item
  does reserve 35.6 while the plates are 25.632. That's deliberate: the item
  reserves a full-width layout row, and the plates are centred inside it.
  Because both the item and the track are centred on x = 0, the 72% track sits
  concentrically inside the 100% row. The width difference produces no offset.

  Where BarFill's −10.680 actually comes from — it's setProgress working exactly
  as written:

  implied progress      = size.x / barWidth = 4.272 / 25.632 = 0.1667
  expected fill local x  = -(barWidth - width)/2 = -10.680
  observed fill local x  = -10.680            match

  track left edge = 0.000 − 25.632/2 = -12.816
  fill  left edge = -10.680 −  4.272/2 = -12.816     left edges aligned

  The fill is left-aligned to the track to the third decimal, at 16.7% progress.

  So: no fix, and the ~18 cm was mine

  There is no bug to fix, and I should be plain about where the 18 cm figure
  came from — it was my own misreading three turns ago, which I retracted after
  the first runtime check. inner/2 = 17.80. Before I narrowed the bar, the track
  spanned the full inner width, so its right end sat at exactly +17.80. In the
  under-exposed Sunlit Room capture I read that end-cap as a separate
  mispositioned element. Hypothesis (2) reproduces the number for the same
  reason — inner/2 is where the old full-width track ended, not where anything
  is offset to.

  The genuine problem was legibility, not geometry, and that was already
  addressed: pill corners, 1.8 cm height, a visible track colour, and the
  neutral→amber→green fill.

  Instrumentation removed from both files. I also fixed a stray doc comment I'd
  displaced earlier — toHex's description had ended up above mixColor when I
  inserted it. completes-word passes; compile clean.

✻ Worked for 2m 41s

※ recap: You're finishing the ASL fingerspelling Lens for the CLAD hackathon; I just diagnosed the confidence bar and found no bug, so nothing needed fixing. Next: commit the accumulated work, since everything from the last several turns is still uncommitted.

> Retake docs/end-to-end-preview.png, same filename so the README link holds.   
                                                                                
  Frame both hands: live hand warm/amber mid-hold on the left, cyan reference   
  hand on the right,                                                            
  LUKE partially green with one letter still pending, confidence bar mid-fill,  
  status line                                                                   
  showing the candidate.                                                        
                                                                                
  Evening Room ground, not Sunlit Room -- two captures in this project produced 
  phantom defects                                                               
  because they were under-exposed.                                              
                                                                                
  If partial-green and mid-fill can't co-occur in a reachable frame (they       
  couldn't last time),                                                          
  prioritise: both hands visible and clearly distinguishable > bar mid-fill >   
  partial word.                                                                 
  Both hands is the shot -- it's what makes "match this" legible without a      
  caption.                                                                      

  Called lens-studio (ctrl+o to expand)

● Preview is paused from the LEAF run. Resuming and re-asserting Evening Room
  explicitly.

  Called lens-studio 2 times (ctrl+o to expand)

● Both hands requires an in-progress phrase — the reference hides when the
  phrase completes, so that constraint aligns with partial-word anyway.

  Called lens-studio 2 times, ran 1 shell command (ctrl+o to expand)

● Both hands and partial word are there; the live hand isn't amber yet and the
  flash owns the status line. Advancing.
  Called lens-studio (ctrl+o to expand)

● That jumped to complete — reference correctly hides with no letter left to
  copy. Retrying for a later point in a hold, where amber and a fuller bar
  co-occur.

  Called lens-studio 2 times, ran 1 shell command (ctrl+o to expand)

● The 1.6 s point was the best reachable state. Taking it at full resolution.

  Read 1 file, called lens-studio 2 times, ran 1 shell command (ctrl+o to expand)

● Good state — L·U·K green, E pending — but a mouse-interactor cursor is
  rendering over the bar. Checking whether it clears.

  Called lens-studio (ctrl+o to expand)

● The cursor is SIK's mouse interactor hovering the bar's Interactable — it'll
  be in every capture. Disabling it temporarily.

  Read 1 file, called lens-studio 3 times, ran 2 shell commands (ctrl+o to expand)

● That's the shot — both hands, amber live vs cyan reference, bar mid-fill, L U
  green with K flashing and E pending. Cropping and saving.

  Called lens-studio, ran 1 shell command (ctrl+o to expand)

● New docs/end-to-end-preview.png — 1392×1340, Evening Room. Live hand amber
  mid-hold (left), cyan reference target (right), bar mid-fill, L·U green with K
  flashing and E pending.

  › [image] docs\end-to-end-preview.png (727.9KB)

● Retaken and saved to docs/end-to-end-preview.png (same path, 1392×1340),
  Evening Room.

  What's in the frame:

  ┌───────────────────────┬─────────────────────────────────────────────────┐
  │        element        │                      state                      │
  ├───────────────────────┼─────────────────────────────────────────────────┤
  │ live hand (left)      │ warm amber, thick bones, mid-hold               │
  ├───────────────────────┼─────────────────────────────────────────────────┤
  │ reference hand        │ cyan, thin bones — unmistakably a different     │
  │ (right)               │ object                                          │
  ├───────────────────────┼─────────────────────────────────────────────────┤
  │ confidence bar        │ ~57% amber fill against a visible track         │
  ├───────────────────────┼─────────────────────────────────────────────────┤
  │ target word           │ L U green, K red flashing, E pending            │
  ├───────────────────────┼─────────────────────────────────────────────────┤
  │ status line           │ signed E — expected K                           │
  └───────────────────────┴─────────────────────────────────────────────────┘

  Everything on your priority list landed, so no trade-off was needed. The only
  deviation from your spec: the status line carries the wrong-letter flash
  rather than the candidate readout. The flash outranks the candidate on that
  line by design, and it also happens to be the more informative thing to show —
  it makes the wrong-letter recovery visible in the same frame.

  Two things worth knowing.

  First, the reference hand hides itself when the phrase completes — no letter
  left to copy, nothing to show. That means "both hands visible" and "partial
  word" aren't competing constraints at all; both hands requires an in-progress
  phrase. Several candidate frames had only one hand for exactly this reason.

  Second, and worth a decision from you: a SIK interactor cursor was rendering 
  on top of the confidence bar in the first full-resolution attempt — a
  ring-and-dot right over the fill. It's there because BackPlate creates an
  Interactable and InteractionPlane on every plate it builds, so the bar is a
  hoverable target. I disabled InteractorCursors for the capture and re-enabled
  it afterwards, so the scene is back as it was.

  That's cosmetic here, but it points at something real: the confidence bar is 
  interactive and shouldn't be. It's a readout. On device the hand interactors
  will hover it the same way the mouse did, so a signer could get a cursor stuck
  on their own progress bar. The fix would be to strip or disable the
  Interactable/InteractionPlane on the bar plates at build time. I haven't
  touched it — say the word.

✻ Baked for 3m 23s

※ recap: We're finishing the ASL fingerspelling Lens for the CLAD hackathon, and I just retook the README hero image showing both hands, the bar, and partial progress. Next: decide whether to strip the stray Interactable off the confidence bar so it stops attracting a cursor.

> Strip interactivity from the panel plates. BackPlate creates an Interactable  
  and                                                                           
  InteractionPlane on every plate it builds, which makes the confidence bar a   
  hoverable target --                                                           
  it's a readout and shouldn't be.                                              
                                                                                
  Nothing on either panel is interactive: this Lens has no buttons, sliders, or 
  draggables at                                                                 
  all. So disable or remove the Interactable/InteractionPlane on every plate    
  SignPanel builds,                                                             
  not just the bar ones.                                                        
                                                                                
  Verify BackPlate doesn't depend on them for its own rendering -- if disabling 
  breaks the plate                                                              
  visuals, fall back to disabling only on the two bar plates and report that.   
                                                                                
  Then confirm in preview with InteractorCursors ENABLED that no cursor lands   
  on the panels, and                                                            
  re-run the LEAF suite.                                                        

  Ran 2 shell commands (ctrl+o to expand)

● No hover/trigger handlers in BackPlate at all — the visual path is independent
  of interaction. It also creates a ColliderComponent, which the cursor
  actually raycasts against. Let me see the main plate's init.

  Ran 1 shell command (ctrl+o to expand)

● Adding a helper and applying it to all three plates.

● Update(Assets\Scripts\SignPanel.ts)
  ⎿  Added 36 lines
      619     * `backgroundColor` is only honoured for a solid fill; leav
           ing the style's
      620     * gradient on would silently ignore every colour set here.
      621     */
      622 +  /**                                                         
      623 +   * Strip interactivity from a BackPlate.                    
      624 +   *                                                          
      625 +   * BackPlate.initialize() unconditionally creates a Collider
          +Component, an                                                 
      626 +   * Interactable and an InteractionPlane on its SceneObject —
          + reasonable for a                                             
      627 +   * button, wrong for a readout. Nothing on either SignPanel 
          +is interactive:                                               
      628 +   * this Lens has no buttons, sliders or draggables at all. L
          +eft in place they                                             
      629 +   * make every plate a hover target, so an interactor cursor 
          +lands on the                                                  
      630 +   * confidence bar and on the panel background.              
      631 +   *                                                          
      632 +   * Safe to disable: BackPlate registers no hover or trigger 
          +handlers, and its                                             
      633 +   * visual path (RoundedRectangle initialize / blendMode / gr
          +adient / size) does                                           
      634 +   * not read interaction state. BackPlate itself already supp
          +orts the plane                                                
      635 +   * being off — initialize() sets `_interactionPlane.enabled`
          + from its own                                                 
      636 +   * `_enableInteractionPlane` input — so this is a supported 
          +configuration                                                 
      637 +   * rather than a component being sabotaged.                 
      638 +   *                                                          
      639 +   * The collider matters as much as the Interactable: it is t
          +he raycast target,                                            
      640 +   * so leaving it enabled would keep the plate hittable even 
          +with interaction                                              
      641 +   * off.                                                     
      642 +   */                                                         
      643 +  private makeNonInteractive(plate: BackPlate, host: SceneObje
          +ct): void {                                                   
      644 +    const interactable = plate.interactable                   
      645 +    if (interactable) {                                       
      646 +      interactable.enabled = false                            
      647 +    }                                                         
      648 +    const plane = plate.interactionPlane                      
      649 +    if (plane) {                                              
      650 +      plane.enabled = false                                   
      651 +    }                                                         
      652 +    const collider = host.getComponent("ColliderComponent")   
      653 +    if (collider) {                                           
      654 +      collider.enabled = false                                
      655 +    }                                                         
      656 +  }                                                           
      657 +                                                              
      658    private styleRect(host: SceneObject, cornerRadius: number, c
           olor: vec4): RoundedRectangle | null {
      659      const rect = host.getComponent(RoundedRectangle.getTypeNam
           e()) as RoundedRectangle | null
      660      if (rect === null || rect === undefined) {

  Called lens-studio 2 times, ran 1 shell command (ctrl+o to expand)

● No errors. Verifying the components are actually disabled at runtime rather
  than assuming the calls landed.

  Called lens-studio (ctrl+o to expand)

● Runtime query doesn't expose per-component enabled state. Adding a temporary
  log so this is confirmed, not assumed.

● Update(Assets\Scripts\SignPanel.ts)
  ⎿  Added 6 lines
      658      if (collider) {
      659        collider.enabled = false
      660      }
      661 +    print(                                                    
      662 +      "SignPanel: stripped interactivity from '" + host.name +
      663 +        "' interactable=" + (interactable ? "off" : "ABSENT") 
          ++                                                             
      664 +        " plane=" + (plane ? "off" : "ABSENT") +              
      665 +        " collider=" + (collider ? "off" : "ABSENT")          
      666 +    )                                                         
      667    }
      668  
      669    private styleRect(host: SceneObject, cornerRadius: number, c
           olor: vec4): RoundedRectangle | null {

  Called lens-studio 2 times (ctrl+o to expand)
● All four plates confirmed — interactable=off plane=off collider=off, and the
  collider does exist and was reached. Now the visual check with cursors
  enabled.

  Called lens-studio (ctrl+o to expand)

● No cursor on the panels, and the plates render exactly as before — backplate,
  track, amber fill all intact. Removing the temporary log.

● Update(Assets\Scripts\SignPanel.ts)
  ⎿  Removed 6 lines
      658      if (collider) {
      659        collider.enabled = false
      660      }
      661 -    print(                                                    
      662 -      "SignPanel: stripped interactivity from '" + host.name +
      663 -        "' interactable=" + (interactable ? "off" : "ABSENT") 
          -+                                                             
      664 -        " plane=" + (plane ? "off" : "ABSENT") +              
      665 -        " collider=" + (collider ? "off" : "ABSENT")          
      666 -    )                                                         
      661    }
      662  
      663    private styleRect(host: SceneObject, cornerRadius: number, c
           olor: vec4): RoundedRectangle | null {

  Called lens-studio 7 times (ctrl+o to expand)

● Interactivity stripped from all panel plates — no fallback needed.

  What BackPlate actually creates

  Reading BackPlate.initialize(), every plate gets three interaction components,
  not two:

  this.collider = this.sceneObject.createComponent("ColliderComponent")
  this._interactable =
  this.sceneObject.createComponent(Interactable.getTypeName())
  this._interactionPlane =
  this.sceneObject.createComponent(InteractionPlane.getTypeName())

  The collider is the one that matters most — it's the raycast target, so
  disabling only the Interactable would have left the plate hittable.
  makeNonInteractive() disables all three.

  Verified safe before doing it

  Your "check BackPlate doesn't depend on them for rendering" was the right
  gate, and it clears on two independent grounds:

  - Source: grepping BackPlate.ts for onHover, onTrigger, visualState,
    onStateChanged returns nothing. It registers no interaction handlers. Its
    visual path — roundedRectangle.initialize(), blendMode, colorMask,
    renderOrder, gradient/backgroundColor, size — never reads interaction state.
  - API intent: initialize() already does _interactionPlane.enabled = 
    this._enableInteractionPlane from its own input, so a disabled plane is a
    configuration BackPlate supports, not a component being sabotaged.

  That analysis then held up empirically: the plates render identically after
  the change — backplate, track and amber fill all intact in the capture.

  Confirmed at runtime, not assumed

  A temporary log proved every call actually found its targets rather than
  silently no-op'ing:

  SignPanel: stripped interactivity from 'SignPanelOutward'  interactable=off
  plane=off collider=off
  SignPanel: stripped interactivity from 'SignPanelInward'   interactable=off
  plane=off collider=off
  SignPanel: stripped interactivity from 'BarTrack'          interactable=off
  plane=off collider=off
  SignPanel: stripped interactivity from 'BarFill'           interactable=off
  plane=off collider=off

  collider=off on all four is the useful part —
  getComponent("ColliderComponent") did resolve, so the raycast target is
  genuinely gone. Worth noting the runtime scene query never listed a collider
  in componentTypes at all; had I trusted that view I'd have wrongly concluded
  there was nothing to disable.

  Log removed afterwards.

  Cursor check with InteractorCursors enabled

  Re-enabled before capturing (it had been off for the hero shot). No cursor 
  lands anywhere on either panel or the bar. Compare to the earlier frames where
  a ring-and-dot sat directly on the fill.

  Suite

  All six pass: completes-word, low-confidence-never-commits, interrupted-hold,
  wrong-letter-does-not-advance, no-spurious-double, alphabet-coverage.

  One scope note: this covers every plate SignPanel builds. The HandVisualizer
  rigs use raw RenderMeshVisual with no BackPlate, so they were never
  interactive and needed nothing.

✻ Brewed for 3m 9s

※ recap: You're shipping the ASL fingerspelling Lens for the CLAD hackathon deadline. Last task done: panel plates are no longer interactive, cursor is gone, all six LEAF scenarios pass. Next: commit and push everything, which is still uncommitted.

> Update docs/VIDEO_SHOTLIST.md for the reference hand and the two mode         
  toggles.                                                                      
                                                                                
  Add a "match the reference hand" beat, early -- right after the two-panel     
  opener. It's now the                                                          
  most legible shot in the video: two hands side by side, cyan target and amber 
  live, needs no                                                                
  narration for a viewer to understand "copy this".                             
                                                                                
  Revise the opener. The outward panel's text is single-sided and               
  backface-culled, so both                                                      
  panels' text can never be legible in one frame. Make it a camera move from    
  the wearer's side                                                             
  to the reader's side -- watching the content change communicates "one surface 
  aimed at each                                                                 
  person" far better than a static shot could.                                  
                                                                                
  Add explicit setup/teardown notes per shot, because two shots need scene      
  changes:                                                                      
  - K/P shot: wire demoPoseAsset, set showReferenceHand OFF (nothing should     
  compete with the                                                              
    two identical skeletons), then unwire after.                                
  - Everything else: demoPoseAsset unwired, showReferenceHand ON.               
                                                                                
  Mark each shot [P] preview or [T] terminal. Keep the strongest material last: 
  K/P identity,                                                                 
  then the LEAF suite passing, then the mutation test failing on revert.        

● Write(docs\VIDEO_SHOTLIST.md)
  ⎿  Added 129 lines, removed 50 lines
        1  # Demo video shot list
        2  
        3 -**Target: 75–90 seconds.** Structured so the strongest materia
          -l lands last — the limitation demo and the mutation test are t
          -he two shots a judge will remember, so they come after the hap
          -py path, not before it.                                       
        3 +**Target: 75–90 seconds.** Ordered so the strongest material l
          +ands last — K/P identity, then the suite passing, then the sui
          +te *failing* when the fix is reverted. Those are the three a j
          +udge will remember.                                           
        4  
        5  Capture source is marked on every shot: **[P]** = Lens Studio 
           preview panel, **[T]** = terminal / Claude Code session.
        6  
        7 -Record with `Win+Alt+R` → `C:\Users\Raol\Videos\Captures\`. On
          -e clean take beats five retries.                              
        7 +Record with `Win+Alt+R` → `C:\Users\Raol\Videos\Captures\`.   
        8  
        9  ---
       10  
       11 -## 0:00–0:10 · The idea — [P]                                 
       11 +## Record in this order, not in presentation order            
       12  
       13 -**~10s.** Both panels visible, no hand yet.                   
       13 +Shot 5 is the only one needing scene changes, and they are fid
          +dly to undo. Record **1, 2, 3, 4, 8** in one pass with the sce
          +ne in its default state, then make the change once, record **5
          +**, then revert. Shots 6 and 7 are terminal captures and are i
          +ndependent of all of it.                                      
       14  
       15 -Show the two surfaces and make the geometry obvious: the outwa
          -rd panel carries the assembled text for the person being spoke
          -n to, the inward panel carries the target word, the confidence
          - bar and the flash for the wearer.                            
       15 +| | shot | scene state |                                      
       16 +|---|---|---|                                                 
       17 +| default | 1, 2, 3, 4, 8 | `demoPoseAsset` **unwired** · `sho
          +wReferenceHand` **ON** |                                      
       18 +| demo | 5 (K/P) | `demoPoseAsset` **wired** · `showReferenceH
          +and` **OFF** |                                                
       19 +| n/a | 6, 7 | terminal only |                                
       20  
       17 -> "One pair of glasses, two surfaces — one aimed at each perso
          -n. The signer gets feedback; the person across from them gets 
          -the text."                                                    
       21 +---                                                           
       22  
       19 -**Get right:** the shot has to read as *two* panels, not one. 
          -If the outward panel is edge-on or washed out, rotate the prev
          -iew camera slightly before recording.                         
       23 +## 1 · 0:00–0:12 · One surface aimed at each person — [P]     
       24  
       25 +**~12s. A camera move, not a static shot.**                   
       26 +                                                              
       27 +The outward panel's text is single-sided and backface-culled, 
          +so **both panels' text can never be legible in one frame** — t
          +hat is the design working, not a framing problem. Watching the
          + content *change* as the camera crosses between them communica
          +tes the idea far better than any static composition could.    
       28 +                                                              
       29 +Start on the wearer's side, hold ~4s on the target word, confi
          +dence bar and hands. Then move through to the reader's side an
          +d hold ~4s on the assembled text.                             
       30 +                                                              
       31 +Preview camera positions, both verified:                      
       32 +                                                              
       33 +```                                                           
       34 +wearer's side   setPosition (0, -11, -42)   lookAt (0, -11, -1
          +10)                                                           
       35 +reader's side   setPosition (0,   6, -150)  lookAt (0,   8, -1
          +10)                                                           
       36 +```                                                           
       37 +                                                              
       38 +> "One pair of glasses, two surfaces. The signer sees their ta
          +rget and their progress. The person across from them sees only
          + the finished text — and reads it right off the glasses."     
       39 +                                                              
       40 +**Get right:** move slowly and continuously; a cut would lose 
          +the whole point. The reader-side text is large, white and corr
          +ectly unmirrored — do not rush past it, it's the payoff of the
          + move.                                                        
       41 +                                                              
       42 +**Setup:** default state. **Teardown:** none.                 
       43 +                                                              
       44  ---
       45  
       23 -## 0:10–0:30 · Spelling LUKE — [P]                            
       46 +## 2 · 0:12–0:22 · Match the reference hand — [P]             
       47  
       25 -**~20s.** The core loop, uninterrupted.                       
       48 +**~10s. The most legible shot in the video — it needs no narra
          +tion to be understood.**                                      
       49  
       27 -Hand skeleton forms L → U → K → E. Per letter, in view:       
       50 +Two hands side by side in the gap between the panels:         
       51  
       29 -- the skeleton holding a shape                                
       30 -- the confidence bar filling **continuously** toward the commi
          -t, not snapping                                               
       31 -- the letter turning green in the target word                 
       32 -- the letter appearing on the outward panel                   
       33 -- the commit chime landing on the frame                       
       34 -- the skeleton pulsing green on commit                        
       52 +- **left, amber, thick bones** — the live hand, drawn from the
          + exact vector the classifier is scoring                       
       53 +- **right, cyan, thin bones** — the reference: the target lett
          +er's stored template                                          
       54  
       55 +A viewer understands "copy the one on the right" instantly. Le
          +t it sit in silence for a beat before saying anything.        
       56 +                                                              
       57 +> "The cyan hand is the letter you're being asked to make. The
          + amber one is what the glasses are actually seeing. It brighte
          +ns as the two converge."                                      
       58 +                                                              
       59 +**Get right:**                                                
       60 +                                                              
       61 +- **Shoot mid-word.** The reference hides itself when the phra
          +se completes — no letter left to copy — so a completed LUKE le
          +aves only one hand on screen.                                 
       62 +- **The reference steps, it does not glide.** In the Editor th
          +e mock replays stored templates verbatim, so the live hand tel
          +eports between exact poses and the reference brightness jumps 
          +between levels. On hardware a real hand sweeps the intermediat
          +e distances and it ramps smoothly. Do not promise a glide the 
          +preview cannot show — sell the pairing, not the animation.    
       63 +                                                              
       64 +**Setup:** default state (`showReferenceHand` ON). **Teardown:
          +** none.                                                      
       65 +                                                              
       66 +---                                                           
       67 +                                                              
       68 +## 3 · 0:22–0:38 · Spelling LUKE — [P]                        
       69 +                                                              
       70 +**~16s.** The core loop, uninterrupted, from the wearer's side
          +.                                                             
       71 +                                                              
       72 +Per letter, in view: the skeleton holds a shape · the confiden
          +ce bar fills **continuously** · the letter turns green in the 
          +target word · it appears on the outward panel · the commit chi
          +me lands on the frame · the skeleton pulses green.            
       73 +                                                              
       74  > "The hand you're seeing isn't an animation — it's the classi
           fier's own input vector, drawn directly. Same array, same fram
           e."
       75  
       38 -**Get right:** let at least one bar fill run its full length o
          -n camera. The continuous fill is the thing that distinguishes 
          -this from a binary threshold, and it is invisible if every com
          -mit is cut short.                                             
       76 +**Get right:** let at least one bar fill run its full length o
          +n camera. The continuous fill is what distinguishes this from 
          +a binary threshold, and it is invisible if every commit is cut
          + short.                                                       
       77  
       78 +**Setup:** default state. **Teardown:** none.                 
       79 +                                                              
       80  ---
       81  
       42 -## 0:30–0:40 · A wrong letter — [P]                           
       82 +## 4 · 0:38–0:46 · A wrong letter — [P]                       
       83  
       44 -**~10s.** Sign something that isn't the target.               
       84 +**~8s.** Sign something that isn't the target.                
       85  
       46 -Show the flash, the `signed X — expected Y` line, and then rec
          -overy — the index does *not* advance, the letter is re-signabl
          -e, the demo keeps going.                                      
       86 +Show the flash, the `signed X — expected Y` line, then recover
          +y — the index does **not** advance, the letter is re-signable,
          + the demo keeps going.                                        
       87  
       88  > "A wrong letter is visible and recoverable. It doesn't silen
           tly pass and it doesn't dead-end the demo."
       89  
       90  **Get right:** hold on the recovery, not just the flash. The p
           oint is that it continues.
       91  
       92 +**Setup:** default state. **Teardown:** none.                 
       93 +                                                              
       94  ---
       95  
       54 -## 0:40–0:50 · K and P are the same hand — [P]                
       96 +## 5 · 0:46–0:56 · K and P are the same hand — [P]            
       97  
       56 -**~10s.** The limitation, visible in four seconds.            
       98 +**~10s.** The honest core of the submission. Do not rush it.  
       99  
       58 -Form K. Form P. The rendered skeleton is **identical**.       
      100 +Form K. Form P. The rendered skeleton is **identical** — and t
          +he status line names which pose is being injected, so no capti
          +on is needed:                                                 
      101  
       60 -> "In ASL these differ by wrist rotation. The normalization is
          - rotation-invariant by construction, so that difference is era
          -sed before the classifier ever sees it. Same for G/Q and H/U. 
          -Measured at distance zero — rotate a pose arbitrarily, re-norm
          -alize, you get zero."                                         
      102 +```                                                           
      103 +DEMO POSE: K        DEMO POSE: P                              
      104 +```                                                           
      105  
       62 -**Get right:** cut between the two poses with no camera moveme
          -nt so the identity is unmistakable. If it looks like a slow mo
          -rph the point is lost. This shot is the honest core of the sub
          -mission — do not rush past it.                                
      106 +> "In ASL these differ by wrist rotation. The normalization is
          + rotation-invariant by construction, so that difference is era
          +sed before the classifier ever sees it. Same for G/Q and H/U. 
          +Measured at distance zero."                                   
      107  
      108 +**Get right:** cut between the two with no camera movement, so
          + the identity is unmistakable. If it reads as a slow morph, th
          +e point is lost.                                              
      109 +                                                              
      110 +**Setup — the only shot needing scene changes:**              
      111 +                                                              
      112 +1. Wire `SignBridge.demoPoseAsset` → `Assets/Data/poses.demo.j
          +son`                                                          
      113 +2. Set `SignBridge.showReferenceHand` → **OFF**               
      114 +                                                              
      115 +The reference hand must be off here. Nothing should compete wi
          +th the two identical skeletons, and a target hand would imply 
          +the Lens is asking for one of these letters when neither is in
          + its vocabulary.                                              
      116 +                                                              
      117 +**Teardown — do this before anything else:**                  
      118 +                                                              
      119 +1. Unwire `demoPoseAsset`                                     
      120 +2. Set `showReferenceHand` back **ON**                        
      121 +                                                              
      122 +Every demo-mode run prints a loud reminder naming the poses an
          +d the real candidate set, so check the log if unsure which sta
          +te you're in.                                                 
      123 +                                                              
      124  ---
      125  
       66 -## 0:50–1:10 · The tests, and the test that fails — [T]       
      126 +## 6 · 0:56–1:08 · The suite passing — [T]                    
      127  
       68 -**~20s.** The strongest 20 seconds. Two beats.                
      128 +**~12s.** Six LEAF scenarios, six green, run against the live 
          +Lens in preview.                                              
      129  
       70 -**Beat one (~8s):** the LEAF suite passing — five scenarios, f
          -ive green.                                                    
      130 +Name what the last one covers, since it is the least obvious: 
          +`alphabet-coverage` asserts a defined behaviour for **all 26 l
          +etters** — six recognized end to end, eighteen absent and refu
          +sed by phrase gating, J and Z excluded as motion letters.     
      131  
       72 -**Beat two (~12s):** revert the re-arm fix (`rearmFrames` 3 → 
          -1) and re-run. `signbridge-no-spurious-double` **fails**:     
      132 +**Setup:** default state — the coverage scenario reads the cla
          +ssifier's loaded letters, so a wired `demoPoseAsset` would be 
          +showing the wrong thing on screen while it ran.               
      133  
      134 +---                                                           
      135 +                                                              
      136 +## 7 · 1:08–1:22 · The test that fails — [T]                  
      137 +                                                              
      138 +**~14s. The strongest fourteen seconds. Do not cut this for ti
          +me.**                                                         
      139 +                                                              
      140 +Revert a fix and re-run. Either mutation works; the re-arm one
          + is the better story:                                         
      141 +                                                              
      142  ```
      143  FAILED: signbridge-no-spurious-double
      144    Expected: "0" — Received: "1"
      145  ```
      146  
       79 -> "A suite that's green on the first run tells you nothing. So
          - the fix was reverted to prove the guard actually fires. That'
          -s a real spurious-double bug, and that's the test catching it.
          -"                                                             
      147 +The second, if you prefer it — break phrase gating by making `
          +unsignableLetters()` return `[]`:                             
      148  
       81 -**Get right:** the failure text must be legible at video resol
          -ution. Zoom the terminal font before recording. This is the sh
          -ot that earns the process half of the score — give it the pixe
          -ls.                                                           
      149 +```                                                           
      150 +FAILED: signbridge-alphabet-coverage                          
      151 +  Expected: "> -1" — Received: "-1"                           
      152 +```                                                           
      153  
      154 +> "A suite that's green on its first run tells you nothing. So
          + the fix was reverted to prove the guard actually fires. That'
          +s a real spurious-double bug, and that's the test catching it.
          +"                                                             
      155 +                                                              
      156 +**Get right:** the failure text must be legible at video resol
          +ution. Raise the terminal font before recording. This is the s
          +hot that earns the process half of the score — give it the pix
          +els.                                                          
      157 +                                                              
      158 +**Teardown:** restore the reverted line and re-run to confirm 
          +green before you stop recording, or you will forget.          
      159 +                                                              
      160  ---
      161  
       85 -## 1:10–1:20 · Close — [P] or [T]                             
      162 +## 8 · 1:22–1:28 · Close — [P] or [T]                         
      163  
       87 -**~10s.** State the scope plainly and stop.                   
      164 +**~6s.** State the scope plainly and stop.                    
      165  
       89 -> "Six letters, synthetic templates, one recording session awa
          -y from real recognition. It reads fingerspelling — not ASL, wh
          -ich has its own grammar. It's a practice and fallback aid, not
          - a replacement for an interpreter."                           
      166 +> "Six letters, synthetic templates, one recording session awa
          +y from real recognition. It reads fingerspelling — not ASL, wh
          +ich has its own grammar. A practice and fallback aid, not a re
          +placement for an interpreter."                                
      167  
      168  **Get right:** end on the limitation stated calmly. Do not clo
           se on a claim the build doesn't support.
      169  
     ...
      171  
      172  ## Pre-record checklist
      173  
       97 -- [ ] Preview device switched **off "Sunlit Room"** to somethi
          -ng darker — Specs renders additively and white-on-bright washe
          -s out                                                         
       98 -- [ ] Outward panel text confirmed legible in the capture, not
          - just the inward one                                          
       99 -- [ ] Terminal font size raised before any **[T]** shot       
      100 -- [ ] Audio levels checked — the commit chime is 0.09s and eas
          -y to lose under narration                                     
      101 -- [ ] `templates.synthetic.json` in place (6 letters) and the 
          -Lens running without errors                                   
      102 -- [ ] Full dry run once, silent, to confirm timings before rec
          -ording with narration                                         
      174 +- [ ] Preview device on **Evening Room**, not Sunlit Room — Sp
          +ecs renders additively, and two captures in this project produ
          +ced phantom defects because they were under-exposed           
      175 +- [ ] `demoPoseAsset` **unwired** and `showReferenceHand` **ON
          +** before shots 1–4 and 8                                     
      176 +- [ ] Terminal font size raised before shots 6 and 7          
      177 +- [ ] Audio levels checked — the commit chime is 0.09 s and ea
          +sy to lose under narration                                    
      178 +- [ ] `templates.synthetic.json` in place (6 letters: L U K E 
          +C O), Lens running with no errors                             
      179 +- [ ] One silent dry run to confirm timings before recording w
          +ith narration                                                 
      180  
      181  ## Timing summary
      182  
      106 -| segment | length | source |                                 
      107 -|---|---|---|                                                 
      108 -| The idea | 10s | [P] |                                      
      109 -| Spelling LUKE | 20s | [P] |                                 
      110 -| Wrong letter | 10s | [P] |                                  
      111 -| K and P identical | 10s | [P] |                             
      112 -| LEAF pass → mutation fail | 20s | [T] |                     
      113 -| Close | 10s | [P]/[T] |                                     
      114 -| **total** | **80s** | |                                     
      183 +| # | segment | length | source |                             
      184 +|---|---|---|---|                                             
      185 +| 1 | One surface each — camera move | 12s | [P] |            
      186 +| 2 | Match the reference hand | 10s | [P] |                  
      187 +| 3 | Spelling LUKE | 16s | [P] |                             
      188 +| 4 | Wrong letter | 8s | [P] |                               
      189 +| 5 | K and P identical | 10s | [P] |                         
      190 +| 6 | LEAF suite passing | 12s | [T] |                        
      191 +| 7 | Mutation test failing | 14s | [T] |                     
      192 +| 8 | Close | 6s | [P]/[T] |                                  
      193 +| | **total** | **88s** | |                                   
      194  
      116 -10s of slack against the 90s ceiling. If a shot overruns, take
          - it from "The idea" — never from the mutation test.           
      195 +Two seconds under the 90 s ceiling. If a shot overruns, take i
          +t from **1** or **3** — never from 5, 6 or 7.                 

● Rewritten. Eight shots, 88s, two under the ceiling.

  Opener is now a camera move, with the coordinates I actually verified this
  session:

  wearer's side   setPosition (0, -11, -42)   lookAt (0, -11, -110)
  reader's side   setPosition (0,   6, -150)  lookAt (0,   8, -110)

  Framed explicitly around the backface-culling constraint — crossing between
  the two surfaces and watching the content change is the argument, so the
  limitation becomes the shot rather than something to work around.

  "Match the reference hand" is shot 2, right after the opener, with a note to
  let it sit in silence before narrating. Two caveats attached, because both
  would sink the take:

  - Shoot mid-word. The reference hides itself when the phrase completes, so a
    finished LUKE leaves one hand on screen.
  - The reference steps, it doesn't glide. The Editor mock replays templates
    verbatim, so brightness jumps between levels rather than ramping. On
    hardware it ramps. The note says to sell the pairing, not promise an
    animation the preview can't produce.

  Setup/teardown is on every shot, plus a recording-order table up front — shot
  5 is the only one needing scene changes, so the efficient pass is 1·2·3·4·8 in
  default state, then change once for 5, then revert. Shot 5's teardown is
  called out as "do this before anything else," and shot 7's reminds you to
  restore the reverted line and confirm green before you stop recording.

  Shot 6 also carries a setup note that wasn't obvious: alphabet-coverage reads
  the classifier's loaded letters, so a wired demoPoseAsset would leave the
  wrong thing on screen while it ran.

  Order ends as you asked — K/P identity (5), suite passing (6), mutation
  failing (7), short close. I gave shot 7 fourteen seconds rather than twelve
  and marked it "do not cut this for time," taking the difference from the
  close. Both mutation options are listed with their exact failure strings,
  since either works and you may prefer whichever you have set up.

  One thing I dropped from the old version: the "confirm the outward panel's
  assembled text is legible" checklist item. That was verified two turns ago —
  large, white, correctly unmirrored from the reader's side — and it's now
  load-bearing in shot 1 rather than an open question.

✻ Baked for 1m 16s

※ recap: You're prepping the ASL fingerspelling Lens for the CLAD hackathon submission, and I just rewrote docs/VIDEO_SHOTLIST.md with the reference-hand beat and mode toggles. Next: commit the accumulated work, then record the video.

> Filming ergonomics -- the mock auto-plays LUKE on load, so there's no clean   
  start and it stops                                                            
  once the phrase completes. Two @inputs on SignBridge, both defaulting to      
  shipped behaviour:                                                            
                                                                                
    startDelaySeconds (default 0) -- hold the mock idle after load so I can hit 
  record before                                                                 
    anything happens.                                                           
                                                                                
    loopDemo (default false) -- when on, restart the phrase and the mock        
  sequence after                                                                
    completion, with a short pause between cycles so the completion chime and   
  the finished word                                                             
    land before it resets.                                                      
                                                                                
  Both filming aids, not product changes -- shipped defaults unchanged, and     
  I'll set them back to                                                         
  0 and false before the final commit.                                          
                                                                                
  While looping, make sure PhraseController resets cleanly: index back to 0,    
  letterStatus                                                                  
  cleared, reference hand shown again, mistakes reset.                          

  Ran 3 shell commands (ctrl+o to expand)

● setPhrase already resets index, letterStatus, mistakes, skipped and
  wrongLetter — so restart() is a clean reset. Adding the inputs.

● Update(Assets\Scripts\SignBridge.ts)
  ⎿  Added 17 lines
      160    @hint("Log a line on every commit, wrong letter and phrase c
           ompletion.")
      161    verbose: boolean = true
      162    @ui.group_end
      163 +                                                              
      164 +  @ui.group_start("Filming aids")                             
      165 +  @ui.label("Recording conveniences, NOT product behaviour. Bo
          +th default to shipped behaviour; set them back to 0 / off befo
          +re committing.")                                              
      166 +  @input                                                      
      167 +  @hint("Hold the mock idle for this long after load, so recor
          +ding can start before anything happens. 0 = shipped behaviour:
          + the mock plays immediately.")                                
      168 +  @widget(new SliderWidget(0, 15, 0.5))                       
      169 +  startDelaySeconds: number = 0                               
      170 +                                                              
      171 +  @input                                                      
      172 +  @hint("Restart the phrase and the mock sequence after comple
          +tion so a take can loop. Off = shipped behaviour: the demo sto
          +ps on the finished word.")                                    
      173 +  loopDemo: boolean = false                                   
      174 +                                                              
      175 +  @input                                                      
      176 +  @hint("Pause between loop cycles. Long enough that the compl
          +etion chime finishes and the finished word is readable before 
          +the reset.")                                                  
      177 +  @widget(new SliderWidget(0.5, 8, 0.25))                     
      178 +  loopPauseSeconds: number = 2.5                              
      179 +  @ui.group_end                                               
      180    private handProvider = HandInputData.getInstance()
      181    private hand!: BaseHand
      182    private liveSource!: HandFeatureSource

● Update(Assets\Scripts\SignBridge.ts)
  ⎿  Added 7 lines
      197    private referencePose: number[] | null = null
      198    private referenceScale = 1
      199  
      200 +  // Filming-aid state. All inert while startDelaySeconds is 0
          + and loopDemo is                                              
      201 +  // off, which is the shipped configuration.                 
      202 +  private sinceReady = 0                                      
      203 +  private started = false                                     
      204 +  private loopPending = false                                 
      205 +  private loopTimer = 0                                       
      206 +                                                              
      207    onAwake() {
      208      // getHand belongs in onAwake. Nothing here subscribes to 
           a SIK event, so
      209      // there is no .add() that needs deferring to OnStartEvent
           .

● Now the update loop.

● Update(Assets\Scripts\SignBridge.ts)
  ⎿  Added 37 lines
      475      this.phrases.update(dt)
      476  
      477      if (this.ready) {
      478 +      // ---- filming aids -----------------------------------
          +--------------                                                
      479 +      // Both branches below are no-ops in the shipped configu
          +ration                                                        
      480 +      // (startDelaySeconds 0, loopDemo off): `started` flips 
          +true on the first                                             
      481 +      // frame and `loopPending` never arms.                  
      482 +      this.sinceReady += dt                                   
      483 +                                                              
      484 +      if (!this.started && (this.startDelaySeconds <= 0 || thi
          +s.sinceReady >= this.startDelaySeconds)) {                    
      485 +        this.started = true                                   
      486 +        if (this.mockHandInput) {                             
      487 +          // reset() rewinds to step 0 AND sets playing = true
          +, so the sequence                                             
      488 +          // begins from its first pose the moment the hold ex
          +pires rather than                                             
      489 +          // resuming wherever it was paused.                 
      490 +          this.mockHandInput.reset()                          
      491 +        }                                                     
      492 +      }                                                       
      493 +                                                              
      494 +      if (this.loopPending) {                                 
      495 +        this.loopTimer -= dt                                  
      496 +        if (this.loopTimer <= 0) {                            
      497 +          this.beginLoopCycle()                               
      498 +        }                                                     
      499 +      }                                                       
      500 +                                                              
      501 +      // Idle means "produce no input this frame". The pipelin
          +e is fed an                                                   
      502 +      // untracked frame rather than skipped, so HoldBuffer st
          +ays reset and the                                             
      503 +      // hands hide — a clean, still start rather than a froze
          +n pose that would                                             
      504 +      // keep filling the window and commit on its own.       
      505 +      if (!this.started || this.loopPending) {                
      506 +        this.holdBuffer.push(null)                            
      507 +        if (this.handVisualizer) {                            
      508 +          this.handVisualizer.render(null, this.holdBuffer.get
          +State(), null, dt)                                            
      509 +        }                                                     
      510 +        this.updateReferenceHand(null)                        
      511 +        updateSignPanels([this.inwardPanel, this.outwardPanel]
          +, this.buildView())                                           
      512 +        return                                                
      513 +      }                                                       
      514 +                                                              
      515        // Resolved per frame rather than cached: MockHandInput 
           registers itself
      516        // during ITS OnStartEvent, and script start order follo
           ws scene hierarchy
      517        // order, which this script must not depend on. Reading 
           the module-level

● Update(Assets\Scripts\SignBridge.ts)
  ⎿  Added 12 lines
      559        // target must move the reference hand in the same frame
            the letter turns
      560        // green, or the signer is shown the letter they just fi
           nished.
      561        this.updateReferenceHand(features)
      562 +                                                              
      563 +      // Arm the loop on the frame the phrase completes. The m
          +ock is paused                                                 
      564 +      // rather than left running, so the finished word sits s
          +till and the                                                  
      565 +      // completion chime lands over a static frame instead of
          + over the next                                                
      566 +      // letter's pose.                                       
      567 +      if (this.loopDemo && !this.loopPending && this.phrases.g
          +etState().status === "complete") {                            
      568 +        this.loopPending = true                               
      569 +        this.loopTimer = this.loopPauseSeconds                
      570 +        if (this.mockHandInput) {                             
      571 +          this.mockHandInput.pause()                          
      572 +        }                                                     
      573 +      }                                                       
      574      }
      575  
      576      updateSignPanels([this.inwardPanel, this.outwardPanel], th
           is.buildView())

● Update(Assets\Scripts\SignBridge.ts)
  ⎿  Added 29 lines
      833    restart(): void {
      834      this.phrases.restart()
      835      this.holdBuffer.reset()
      836 +    // Drop the cached reference target so the pose and its di
          +stance scale are                                              
      837 +    // refetched. Without this, a restart back to the SAME let
          +ter the cache                                                 
      838 +    // already holds would leave the reference hand hidden or 
          +stale.                                                        
      839 +    this.referenceLetter = null                               
      840 +    this.referencePose = null                                 
      841 +    // A manual restart cancels any pending loop — otherwise a
          + scenario calling                                             
      842 +    // restart() mid-countdown would be reset again underneath
          + itself.                                                      
      843 +    this.loopPending = false                                  
      844 +    this.loopTimer = 0                                        
      845    }
      846 +                                                              
      847 +  /**                                                         
      848 +   * Begin another cycle of a looping take.                   
      849 +   *                                                          
      850 +   * PhraseController.restart() reseats the same phrase throug
          +h setPhrase(),                                                
      851 +   * which rebuilds letterStatus to all-pending and zeroes ind
          +ex, mistakes,                                                 
      852 +   * mistakesOnCurrentLetter, skipped and wrongLetter — so the
          + loop starts from                                             
      853 +   * a genuinely clean state, not a partially cleared one. res
          +tart() also clears                                            
      854 +   * the reference cache, which is what brings the target hand
          + back after the                                               
      855 +   * completed phrase had hidden it.                          
      856 +   */                                                         
      857 +  private beginLoopCycle(): void {                            
      858 +    this.restart()                                            
      859 +    if (this.mockHandInput) {                                 
      860 +      this.mockHandInput.reset()                              
      861 +    }                                                         
      862 +    if (this.verbose) {                                       
      863 +      print("SignBridge: loop restart — '" + this.phrases.getS
          +tate().phrase + "' from the top.")                            
      864 +    }                                                         
      865 +  }                                                           
      866  }

● Update(Assets\Scripts\SignBridge.ts)
  ⎿  Added 5 lines
      444          }
      445        }
      446        this.mockHandInput.loadFromTemplates(poses, {framesPerPo
           se: 30, gapFrames: 12})
      447 +      if (this.startDelaySeconds > 0) {                       
      448 +        // loadFromTemplates -> setSequence -> reset() leaves 
          +the mock playing,                                             
      449 +        // so the hold has to be applied after it, not before.
      450 +        this.mockHandInput.pause()                            
      451 +      }                                                       
      452        if (source !== "templates") {
      453          const shown = letterKeys(poses).join(",")
      454          print(

  Called lens-studio (ctrl+o to expand)
● Compiles. Now proving the aids actually work — enabling both and watching a
  full cycle.

  Called lens-studio 2 times (ctrl+o to expand)

● Start delay confirmed — setup ends 27.654, first activity 32.004: a 4.35 s 
  hold. The phrase completed right at the window edge, so tailing for the loop
  restart.

  Called lens-studio (ctrl+o to expand)

● Loop verified precisely:

  19:06:44.123  committed E (100%)          <- phrase complete
  19:06:46.632  loop restart — 'LUKE'       <- 2.51 s pause (configured 2.5)
  19:06:47.016  WRONG — signed C, expected L <- index back to 0
  19:06:49.827  committed L (25%)            <- progress recomputed from scratch

  Confirming the reference hand comes back on the second cycle.

  Called lens-studio (ctrl+o to expand)

● Reference hand is back on cycle 2 — both hands, L green, U flashing. Restoring
  shipped defaults; also the preview scene has drifted to an outdoor
  environment.

  Called lens-studio 2 times (ctrl+o to expand)

● Now the full suite with shipped defaults restored.

  Called lens-studio 6 times (ctrl+o to expand)

● Both aids in, both verified, both restored to shipped defaults.

  startDelaySeconds (default 0)

  The mock is paused after loadFromTemplates, since setSequence → reset() leaves
  it playing — pausing before would have been silently undone. When the hold
  expires, mock.reset() rewinds to step 0 and resumes, so the sequence starts
  from its first pose rather than resuming mid-stream.

  During the hold the pipeline is fed an untracked frame rather than skipped.
  That matters: the mock's getFeatures() still returns step 0's pose while
  paused, so simply not advancing would have left a frozen hand filling the hold
  window and committing a letter on its own. Pushing null keeps the buffer
  reset, hands hidden, bar at zero — a genuinely still frame.

  Measured at 4 s: setup ends 27.654, first activity 32.004 — a 4.35 s gap.

  loopDemo (default false) + loopPauseSeconds (2.5)

  Arms on the frame the phrase completes and pauses the mock, so the finished
  word sits still and the completion chime lands over a static frame instead of
  over the next letter's pose.

  19:06:44.123  committed E (100%)
  19:06:46.632  loop restart — 'LUKE' from the top     <- 2.51 s
  19:06:47.016  WRONG — signed C, expected L           <- index 0
  19:06:49.827  committed L (25%)                      <- progress from scratch

  Clean reset, confirmed on both counts. phrases.restart() → setPhrase()
  rebuilds letterStatus to all-pending and zeroes index, mistakes,
  mistakesOnCurrentLetter, skipped, wrongLetter — I read that rather than
  assuming it. The log corroborates: cycle 2 expects L again and progress
  restarts at 25%, which only happens if letterStatus was actually cleared.

  The reference hand needed one extra thing. updateReferenceHand caches the
  target letter and its distance scale, so a restart back to a letter the cache
  already held would have left the target hand hidden or stale. restart() now
  clears referenceLetter/referencePose, forcing a refetch — and the cycle-2
  capture shows both hands back, amber and cyan.

  restart() also cancels a pending loop, so a LEAF scenario calling it
  mid-countdown can't be reset underneath itself.

  State restored

  startDelaySeconds: 0, loopDemo: false — shipped defaults. All six scenarios
  pass with them restored.

  One thing worth flagging: the preview environment had drifted to an outdoor 
  evening scene, not Evening Room. I noticed it in the cycle-2 capture and set
  it back. Something in the refresh/LEAF cycle resets it, so it's worth a glance
  at the preview source right before you hit record — your shot list's first
  checklist item already covers it, but it evidently doesn't stay put on its
  own.

✻ Cooked for 4m 38s

※ recap: You're building the ASL fingerspelling Lens for the CLAD hackathon, and I've just added the two filming aids (start delay and loop) with shipped defaults restored and all six LEAF tests passing. Next: record the demo video following docs/VIDEO_SHOTLIST.md.

> /compact                                                                      
  ⎿  Compacted (ctrl+o to see full summary)
  ⎿  Read AGENTS.md (94 lines)
  ⎿  Referenced file Assets\Scripts\SignBridge.ts
  ⎿  Read docs\VIDEO_SHOTLIST.md (196 lines)
  ⎿  Referenced file Assets\Scripts\SignPanel.ts
  ⎿  Referenced file Assets\Scripts\HandVisualizer.ts

> Prep the Lens for video recording. Three parts.                               
                                                                                
  1. FILMING AIDS -- two @inputs on SignBridge, both defaulting to shipped      
  behaviour:                                                                    
                                                                                
     startDelaySeconds (default 0) -- hold the mock idle after load so I can    
  press record before                                                           
     anything happens. I'll set it to 3 for the shoot.                          
                                                                                
     loopDemo (default false) -- when on, restart the phrase and the mock       
  sequence after                                                                
     completion, with a short pause so the completion chime and the finished    
  word land before it                                                           
     resets. I'll set it ON for the shoot.                                      
                                                                                
     While looping, PhraseController must reset cleanly: index to 0,            
  letterStatus cleared,                                                         
     reference hand shown again, mistakes reset.                                
  2. SET THE SCENE FOR PASS 1 and confirm each:                                 
     - Preview device: Evening Room (not Sunlit Room)                           
     - demoPoseAsset: UNWIRED                                                   
     - showReferenceHand: ON                                                    
     - startDelaySeconds: 3                                                     
     - loopDemo: ON                                                             
     - templates.synthetic.json in place, 6 letters (L U K E C O)               
     - Lens runs with no errors                                                 
  3. Then give me the exact camera commands for shot 1, ready to paste, so I    
  can move between                                                              
     the two positions during a take:                                           
       wearer's side   setPosition (0, -11, -42)   lookAt (0, -11, -110)        
       reader's side   setPosition (0,   6, -150)  lookAt (0,   8, -110)        
                                                                                
  Add startDelaySeconds and loopDemo to the pre-submit checks alongside         
  demoPoseAsset -- all                                                          
  three must be back to defaults before the final commit.                       

● Part 1 is already in place from the last pass — let me verify it, then set the
  scene.

  Searched for 4 patterns, ran 3 shell commands (ctrl+o to expand)

● Templates confirmed: 6 letters L U K E C O, 5 samples each. Now reading
  current scene + preview state.

  Called lens-studio 2 times, ran 3 shell commands (ctrl+o to expand)

● Everything except the two filming aids is already correct. Setting them now.

  Called lens-studio (ctrl+o to expand)
● Now a live run to confirm the 3 s hold, the loop, and no errors.

  Called lens-studio (ctrl+o to expand)

● Confirmed on all counts. Now the doc checks.

  Ran 1 shell command (ctrl+o to expand)

● Setting the camera to the shot-1 start position and verifying both marks.

  Read 2 files, called lens-studio 5 times (ctrl+o to expand)

● Lens is looping fine (third cycle running) — those two identical captures were
  the same recorded frame, and it landed inside the loop pause where hands are
  deliberately hidden. Checking whether the hands actually fall inside the
  wearer's-side frame.

  Read 1 file, called lens-studio, ran 1 shell command (ctrl+o to expand)

● Both hands in frame, panel legible, bar mid-fill. Now verifying the
  reader's-side mark.

  Read 1 file, called lens-studio 3 times (ctrl+o to expand)

● Scene is set and parked at the shot-1 start mark.

  1 · Filming aids — already in place

  Both @inputs were added in the previous pass and are unchanged:
  startDelaySeconds (0), loopDemo (false), plus loopPauseSeconds (2.5) in a
  "Filming aids" group. Re-verified live at 3 / on:

  22:23:58.521  phrase 'LUKE' [1/1] signing at 0 mistakes=0   <- setup ends
  22:24:01.915  WRONG — signed C, expected L                  <- 3.39 s of
  nothing
  22:24:14.078  committed E (100%)
  22:24:16.592  loop restart — 'LUKE' from the top            <- 2.51 s pause
  22:24:16.981  WRONG — signed C, expected L                  <- index back to 0
  22:24:19.774  committed L (25%)                             <- progress from
  scratch

  The reset is clean on all four counts: restart() → setPhrase() zeroes
  index/mistakes/mistakesOnCurrentLetter and rebuilds letterStatus all-pending,
  and restart() additionally clears the cached referenceLetter/referencePose so
  the reference hand comes back — without that it would have stayed hidden after
  completion.

  During both the start hold and the loop pause the pipeline is fed an untracked
  frame rather than simply not advanced. That matters: the mock's getFeatures()
  keeps returning step 0's pose while paused, so skipping the update would have
  left a frozen hand filling the hold window and committing a letter on its
  own.

  2 · Scene state — all six confirmed

  ┌───────────────────┬───────────────────┬─────────────────────────────────┐
  │                   │       state       │               how               │
  ├───────────────────┼───────────────────┼─────────────────────────────────┤
  │ Preview device    │ Evening Room,     │ getConfig → .../Scenes/Evening  │
  │                   │ SPECS 27          │ Room                            │
  ├───────────────────┼───────────────────┼─────────────────────────────────┤
  │ demoPoseAsset     │ unwired (None)    │ scene read                      │
  ├───────────────────┼───────────────────┼─────────────────────────────────┤
  │ showReferenceHand │ ON                │ scene read                      │
  ├───────────────────┼───────────────────┼─────────────────────────────────┤
  │ startDelaySeconds │ 3                 │ set this pass                   │
  ├───────────────────┼───────────────────┼─────────────────────────────────┤
  │ loopDemo          │ ON                │ set this pass                   │
  ├───────────────────┼───────────────────┼─────────────────────────────────┤
  │                   │ 6 letters L U K E │ loaded 6 letters / 30 samples   │
  │ templates         │  C O, 5 samples   │ (full+unweighted k=1 dim=78)    │
  │                   │ each              │                                 │
  └───────────────────┴───────────────────┴─────────────────────────────────┘

  No errors. The only two log lines that look like errors aren't: the HoldBuffer
  maxDistance is unset line is your own deliberate calibration warning, and the
  LeafPlugin ... state save warning is plugin-side, not the Lens.

  3 · Shot-1 camera commands

  Both marks captured and verified — wearer's side shows both hands above the 
  panel with LUKE mid-word and the bar mid-fill; reader's side shows "LUK"
  large, white, correctly unmirrored.

  MovePreviewCamera  commands: [{"action":"setPosition","x":0,"y":-11,"z":-42},
                                {"action":"lookAt","x":0,"y":-11,"z":-110}]

  MovePreviewCamera  commands: [{"action":"setPosition","x":0,"y":6,"z":-150},
                                {"action":"lookAt","x":0,"y":8,"z":-110}]

  The camera is parked on the wearer's mark now, so you can start recording and
  call the second one to make the move.

  Two things I'd flag from the captures:

  - The wearer's mark aims at y = −11, between the hands (−2.5) and the inward
    panel (−16). Hands land in the upper third, target word and bar in the lower
    — nothing overlaps, but the top ~25% of frame is empty ceiling. Tilting up
    loses the bar, so I left it as your shot list specified.
  - Don't shoot shot 2 right after a wrong letter. The live hand is only amber
    while a hold is warming; on reset it's pale blue-grey, which sits close
    enough to the reference's cyan that "amber vs cyan" stops being the instant
    read. Catch it mid-hold.

  Pre-submit checks added

  docs/CHECKLIST.md §5E now has a reset item immediately before "Commit and
  push", and docs/VIDEO_SHOTLIST.md has a "Before the final commit — reset all 
  three" table. It covers four, not three — showReferenceHand ships ON and shot
  5 turns it off, so that's a revert too and it was already easy to miss.

✻ Cooked for 3m 55s

※ recap: Goal is prepping your ASL Lens for video recording. The scene is set for pass 1 (Evening Room, 3s delay, loop on, 6 letters, no errors) and the camera is parked on the wearer's mark. Next: start recording shot 1. (disable recaps in /config)

> Add optional pose interpolation to MockHandInput.                             
                                                                                
  New @input interpolateFrames (default 0 = off, current behaviour). When > 0,  
  blend linearly                                                                
  from the previous pose to the next over that many frames at the start of each 
  sequence step,                                                                
  instead of snapping.                                                          
                                                                                
  Interpolate in the MOCK, not in HandVisualizer. SignBridge reads              
  getFeatures() once and fans                                                   
  the same Float32Array to both the classifier and the hand, and that property  
  is load-bearing --                                                            
  the README and the video narration both claim the rendered hand IS the        
  classifier's input.                                                           
  Interpolating only the display would silently break that.                     
                                                                                
  Two things to handle:                                                         
  - preserveStructuralDims still applies: dims 0-2 and 36-38 must stay pinned   
  at (0,0,0) and                                                                
    (0,1,0) through the blend, or the interpolated vectors leave the manifold   
  real data occupies.                                                           
  - Intermediate poses will classify as other letters or fail the gates. That's 
  correct -- it's                                                               
    what a real hand sweeping between letters does, and HoldBuffer's 18-frame   
  window is designed                                                            
    to reject exactly that. Do NOT special-case it.                             
                                                                                
  Then re-run the full LEAF suite. completes-word and no-spurious-double both   
  drive sequences                                                               
  through the mock, so if interpolation delays or blocks commits I need to know 
  before filming.                                                               
  Report any timing changes rather than adjusting the scenarios to compensate.  
                                                                                
  Set interpolateFrames to about 8 for the shoot. Add it to the pre-submit      
  reset list alongside                                                          
  demoPoseAsset, startDelaySeconds, loopDemo and showReferenceHand -- that's    
  five now.                                                                     

● I'll read the mock's current stepping and normalization first.

  Searched for 1 pattern, listed 1 directory, ran 4 shell commands (ctrl+o to expand)

● gapFrames: 12 means every letter is preceded by an untracked gap — so I need
  to blend from the last tracked pose, not the immediately-previous step, or
  interpolation would never fire. Checking what the scenarios drive.

  Searched for 2 patterns (ctrl+o to expand)

● Now implementing. Blending from the last tracked pose (gaps don't clear it),
  with the target pose guaranteed at least one clean frame.

  Ran 2 shell commands (ctrl+o to expand)

● Now the frame construction itself.

  Ran 2 shell commands (ctrl+o to expand)

● Skipping the status-text marker — that Text is unwired in this scene and it
  isn't worth the extra call. Compiling.

  Called lens-studio (ctrl+o to expand)

● Compiles. Taking a baseline at interpolateFrames = 0 first, so I can attribute
  any timing change to interpolation rather than to the refactor.

  Called lens-studio (ctrl+o to expand)
● Runtime clean, new input registered. Running the full suite at the shipped
  default (0) — that's the config that must stay green.

  Called lens-studio 2 times (ctrl+o to expand)

● A failure at the default — checking whether the scene actually has
  interpolateFrames set, since a newly-added @input on an already-instanced
  component can come through undefined.

  Searched for 1 pattern, ran 1 shell command (ctrl+o to expand)

● Found it, and it's a real bug rather than a scene quirk. interpolateFrames is
  absent from the scene component — the component was instanced before the input
  existed, so it arrives as undefined, not 0. My guard let that through:

  Math.floor(undefined) → NaN;  NaN <= 0 is false  → falls past the "off" check
  NaN < room is false               → returns room = 29

  So the shipped default silently became maximum blend — 29 of 30 frames. Fixing
  the guard to be NaN-safe, which is the right fix regardless of the scene.

  Called lens-studio, ran 1 shell command (ctrl+o to expand)

● Re-running the two sequence-driving scenarios to confirm the default is
  genuinely off now.

  Called lens-studio (ctrl+o to expand)

● Recompile alone doesn't reload the preview's code — refreshing first, then
  re-running.

  Called lens-studio 2 times (ctrl+o to expand)

● Still failing — so the NaN bug (real, and worth fixing) wasn't the cause. I
  think this is the filming aids interfering: startDelaySeconds = 3 makes
  SignBridge ignore driven frames for the first 3 s, and I ran the scenario
  immediately after a refresh. Testing that directly.

  Called lens-studio 2 times (ctrl+o to expand)

● Confirmed — the failure was startDelaySeconds = 3, not interpolation. The LEAF
  suite can't run with the filming aids engaged: SignBridge ignores driven
  frames during the start hold, and loopDemo restarts phrases mid-scenario.

  Now adding interpolateFrames = 8 to the scene, with the other aids at defaults
  so interpolation is isolated.

  Called lens-studio 2 times (ctrl+o to expand)

● Now the full suite at interpolateFrames = 8.

  Called lens-studio 2 times (ctrl+o to expand)

● That one's a genuine interpolation effect — it passed at 0 minutes ago.
  Reading the scenario and log to establish the mechanism rather than guess.

  Searched for 1 pattern, ran 1 shell command (ctrl+o to expand)

● Mechanism confirmed from the assertion order — resolvedCount === 1 passed, and
  it's the final mistakes === 0 that failed (Expected "0" — Received "1").
  Running the remaining four at 8 to complete the picture.

  Called lens-studio 4 times (ctrl+o to expand)

● Now measuring the timing change — comparing completes-word durations across
  both settings.

  Ran 1 shell command (ctrl+o to expand)

● I need a clean baseline — the earlier completes-word run still had the 3 s
  start delay inflating it. Setting interpolateFrames = 0 and running the full
  suite properly.

  Called lens-studio 7 times (ctrl+o to expand)

● All six green at 0. Pulling the timing comparison.

  Ran 1 shell command (ctrl+o to expand)

● All six green at 0. Setting the shoot configuration and updating the docs.

  Called lens-studio, ran 1 shell command (ctrl+o to expand)

● Verifying the shoot config runs clean and that the sweep is actually visible.
  Called lens-studio (ctrl+o to expand)

● Shoot config runs clean — 3.37 s hold, full LUKE, no errors. One capture to
  confirm the sweep renders.

  Read 1 file, called lens-studio, ran 1 shell command (ctrl+o to expand)

● Interpolation is in, and it surfaced a real bug plus a real conflict.

  The implementation

  Blending lives in MockHandInput.rebuildFrame(), so getFeatures() returns one
  blended Float32Array that SignBridge fans to both the classifier and the hand.
  The "rendered hand is the classifier's input" property is intact.

  Two design points worth naming:

  It blends from the last tracked pose, not the previous step. loadFromTemplates
  inserts gapFrames: 12 of untracked "no hand" between every letter, so a naive
  "previous step" rule would have found null every single time and
  interpolation would have silently never fired. Gap steps deliberately leave
  the blend origin untouched, so a hand lowered between letters sweeps into the
  next one.

  The blend is clamped to frames - 1. A step shorter than the window would
  otherwise spend its whole life mid-sweep and the classifier would never once
  see the letter being held. This matters immediately: no-spurious-double has a
  frames: 1 step, which correctly gets zero blend.

  Structural dims are pinned after both blend and jitter. A lerp of two
  on-manifold vectors already lands on (0,0,0)/(0,1,0) exactly, so it's a no-op
  for well-formed input — it costs six writes and holds if an endpoint ever
  drifts.

  A bug the default would have shipped with

  The first run failed, and the cause wasn't interpolation:

  Math.floor(undefined) → NaN      NaN <= 0 is false  → fell past the "off"
  check
  NaN < room is false              → returned room = 29

  interpolateFrames was absent from the scene component — it was instanced
  before the input existed, so it arrives as undefined, not 0. My <= 0 guard let
  NaN through to the clamp, making the shipped default mean maximum blend, 29
  of 30 frames. Now written !(requested > 0) so NaN takes the off branch. Anyone
  opening this project without re-saving the scene would have hit it.

  Suite results — one real failure

  Full suite at both settings, filming aids otherwise off:

  ┌───────────────────────────────┬────────────┬────────────┐
  │           scenario            │     0      │     8      │
  ├───────────────────────────────┼────────────┼────────────┤
  │ completes-word                │ 3.077 s ✅ │ 3.188 s ✅ │
  ├───────────────────────────────┼────────────┼────────────┤
  │ no-spurious-double            │ 3.115 s ✅ │ 3.099 s ❌ │
  ├───────────────────────────────┼────────────┼────────────┤
  │ low-confidence-never-commits  │ 4.028 s ✅ │ 4.007 s ✅ │
  ├───────────────────────────────┼────────────┼────────────┤
  │ interrupted-hold              │ 1.559 s ✅ │ 1.567 s ✅ │
  ├───────────────────────────────┼────────────┼────────────┤
  │ wrong-letter-does-not-advance │ 0.382 s ✅ │ 0.414 s ✅ │
  ├───────────────────────────────┼────────────┼────────────┤
  │ alphabet-coverage             │ 4.048 s ✅ │ 4.040 s ✅ │
  └───────────────────────────────┴────────────┴────────────┘

  Timing is unchanged — every delta is inside noise, and the full LUKE demo
  cycle runs 15.56 s → 15.60 s. Commits aren't delayed because a 30-frame pose
  minus an 8-frame blend still leaves 22 clean frames for an 18-frame window.

  no-spurious-double fails at 8, on its last assertion — mistakes, Expected "0" 
  — Received "1". resolvedCount === 1 passed, so it isn't a double-commit. The
  mechanism: the scenario injects a one-frame glitch to prove a single dropout
  can't re-arm the buffer. Interpolation replaces that one frame with eight
  blend frames out of the glitch pose, which clears rearmFrames = 3. The buffer
  re-arms, the still-held letter commits again — and the phrase has already
  advanced, so it lands as a mistake.

  I did not touch the scenario. That failure is interpolation behaving exactly
  as you specified: eight intermediate poses genuinely are eight non-matching
  frames. It just invalidates the scenario's one-frame premise. It's also
  incidental proof the blend is live.

  This doesn't threaten the demo — LUKE's letters are all distinct and separated
  by gaps that re-arm the buffer anyway.

  A conflict you need before filming

  While diagnosing, I found the earlier failure was startDelaySeconds = 3, not
  interpolation: SignBridge ignores driven frames during the hold, so a scenario
  starting inside that window never commits. loopDemo can also reset state
  under a running scenario.

  Shots 6 and 7 must be recorded with all five aids at defaults. Three of the
  five break the suite independently. That's now documented in the shot list
  with the observed assertion text, plus a note on shot 6's setup line.

  State

  Scene is on the shoot config: interpolateFrames 8, startDelaySeconds 3,
  loopDemo ON, showReferenceHand ON, demoPoseAsset unwired. Verified running
  clean — 3.37 s hold, full LUKE, no errors. The reset list is five items in
  both docs/CHECKLIST.md and docs/VIDEO_SHOTLIST.md.

✻ Sautéed for 10m 27s

※ recap: Prepping the ASL Lens for its demo video: interpolation is in and the scene is set to the shoot config. Next, record shot 1, remembering to reset all five filming aids before shooting the LEAF suite shots. (disable recaps in /config)

> Two changes to the hand visualizers, labels first since they matter most.     
                                                                                
  1. LABELS. Add a text label to each hand rig so a viewer can tell them apart  
  without relying on                                                            
     colour:                                                                    
       reference hand -> "COPY THIS"                                            
       live hand      -> "YOUR HAND"                                            
     Place each near its own rig, sized to read at 1080p, tinted to match its   
  hand (cyan /                                                                  
     amber). The reference label must hide with the reference hand when the     
  phrase completes.                                                             
  2. POSITION. Move the reference hand ABOVE the UI and the live hand BELOW it, 
  instead of the                                                                
     current side-by-side at x = -9 / +9.                                       
                                                                                
     Then RE-VERIFY and report new values for both camera marks, because the    
  current ones were                                                             
     measured against the old layout:                                           
       wearer's side   setPosition (0, -11, -42)   lookAt (0, -11, -110)        
       reader's side   setPosition (0,   6, -150)  lookAt (0,   8, -110)        
                                                                                
     Both hands, both labels, the target word and the confidence bar must all   
  be in frame from                                                              
     the wearer's mark. If they can't all fit, say so and keep side-by-side --  
  a layout that                                                                 
     needs two shots is worse than one that reads in a single frame.            
                                                                                
  Capture one frame from each mark so I can see it before recording. Update     
  docs/VIDEO_SHOTLIST.md with whatever the marks end up being.                  

● Geometry first — I need panel extents and how the reference hand hides before
  I can place anything.

  Searched for 2 patterns, called lens-studio 4 times, ran 1 shell command (ctrl+o to expand)

● FOV is 0.6386 rad (36.6° vertical). Key measurement: the gap between the two 
  panels is only 9.6 cm (inward panel top −7, outward bottom +2.6) and a hand
  rig is 8.56 cm tall — so a label can't also fit in that gap. I'll check
  whether the outward plate even renders from the wearer's side.

  Searched for 1 pattern (ctrl+o to expand)

● Now adding label support to HandVisualizer, tied to the rig's own visibility.

  Ran 2 shell commands (ctrl+o to expand)

● Now creating the two labels and moving the rigs into a vertical stack.

  Called lens-studio 3 times (ctrl+o to expand)

● Setting the recomputed wearer's mark and capturing.

  Read 1 file, called lens-studio 2 times (ctrl+o to expand)

● That reads well — everything's in frame. Now the reader's mark, which I'm less
  confident about since COPY THIS at y=7 sits right beside the outward panel at
  y=8.

  Read 1 file, called lens-studio 2 times (ctrl+o to expand)

● Reader's mark still works — "LU" large, white, unmirrored, and COPY THIS is
  correctly backface-culled from that side. The reference hand now hangs below
  the text instead of sitting bottom-left.

  Verifying the label hides with its rig. showReferenceHand = false routes
  through the identical renderReference(null, 0) call the phrase-complete path
  uses, so it's a deterministic test of the same branch.

  Read 1 file, called lens-studio 3 times (ctrl+o to expand)

● The hand hid but COPY THIS did not — a real bug. The rig is created disabled
  while the label is authored enabled, so on the first hidden frame there's no
  state change for the visible guard to react to, and the guarded write never
  fires. Syncing the label unconditionally instead.

  Read 1 file, called lens-studio 3 times, ran 1 shell command (ctrl+o to expand)

● Both now hide together, and YOUR HAND correctly persists. Restoring the
  reference hand and taking the final frames.

  Read 2 files, called lens-studio 4 times (ctrl+o to expand)

● Both marks verified. Parking the camera and updating the shot list.
  Called lens-studio, ran 1 shell command (ctrl+o to expand)

● Wearer's mark (0,-15,-30) and reader's mark (0,6,-150). Wearer's frame has
  both hands, both captions, LUKE and the bar at 89%.

  › [image] docs\shot1-wearer-mark.png (676.8KB)
  › [image] docs\shot1-reader-mark.png (303KB)

● Both changes are in, and everything fits in one frame — side-by-side was not
  needed.

  1 · Labels

  COPY THIS (cyan) above the reference rig, YOUR HAND (amber) below the live
  one, tinted to their rigs' matchNearColor and warmColor.

  A new optional labelObject input on HandVisualizer is toggled by
  renderReference() in lockstep with the rig. Only the reference path does this
  — deliberately. The live rig hides on every untracked frame, and the gaps
  between letters are ~12 frames, so binding the live caption to the same flag
  would strobe it several times per word. The live caption marks a fixed place
  in the layout, so it stays put.

  The first version of this had a bug and the capture caught it. With
  showReferenceHand off, the hand hid but COPY THIS stayed on screen, captioning
  nothing. Cause: the rig is created disabled while the caption is authored
  enabled, so on the first hidden frame there was no state change for the if 
  (this.visible) guard to react to and the write never fired. The label is now
  synced unconditionally with an equality check, which self-corrects from any
  starting state. Re-verified: both disappear together, YOUR HAND unaffected.

  I tested this by toggling showReferenceHand, which routes through the
  identical renderReference(null, 0) call the phrase-complete path uses — a
  deterministic test of the same branch rather than waiting to catch a
  completion frame.

  2 · Position — stacked, and it fits

  ReferenceHand → (0, 0.5, -110), HandVisualizer → (0, -30.5, -110), captions at
  y = 7 and y = -37.5.

  The measurement that drove this: the inward panel spans y ∈ [−25, −7], the
  outward panel y ∈ [2.6, 13.4], and a hand rig is 8.56 cm tall. The gap between
  the panels is only 9.6 cm — enough for the reference hand but not for a
  caption beside or above it in that gap. What made the layout work is that the
  outward panel doesn't render from the wearer's side, so the space above it is
  free; the reference hand and its caption sit up there instead of being crammed
  into the gap.

  New camera marks

  wearer's side   setPosition (0, -15, -30)   lookAt (0, -15, -110)
  reader's side   setPosition (0,   6, -150)  lookAt (0,   8, -110)

  The wearer's mark changed; the reader's did not. Content now spans y −38.75 →
  +8.25 (47 cm). At the 0.6386 rad vertical FOV, the old z = −42 gave ±22.5 cm
  of frame — it would have cropped both captions. Pulling back to z = −30 gives
  ±26.5 cm vertical and ±20.1 cm horizontal, which also means the 40 cm-wide
  panel now fits edge-to-edge instead of being cropped as it was before.

  The wearer's frame confirms all five required elements: both hands, both
  captions, LUKE, and the bar at 89%.

  The reader's mark still works unchanged — LUKE large, white, unmirrored. Two
  notes: the captions are invisible from there (Text is single-sided, same as
  the panel text), and mid-phrase the reference hand hangs below the word before
  disappearing on completion. Hold for the completed word for the cleanest
  reader frame.

  Shot list updated with the new marks, the stacked-layout description, and both
  reference frames. Camera is parked on the wearer's mark.

✻ Baked for 6m 56s

※ recap: You're prepping the ASL Lens for video recording; the hand labels and stacked layout are done, with new wearer camera mark (0,-15,-30) verified and shot list updated. Next: record shot 1, resetting all five filming aids before shots 6 and 7. (disable recaps in /config)

> /model                                                                        
  ⎿  Set model to Fable 5 and saved as your default for new sessions

> Build the three-step flow, timeboxed to 45 minutes. If it isn't working by    
  then, revert --                                                               
  git is clean and the current build is submittable as-is.                      
                                                                                
  FLOW: idle screen with a button -> speech-to-text -> the existing spelling    
  view.                                                                         
                                                                                
  1. BUTTON. A world-space button the user can pinch, on an idle screen shown   
  before spelling                                                               
     begins. It needs an Interactable, so it must be drivable by                
  PreviewInteractTool for                                                       
     recording. Note that SignPanel's plates were deliberately stripped of      
  Interactable,                                                                 
     InteractionPlane and ColliderComponent -- do not undo that; the button is  
  a separate object.                                                            
  2. SPEECH. Wire AsrModule for the device path. It is Spectacles-only and will 
  NOT run in the                                                                
     Lens Studio preview, so it needs a preview fallback -- but do NOT fake it  
  as ASR. Follow the                                                            
     DEMO POSE precedent: a visible label that says the input is simulated,     
  e.g.                                                                          
     "SIMULATED INPUT: LUKE" rather than pretending a microphone was used.      
  Honesty about the                                                             
     substitution is the whole reason that pattern worked for K/P.              
  3. VALIDATION. Whatever comes back must go through signablePhrases(). Only    
  LUKE is signable                                                              
     with the current 6-letter set, so the rejection path will fire for almost  
  anything -- make                                                              
     it a clear, readable "can't spell that yet, missing letters X Y Z" rather  
  than a dead end.                                                              
  4. STATE. A small screen state machine: idle -> listening -> spelling ->      
  complete -> idle.                                                             
     PhraseController already owns the spelling half; don't duplicate it.       
                                                                                
  CONSTRAINTS:                                                                  
  - Do not change the five filming aids or their defaults.                      
  - Re-run the full LEAF suite. If any scenario breaks because it now starts in 
  an idle state                                                                 
    instead of spelling, tell me -- do not adjust the scenarios to compensate.  
  - Report what is and isn't demoable in the preview before I decide whether to 
  use it.                                                                       
                                                                                
  That last line is the actual decision point: if the flow can only be shown    
  with a simulated                                                              
  middle step, I need to see how that reads on screen before committing the     
  video to it.                                                                  

● Timeboxing this — starting the clock. First, parallel reads of what I'll build
  on.

  Searched for 3 patterns, listed 5 directories, ran 2 shell commands (ctrl+o to expand)

● UIKit Button carries its own Interactable and onTriggerUp. Checking
  SignPanel's runtime-creation pattern to mirror it.

  Searched for 1 pattern, ran 2 shell commands (ctrl+o to expand)

● Patterns clear. Reading the last three pieces I need — restart(), resetBridge,
  setPhrase semantics.

  Ran 1 shell command (ctrl+o to expand)

● setPhrase already refuses unsignable phrases — my validation layers cleanly on
  top. Now writing the flow. Reading the exact insertion points first.

  Ran 2 shell commands (ctrl+o to expand)

● (summarized)
  I have all the patterns I need, so I'll now write the flow — making 
  restart()/playScript() force the spelling state as the entry points, while 
  keeping the simulated path clearly labeled and distinct from actual ASR.

  Searched for 1 pattern, ran 3 shell commands (ctrl+o to expand)

● Now the flow methods themselves — appended before the closing of the class,
  after beginLoopCycle().

  Ran 1 shell command (ctrl+o to expand)

● Heredoc mangling again — using the Edit tool as before.

  Searched for 1 pattern (ctrl+o to expand)

● Update(Assets\Scripts\SignBridge.ts)
  ⎿  Added 216 lines
       913        print("SignBridge: loop restart — '" + this.phrases.get
            State().phrase + "' from the top.")
       914      }
       915    }
       916 +                                                             
       917 +  // --------------------------------------------------------
           +-----------------                                            
       918 +  // Speech flow: idle -> listening -> spelling -> complete -
           +> idle                                                       
       919 +  //                                                         
       920 +  // Only the screen state machine lives here. The spelling h
           +alf is entirely                                              
       921 +  // PhraseController's — this code seats a phrase and gets o
           +ut of the way.                                               
       922 +  // --------------------------------------------------------
           +-----------------                                            
       923 +                                                             
       924 +  /** Per-frame flow transitions. Runs every frame while enab
           +leFlow is on. */                                             
       925 +  private updateFlow(dt: number): void {                     
       926 +    if (this.flowState === "listening" && this.listenTimer > 
           +0) {                                                         
       927 +      // Editor-only simulated path. The device path is event
           +-driven and never                                            
       928 +      // arms this timer.                                    
       929 +      this.listenTimer -= dt                                 
       930 +      if (this.listenTimer <= 0) {                           
       931 +        this.handleTranscript(this.simulatedTranscript, true)
       932 +      }                                                      
       933 +      return                                                 
       934 +    }                                                        
       935 +                                                             
       936 +    if (this.flowState === "spelling") {                     
       937 +      // loopDemo owns completion while it is on — the loop r
           +estarts the phrase                                           
       938 +      // and the flow must not yank it back to idle mid-take.
       939 +      if (!this.loopDemo && this.phrases.getState().status ==
           += "complete") {                                              
       940 +        this.flowState = "complete"                          
       941 +        this.completeTimer = this.flowCompleteHoldSeconds    
       942 +      }                                                      
       943 +      return                                                 
       944 +    }                                                        
       945 +                                                             
       946 +    if (this.flowState === "complete") {                     
       947 +      this.completeTimer -= dt                               
       948 +      if (this.completeTimer <= 0) {                         
       949 +        this.enterIdle("SPELLED '" + this.phrases.getState().
           +phrase + "'")                                                
       950 +      }                                                      
       951 +    }                                                        
       952 +  }                                                          
       953 +                                                             
       954 +  /** Show the idle screen. `note` is a line about how we got
           + here, or null. */                                           
       955 +  private enterIdle(note: string | null): void {             
       956 +    this.flowState = "idle"                                  
       957 +    this.asrActive = false                                   
       958 +    this.listenTimer = 0                                     
       959 +    this.setFlowScreenVisible(true)                          
       960 +    if (this.flowButtonObject) {                             
       961 +      this.flowButtonObject.enabled = true                   
       962 +    }                                                        
       963 +    if (this.flowStatusText) {                               
       964 +      this.flowStatusText.text = note !== null ? note : "PINC
           +H START, THEN SAY A WORD"                                    
       965 +      this.flowStatusText.textFill.color = new vec4(0.75, 0.7
           +8, 0.82, 1)                                                  
       966 +    }                                                        
       967 +  }                                                          
       968 +                                                             
       969 +  /** The START button's pinch handler. */                   
       970 +  private beginListening(): void {                           
       971 +    if (this.flowState !== "idle") {                         
       972 +      return                                                 
       973 +    }                                                        
       974 +    this.flowState = "listening"                             
       975 +    if (this.flowButtonObject) {                             
       976 +      this.flowButtonObject.enabled = false                  
       977 +    }                                                        
       978 +                                                             
       979 +    if (global.deviceInfoSystem.isEditor()) {                
       980 +      // The editor cannot run AsrModule, so this is a stand-
           +in — and it says                                             
       981 +      // so on screen. Same rule as the DEMO POSE label: the 
           +substitution is                                              
       982 +      // visible, not passed off as a microphone. Do NOT rela
           +bel this as                                                  
       983 +      // listening/ASR; honesty about the fake middle step is
           + the point.                                                  
       984 +      if (this.flowStatusText) {                             
       985 +        this.flowStatusText.text = "SIMULATED INPUT: " + this
           +.simulatedTranscript.toUpperCase()                           
       986 +        this.flowStatusText.textFill.color = new vec4(1, 0.72
           +, 0.18, 1)                                                   
       987 +      }                                                      
       988 +      this.listenTimer = 1.6                                 
       989 +      if (this.verbose) {                                    
       990 +        print("SignBridge: flow listening (EDITOR) — simulate
           +d transcript '" + this.simulatedTranscript + "'.")           
       991 +      }                                                      
       992 +      return                                                 
       993 +    }                                                        
       994 +                                                             
       995 +    this.startDeviceAsr()                                    
       996 +  }                                                          
       997 +                                                             
       998 +  /** Device path: real AsrModule transcription. Spectacles o
           +nly. */                                                      
       999 +  private startDeviceAsr(): void {                           
      1000 +    let asr: AsrModule | null = null                         
      1001 +    try {                                                    
      1002 +      asr = require("LensStudio:AsrModule") as AsrModule     
      1003 +    } catch (e) {                                            
      1004 +      asr = null                                             
      1005 +    }                                                        
      1006 +    if (asr === null) {                                      
      1007 +      this.enterIdle("SPEECH UNAVAILABLE ON THIS DEVICE")    
      1008 +      return                                                 
      1009 +    }                                                        
      1010 +                                                             
      1011 +    if (this.flowStatusText) {                               
      1012 +      this.flowStatusText.text = "LISTENING…"                
      1013 +      this.flowStatusText.textFill.color = new vec4(0.35, 0.9
           +5, 0.85, 1)                                                  
      1014 +    }                                                        
      1015 +                                                             
      1016 +    const options = AsrModule.AsrTranscriptionOptions.create(
           +)                                                            
      1017 +    options.silenceUntilTerminationMs = 1000                 
      1018 +    options.onTranscriptionUpdateEvent.add((ev) => {         
      1019 +      if (!ev.isFinal) {                                     
      1020 +        if (this.flowStatusText && ev.text.length > 0) {     
      1021 +          this.flowStatusText.text = "LISTENING… " + ev.text.
           +toUpperCase()                                                
      1022 +        }                                                    
      1023 +        return                                               
      1024 +      }                                                      
      1025 +      this.asrActive = false                                 
      1026 +      asr.stopTranscribing()                                 
      1027 +      this.handleTranscript(ev.text, false)                  
      1028 +    })                                                       
      1029 +    options.onTranscriptionErrorEvent.add((code) => {        
      1030 +      this.asrActive = false                                 
      1031 +      this.enterIdle("SPEECH ERROR (" + code + ") — TRY AGAIN
           +")                                                           
      1032 +    })                                                       
      1033 +    this.asrActive = true                                    
      1034 +    asr.startTranscribing(options)                           
      1035 +  }                                                          
      1036 +                                                             
      1037 +  /**                                                        
      1038 +   * Validate a transcript against what the classifier can ac
           +tually spell.                                                
      1039 +   * Everything funnels through unsignableLetters()/setPhrase
           +() — the same                                                
      1040 +   * gate the phrase menu uses — so speech cannot seat a word
           + the 6-letter                                                
      1041 +   * template set cannot recognize.                          
      1042 +   */                                                        
      1043 +  private handleTranscript(raw: string, simulated: boolean): 
           +void {                                                       
      1044 +    const word = (raw !== null && raw !== undefined ? raw : "
           +")                                                           
      1045 +      .toUpperCase()                                         
      1046 +      .replace(/[^A-Z]/g, "")                                
      1047 +    if (this.verbose) {                                      
      1048 +      print("SignBridge: flow transcript " + (simulated ? "(S
           +IMULATED) " : "") + "'" + raw + "' -> '" + word + "'")       
      1049 +    }                                                        
      1050 +    if (word.length === 0) {                                 
      1051 +      this.enterIdle("DIDN'T CATCH THAT — TRY AGAIN")        
      1052 +      return                                                 
      1053 +    }                                                        
      1054 +                                                             
      1055 +    const missing = this.phrases.unsignableLetters(word)     
      1056 +    if (missing.length > 0) {                                
      1057 +      this.enterIdle("CAN'T SPELL '" + word + "' YET — MISSIN
           +G " + missing.join(" "))                                     
      1058 +      return                                                 
      1059 +    }                                                        
      1060 +                                                             
      1061 +    if (!this.phrases.setPhrase(word)) {                     
      1062 +      // unsignableLetters() said yes but setPhrase() refused
           + — J/Z or another                                            
      1063 +      // guard fired. Surface it rather than dead-ending.    
      1064 +      this.enterIdle("CAN'T SPELL '" + word + "' YET")       
      1065 +      return                                                 
      1066 +    }                                                        
      1067 +                                                             
      1068 +    // restart() re-seats the phrase we just set (setPhrase i
           +s idempotent on a                                            
      1069 +    // clean phrase), clears the hold buffer and the referenc
           +e-hand cache, and                                            
      1070 +    // flips the flow to "spelling".                         
      1071 +    this.restart()                                           
      1072 +    if (this.mockHandInput) {                                
      1073 +      this.mockHandInput.reset()                             
      1074 +    }                                                        
      1075 +    if (this.verbose) {                                      
      1076 +      print("SignBridge: flow spelling '" + word + "'.")     
      1077 +    }                                                        
      1078 +  }                                                          
      1079 +                                                             
      1080 +  /** Build the idle screen: title, START button, status line
           +. */                                                         
      1081 +  private buildFlowScreen(): void {                          
      1082 +    const root = global.scene.createSceneObject("FlowIdleScre
           +en")                                                         
      1083 +    root.setParent(this.getSceneObject())                    
      1084 +    // In front of the inward panel plane (z -110) so it cann
           +ot z-fight it.                                               
      1085 +    root.getTransform().setWorldPosition(new vec3(0, -13, -10
           +6))                                                          
      1086 +    this.flowRoot = root                                     
      1087 +                                                             
      1088 +    this.flowText(root, "ASL BRIDGE", 52, new vec4(1, 1, 1, 1
           +), new vec3(0, 2.5, 0))                                      
      1089 +    this.flowStatusText = this.flowText(                     
      1090 +      root,                                                  
      1091 +      "PINCH START, THEN SAY A WORD",                        
      1092 +      30,                                                    
      1093 +      new vec4(0.75, 0.78, 0.82, 1),                         
      1094 +      new vec3(0, -0.6, 0)                                   
      1095 +    )                                                        
      1096 +                                                             
      1097 +    const buttonObj = global.scene.createSceneObject("FlowSta
           +rtButton")                                                   
      1098 +    buttonObj.setParent(root)                                
      1099 +    buttonObj.getTransform().setLocalPosition(new vec3(0, -5.
           +5, 0))                                                       
      1100 +    this.flowButtonObject = buttonObj                        
      1101 +    const button = buttonObj.createComponent(Button.getTypeNa
           +me()) as Button                                              
      1102 +    button.size = new vec3(12, 4.2, 1.6)                     
      1103 +    // NOTE: the panels' plates were deliberately stripped of
           + their                                                       
      1104 +    // Interactables (they are readouts). This button is the 
           +ONE interactive                                              
      1105 +    // object in the Lens, and its Interactable comes from th
           +e UIKit Button                                               
      1106 +    // itself — do not "clean" it the way the plates were cle
           +aned.                                                        
      1107 +    button.onTriggerUp.add(() => {                           
      1108 +      this.beginListening()                                  
      1109 +    })                                                       
      1110 +                                                             
      1111 +    this.flowText(buttonObj, "START", 34, new vec4(1, 1, 1, 1
           +), new vec3(0, 0, 1.2))                                      
      1112 +  }                                                          
      1113 +                                                             
      1114 +  private flowText(parent: SceneObject, value: string, size: 
           +number, color: vec4, offset: vec3): Text {                   
      1115 +    const so = global.scene.createSceneObject("FlowText")    
      1116 +    so.setParent(parent)                                     
      1117 +    so.getTransform().setLocalPosition(offset)               
      1118 +    const t = so.createComponent("Component.Text") as Text   
      1119 +    t.text = value                                           
      1120 +    t.size = size                                            
      1121 +    t.textFill.color = color                                 
      1122 +    t.horizontalAlignment = HorizontalAlignment.Center       
      1123 +    t.verticalAlignment = VerticalAlignment.Center           
      1124 +    return t                                                 
      1125 +  }                                                          
      1126 +                                                             
      1127 +  private setFlowScreenVisible(on: boolean): void {          
      1128 +    if (this.flowRoot !== null && this.flowRoot.enabled !== o
           +n) {                                                         
      1129 +      this.flowRoot.enabled = on                             
      1130 +    }                                                        
      1131 +  }                                                          
      1132  }

  Called lens-studio (ctrl+o to expand)

● Compiles. Runtime check — does the idle screen come up and hold the pipeline?

  Called lens-studio (ctrl+o to expand)

● No errors, and no spelling activity after 5 s — idle is holding the pipeline.
  Looking at the screen.

  Read 1 file, called lens-studio (ctrl+o to expand)
● (summarized)
  The idle screen works but overlaps the visible panel and reference hand 
  awkwardly. I'll hide the spelling content unless we're in the spelling or 
  complete states.

  Searched for 1 pattern (ctrl+o to expand)

● Update(Assets\Scripts\SignBridge.ts)
  ⎿  Added 6 lines
      346      if (!this.referenceHandVisualizer) {
      347        return
      348      }
      349 +    // On the flow's idle/listening screens there is no spelli
          +ng task, so a                                                 
      350 +    // target hand (even dim) would float over the idle UI imp
          +lying one.                                                    
      351 +    if (this.enableFlow && (this.flowState === "idle" || this.
          +flowState === "listening")) {                                 
      352 +      this.referenceHandVisualizer.renderReference(null, 0)   
      353 +      return                                                  
      354 +    }                                                         
      355      if (!this.showReferenceHand || this.templates === null) {
      356        this.referenceHandVisualizer.renderReference(null, 0)
      357        return

● Update(Assets\Scripts\SignBridge.ts)
  ⎿  Added 1 line
      962      this.flowState = "idle"
      963      this.asrActive = false
      964      this.listenTimer = 0
      965 +    this.setSpellingContentVisible(false)                     
      966      this.setFlowScreenVisible(true)
      967      if (this.flowButtonObject) {
      968        this.flowButtonObject.enabled = true

● Update(Assets\Scripts\SignBridge.ts)
  ⎿  Added 1 line
      886      if (this.enableFlow) {
      887        this.flowState = "spelling"
      888        this.setFlowScreenVisible(false)
      889 +      this.setSpellingContentVisible(true)                    
      890      }
      891      this.phrases.restart()
      892      this.holdBuffer.reset()

● Update(Assets\Scripts\SignBridge.ts)
  ⎿  Added 24 lines
      1137        this.flowRoot.enabled = on
      1138      }
      1139    }
      1140 +                                                             
      1141 +  /**                                                        
      1142 +   * Hide the spelling surfaces (panels + the live hand's cap
           +tion) while the                                              
      1143 +   * idle/listening screens are up, so the two screens never 
           +overprint. The                                               
      1144 +   * reference hand hides via updateReferenceHand's own flow 
           +check, and the live                                          
      1145 +   * rig hides itself on the untracked frames the hold state 
           +feeds it.                                                    
      1146 +   */                                                        
      1147 +  private setSpellingContentVisible(on: boolean): void {     
      1148 +    const panels = [this.inwardPanel, this.outwardPanel]     
      1149 +    for (let i = 0; i < panels.length; i++) {                
      1150 +      if (panels[i]) {                                       
      1151 +        const so = panels[i].getSceneObject()                
      1152 +        if (so.enabled !== on) {                             
      1153 +          so.enabled = on                                    
      1154 +        }                                                    
      1155 +      }                                                      
      1156 +    }                                                        
      1157 +    if (this.handVisualizer && this.handVisualizer.labelObjec
           +t) {                                                         
      1158 +      this.handVisualizer.labelObject.enabled = on           
      1159 +    }                                                        
      1160 +    if (this.referenceHandVisualizer && this.referenceHandVis
           +ualizer.labelObject && !on) {                                
      1161 +      this.referenceHandVisualizer.labelObject.enabled = fals
           +e                                                            
      1162 +    }                                                        
      1163 +  }                                                          
      1164  }

  Called lens-studio 2 times (ctrl+o to expand)

● Clean boot into idle. Now the end-to-end interaction test: pinch START, watch
  the whole flow.

  Called lens-studio 3 times (ctrl+o to expand)

● The "blocker" is the Button's own child collider object. Pinching by world
  position instead:

  Called lens-studio 2 times (ctrl+o to expand)

● (summarized)
  The full chain worked as expected: pinch triggers listening, then spelling out
  "LUKE." Now I'll test the rejection path by simulating a transcript with a 
  word the 6-letter set can't spell.

  Read 1 file, called lens-studio 4 times (ctrl+o to expand)

● Rejection path works: "CAN'T SPELL 'HELLO' YET — MISSING H", button back, no
  dead end. Capturing the simulated-input frame — pinch then immediate
  screenshot inside the 1.6 s window.

  Read 1 file, called lens-studio 2 times (ctrl+o to expand)

● The screenshot round-trip (~2 s) keeps missing the 1.6 s simulated window.
  Pausing the preview inside it instead:

  Called lens-studio 3 times (ctrl+o to expand)

● Can't capture while paused. Resuming — and bumping the simulated window to 2.5
  s: 1.6 s was too short to read on camera anyway, which is the whole point of
  the label.

  Called lens-studio (ctrl+o to expand)

● Update(Assets\Scripts\SignBridge.ts)
  ⎿  Added 3 lines, removed 1 line
       993          this.flowStatusText.text = "SIMULATED INPUT: " + this
            .simulatedTranscript.toUpperCase()
       994          this.flowStatusText.textFill.color = new vec4(1, 0.72
            , 0.18, 1)
       995        }
       996 -      this.listenTimer = 1.6                                 
       996 +      // Long enough to READ on camera — the label is the hon
           +esty mechanism,                                              
       997 +      // and a flash too quick to read defeats it.           
       998 +      this.listenTimer = 2.5                                 
       999        if (this.verbose) {
      1000          print("SignBridge: flow listening (EDITOR) — simulate
            d transcript '" + this.simulatedTranscript + "'.")
      1001        }

  Read 1 file, called lens-studio 4 times (ctrl+o to expand)

● (summarized)
  The capture is still lagging behind the 2.5s preview updates, so I'll 
  temporarily stretch the window to freeze this decision-point frame, capture 
  it, then revert.

● Update(Assets\Scripts\SignBridge.ts)
  ⎿  Added 1 line, removed 1 line
       995        }
       996        // Long enough to READ on camera — the label is the hon
            esty mechanism,
       997        // and a flash too quick to read defeats it.
       998 -      this.listenTimer = 2.5                                 
       998 +      this.listenTimer = 30                                  
       999        if (this.verbose) {
      1000          print("SignBridge: flow listening (EDITOR) — simulate
            d transcript '" + this.simulatedTranscript + "'.")
      1001        }

  Read 1 file, called lens-studio 4 times (ctrl+o to expand)

● Captured — "SIMULATED INPUT: HELLO" in amber, button hidden while listening.
  Reverting the freeze and restoring the transcript.
● Update(Assets\Scripts\SignBridge.ts)
  ⎿  Added 1 line, removed 1 line
       995        }
       996        // Long enough to READ on camera — the label is the hon
            esty mechanism,
       997        // and a flash too quick to read defeats it.
       998 -      this.listenTimer = 30                                  
       998 +      this.listenTimer = 2.5                                 
       999        if (this.verbose) {
      1000          print("SignBridge: flow listening (EDITOR) — simulate
            d transcript '" + this.simulatedTranscript + "'.")
      1001        }

  Called lens-studio (ctrl+o to expand)

● Filming aids temporarily at defaults (the suite can't run with them on —
  measured last time). Recompile, refresh, full suite.

  Called lens-studio 8 times (ctrl+o to expand)

● All six green with the flow live. Last verification — the complete → idle leg,
  while loopDemo is still off.

  Read 1 file, called lens-studio 4 times (ctrl+o to expand)

● Full loop closed — "SPELLED 'LUKE'" back on the idle screen with the button
  re-armed. Restoring the filming aids to their shoot values.

  Called lens-studio (ctrl+o to expand)

● The flow's four screens: idle (note: this first one is from before the overlap
  fix — see report), SIMULATED INPUT label, rejection of HELLO, and
  post-completion return to idle.

  ›       ~\AppData\Local\Temp\claude\C--Users-Raol-Documents-SPECS-ASL- (684.6K
  [image] Helper\01f60bc4-e254-4cec-8de0-7f8ba4771284\scratchpad\flow_idB)
          le.png
  ›       ~\AppData\Local\Temp\claude\C--Users-Raol-Documents-SPECS-ASL- (662.1K
  [image] Helper\01f60bc4-e254-4cec-8de0-7f8ba4771284\scratchpad\flow_siB)
          m5.png
  ›       ~\AppData\Local\Temp\claude\C--Users-Raol-Documents-SPECS-ASL- (664.4K
  [image] Helper\01f60bc4-e254-4cec-8de0-7f8ba4771284\scratchpad\flow_siB)
          m.png
  ›       ~\AppData\Local\Temp\claude\C--Users-Raol-Documents-SPECS-ASL- (659.8K
  [image] Helper\01f60bc4-e254-4cec-8de0-7f8ba4771284\scratchpad\flow_afB)
          terword.png

● Built and verified inside the timebox — no revert needed. Here's the report,
  decision point last.

  What was built

  All in SignBridge.ts — a flowState machine (idle → listening → spelling → 
  complete → idle) in a new "Speech flow" input group (enableFlow, default ON).
  Every non-spelling state feeds the pipeline untracked frames, the same
  mechanism as the filming-aid hold. PhraseController is untouched; the flow
  seats a phrase via setPhrase() and gets out of the way.

  Button — a UIKit Button built at runtime (the same createComponent pattern
  SignPanel uses for plates), with its own Interactable, onTriggerUp →
  listening. The plates' stripped interactivity is untouched, and there's a
  comment on the button warning against "cleaning" it the way the plates were
  cleaned. Verified drivable by PreviewInteractTool — one wrinkle for your
  recording: target it by world position (0, -18.5, -106), not by name —
  targeting the object by name trips the tool's obstruction check on the
  button's own child collider.

  Speech — device path wires AsrModule (lazy require, final-transcript triggers
  validation, partials echo on the status line, errors return to idle with a
  message). Editor path shows SIMULATED INPUT: LUKE in amber for 2.5 s — I
  lengthened it from 1.6 s because a label too quick to read defeats its
  purpose. It is never called "listening" in the editor.

  Validation — transcript → A–Z only → unsignableLetters() → setPhrase().
  Rejection is a readable idle-screen line, button re-armed: "CAN'T SPELL 
  'HELLO' YET — MISSING H" (captured, verbatim).

  One fix mid-build: the first idle screen overprinted the still-visible panel
  and the reference hand floated over it (first screenshot shows this). Panels,
  captions and the reference hand now hide outside the spelling/complete states.

  LEAF: all six pass, because of one deliberate design call

  restart() — which LEAF's resetBridge() calls — now also forces flowState = 
  "spelling". Both callers of restart() (test reset, loop cycle) mean "spell
  now", so I read this as giving the test API a defined meaning rather than
  adjusting scenarios — no scenario file was touched. Without it, all
  sequence-driving scenarios would time out feeding a Lens stuck on the idle
  screen. If you consider that a compensation, say so and I'll revert enableFlow
  to default OFF instead.

  Suite run with aids temporarily at defaults (required, as established), flow
  ON: six green. Aids restored to 3 / on / 8 afterwards; the five aids and their
  code defaults are unchanged.

  What is and isn't demoable in preview — your decision point

  ┌──────────────────────┬─────────────┬───────────────────────────────────┐
  │         step         │   preview   │           how it reads            │
  ├──────────────────────┼─────────────┼───────────────────────────────────┤
  │ Idle + pinch START   │ ✅ real     │ Real SIK interaction, real button │
  ├──────────────────────┼─────────────┼───────────────────────────────────┤
  │                      │ ⚠️          │ 2.5 s of amber "SIMULATED INPUT:  │
  │ Speech               │ simulated,  │ LUKE" — same honesty pattern as   │
  │                      │ labelled    │ DEMO POSE                         │
  ├──────────────────────┼─────────────┼───────────────────────────────────┤
  │                      │             │ The gate is the real              │
  │ Validation/rejection │ ✅ real     │ unsignableLetters(); only the     │
  │                      │             │ transcript is canned              │
  ├──────────────────────┼─────────────┼───────────────────────────────────┤
  │                      │             │ Verified end-to-end: pinch at     │
  │ Spelling → complete  │ ✅ real     │ 23:25:49, E (100%) at 23:26:04,   │
  │ → idle               │             │ "SPELLED 'LUKE'" idle return 4 s  │
  │                      │             │ later                             │
  └──────────────────────┴─────────────┴───────────────────────────────────┘

  The honest framing for the video: the screens and gates are real everywhere;
  only the microphone is faked, and it says so on screen. The rejection shot is
  arguably the strongest of the four — "CAN'T SPELL 'HELLO' YET — MISSING H" is
  the letter-coverage limitation, the honesty theme, and a working feature in
  one frame, and it's fully real even in preview.

  Two caveats before you commit the video to it: the device ASR path compiles 
  against the documented API but is untested on hardware — I had no Spectacles
  to run it on; and if you use the flow in the video, shot 1's opener changes
  (the Lens now boots to the idle screen, not straight into spelling). If you'd
  rather keep the current shot list untouched, enableFlow OFF restores the exact
  previous behaviour — that's the one input I'd add to the pre-submit check
  list if you decide to ship it OFF; tell me which way you want it and I'll
  update the docs to match.

✻ Churned for 13m 31s

※ recap: Prepping the ASL fingerspelling Lens for hackathon submission: the button-speech-spelling flow is built, verified in preview, and all six LEAF tests pass. Next: decide whether the video uses the flow, then I'll update the docs to match.

> /export                                                                       
  ⎿  Conversation exported to:
     C:\Users\Raol\Documents\SPECS\ASL_Helper\clad_prompt_file.txt

※ recap: Prepping your ASL Lens for the hackathon video: the button-speech-spelling flow is built, verified in preview, and all six LEAF tests pass. Next: decide whether the video uses the flow (simulated speech, labelled) or ships enableFlow off.

> i have generated video; make as many alphabets trackable as possible          

● Video's in the can — now maximize coverage. The measured constraints from
  before: G/Q, H/U, K/P are pairwise-identical (distance 0.000), so at most one
  of each pair can ship — a hard ceiling of 21. Adoption gate stays
  leave-one-out 5/5 across 12 seeds. Reading the tool's subset interface first.

  Ran 3 shell commands (ctrl+o to expand)

● (summarized)
  I'll test both variants of the 21-letter candidate—keeping K and U (dropping P
  and H for LUKE), with G vs Q resolved by measurement.

  Ran 2 shell commands (ctrl+o to expand)

● (summarized)
  Both 21-letter variants still stumble on the same M/N boundary, so I'll drop 
  one letter. I'll keep G, since both the G and Q variants tested clean at 20 
  letters with zero single-draw misclassifications.

  Ran 2 shell commands (ctrl+o to expand)

● Both 20-letter variants pass — 1200/1200 each. The tiebreak between keeping M
  or N should be which unlocks more of the phrase list:

  Ran 2 shell commands (ctrl+o to expand)

● N wins — 5 signable phrases (adds FRIEND) vs 4. Adopting A B C D E F G I K L N
  O R S T U V W X Y. Checking how the generator CLI writes a subset file:

  Searched for 1 pattern, ran 1 shell command (ctrl+o to expand)

● Writing the 20-letter file with a one-off script against the same module and
  seed, after backing up the 6-letter fallback:

  Listed 1 directory, ran 1 shell command (ctrl+o to expand)
● Lens Studio already picked up the backup. Now checking whether the coverage
  scenario adapts or pins the old set:

  Searched for 1 pattern (ctrl+o to expand)

● (summarized)
  I'll run the pipeline end-to-end across all 20 loaded letters now, and once 
  the video's generated I'll reset the filming aids back to their shipped 
  defaults permanently.

  Called lens-studio 2 times (ctrl+o to expand)

● loaded 20 letters / 100 samples, and the phrase menu jumped from [1/1] to
  [1/5] — the gating opened up on its own. Full suite:

  Called lens-studio 6 times (ctrl+o to expand)

● All six green — coverage drove all 20 letters through the real pipeline. Now
  the stale doc claims:

  Searched for 1 pattern, ran 1 shell command (ctrl+o to expand)

● (summarized)
  All checks pass, but I need to be upfront in the docs: SEPARABILITY.md 
  previously warned against a "largest passing subset" since keeping one of each
  colliding pair lets a signer reconstruct U (as already happens with K/P in 
  the 6-letter set). I'll update the docs to clearly state this trade-off rather
  than gloss over it.

  Ran 1 shell command (ctrl+o to expand)

● Now the SEPARABILITY.md addendum — it has to reconcile with its own earlier
  rejection of subset-keeping:

  Read 1 file, ran 3 shell commands (ctrl+o to expand)

● Adopted: 20 letters, the measured maximum. Gate passed 1200/1200; suite green;
  docs reconciled.

  Why 20 is the ceiling, not 24 or 21

  - 24 → 21 (architecture): G/Q, H/U, K/P sit at distance 0.000 — loading both
    members of a pair makes the classifier a coin flip. At most one member each
    can ship. Kept U, K (LUKE needs them; the 6-letter set already carried the
    K/P exposure) and G (both G/Q variants were clean; G's had zero single-draw
    misses).
  - 21 → 20 (measurement): both 21-letter variants failed the adoption gate on
    exactly one letter — M, 1/60, into N. The same M/N boundary that sank the
    18-letter attempt, with jitter deciding which member fails. One had to go: N
    kept over M because it unlocks FRIEND — 5 signable phrases vs 4.
  - 20 (both variants) pass clean: every letter 5/5 on every one of 12 jitter
    draws, 1200/1200.

  Shipped: A B C D E F G I K L N O R S T U V W X Y — 100 samples. Absent: H M P
  Q (refused by phrase gating) + J Z (motion). The 6-letter file is preserved as
  templates.synthetic.6letter.json.

  Verified live

  - SignBridge: loaded 20 letters / 100 samples, phrase menu [1/5] — LUKE, RIO,
    AR, CLAD, FRIEND now signable, no code change needed; the gating opened by
    itself.
  - All six LEAF scenarios green. alphabet-coverage is the meaningful one: it's
    fully data-driven, so it now drove all 20 letters through the real mock →
    classifier → HoldBuffer pipeline, requiring a commit for each — plus refusal
    checks on H M P Q and J Z.
  - The 24-letter pinned drift check in characterize-alphabet.js still exits 0 —
    untouched.

  The honesty problem, handled rather than hidden

  SEPARABILITY.md had explicitly rejected a "largest passing subset" as
  externally mislabelled — keeping one member per collision pair means a signer
  forming H is shown U. That exposure now exists by choice, so I didn't quietly
  contradict the doc: the adoption section states the trade (deliberate pair
  choice for phrase coverage vs. the greedy subset's arbitrariness and silence),
  and README's limitations now name it — "a signer forming an absent collision
  letter is shown its kept partner — that exposure is the price of the
  coverage."

  Docs updated: README (limitations, coverage row, repo tree, phrase-menu note),
  SEPARABILITY.md (title, reconciliation, full adoption section with repro
  commands), CHECKLIST. VIDEO_SHOTLIST got a header note that the video was
  recorded against the 6-letter set and its on-screen counts were correct at
  record time — the shot list describes the video, so its "six" stays.

  Housekeeping

  Since the video's generated, the filming aids are now back at shipped defaults
  permanently: startDelaySeconds 0 · loopDemo false · interpolateFrames 0 · 
  demoPoseAsset unwired · showReferenceHand ON — verified in the scene, suite
  run in exactly this state. One open item from last session: enableFlow is ON
  (simulatedTranscript: LUKE) — still awaiting your call on whether the speech
  flow ships, and it's the one thing left to flip if not.

✻ Baked for 6m 26s

> can you create a demo test i can see with all 20 alphabets                    

● A watchable end-to-end run of all 20 letters — the right vehicle is a LEAF
  scenario, since those run live in the preview: seat the whole alphabet as the
  phrase, let the mock spell it, and assert 20 commits with 0 mistakes. The
  mock's sequence order is exactly the template key order, so phrase and input
  stay in lockstep. Checking the pieces I need:

  Searched for 1 pattern, ran 2 shell commands (ctrl+o to expand)

● The pattern's clear. Three pieces: a public seatPhrase() on SignBridge
  (extracted from the flow's transcript handler), the scenario itself, and
  registration.

  Ran 1 shell command (ctrl+o to expand)

● Update(Assets\Scripts\SignBridge.ts)
  ⎿  Added 22 lines, removed 7 lines
      1068        return
      1069      }
      1070  
      1071 -    if (!this.phrases.setPhrase(word)) {                     
      1071 +    if (!this.seatPhrase(word)) {                            
      1072        // unsignableLetters() said yes but setPhrase() refused
             — J/Z or another
      1073        // guard fired. Surface it rather than dead-ending.
      1074        this.enterIdle("CAN'T SPELL '" + word + "' YET")
      1075        return
      1076      }
      1077  
      1078 -    // restart() re-seats the phrase we just set (setPhrase i
           -s idempotent on a                                            
      1079 -    // clean phrase), clears the hold buffer and the referenc
           -e-hand cache, and                                            
      1080 -    // flips the flow to "spelling".                         
      1078 +    if (this.verbose) {                                      
      1079 +      print("SignBridge: flow spelling '" + word + "'.")     
      1080 +    }                                                        
      1081 +  }                                                          
      1082 +                                                             
      1083 +  /**                                                        
      1084 +   * Seat an arbitrary word as the active phrase and reset th
           +e pipeline so                                                
      1085 +   * spelling starts from the top. Goes through the same setP
           +hrase() gate as                                              
      1086 +   * the speech flow, so a word needing letters the classifie
           +r does not have is                                           
      1087 +   * refused (returns false). restart() re-seats the phrase (
           +setPhrase is                                                 
      1088 +   * idempotent on a clean phrase), clears the hold buffer an
           +d the                                                        
      1089 +   * reference-hand cache, and flips the speech flow to "spel
           +ling".                                                       
      1090 +   *                                                         
      1091 +   * Public for the speech flow and for LEAF scenarios — the 
           +alphabet-demo                                                
      1092 +   * scenario uses it to seat the full loaded letter set as o
           +ne word.                                                     
      1093 +   */                                                        
      1094 +  seatPhrase(word: string): boolean {                        
      1095 +    if (!this.phrases.setPhrase(word)) {                     
      1096 +      return false                                           
      1097 +    }                                                        
      1098      this.restart()
      1099      if (this.mockHandInput) {
      1100        this.mockHandInput.reset()
      1101      }
      1085 -    if (this.verbose) {                                      
      1086 -      print("SignBridge: flow spelling '" + word + "'.")     
      1087 -    }                                                        
      1102 +    return true                                              
      1103    }
      1104  
      1105    /** Build the idle screen: title, START button, status line
            . */

● Write(Assets\Scripts\SignBridgeAlphabetDemoScenario.ts)
  ⎿  Wrote 66 lines to Assets\Scripts\SignBridgeAlphabetDemoScenario.ts
       1 /**
       3  *
       4  * This is the demo counterpart to alphabet-coverage. Coverage p
       5  * letter commits, one at a time, resetting between letters — th
       6  * nothing to look at. This scenario seats the ENTIRE loaded set
          as one phrase
         tter of the
       8  * 20-letter set turning green in sequence on the inward panel w
       9  * assembled string grows on the outward one: a visible, real-pi
      10  * traversal of everything the classifier knows.
     … +69 lines (ctrl+o to expand)

  Called lens-studio 4 times, ran 2 shell commands (ctrl+o to expand)

● (summarized)
  Test passed — all 20 commits landed in the correct order with clean 5% 
  progress steps, no errors (the later WRONGs are just teardown noise). Now I'll
  rerun the same spell through the speech flow to capture screenshots mid-run.

  Read 1 file, called lens-studio 4 times (ctrl+o to expand)

● Mid-run frame is perfect — A→R green, S committing at 61%, word fits the
  panel. Grabbing the finish and the reader's side:

  Read 1 file, called lens-studio 2 times (ctrl+o to expand)
● Run completed and the flow closed the loop — idle screen reads SPELLED 
  'ABCDEFGIKLNORSTUVWXY'. Restoring the transcript and re-running the rest of
  the suite with the 7th scenario registered:

  Called lens-studio 7 times (ctrl+o to expand)

● The 20-letter run: mid-spell (A–R green, S committing at 61%) and the flow's
  completion screen.

  ›       ~\AppData\Local\Temp\claude\C--Users-Raol-Documents-SPECS-ASL- (635.5K
  [image] Helper\01f60bc4-e254-4cec-8de0-7f8ba4771284\scratchpad\abc_midB)
          1.png
  ›       ~\AppData\Local\Temp\claude\C--Users-Raol-Documents-SPECS-ASL- (618.9K
  [image] Helper\01f60bc4-e254-4cec-8de0-7f8ba4771284\scratchpad\abc_donB)
          e.png

● Done — there's now a watchable full-alphabet demo, and it ran live: all 20
  letters committed in order, A → Y, zero wrongs, ~18 seconds, progress climbing
  in clean 5% steps.

  What was built

  signbridge-alphabet-demo — a 7th LEAF scenario
  (SignBridgeAlphabetDemoScenario.ts). It's the demo counterpart to
  alphabet-coverage: coverage proves each letter commits one at a time,
  resetting between letters — thorough but nothing to look at. This one seats
  the entire loaded set as a single phrase and spells it straight through, so
  you watch every letter turn green in sequence on the inward panel while the
  assembled string grows on the outward one. It asserts completion, 0 mistakes,
  0 skips, every letterStatus "done", and assembled === word.

  Two design points:

  - It's derived from getLoadedLetters(), not a pinned string — it always spells
    exactly what ships, so if the template set ever changes it stays honest,
    and its commit count is the letter count.
  - It cleans up after itself — captures the seated phrase before, re-seats it
    after, so the rest of the suite finds the Lens the way it expects.

  Supporting change: SignBridge.seatPhrase(word) is now public — extracted from
  the speech flow's transcript handler (which now calls it), so scenario and
  flow go through the identical setPhrase() gate.

  Two ways for you to watch it

  1. LEAF panel → run signbridge-alphabet-demo with the preview camera on the
     wearer's mark: setPosition (0, -15, -30), lookAt (0, -15, -110). (The mark
     is written into the scenario's header comment.)
  2. Pinch the START button with simulatedTranscript set to ABCDEFGIKLNORSTUVWXY
     — same spell through the speech flow, ending on the idle screen reading
     SPELLED 'ABCDEFGIKLNORSTUVWXY'. I've restored the input to LUKE, so flip it
     back if you want this version.

  The two frames I sent are from a live run: mid-spell with A B C D E F G I K L 
  N O R green and S committing at 61%, and the completion screen. The
  20-character word fits the panel width with room to spare.

  Suite state

  All seven scenarios green in the current build — the six existing ones re-run
  after the registry change, plus the new demo. Log evidence of the run:

  01:12:12.438  committed E (25%)   ...
  01:12:25.776  committed Y (100%)
  01:12:25.777  [signbridge-alphabet-demo] PASSED

✻ Crunched for 7m 10s