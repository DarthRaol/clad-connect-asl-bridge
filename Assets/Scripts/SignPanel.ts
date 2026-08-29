/**
 * SignPanel — the outward-facing readout for an ASL fingerspelling bridge.
 *
 * This panel is read by the person the wearer is talking TO, not by the wearer.
 * `faceOutward` (default true) rotates the root 180 degrees about Y so the
 * panel's face points away from the glasses.
 *
 * It shows, top to bottom:
 *   - the target word, per character, colored by PhraseController letterStatus
 *   - the assembled text so far, in the largest role on the panel
 *   - a confidence bar driven by HoldBuffer.getState().progress
 *   - a status line that carries the wrong-letter flash
 *
 * ---------------------------------------------------------------------------
 * TWO IMPLEMENTATION NOTES WORTH KNOWING BEFORE EDITING
 * ---------------------------------------------------------------------------
 *
 * PER-CHARACTER COLOR IS ONE RICH-TEXT COMPONENT, NOT N TEXT SLOTS.
 * The target word is a single Component.Text with `enableRichText = true` and
 * per-character `<color=#rrggbb>` markup. The alternative — one Text per
 * character inside a FlexLayout row — needs slot pre-allocation and either
 * disables unused slots (which drops them out of the layout pass) or leaves
 * empty ones reserving width. Markup sidesteps all of it, re-renders in one
 * assignment, and keeps spacing native to the font.
 *
 * THE BAR IS A BACKPLATE WIDTH, NOT A COLORED GLYPH RUN.
 * UIKit BackPlate exposes no tint — only `style: "default" | "dark" | "simple"`
 * — so the bar gets contrast from two plates in different styles rather than
 * two colors. A text bar built from block glyphs would have been colorable, but
 * depends on glyph coverage in the system font and renders as tofu when it is
 * missing. Semantic color therefore lives on the Text elements, which do expose
 * `textFill.color`, and the bar carries magnitude only.
 */

import {BackPlate} from "SpectaclesUIKit.lspkg/Scripts/BackPlate"
import {RoundedRectangle} from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import {FlexItem} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexItem"
import {FlexLayout} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexLayout"
import {
  FlexAlign,
  FlexAlignSelf,
  FlexDirection,
  FlexJustify
} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexTypes"

// ── Typography: the single source of truth for text size + weight ────────────
// `Component.Text.size` is the glyph EM-SQUARE height (em cm = size / 43.886),
// calibrated for the SnapOS system font at the z = -110 cm focal plane. Pick a
// role, never a raw number. No custom theme font is on disk, so the scale is
// unmodified.
const FONT_SIZE_SCALE = 1.0

type TextRole =
  | "Title1"
  | "Title2"
  | "HeadlineXL"
  | "Headline1"
  | "Headline2"
  | "Subheadline"
  | "Button"
  | "Callout"
  | "Body"
  | "Caption"

const TYPE_SCALE: Record<TextRole, {size: number; weight: number}> = {
  Title1: {size: 105, weight: 700},
  Title2: {size: 93, weight: 700},
  HeadlineXL: {size: 62, weight: 700},
  Headline1: {size: 54, weight: 700},
  Headline2: {size: 48, weight: 700},
  Subheadline: {size: 41, weight: 700},
  Button: {size: 39, weight: 500},
  Callout: {size: 39, weight: 700},
  Body: {size: 39, weight: 500},
  Caption: {size: 38, weight: 500}
}

function roleSize(role: TextRole, distanceCm: number = 110): number {
  return TYPE_SCALE[role].size * FONT_SIZE_SCALE * (distanceCm / 110)
}

function applyTextRole(t: Text, role: TextRole, distanceCm: number = 110): void {
  t.size = roleSize(role, distanceCm)
  ;(t as Text & {weight?: number}).weight = TYPE_SCALE[role].weight
}

/** Depth-buffer tie-breakers. Layout writes only X/Y, so local Z survives. */
const CONTENT_Z = 0.6
const LAYOUT_Z_LIFT = 0.02
const BAR_FILL_Z = 0.05

/** Fill narrower than this reads as a rendering artifact; hide it instead. */
const MIN_VISIBLE_FILL_CM = 0.15

function clamp01(v: number): number {
  if (!(v > 0)) {
    return 0
  }
  return v > 1 ? 1 : v
}

