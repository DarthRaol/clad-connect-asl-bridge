/**
 * Renders the classifier's INPUT as a visible hand.
 *
 * The 78-dim feature vector is 26 landmarks x 3 axes in the hand's own
 * normalized frame (origin at the wrist, +Y along wrist->middleKnuckle, unit
 * scale = |wrist->middleKnuckle|). So the features ARE positions — this script
 * reshapes them and draws them. It does not animate a separate rig, does not
 * re-read the hand, and does not smooth: SignBridge hands it the exact
 * Float32Array it gave the classifier on the same frame.
 *
 * That is the whole point. If the drawn hand looks wrong, the classifier is
 * seeing something wrong.
 *
 * Geometry is built with MeshBuilder rather than mesh presets so the sphere
 * radius and bone dimensions are known exactly instead of inherited from a
 * preset whose scale would have to be discovered by trial.
 *
 * Colour reflects HoldBuffer state, so a commit is visible on the hand itself
 * and not only on the confidence bar:
 *   neutral   searching   — nothing is accumulating
 *   warming   progress    — lerps toward amber as the window fills
 *   confirmed commit      — green pulse, held for confirmSeconds
 */

import {FINGER_GROUPS, LANDMARK_COUNT, LANDMARK_ORDER} from "./LandmarkCapture"
import {HoldState} from "./HoldBuffer"

/**
 * Bone list: wrist -> each finger's chain, in LANDMARK_ORDER order.
 *
 * Derived from FINGER_GROUPS rather than hand-written, so adding or reordering
 * landmarks in LandmarkCapture cannot silently leave this drawing the wrong
 * skeleton. Each finger contributes 5 bones (wrist->ToWrist->Knuckle->Mid->
 * Upper->Tip), giving 25 for the 26 landmarks.
 */
function buildBones(): number[][] {
  const bones: number[][] = []
  const fingers = Object.keys(FINGER_GROUPS)
  for (let f = 0; f < fingers.length; f++) {
    const chain = FINGER_GROUPS[fingers[f]]
    let prev = 0 // wrist
    for (let i = 0; i < chain.length; i++) {
      bones.push([prev, chain[i]])
      prev = chain[i]
    }
  }
  return bones
}

const BONES: number[][] = buildBones()

/** Unit sphere, radius 1, centred on the origin. */
function buildSphereMesh(segments: number, rings: number): RenderMesh {
  const mb = new MeshBuilder([
    {name: "position", components: 3},
    {name: "normal", components: 3},
    {name: "texture0", components: 2}
  ])
  mb.topology = MeshTopology.Triangles
  // Defaults to MeshIndexType.None, which silently invalidates any appended
  // index buffer and makes updateMesh() throw "Mesh is not valid".
  mb.indexType = MeshIndexType.UInt16

  const verts: number[] = []
  for (let r = 0; r <= rings; r++) {
    const theta = (Math.PI * r) / rings
    const y = Math.cos(theta)
    const radius = Math.sin(theta)
    for (let s = 0; s <= segments; s++) {
      const phi = (2 * Math.PI * s) / segments
      const x = radius * Math.cos(phi)
      const z = radius * Math.sin(phi)
      verts.push(x, y, z, x, y, z, s / segments, r / rings)
    }
  }
  mb.appendVerticesInterleaved(verts)

  const idx: number[] = []
  const stride = segments + 1
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const a = r * stride + s
      const b = a + stride
      idx.push(a, b, a + 1, a + 1, b, b + 1)
    }
  }
  mb.appendIndices(idx)
  mb.updateMesh()
  return mb.getMesh()
}

/**
 * Unit bone: a 1x1 box spanning y in [0, 1], so an object placed at joint A,
 * rotated to point at B and scaled (t, |B-A|, t) exactly spans the bone.
 */
