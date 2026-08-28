/**
 * A hold interrupted midway does not commit.
 *
 * Holds the correct letter for under half the window, then loses the hand.
 * Losing tracking is unambiguous evidence the pose ended, so the window is
 * wiped rather than merely diluted — the partial progress must not survive to
 * be topped up later.
 */

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {HOLD, frames, getBridge, resetBridge, resolvedCount} from "./SignBridgeLeafSupport"

@component
export class SignBridgeInterruptedHoldScenario extends Scenario {
  async run(): Promise<void> {
    const bridge = getBridge()
    await resetBridge(bridge)

    const target = bridge.getPhraseState().currentLetter
    const before = resolvedCount(bridge)
    const windowFrames = bridge.getHoldState().capacity
    expect(windowFrames).toBeGreaterThan(2)

    const partial = Math.floor(windowFrames / 2)

    expect(
      bridge.playScript([
        {letter: target, frames: partial},
        {letter: null, frames: HOLD * 3}
      ])
    ).toBe(true)

    // Let the partial hold accumulate but stay short of the window.
    await frames(partial)
    const midway = bridge.getHoldState()
    expect(midway.filled).toBeLessThan(midway.capacity)

    // Ride out the untracked stretch.
    await frames(HOLD * 2)

    const hold = bridge.getHoldState()

    // No commit, and the same letter is still expected.
    expect(resolvedCount(bridge)).toBe(before)
    expect(bridge.getPhraseState().currentLetter).toBe(target)

    // Untracked hard-resets: empty window, re-armed, no candidate, bar at zero.
    expect(hold.filled).toBe(0)
    expect(hold.armed).toBe(true)
    expect(hold.candidate).toBeNull()
    expect(hold.progress).toBe(0)
  }
}
