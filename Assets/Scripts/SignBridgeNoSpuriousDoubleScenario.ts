/**
 * A single rejected frame must NOT re-arm into a spurious double.
 *
 * This is the regression test for the re-arm rule. After a commit the hold
 * buffer disarms; it re-arms only after `rearmFrames` CONSECUTIVE ambiguous
 * frames. One rejected frame mid-hold — a momentary tracking dropout — looks
 * like the start of a deliberate bounce but is not, and must not produce a
 * second commit of a letter the user only signed once.
 *
 * The distance gate is off by default, so nothing can be rejected at all. The
 * scenario sets `maxDistance` below the nearest-neighbour distance first, so
 * real poses pass and the scaled-away pose does not — then restores it, since
 * scenarios share one live Lens.
 */

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {HOLD, frames, getBridge, resetBridge, resolvedCount, waitUntil} from "./SignBridgeLeafSupport"

@component
export class SignBridgeNoSpuriousDoubleScenario extends Scenario {
  async run(): Promise<void> {
    const bridge = getBridge()
    await resetBridge(bridge)

    const target = bridge.getPhraseState().currentLetter

    const nearest = bridge.nearestOtherDistance(target)
    expect(nearest).toBeGreaterThan(0)
    bridge.setMaxDistance(nearest * 0.5)

    expect(bridge.getHoldState().nonMatchingRun).toBe(0)

    // Commit the letter, hold it, drop in exactly ONE rejected frame, keep
    // holding. rearmFrames is 3, so a single glitch must not re-arm.
    expect(
      bridge.playScript([
        {letter: target, frames: HOLD},
        {letter: target, farScale: 4, frames: 1},
        {letter: target, frames: HOLD * 4}
      ])
    ).toBe(true)

    const committed = await waitUntil(() => resolvedCount(bridge) > 0, HOLD * 3)
    expect(committed).toBe(true)
    expect(resolvedCount(bridge)).toBe(1)

    // Ride out the glitch and the long hold that follows it. If the glitch had
    // re-armed the buffer, the still-held letter would refill the window and
    // commit a second time somewhere in here.
    await frames(HOLD * 4)

    expect(resolvedCount(bridge)).toBe(1)
    expect(bridge.getPhraseState().mistakes).toBe(0)

    // Leave the gate as the rest of the suite expects to find it.
    bridge.setMaxDistance(0)
  }
}