function buildBoneMesh(): RenderMesh {
  const mb = new MeshBuilder([
    {name: "position", components: 3},
    {name: "normal", components: 3},
    {name: "texture0", components: 2}
  ])
  mb.topology = MeshTopology.Triangles
  // Defaults to MeshIndexType.None, which silently invalidates any appended
  // index buffer and makes updateMesh() throw "Mesh is not valid".
  mb.indexType = MeshIndexType.UInt16

  const h = 0.5
  const corners = [
    [-h, 0, -h], [h, 0, -h], [h, 0, h], [-h, 0, h],
    [-h, 1, -h], [h, 1, -h], [h, 1, h], [-h, 1, h]
  ]
  const verts: number[] = []
  for (let i = 0; i < corners.length; i++) {
    const c = corners[i]
    const n = Math.sqrt(c[0] * c[0] + (c[1] - 0.5) * (c[1] - 0.5) + c[2] * c[2]) || 1
    verts.push(c[0], c[1], c[2], c[0] / n, (c[1] - 0.5) / n, c[2] / n, 0, 0)
  }
  mb.appendVerticesInterleaved(verts)
  mb.appendIndices([
    0, 1, 2, 0, 2, 3, // bottom
    4, 6, 5, 4, 7, 6, // top
    0, 4, 5, 0, 5, 1, // -z
    1, 5, 6, 1, 6, 2, // +x
    2, 6, 7, 2, 7, 3, // +z
    3, 7, 4, 3, 4, 0 // -x
  ])
  mb.updateMesh()
  return mb.getMesh()
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function mixColor(a: vec4, b: vec4, t: number): vec4 {
  return new vec4(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t), lerp(a.w, b.w, t))
}

@component
export class HandVisualizer extends BaseScriptComponent {
  @ui.label("<b>Hand Visualizer</b> — draws the exact vector the classifier sees")
  @ui.separator
  @ui.group_start("Materials")
  @input
  @hint("Unlit material for the joint spheres. Tinted at runtime by hold state — give it its own asset, not one shared with the panels.")
  jointMaterial: Material

  @input
  @hint("Unlit material for the bones. A second asset, so bones can sit dimmer than joints.")
  boneMaterial: Material
  @ui.group_end

  @ui.group_start("Layout")
  @input
  @hint("Centimetres per unit of normalized hand space. One unit is wrist->middleKnuckle, so the drawn hand is roughly 2x this tall.")
  @widget(new SliderWidget(1, 20, 0.5))
  handScale: number = 5.5

  @input
  @hint("Offset of the rig from this object, in centimetres. The default seats it in the gap between the two panels.")
  offset: vec3 = new vec3(0, 0, 2)

  @input
  @hint("Rig rotation in degrees. The normalized frame has +Z as the palm normal; the default turns the palm toward the wearer.")
  rotationDegrees: vec3 = new vec3(0, 180, 0)

  @input
  @hint("Radius of a joint sphere, in centimetres.")
  @widget(new SliderWidget(0.05, 1.5, 0.05))
  jointRadius: number = 0.42

  @input
  @hint("Thickness of a bone, in centimetres.")
  @widget(new SliderWidget(0.05, 1.5, 0.05))
  boneThickness: number = 0.26
  @ui.group_end

  @ui.group_start("Colour")
  @input
  @widget(new ColorWidget())
  @hint("Searching: a hand is tracked but nothing is accumulating.")
  neutralColor: vec4 = new vec4(0.36, 0.58, 0.88, 1)

  @input
  @widget(new ColorWidget())
  @hint("Fully warmed: HoldBuffer progress at 1, a commit about to fire.")
  warmColor: vec4 = new vec4(1, 0.72, 0.18, 1)

  @input
  @widget(new ColorWidget())
  @hint("Committed: pulsed on the frame a letter commits.")
  confirmColor: vec4 = new vec4(0.24, 0.94, 0.46, 1)

  @input
  @hint("How long the commit pulse holds before falling back to neutral.")
  @widget(new SliderWidget(0.05, 2, 0.05))
  confirmSeconds: number = 0.45

  @input
  @hint("Bone brightness relative to the joints. Below 1 makes the joints read as knuckles.")
  @widget(new SliderWidget(0.2, 1, 0.05))
  boneDimming: number = 0.55
  @ui.group_end