/**
 * One frame of everything any SignPanel can show.
 *
 * The whole point of a single view object is that the inward and outward panels
 * are driven from the SAME value in the SAME frame. Build it once from
 * PhraseController and HoldBuffer, hand it to every panel, and the two physical
 * surfaces cannot disagree about what letter is current or how far along a
 * commit is.
 */
export type SignPanelView = {
  /** Target phrase as displayed, spaces included. */
  phrase: string
  /** PhraseController.getState().letterStatus — one entry per character. */
  letterStatus: string[]
  /** Text committed so far. This is what the reader reads. */
  assembled: string
  /** HoldBuffer.getState().progress, 0..1. */
  progress: number
  /** HoldBuffer's leading candidate, or null. */
  candidate: string | null
  /** Letter actually signed during a wrong-letter flash, else null. */
  wrongSigned: string | null
  /** Letter that was expected during a wrong-letter flash, else null. */
  wrongExpected: string | null

  /**
   * DEMO ONLY. Label of the pose being INJECTED this frame, never a
   * classification result.
   *
   * Null on every normal run, which is the entire point — SignBridge populates
   * it only while `demoPoseAsset` is wired, so this cannot reach the shipped
   * experience. When set it takes over the status line and is rendered as
   * "DEMO POSE: X", deliberately worded so a viewer reads it as the input being
   * fed in rather than as something the Lens recognized. The classifier's own
   * reading of these poses is a low-confidence U, and a shot that let that sit
   * next to a "K" would imply a recognition the Lens is not making.
   */
  demoLabel?: string | null
}

/**
 * Feed every panel from one view in one pass — the drift-proof call.
 *
 * Nulls in the array are skipped, so an unwired @input during bring-up does not
 * take the whole update path down with it.
 */
export function updateSignPanels(panels: (SignPanel | null | undefined)[], view: SignPanelView): void {
  if (!panels) {
    return
  }
  for (let i = 0; i < panels.length; i++) {
    const panel = panels[i]
    if (panel) {
      panel.applyView(view)
    }
  }
}

/** Componentwise blend, for the confidence bar's neutral -> warm ramp. */
function mixColor(a: vec4, b: vec4, t: number): vec4 {
  const k = clamp01(t)
  return new vec4(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k, a.w + (b.w - a.w) * k)
}

/** vec4 colour to the `#rrggbb` form rich-text markup expects. */
function toHex(c: vec4): string {
  const ch = (v: number) => {
    let n = Math.round(clamp01(v) * 255)
    if (n < 0) {
      n = 0
    }
    const s = n.toString(16)
    return s.length === 1 ? "0" + s : s
  }
  return "#" + ch(c.r) + ch(c.g) + ch(c.b)
}

@component
export class SignPanel extends BaseScriptComponent {
  @ui.label("<b>Sign Panel</b> — outward-facing fingerspelling readout")
  @ui.separator
  @ui.group_start("Orientation")
  @input
  @hint(
    "Rotate 180 degrees so the panel faces AWAY from the wearer. The reader is not the wearer. Turn OFF for a wearer-facing mirror of the same panel."
  )
  faceOutward: boolean = true
  @ui.group_end
  @ui.group_start("Sections")
  @input
  @hint("Show the small caption above the target word.")
  showHeader: boolean = true

  @input
  @hint("Show the target word with per-character progress. Signer feedback — belongs on the INWARD panel.")
  showTargetWord: boolean = true

  @input
  @hint("Show the assembled text. Reader-facing — belongs on the OUTWARD panel.")
  showAssembledText: boolean = true

  @input
  @hint("Show the confidence bar. Signer feedback — belongs on the INWARD panel.")
  showConfidenceBar: boolean = true

  @input
  @hint("Show the status line carrying the wrong-letter flash. Signer feedback — belongs on the INWARD panel.")
  showStatusLine: boolean = true
  @ui.group_end
  @ui.group_start("Layout")
  @input
  @widget(new SliderWidget(20, 60, 1))
  @hint("Panel width in centimetres at the 110 cm focal plane.")
  panelWidth: number = 42

  @input
  @widget(new SliderWidget(0.5, 4, 0.1))
  @hint("Vertical gap between the word, the assembled text, the bar and the status line.")
  rowGap: number = 1.6

  @input
  @widget(new SliderWidget(1, 5, 0.1))
  @hint("Inner padding on all four sides.")
  padding: number = 2.2

  @input
  @widget(new SliderWidget(0.4, 2.5, 0.1))
  @hint("Height of the confidence bar. Corner radius follows it, so the bar is always a pill.")
  barHeight: number = 1.8

