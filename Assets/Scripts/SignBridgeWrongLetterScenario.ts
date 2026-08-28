/**
 * A wrong letter does not advance the index.
 *
 * Signs a letter that is not the target. The mistake must be recorded and
 * surfaced on both panels, but the index must not move and the phrase must not
 * reset — visible, recoverable, and not a hard failure.
 */

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {HOLD, getBridge, resetBridge, resolvedCount, waitUntil} from "./SignBridgeLeafSupport"
import {SignBridge} from "./SignBridge"

@component
export class SignBridgeWrongLetterScenario extends Scenario {
  async run(): Promise<void> {
    const bridge = getBridge()
    await resetBridge(bridge)

    const before = bridge.getPhraseState()
    const resolvedBefore = resolvedCount(bridge)
    const target = before.currentLetter
    const wrong = this.aDifferentLetter(bridge, target)
    expect(wrong).not.toBe(null)

    expect(bridge.playScript([{letter: wrong, frames: HOLD * 5}])).toBe(true)

    const flagged = await waitUntil(() => bridge.getPhraseState().mistakes > before.mistakes, HOLD * 5)
    expect(flagged).toBe(true)

    const after = bridge.getPhraseState()

    // Recorded and visible...
    expect(after.mistakes).toBe(before.mistakes + 1)
    expect(after.status).toBe("wrong")
    expect(after.wrongLetter).toBe(wrong)

    // ...but the index did not move, nothing was resolved, and the same letter
    // is still expected.
    expect(after.index).toBe(before.index)
    expect(after.currentLetter).toBe(target)
    expect(resolvedCount(bridge)).toBe(resolvedBefore)
    expect(after.progress).toBeCloseTo(before.progress, 3)

    // Both panels render from this view, so asserting it covers both surfaces.
    const view = bridge.getView()
    expect(view.wrongSigned).toBe(wrong)
    expect(view.wrongExpected).toBe(target)
  }

  private aDifferentLetter(bridge: SignBridge, letter: string): string | null {
    const letters = bridge.getLoadedLetters()
    for (let i = 0; i < letters.length; i++) {
      if (letters[i] !== letter) {
        return letters[i]
      }
    }
    return null
  }
}