  @ui.group_start("Reference hand colour")
  @input
  @widget(new ColorWidget())
  @hint("REFERENCE INSTANCE ONLY. Colour when the live hand is far from this pose. Keep it dim and cool so the reference never competes with the live hand for attention.")
  matchFarColor: vec4 = new vec4(0.30, 0.42, 0.52, 0.55)

  @input
  @widget(new ColorWidget())
  @hint("REFERENCE INSTANCE ONLY. Colour when the live hand is on this pose. The reference brightening is the 'you're getting closer' signal.")
  matchNearColor: vec4 = new vec4(0.35, 0.95, 0.85, 1)
  @ui.group_end

  @ui.group_start("Behaviour")
  @input
  @hint("Hide the rig on untracked frames. On means the gaps in the input are visible as gaps — recommended, since the point is to show the real input.")
  hideWhenUntracked: boolean = true
  @ui.group_end

  private rig: SceneObject | null = null
  private joints: Transform[] = []
  private bones: Transform[] = []
  private confirmTimer = 0
  private visible = true
  private readonly up = new vec3(0, 1, 0)

  onAwake(): void {
    this.build()
  }

  // --------------------------------------------------------------- building

  private build(): void {
    if (!this.jointMaterial || !this.boneMaterial) {
      print("HandVisualizer ERROR: jointMaterial and boneMaterial must both be wired. Nothing will be drawn.")
      return
    }

    const sphere = buildSphereMesh(10, 7)
    const bone = buildBoneMesh()

    const root = global.scene.createSceneObject("HandRig")
    root.setParent(this.getSceneObject())
    const rt = root.getTransform()
    rt.setLocalPosition(this.offset)
    rt.setLocalRotation(
      quat.fromEulerVec(
        new vec3(
          (this.rotationDegrees.x * Math.PI) / 180,
          (this.rotationDegrees.y * Math.PI) / 180,
          (this.rotationDegrees.z * Math.PI) / 180
        )
      )
    )
    this.rig = root
    // Start hidden: until render() supplies real landmarks every joint would
    // sit at the origin with an unset scale, which reads as a blob.
    root.enabled = false
    this.visible = false

    for (let i = 0; i < LANDMARK_COUNT; i++) {
      const obj = global.scene.createSceneObject("joint_" + LANDMARK_ORDER[i])
      obj.setParent(root)
      const visual = obj.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
      visual.mesh = sphere
      visual.mainMaterial = this.jointMaterial
      this.joints.push(obj.getTransform())
    }

    for (let i = 0; i < BONES.length; i++) {
      const a = LANDMARK_ORDER[BONES[i][0]]
      const b = LANDMARK_ORDER[BONES[i][1]]
      const obj = global.scene.createSceneObject("bone_" + a + "_" + b)
      obj.setParent(root)
      const visual = obj.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
      visual.mesh = bone
      visual.mainMaterial = this.boneMaterial
      this.bones.push(obj.getTransform())
    }

    print(
      "HandVisualizer: built " + this.joints.length + " joints and " + this.bones.length +
        " bones from LANDMARK_ORDER."
    )
  }

  // ---------------------------------------------------------------- driving

  /**
   * Draw one frame.
   *
   * @param features the SAME array handed to the classifier this frame, or
   *        null when the frame is untracked. Not copied, not cached — read
   *        immediately and discarded.
   * @param hold current HoldBuffer state; drives the colour.
   * @param commitEvent the letter committed on this exact frame, or null.
   *        Taken from HoldBuffer.push()'s return rather than inferred from a
   *        change in `hold.committed`, so a letter committed twice in a row
   *        still pulses the second time.
   * @param dt seconds since the last frame, for the pulse decay.
   */
  render(features: ArrayLike<number> | null, hold: HoldState, commitEvent: string | null, dt: number): void {
    if (this.rig === null) {
      return
    }

    if (commitEvent !== null) {
      this.confirmTimer = this.confirmSeconds
    } else if (this.confirmTimer > 0) {
      this.confirmTimer -= dt
    }

    const tracked = features !== null && features.length >= LANDMARK_COUNT * 3
    if (!tracked) {
      if (this.hideWhenUntracked && this.visible) {
        this.rig.enabled = false
        this.visible = false
      }
      // Colour still advances so a pulse started on the commit frame decays
      // even if tracking drops immediately after it.
      this.applyColor(hold)
      return
    }
    if (!this.visible) {
      this.rig.enabled = true
      this.visible = true
    }

    this.drawPose(features)
    this.applyColor(hold)
  }