  @input
  @widget(new SliderWidget(0.3, 1, 0.05))
  @hint("Bar width as a fraction of the panel's inner width. Below 1 keeps the bar inside the text column instead of running edge to edge.")
  barWidthFraction: number = 0.72
  @ui.group_end

  @ui.group_start("Confidence bar colour")
  @input
  @widget(new ColorWidget())
  @hint("Fill colour while progress is low. Matches HandVisualizer's neutral, so the bar and the hand agree.")
  barNeutralColor: vec4 = new vec4(0.36, 0.58, 0.88, 1)

  @input
  @widget(new ColorWidget())
  @hint("Fill colour as progress approaches a commit. Matches HandVisualizer's warming amber.")
  barWarmColor: vec4 = new vec4(1, 0.72, 0.18, 1)

  @input
  @widget(new ColorWidget())
  @hint("Fill colour on the commit frame, when progress reaches 1.")
  barConfirmColor: vec4 = new vec4(0.24, 0.94, 0.46, 1)

  @input
  @widget(new ColorWidget())
  @hint("Unfilled track. Needs enough alpha to read as an empty bar rather than as nothing.")
  barTrackColor: vec4 = new vec4(1, 1, 1, 0.16)
  @ui.group_end
  @ui.group_start("Labels")
  @input
  @hint("Small caption above the target word. Empty string hides it.")
  headerLabel: string = "SIGNING"

  @input
  @hint("Shown in the assembled-text area before anything has been committed.")
  emptyPlaceholder: string = "—"
  @ui.group_end
  @ui.group_start("Letter colours")
  @input
  @widget(new ColorWidget())
  @hint("Characters already committed correctly.")
  doneColor: vec4 = new vec4(0.45, 0.9, 0.55, 1)

  @input
  @widget(new ColorWidget())
  @hint("The character being signed right now.")
  currentColor: vec4 = new vec4(1, 1, 1, 1)

  @input
  @widget(new ColorWidget())
  @hint("Characters not yet reached.")
  pendingColor: vec4 = new vec4(1, 1, 1, 0.5)

  @input
  @widget(new ColorWidget())
  @hint("Characters that were skipped rather than signed.")
  skippedColor: vec4 = new vec4(0.95, 0.8, 0.4, 1)

  @input
  @widget(new ColorWidget())
  @hint("The current character while a wrong-letter flash is up, and the flash text itself.")
  wrongColor: vec4 = new vec4(0.9, 0.45, 0.45, 1)
  @ui.group_end
  @ui.group_start("Text colours")
  @input
  @widget(new ColorWidget())
  @hint("The assembled text the reader is here to read. Keep this the brightest thing on the panel.")
  assembledColor: vec4 = new vec4(1, 1, 1, 1)

  @input
  @widget(new ColorWidget())
  @hint("Header caption and the idle status line.")
  captionColor: vec4 = new vec4(1, 1, 1, 0.55)
  @ui.group_end
  // --- built at awake -----------------------------------------------------
  private backPlate!: BackPlate
  private headerText: Text | null = null
  private wordText!: Text
  private assembledText!: Text
  private statusText!: Text
  private barTrack!: BackPlate
  private barFill!: BackPlate
  private barFillObject!: SceneObject
  // BackPlate keeps its RoundedRectangle private and exposes only `style`,
  // which has no tint. The RoundedRectangle sits on the same SceneObject, so
  // fetch it directly — that is what actually carries backgroundColor.
  private barTrackRect: RoundedRectangle | null = null
  private barFillRect: RoundedRectangle | null = null

  // --- render state -------------------------------------------------------
  private phrase = ""
  private statuses: string[] = []
  private wrongSigned: string | null = null
  private wrongExpected: string | null = null

