/**
 * SignBridgeLeafSupport — shared helpers for the SignBridge LEAF scenarios.
 *
 * This Lens has NO interactables — no buttons, sliders or draggables — so there
 * is nothing for DefaultLeafInteractor, LeafHandInteractor or the IK
 * interactor to reach for. The scenarios drive the mock feature source through
 * SignBridge.playScript() and assert on state instead. That is why none of the
 * usual interactor classes appear here.
 *
 * Waiting is frame-based rather than time-based: HoldBuffer counts FRAMES, and
 * preview frame rate is not fixed, so `sleep(600)` would be flaky in exactly
 * the tests that care about window length.
 */

import {findSceneObjectByName, nextFrame} from "Leaf.lspkg/Utils/common/Utils"
import {MockHandInput} from "./MockHandInput"
import {SignBridge} from "./SignBridge"

/** Scene object names — both confirmed present via scene-graphql. */
export const SIGN_BRIDGE_OBJECT = "SignBridge"
export const MOCK_HAND_OBJECT = "MockHandInput"

/** Frames per pose in a script. Comfortably longer than the 18-frame window. */
export const HOLD = 30

/** Frames of untracked hand between poses — enough to re-arm unambiguously. */
export const GAP = 10

export function getBridge(): SignBridge {
  const object = findSceneObjectByName(SIGN_BRIDGE_OBJECT)
  if (!object) {
    throw new Error("Scene object '" + SIGN_BRIDGE_OBJECT + "' not found.")
  }
  const bridge = object.getComponent(SignBridge.getTypeName()) as SignBridge
  if (!bridge) {
    throw new Error("SignBridge component not found on '" + SIGN_BRIDGE_OBJECT + "'.")
  }
  return bridge
}

export function getMock(): MockHandInput {
  const object = findSceneObjectByName(MOCK_HAND_OBJECT)
  if (!object) {
    throw new Error("Scene object '" + MOCK_HAND_OBJECT + "' not found.")
  }
  const mock = object.getComponent(MockHandInput.getTypeName()) as MockHandInput
  if (!mock) {
    throw new Error("MockHandInput component not found on '" + MOCK_HAND_OBJECT + "'.")
  }
  return mock
}

/** Advance exactly `count` frames. */
export async function frames(count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await nextFrame()
  }
}

/**
 * Advance until `predicate` holds, or `maxFrames` elapse.
 * @returns true if the predicate became true within the budget
 */
export async function waitUntil(predicate: () => boolean, maxFrames: number): Promise<boolean> {
  for (let i = 0; i < maxFrames; i++) {
    if (predicate()) {
      return true
    }
    await nextFrame()
  }
  return predicate()
}

/**
 * Put the Lens in a known state before a scenario's own steps.
 *
 * Scenarios share one live Lens, so every one of them starts here rather than
 * assuming whatever the previous scenario left behind. Waits for templates to
 * load before returning, so a scenario never asserts against a bridge that
 * cannot classify yet.
 */
export async function resetBridge(bridge: SignBridge): Promise<void> {
  const ready = await waitUntil(() => bridge.isReady(), 240)
  if (!ready) {
    throw new Error(
      "SignBridge never became ready — templates failed to load. Check the templatesAsset wiring; " +
        "an empty templates.json makes every classify() return null."
    )
  }
  bridge.setMaxDistance(0) // gate off unless a scenario opts in
  bridge.restart()
  await frames(2)
}

/** Total letters resolved (done or skipped) in the current phrase. */
export function resolvedCount(bridge: SignBridge): number {
  const state = bridge.getPhraseState()
  let n = 0
  for (let i = 0; i < state.letterStatus.length; i++) {
    const s = state.letterStatus[i]
    if (s === "done" || s === "skipped") {
      n++
    }
  }
  return n
}
