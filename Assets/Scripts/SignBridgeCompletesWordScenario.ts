/**
 * A full word completes.
 *
 * Plays the seated phrase's own letters in order, each held past the hold
 * window, with an untracked gap between them. Every letter should commit, the
 * phrase should reach `complete`, and the reader-facing string should equal
 * the target with no mistakes and no skips.
 */

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {GAP, HOLD, getBridge, resetBridge, waitUntil} from "./SignBridgeLeafSupport"

@component
export class SignBridgeCompletesWordScenario extends Scenario {
  async run(): Promise<void> {
    const bridge = getBridge()
    await resetBridge(bridge)

    const target = bridge.getPhraseState().phrase
    expect(target.length).toBeGreaterThan(0)

    const steps = []
    for (let i = 0; i < target.length; i++) {
      const ch = target[i]
      if (ch === " ") {
        continue
      }
      steps.push({letter: ch, frames: HOLD})
      steps.push({letter: null, frames: GAP})
    }

    expect(bridge.playScript(steps)).toBe(true)

    const completed = await waitUntil(() => bridge.getPhraseState().status === "complete", (HOLD + GAP) * 12)
    expect(completed).toBe(true)

    const state = bridge.getPhraseState()
    expect(state.status).toBe("complete")
    expect(state.progress).toBeCloseTo(1, 3)
    expect(state.mistakes).toBe(0)
    expect(state.skipped).toBe(0)

    // What the outward panel shows the reader.
    expect(bridge.getView().assembled).toBe(target)
  }
}