  onAwake() {
    if (this.faceOutward) {
      // The reader stands opposite the wearer, so the panel's face has to point
      // away from the glasses rather than at them.
      this.sceneObject.getTransform().setLocalRotation(quat.angleAxis(Math.PI, vec3.up()))
    }

    // Canvas at the root — SortingType.Hierarchy, so depth-first hierarchy
    // order IS render order. Nothing in this subtree sets renderOrder.
    this.sceneObject.createComponent("Component.Canvas")

    // BackPlate FIRST so the DFS paints it behind everything that follows.
    this.backPlate = this.sceneObject.createComponent(BackPlate.getTypeName()) as BackPlate

    // Content AFTER the plate so the DFS paints it on top. The +0.6 Z is a
    // depth-buffer tie-breaker against the plate's ~1 cm thickness.
    const content = this.obj(this.sceneObject, "Content", new vec3(0, 0, CONTENT_Z))

    const flex = content.createComponent(FlexLayout.getTypeName()) as FlexLayout
    // MUST precede any flexChild() call. FlexLayout.addItems() throws while
    // autoDiscoverItemsOnStart is enabled and the layout is uninitialized —
    // and everything below is built during onAwake, long before init. Turning
    // discovery off makes this layout's membership explicit via addItems.
    // (FlexLayout.ts:641; the setter's own docstring prescribes exactly this.)
    flex.autoDiscoverItemsOnStart = false
    flex.width = this.panelWidth
    flex.height = -1
    flex.direction = FlexDirection.Column
    flex.alignItems = FlexAlign.Stretch
    flex.rowGap = this.rowGap
    flex.paddingTop = this.padding
    flex.paddingBottom = this.padding
    flex.paddingLeft = this.padding
    flex.paddingRight = this.padding

    // Plate hugs whatever the layout measured.
    flex.onLayoutComplete.add(r => {
      this.backPlate.size = new vec2(r.containerWidth, r.containerHeight)
    })

    const inner = this.panelWidth - this.padding * 2

    if (this.showHeader && this.headerLabel !== "") {
      this.flexChild(content, {w: inner, h: 1.6}, child => {
        this.headerText = this.stretchText(child, this.headerLabel, "Caption", this.captionColor)
      })
    }

    // Target word, per character, from letterStatus.
    if (this.showTargetWord) {
      this.flexChild(content, {w: inner, h: 3.4}, child => {
        this.wordText = this.stretchText(child, "", "Headline2", this.pendingColor)
        this.wordText.enableRichText = true
      })
    }

    // The assembled text — the reason the reader is looking at this panel, so
    // it gets the largest role.
    if (this.showAssembledText) {
      this.flexChild(content, {w: inner, h: 6.4}, child => {
        this.assembledText = this.stretchText(child, this.emptyPlaceholder, "Title1", this.assembledColor)
      })
    }

    // Confidence bar. Track and fill are plain children of the item, not laid
    // out, so their local positions are ours to control.
    if (this.showConfidenceBar) {
      const barWidth = inner * clamp01(this.barWidthFraction)
      const radius = this.barHeight / 2
      this.flexChild(content, {w: inner, h: this.barHeight}, child => {
        const trackObject = this.obj(child, "BarTrack")
        this.barTrack = trackObject.createComponent(BackPlate.getTypeName()) as BackPlate
        this.barTrack.onInitialized.add(() => {
          this.barTrack.style = "dark"
          this.barTrack.size = new vec2(barWidth, this.barHeight)
          this.barTrackRect = this.styleRect(trackObject, radius, this.barTrackColor)
        })

        // Created after the track, so the DFS paints the fill over it.
        this.barFillObject = this.obj(child, "BarFill", new vec3(0, 0, BAR_FILL_Z))
        this.barFill = this.barFillObject.createComponent(BackPlate.getTypeName()) as BackPlate
        this.barFill.onInitialized.add(() => {
          this.barFill.style = "default"
          this.barFillRect = this.styleRect(this.barFillObject, radius, this.barNeutralColor)
          this.setProgress(0, null)
        })
      })
    }

    // Status line — carries the wrong-letter flash.
    if (this.showStatusLine) {
      this.flexChild(content, {w: inner, h: 2.0}, child => {
        this.statusText = this.stretchText(child, "", "Body", this.captionColor)
      })
    }
  }

  /**
   * Push one frame of state. Every panel gets the SAME view object, and each
   * renders only the sections it was configured to build, so an inward and an
   * outward panel cannot show contradictory values — there is no per-panel
   * setter call for a caller to forget or order differently.
   *
   * Prefer `updateSignPanels()` over calling this per panel.
   */
  applyView(view: SignPanelView): void {
    this.setTargetWord(view.phrase, view.letterStatus)
    this.setAssembledText(view.assembled)

    if (view.wrongSigned !== null && view.wrongExpected !== null) {
      this.showWrongLetter(view.wrongSigned, view.wrongExpected)
    } else if (this.wrongSigned !== null) {
      this.clearWrongLetter()
    }

    // After the wrong-letter branch: setProgress leaves the status line alone
    // while a flash owns it.
    this.setProgress(view.progress, view.candidate)

    // Demo override, last so it wins the status line outright. In demo mode the
    // line's job is to name the INPUT, and a flash or a candidate readout
    // sharing it would reintroduce exactly the ambiguity the label exists to
    // remove. Panels with showStatusLine off — the outward one — have no
    // statusText and are untouched.
    if (view.demoLabel !== undefined && view.demoLabel !== null && this.statusText) {
      this.statusText.text = "DEMO POSE: " + view.demoLabel
      this.statusText.textFill.color = this.captionColor
    }
  }

