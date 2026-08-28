/**
 * Low-confidence input never commits.
 *
 * A pose blended halfway between the target letter and its NEAREST neighbour
 * sits equidistant from both, so the margin `1 - d_best/d_runnerUp` collapses
 * toward zero. The classifier still names a winner every frame — that is the
 * point. The hold buffer must refuse it anyway.
 *
 * Held far longer than a clean commit would need, so a pass means "refused",
 * not "not yet".
 */

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {HOLD, frames, getBridge, resetBridge, resolvedCount} from "./SignBridgeLeafSupport"
import {SignBridge} from "./SignBridge"

@component
export class SignBridgeLowConfidenceScenario extends Scenario {
  async run(): Promise<void> {
    const bridge = getBridge()
    await resetBridge(bridge)

    const target = bridge.getPhraseState().currentLetter
    expect(target).not.toBe(null)

    const other = this.nearestOther(bridge, target)
    expect(other).not.toBe(null)

    const before = resolvedCount(bridge)
    const mistakesBefore = bridge.getPhraseState().mistakes

    expect(bridge.playScript([{letter: target, blendWith: other, blend: 0.5, frames: HOLD * 8}])).toBe(true)

    await frames(HOLD * 6)

    const state = bridge.getPhraseState()
    const hold = bridge.getHoldState()

    // Nothing advanced, and nothing was scored as a mistake either — an
    // ambiguous pose is refused, not judged.
    expect(resolvedCount(bridge)).toBe(before)
    expect(state.currentLetter).toBe(target)
    expect(state.mistakes).toBe(mistakesBefore)
    expect(state.status).not.toBe("complete")

    // The stall is visible rather than silent: confidence sits under the
    // threshold, so the bar never fills.
    expect(hold.meanConfidence).toBeLessThan(0.3)
    expect(hold.progress).toBeLessThan(1)
  }

  /** Closest other loaded letter, by first-template distance. */
  private nearestOther(bridge: SignBridge, letter: string): string | null {
    let best: string | null = null
    let bestDistance = Infinity
    const letters = bridge.getLoadedLetters()
    for (let i = 0; i < letters.length; i++) {
      if (letters[i] === letter) {
        continue
      }
      const d = bridge.distanceBetween(letter, letters[i])
      if (d < bestDistance) {
        bestDistance = d
        best = letters[i]
      }
    }
    return best
  }
}
