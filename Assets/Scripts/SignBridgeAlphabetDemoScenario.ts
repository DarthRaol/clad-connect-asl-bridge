/**
 * The whole loaded letter set spells, end to end, WATCHABLY.
 *
 * This is the demo counterpart to alphabet-coverage. Coverage proves each
 * letter commits, one at a time, resetting between letters — thorough but
 * nothing to look at. This scenario seats the ENTIRE loaded set as one phrase
 * and spells it straight through, so the preview shows every letter of the
 * 20-letter set turning green in sequence on the inward panel while the
 * assembled string grows on the outward one: a visible, real-pipeline
 * traversal of everything the classifier knows.
 *
 * Derived from getLoadedLetters(), not a pinned string, so it stays honest if
 * the template set changes: it always spells exactly what is shipped, and its
 * commit count IS the letter count.
 *
 * Watch it from the wearer's mark:
 *   setPosition (0, -15, -30)   lookAt (0, -15, -110)
 */

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {GAP, HOLD, getBridge, resetBridge, waitUntil} from "./SignBridgeLeafSupport"

@component
export class SignBridgeAlphabetDemoScenario extends Scenario {
  async run(): Promise<void> {
    const bridge = getBridge()
    await resetBridge(bridge)

    // Scenarios share one live Lens — remember what was seated so the demo
    // leaves the Lens the way the rest of the suite expects to find it.
    const before = bridge.getPhraseState().phrase

    const loaded = bridge.getLoadedLetters()
    expect(loaded.length).toBeGreaterThan(0)
    const word = loaded.join("")

    expect(bridge.seatPhrase(word)).toBe(true)

    const steps = []
    for (let i = 0; i < word.length; i++) {
      steps.push({letter: word[i], frames: HOLD})
      steps.push({letter: null, frames: GAP})
    }
    expect(bridge.playScript(steps)).toBe(true)

    // Generous frame budget: one HOLD+GAP per letter plus slack for the
    // window filling and the preview's variable frame pacing.
    const budget = (HOLD + GAP) * (word.length + 6)
    const completed = await waitUntil(() => bridge.getPhraseState().status === "complete", budget)
    expect(completed).toBe(true)

    const state = bridge.getPhraseState()
    expect(state.status).toBe("complete")
    expect(state.mistakes).toBe(0)
    expect(state.skipped).toBe(0)
    for (let i = 0; i < state.letterStatus.length; i++) {
      expect(state.letterStatus[i]).toBe("done")
    }

    // The reader-facing string is the full set, in template order.
    expect(bridge.getView().assembled).toBe(word)

    expect(bridge.seatPhrase(before)).toBe(true)
  }
}