  // -------------------------------------------------------------------------
  // Public API — the main script pushes state in; nothing is pulled out
  // -------------------------------------------------------------------------

  /** The text committed so far. This is what the reader is actually reading. */
  setAssembledText(text: string): void {
    if (!this.assembledText) {
      return
    }
    this.assembledText.text = text && text.length > 0 ? text : this.emptyPlaceholder
  }

  /**
   * Render the target word with per-character progress.
   *
   * @param phrase   the phrase as displayed, spaces included
   * @param statuses one entry per character, from PhraseController's
   *                 letterStatus[]: "pending" | "current" | "done" | "skipped"
   *                 | "unsignable"
   */
  setTargetWord(phrase: string, statuses: string[]): void {
    this.phrase = phrase !== null && phrase !== undefined ? phrase : ""
    this.statuses = statuses !== null && statuses !== undefined ? statuses : []
    this.renderWord()
  }

  /**
   * Drive the confidence bar from HoldBuffer.getState().progress.
   *
   * The bar is a width, so it grows continuously toward a commit instead of
   * flipping between two states. Call every frame.
   *
   * @param progress 0..1
   * @param candidate leading letter, shown on the idle status line; null hides it
   */
  setProgress(progress: number, candidate: string | null): void {
    if (!this.barFill || !this.barFillObject) {
      return
    }

    const inner = this.panelWidth - this.padding * 2
    const barWidth = inner * clamp01(this.barWidthFraction)
    const p = clamp01(progress)
    // Never let the fill shrink below its own corner radius: a pill narrower
    // than its diameter renders as a wedge, which reads as a glitch at the
    // very start of every hold.
    const width = Math.max(barWidth * p, p > 0 ? this.barHeight : 0)

    if (width < MIN_VISIBLE_FILL_CM) {
      this.barFillObject.enabled = false
    } else {
      this.barFillObject.enabled = true
      this.barFill.size = new vec2(width, this.barHeight)
      // Grow from the left edge: a BackPlate is centred on its object, so the
      // object slides left by half the width it is missing.
      this.barFillObject.getTransform().setLocalPosition(new vec3(-(barWidth - width) / 2, 0, BAR_FILL_Z))
    }

    // Colour carries the same three states as the hand skeleton, so the two
    // surfaces never disagree about what the hold buffer is doing.
    if (this.barFillRect !== null) {
      this.barFillRect.backgroundColor =
        p >= 0.999 ? this.barConfirmColor : mixColor(this.barNeutralColor, this.barWarmColor, p)
    }

    // Only narrate the candidate when no wrong-letter flash owns the line.
    if (this.wrongSigned === null && this.statusText) {
      if (candidate !== null && p > 0) {
        this.statusText.text = candidate + "  " + Math.round(p * 100) + "%"
        this.statusText.textFill.color = this.captionColor
      } else {
        this.statusText.text = ""
      }
    }
  }

  /**
   * Surface a wrong commit. Visible and recoverable — the panel says what was
   * signed and what was expected, and tints the current character. Clear it
   * with `clearWrongLetter()` when PhraseController leaves its `wrong` state.
   */
  showWrongLetter(signed: string, expected: string): void {
    this.wrongSigned = signed
    this.wrongExpected = expected
    if (this.statusText) {
      this.statusText.text = "signed " + signed + " — expected " + expected
      this.statusText.textFill.color = this.wrongColor
    }
    this.renderWord()
  }

  /** Drop the wrong-letter flash and return the status line to normal. */
  clearWrongLetter(): void {
    this.wrongSigned = null
    this.wrongExpected = null
    if (this.statusText) {
      this.statusText.text = ""
      this.statusText.textFill.color = this.captionColor
    }
    this.renderWord()
  }