  /**
   * Draw a fixed pose tinted by how well the live hand matches it — the
   * REFERENCE path.
   *
   * Deliberately separate from render(): a reference hand shows a target, not
   * an input, so it must never take its colour from HoldBuffer state. Its
   * colour answers one question only — how close is the user's hand to THIS
   * pose — and it has no commit pulse, because a reference hand cannot commit.
   *
   * @param features the target letter's template vector
   * @param quality 0 = far from this pose, 1 = on it
   */
  renderReference(features: ArrayLike<number> | null, quality: number): void {
    if (this.rig === null) {
      return
    }
    const usable = features !== null && features.length >= LANDMARK_COUNT * 3
    if (!usable) {
      if (this.visible) {
        this.rig.enabled = false
        this.visible = false
      }
      return
    }
    if (!this.visible) {
      this.rig.enabled = true
      this.visible = true
    }

    this.drawPose(features)

    const q = quality < 0 ? 0 : quality > 1 ? 1 : quality
    const color = mixColor(this.matchFarColor, this.matchNearColor, q)
    this.jointMaterial.mainPass.baseColor = color
    const d = this.boneDimming
    this.boneMaterial.mainPass.baseColor = new vec4(color.x * d, color.y * d, color.z * d, color.w)
  }

  /** Write one 78-dim vector into the joint and bone transforms. */
  private drawPose(features: ArrayLike<number>): void {
    const s = this.handScale
    // middleKnuckle sits at (0,1,0) in normalized space; subtracting it centres
    // the hand on the rig origin instead of hanging it off the wrist.
    const centreY = s

    const px: number[] = []
    const py: number[] = []
    const pz: number[] = []
    for (let i = 0; i < LANDMARK_COUNT; i++) {
      const o = i * 3
      const x = features[o] * s
      const y = features[o + 1] * s - centreY
      const z = features[o + 2] * s
      px.push(x)
      py.push(y)
      pz.push(z)
      const t = this.joints[i]
      t.setLocalPosition(new vec3(x, y, z))
      t.setLocalScale(new vec3(this.jointRadius, this.jointRadius, this.jointRadius))
    }

    const thick = this.boneThickness
    for (let i = 0; i < BONES.length; i++) {
      const a = BONES[i][0]
      const b = BONES[i][1]
      const dx = px[b] - px[a]
      const dy = py[b] - py[a]
      const dz = pz[b] - pz[a]
      const length = Math.sqrt(dx * dx + dy * dy + dz * dz)
      const t = this.bones[i]
      if (length < 1e-5) {
        // Degenerate bone: collapse it rather than feeding a zero vector to
        // rotationFromTo, which has no defined answer.
        t.setLocalScale(new vec3(0, 0, 0))
        continue
      }
      t.setLocalPosition(new vec3(px[a], py[a], pz[a]))
      t.setLocalRotation(quat.rotationFromTo(this.up, new vec3(dx / length, dy / length, dz / length)))
      t.setLocalScale(new vec3(thick, length, thick))
    }
  }

  private applyColor(hold: HoldState): void {
    let color: vec4
    if (this.confirmTimer > 0) {
      color = this.confirmColor
    } else {
      const p = hold !== null && hold !== undefined ? hold.progress : 0
      color = mixColor(this.neutralColor, this.warmColor, p < 0 ? 0 : p > 1 ? 1 : p)
    }

    this.jointMaterial.mainPass.baseColor = color
    const d = this.boneDimming
    this.boneMaterial.mainPass.baseColor = new vec4(color.x * d, color.y * d, color.z * d, color.w)
  }

  /** Current colour phase, for tests and logs. */
  phase(): string {
    return this.confirmTimer > 0 ? "confirmed" : "tracking"
  }

  /** Number of bones drawn — asserts the skeleton matched LANDMARK_ORDER. */
  boneCount(): number {
    return this.bones.length
  }
}
