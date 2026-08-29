/**
 * Every letter A–Z has an asserted behaviour. None is unaccounted for.
 *
 * This is a COVERAGE CONTRACT, not a recognition test for the alphabet. Only
 * six letters have templates, so only six can be recognized; the value here is
 * that the other twenty are pinned to a defined, safe behaviour instead of
 * being merely absent and untested.
 *
 * Each letter falls into exactly one of three buckets, and the scenario fails
 * if any letter falls into none or into more than one:
 *
 *   RECOGNIZED   has templates — drive the real pipeline (mock -> classifier ->
 *                hold buffer) and require it to commit ITSELF, not a neighbour
 *   ABSENT       no templates — must never be returned by the classifier, and
 *                the phrase layer must refuse to seat a word needing it
 *   MOTION       J and Z — defined by movement, so no single-frame template can
 *                represent them; they must never appear in a loaded set
 *
 * The regression this actually guards: someone records more templates and
 * updates the classifier without updating phrase gating, so a phrase gets
 * seated that cannot be completed. The ABSENT bucket checks both halves.
 */

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {GAP, HOLD, frames, getBridge, resetBridge, waitUntil} from "./SignBridgeLeafSupport"

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

/**
 * Motion letters. Excluded by definition rather than by what happens to be
 * recorded — a template set containing J or Z would itself be the bug, since a
 * single frame cannot encode the movement that defines them.
 */
const MOTION_LETTERS = "JZ"

@component
export class SignBridgeAlphabetCoverageScenario extends Scenario {
  async run(): Promise<void> {
    const bridge = getBridge()
    await resetBridge(bridge)

    const loaded = bridge.getLoadedLetters()
    expect(loaded.length).toBeGreaterThan(0)

    const isLoaded: {[k: string]: boolean} = {}
    for (let i = 0; i < loaded.length; i++) {
      isLoaded[loaded[i].toUpperCase()] = true
    }

    // ---- every loaded letter must be a real, non-motion letter of A–Z ------
    // Guards the reverse direction: a template set carrying "_NEGATIVE", a
    // motion letter, or junk would otherwise sail through unnoticed.
    for (let i = 0; i < loaded.length; i++) {
      const ch = loaded[i]
      expect(ch.length).toBe(1)
      expect(ALPHABET.indexOf(ch)).toBeGreaterThan(-1)
      expect(MOTION_LETTERS.indexOf(ch)).toBe(-1)
    }

    const recognized: string[] = []
    const absent: string[] = []
    const motion: string[] = []

    for (let i = 0; i < ALPHABET.length; i++) {
      const ch = ALPHABET[i]
      if (MOTION_LETTERS.indexOf(ch) >= 0) {
        motion.push(ch)
      } else if (isLoaded[ch] === true) {
        recognized.push(ch)
      } else {
        absent.push(ch)
      }
    }

    // Partition is total and disjoint — no letter unaccounted for, none twice.
    expect(recognized.length + absent.length + motion.length).toBe(26)
    expect(motion.length).toBe(2)
    expect(recognized.length).toBe(loaded.length)

    // ---- MOTION ------------------------------------------------------------
    for (let i = 0; i < motion.length; i++) {
      const ch = motion[i]
      expect(isLoaded[ch]).toBeFalsy()
      // A word needing a motion letter can never be seated.
      expect(bridge.unsignableLetters(ch).indexOf(ch)).toBeGreaterThan(-1)
    }

    // ---- ABSENT ------------------------------------------------------------
    for (let i = 0; i < absent.length; i++) {
      const ch = absent[i]
      expect(isLoaded[ch]).toBeFalsy()
      // Both halves: not classifiable, AND the phrase layer knows it.
      expect(bridge.unsignableLetters(ch).indexOf(ch)).toBeGreaterThan(-1)
    }

    // ---- RECOGNIZED --------------------------------------------------------
    // Driven through the real chain, one letter at a time. Asserting the
    // committed letter equals the letter played is what makes this a
    // recognition test rather than a membership check — a classifier that
    // returned a fixed nearest neighbour would pass the membership half and
    // fail here.
    for (let i = 0; i < recognized.length; i++) {
      const ch = recognized[i]

      bridge.restart()
      await frames(2)

      // A loaded letter must never be reported unsignable.
      expect(bridge.unsignableLetters(ch).length).toBe(0)

      expect(
        bridge.playScript([
          {letter: ch, frames: HOLD},
          {letter: null, frames: GAP}
        ])
      ).toBe(true)

      const committed = await waitUntil(() => bridge.getHoldState().committed === ch, (HOLD + GAP) * 3)
      expect(committed).toBe(true)
      expect(bridge.getHoldState().committed).toBe(ch)

      // Settle the untracked gap so the next letter starts from a clean,
      // re-armed buffer rather than inheriting this one's disarmed state.
      await frames(GAP)
    }

    // Leave the Lens as the rest of the suite expects to find it.
    bridge.restart()
    await frames(2)
  }
}