  /** Replace the small caption above the target word. */
  setHeader(text: string): void {
    if (this.headerText) {
      this.headerText.text = text
    }
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  /**
   * One rich-text assignment paints the whole word. A character in the
   * `current` slot flips to `wrongColor` while a flash is up, so the mistake is
   * visible on the word itself and not only in the status line.
   */
  private renderWord(): void {
    if (!this.wordText) {
      return
    }

    let markup = ""
    for (let i = 0; i < this.phrase.length; i++) {
      const ch = this.phrase[i]
      if (ch === " ") {
        markup += "  "
        continue
      }
      const status = i < this.statuses.length ? this.statuses[i] : "pending"
      markup += "<color=" + toHex(this.colorForStatus(status)) + ">" + ch + "</color> "
    }
    this.wordText.text = markup
  }

  private colorForStatus(status: string): vec4 {
    if (status === "done") {
      return this.doneColor
    }
    if (status === "skipped") {
      return this.skippedColor
    }
    if (status === "current") {
      return this.wrongSigned !== null ? this.wrongColor : this.currentColor
    }
    if (status === "unsignable") {
      return this.pendingColor
    }
    return this.pendingColor
  }

  // -------------------------------------------------------------------------
  // Composition helpers
  // -------------------------------------------------------------------------

  /**
   * Reach past BackPlate to the RoundedRectangle it builds, and make it a
   * tintable pill.
   *
   * BackPlate exposes only `style` ("default" | "dark" | "simple"), which has
   * no tint, and keeps its RoundedRectangle private — but the component sits on
   * the same SceneObject, so it can be fetched. Gradient is disabled because
   * `backgroundColor` is only honoured for a solid fill; leaving the style's
   * gradient on would silently ignore every colour set here.
   */
  private styleRect(host: SceneObject, cornerRadius: number, color: vec4): RoundedRectangle | null {
    const rect = host.getComponent(RoundedRectangle.getTypeName()) as RoundedRectangle | null
    if (rect === null || rect === undefined) {
      return null
    }
    rect.gradient = false
    rect.cornerRadius = cornerRadius
    rect.backgroundColor = color
    return rect
  }

  private obj(parent: SceneObject, name: string, position?: vec3): SceneObject {
    const sceneObject = global.scene.createSceneObject(name)
    sceneObject.setParent(parent)
    if (position) {
      sceneObject.getTransform().setLocalPosition(position)
    }
    return sceneObject
  }

  private liftInZ(sceneObject: SceneObject, zOffset: number): void {
    const transform = sceneObject.getTransform()
    const pos = transform.getLocalPosition()
    transform.setLocalPosition(new vec3(pos.x, pos.y, pos.z + zOffset))
  }

  private flexChild(
    parent: SceneObject,
    size: {w?: number; h?: number; grow?: number},
    builder: (childObject: SceneObject) => void
  ): SceneObject {
    const child = this.obj(parent, "Item")
    this.liftInZ(child, LAYOUT_Z_LIFT)
    const flexItem = child.createComponent(FlexItem.getTypeName()) as FlexItem
    if (size.w !== undefined && size.w > 0) {
      flexItem.overrideWidth = size.w
    }
    if (size.h !== undefined && size.h > 0) {
      flexItem.overrideHeight = size.h
    }
    flexItem.flexGrow = size.grow !== undefined ? size.grow : 0
    flexItem.flexShrink = 0
    flexItem.alignSelf = FlexAlignSelf.Stretch

    builder(child)

    // Mandatory — without addItems the children stack at the origin.
    const parentFlexLayout = parent.getComponent(FlexLayout.getTypeName()) as FlexLayout | null
    if (parentFlexLayout) {
      parentFlexLayout.addItems([flexItem])
    }
    return child
  }

  /**
   * Centred text in a column-direction parent. The parent's cross axis is
   * horizontal, so the FlexItem stretches to full cell width and a 1x1
   * placeholder layoutRect genuinely centres.
   */
  private stretchText(parent: SceneObject, value: string, role: TextRole, color: vec4): Text {
    const so = this.obj(parent, "Text")
    const t = so.createComponent("Component.Text") as Text
    t.text = value
    t.depthTest = true
    applyTextRole(t, role)
    t.textFill.color = color
    t.horizontalAlignment = HorizontalAlignment.Center
    t.verticalAlignment = VerticalAlignment.Center
    t.horizontalOverflow = HorizontalOverflow.Overflow
    t.verticalOverflow = VerticalOverflow.Overflow
    t.layoutRect = Rect.create(-0.5, 0.5, -0.5, 0.5)
    return t
  }
}
