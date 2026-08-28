/**
 * PhraseController — the state machine over a target phrase.
 *
 * Owns "which letter are we on", consumes commits from HoldBuffer, and emits
 * the discrete moments a UI needs. Rendering reads `getState()` each frame;
 * events mark transitions worth reacting to (sound, flash, confetti).
 *
 * ---------------------------------------------------------------------------
 * WRONG LETTERS ARE VISIBLE, RECOVERABLE, AND NOT FATAL
 * ---------------------------------------------------------------------------
 *
 * A wrong commit:
 *   - does NOT advance the index
 *   - does NOT reset the phrase
 *   - is NOT silently dropped
 *
 * It moves the machine into `wrong` for `wrongDisplaySeconds`, carrying the
 * letter that was actually signed so the UI can show "you signed E, expected A".
 * The state clears on its own, and the same target letter is still expected.
 * A correct commit arriving during `wrong` is accepted immediately and clears
 * it — the flash must never block the user.
 *
 * `mistakesOnCurrentLetter` is exposed separately from the phrase total so a UI
 * can escalate its help (highlight, hand diagram) without the state machine
 * deciding what "escalate" means.
 *
 * ---------------------------------------------------------------------------
 * UNSIGNABLE CHARACTERS
 * ---------------------------------------------------------------------------
 *
 * Spaces cannot be fingerspelled, so they are auto-skipped: the index advances
 * past them without waiting for a commit.
 *
 * More dangerously, J and Z are motion letters — a static handshape classifier
 * cannot produce them, and they are omitted from the recorder's default letter
 * set. A phrase containing one would be impossible to finish, which in a live
 * demo means a dead end with no explanation. Call `setAvailableLetters()` with
 * the classifier's loaded letters and the controller will refuse to seat an
 * impossible phrase, saying which letter is missing.
 */

import Event from "SpectaclesInteractionKit.lspkg/Utils/Event"

/** Result of feeding a commit in. */
export type CommitOutcome = "correct" | "wrong" | "ignored"

export type PhraseStatus = "idle" | "signing" | "wrong" | "complete"

/** Per-character progress marker. */
export type LetterStatus = "pending" | "done" | "skipped" | "current" | "unsignable"

export type PhraseState = {
  /** The phrase as displayed, including spaces. */
  phrase: string

  /** One entry per character of `phrase`, for rendering the word with progress. */
  letterStatus: LetterStatus[]

  /** Index into `phrase` of the character being signed, or -1 when none. */
  index: number

  /** The character expected right now, or null when idle/complete. */
  currentLetter: string | null

  status: PhraseStatus

  /** During `wrong`, the letter actually signed. Null otherwise. */
  wrongLetter: string | null

  /** Signable characters completed, over signable characters total. */
  progress: number

  /** Total wrong commits on this phrase. */
  mistakes: number

  /** Wrong commits on the current letter, for escalating UI help. */
  mistakesOnCurrentLetter: number

  /** Letters manually skipped on this phrase. */
  skipped: number

  /** Position in the preset menu, and how many presets exist. */
  phraseIndex: number
  phraseCount: number
}

export type LetterEvent = {
  letter: string
  index: number
  /** Signable characters left after this one. */
  remaining: number
}

export type WrongLetterEvent = {
  /** What the user actually signed. */
  signed: string
  /** What was expected. */
  expected: string
  index: number
  /** Wrong commits on this letter so far, including this one. */
  mistakesOnCurrentLetter: number
}

export type PhraseCompleteEvent = {
  phrase: string
  mistakes: number
  skipped: number
}

export type PhraseChangedEvent = {
  phrase: string
  phraseIndex: number
}

export type PhraseControllerConfig = {
  /** Preset menu. Defaults to a J/Z-free demo set. */
  phrases?: string[]

  /** How long `wrong` stays up before clearing itself. Default 1.2s. */
  wrongDisplaySeconds?: number

  /**
   * Seconds to hold on `complete` before auto-advancing to the next preset.
   * Default 0 — stay complete until the caller acts.
   */
  autoAdvanceSeconds?: number
}

/**
 * Default preset menu, ordered DEMO-SAFE FIRST.
 *
 * Every entry is free of J and Z — motion letters a static handshape
 * classifier cannot produce at all. Beyond that, two things make a phrase
 * risky to sign in front of an audience, and the ordering below reflects both:
 *
 *   DOUBLE LETTERS ("HELLO", "GOOD"). A repeated adjacent letter must commit
 *   twice, which means clearing HoldBuffer's re-arm run between them. That
 *   works, but it depends on the signer producing a clean bounce under
 *   pressure — a mechanic that fails silently as "it only typed one L".
 *
 *   THUMB-OCCLUDED LETTERS (A, S, T, M, N). These differ mainly by where the
 *   thumb crosses relative to the finger knuckles, which is exactly the
 *   distinction hand tracking resolves worst and the one this classifier is
 *   least likely to get right. See docs/JOINTS.md.
 *
 * Of the ten entries this list originally held, NINE carried at least one of
 * those. That is fine for an app — a user spells whatever they need — but it
 * is a poor demo, so the safe entries now come first.
 *
 * Proper nouns lead deliberately. Fingerspelling exists mostly for names, so a
 * name that is also clean to recognize is simultaneously the safest thing to
 * demo and the most honest illustration of what the Lens is for.
 *
 * ---- TIER 1: demo-safe — no double letter, none of A/S/T/M/N -------------
 *   LUKE, RIO, CHLOE, PERU   proper nouns: the real use case, and clean
 *   HELP                     the only original entry that was already clean
 *
 * ---- TIER 2: one risk factor — usable, mention the caveat ----------------
 *   AR       confusable A          (shortest, so least exposure)
 *   CLAD     confusable A
 *   FRIEND   confusable N
 *   HELLO    double LL             (recognition fine; the bounce is the risk)
 *   SPECS    confusable S, twice
 *
 * ---- TIER 3: several risk factors — app-realistic, demo-hostile ----------
 *   SNAP           confusable S, N, A
 *   NAME           confusable N, A, M
 *   THANK YOU      confusable T, A, N  + space
 *   GOOD MORNING   double OO + confusable M, N + space
 *
 * If you reorder or extend this list, keep the tier comments accurate — the
 * whole point is that the distinction survives the next edit.
 */
export const DEFAULT_PHRASES: readonly string[] = [
  // Tier 1 — demo-safe
  "LUKE",
  "RIO",
  "CHLOE",
  "PERU",
  "HELP",
  // Tier 2 — one risk factor
  "AR",
  "CLAD",
  "FRIEND",
  "HELLO",
  "SPECS",
  // Tier 3 — multiple risk factors
  "SNAP",
  "NAME",
  "THANK YOU",
  "GOOD MORNING"
]

/**
 * How many leading entries of DEFAULT_PHRASES are demo-safe (tier 1).
 * `DEFAULT_PHRASES.slice(0, DEMO_SAFE_PHRASE_COUNT)` is the list to seat when
 * the audience matters more than the variety.
 */
export const DEMO_SAFE_PHRASE_COUNT = 5

/** A character that must be signed, as opposed to a space or separator. */
function isSignable(ch: string): boolean {
  return ch >= "A" && ch <= "Z"
}

export class PhraseController {
  // --- events ------------------------------------------------------------
  /** A correct letter was committed. */
  readonly onCorrectLetter: Event<LetterEvent> = new Event<LetterEvent>()
  /** A wrong letter was committed. Visible, recoverable, non-fatal. */
  readonly onWrongLetter: Event<WrongLetterEvent> = new Event<WrongLetterEvent>()
  /** The `wrong` display expired and the machine returned to signing. */
  readonly onWrongCleared: Event<void> = new Event<void>()
  /** Every signable character in the phrase is done. */
  readonly onPhraseComplete: Event<PhraseCompleteEvent> = new Event<PhraseCompleteEvent>()
  /** A new phrase was seated. */
  readonly onPhraseChanged: Event<PhraseChangedEvent> = new Event<PhraseChangedEvent>()
  /** A letter was manually skipped. */
  readonly onLetterSkipped: Event<LetterEvent> = new Event<LetterEvent>()

  // --- config ------------------------------------------------------------
  private phrases: string[]
  private wrongDisplaySeconds: number
  private autoAdvanceSeconds: number

  /** Letters the classifier can actually produce. Empty means "unvalidated". */
  private availableLetters: {[letter: string]: boolean} = {}
  private hasAvailableLetters = false

  // --- state -------------------------------------------------------------
  private phrase = ""
  private phraseIndex = 0
  private letterStatus: LetterStatus[] = []
  private index = -1
  private status: PhraseStatus = "idle"
  private wrongLetter: string | null = null
  private timer = 0
  private mistakes = 0
  private mistakesOnCurrentLetter = 0
  private skipped = 0

  constructor(config: PhraseControllerConfig = {}) {
    this.phrases =
      config.phrases !== undefined && config.phrases.length > 0 ? config.phrases.slice() : DEFAULT_PHRASES.slice()
    this.wrongDisplaySeconds = config.wrongDisplaySeconds !== undefined ? config.wrongDisplaySeconds : 1.2
    this.autoAdvanceSeconds = config.autoAdvanceSeconds !== undefined ? config.autoAdvanceSeconds : 0
    this.selectPhrase(0)
  }

  // -------------------------------------------------------------------------
  // Phrase menu
  // -------------------------------------------------------------------------

  /** The preset menu, for rendering a chooser. */
  getPhrases(): string[] {
    return this.phrases.slice()
  }

  /** Replace the preset menu and seat its first entry. */
  setPhrases(phrases: string[]): void {
    if (!phrases || phrases.length === 0) {
      throw new Error("PhraseController.setPhrases: need at least one phrase.")
    }
    this.phrases = phrases.slice()
    this.selectPhrase(0)
  }

  /**
   * Constrain phrases to what the classifier can actually recognize. Pass
   * `classifier.loadedLetters()`. Once set, seating a phrase containing an
   * unavailable letter is refused rather than producing an unfinishable demo.
   */
  setAvailableLetters(letters: string[]): void {
    this.availableLetters = {}
    this.hasAvailableLetters = letters !== null && letters !== undefined && letters.length > 0
    if (!this.hasAvailableLetters) {
      return
    }
    for (let i = 0; i < letters.length; i++) {
      this.availableLetters[letters[i].toUpperCase()] = true
    }
    // Re-validate what is currently seated.
    const missing = this.unsignableLetters(this.phrase)
    if (missing.length > 0) {
      print(
        "PhraseController WARNING: seated phrase '" +
          this.phrase +
          "' needs letter(s) the classifier does not have: " +
          missing.join(", ") +
          ". It cannot be completed."
      )
      this.markUnsignable()
    }
  }

  /** Letters in a phrase that the classifier cannot produce. */
  unsignableLetters(phrase: string): string[] {
    if (!this.hasAvailableLetters || !phrase) {
      return []
    }
    const missing: string[] = []
    const seen: {[k: string]: boolean} = {}
    const upper = phrase.toUpperCase()
    for (let i = 0; i < upper.length; i++) {
      const ch = upper[i]
      if (!isSignable(ch) || seen[ch]) {
        continue
      }
      seen[ch] = true
      if (!this.availableLetters[ch]) {
        missing.push(ch)
      }
    }
    return missing
  }

  /** Phrases from the menu that can actually be completed right now. */
  signablePhrases(): string[] {
    const out: string[] = []
    for (let i = 0; i < this.phrases.length; i++) {
      if (this.unsignableLetters(this.phrases[i]).length === 0) {
        out.push(this.phrases[i])
      }
    }
    return out
  }

  /** Seat a preset by menu position. */
  selectPhrase(phraseIndex: number): boolean {
    if (phraseIndex < 0 || phraseIndex >= this.phrases.length) {
      return false
    }
    this.phraseIndex = phraseIndex
    return this.setPhrase(this.phrases[phraseIndex])
  }

  /** Seat an arbitrary phrase, outside the menu. */
  setPhrase(phrase: string): boolean {
    const upper = (phrase !== null && phrase !== undefined ? phrase : "").toUpperCase()
    this.phrase = upper
    this.letterStatus = new Array(upper.length)
    this.mistakes = 0
    this.mistakesOnCurrentLetter = 0
    this.skipped = 0
    this.wrongLetter = null
    this.timer = 0

    for (let i = 0; i < upper.length; i++) {
      this.letterStatus[i] = isSignable(upper[i]) ? "pending" : "unsignable"
    }

    const missing = this.unsignableLetters(upper)
    if (missing.length > 0) {
      print(
        "PhraseController WARNING: '" +
          upper +
          "' needs letter(s) the classifier does not have: " +
          missing.join(", ") +
          ". Refusing to seat it — pick another phrase, or record templates for those letters."
      )
      this.markUnsignable()
      return false
    }

    this.index = this.nextSignableFrom(0)
    this.status = this.index === -1 ? "complete" : "signing"
    if (this.index !== -1) {
      this.letterStatus[this.index] = "current"
    }

    this.onPhraseChanged.invoke({phrase: this.phrase, phraseIndex: this.phraseIndex})
    return true
  }

  /** Advance the menu, wrapping. */
  nextPhrase(): boolean {
    if (this.phrases.length === 0) {
      return false
    }
    return this.selectPhrase((this.phraseIndex + 1) % this.phrases.length)
  }

  /** Step back through the menu, wrapping. */
  previousPhrase(): boolean {
    if (this.phrases.length === 0) {
      return false
    }
    return this.selectPhrase((this.phraseIndex - 1 + this.phrases.length) % this.phrases.length)
  }

  /** Re-seat the current phrase from the start. */
  restart(): void {
    this.setPhrase(this.phrase)
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  /**
   * Feed a committed letter from HoldBuffer.
   *
   * @returns what happened, so the caller can drive sound without subscribing
   */
  submit(letter: string): CommitOutcome {
    if (this.status === "idle" || this.status === "complete" || this.index === -1) {
      return "ignored"
    }
    if (!letter) {
      return "ignored"
    }

    const signed = letter.toUpperCase()
    const expected = this.phrase[this.index]

    if (signed !== expected) {
      this.mistakes++
      this.mistakesOnCurrentLetter++
      this.wrongLetter = signed
      this.status = "wrong"
      this.timer = this.wrongDisplaySeconds
      this.onWrongLetter.invoke({
        signed: signed,
        expected: expected,
        index: this.index,
        mistakesOnCurrentLetter: this.mistakesOnCurrentLetter
      })
      return "wrong"
    }

    // Correct — this clears any wrong flash immediately rather than making the
    // user wait it out.
    this.letterStatus[this.index] = "done"
    this.wrongLetter = null
    this.mistakesOnCurrentLetter = 0

    const completedIndex = this.index
    const next = this.nextSignableFrom(this.index + 1)
    this.onCorrectLetter.invoke({
      letter: signed,
      index: completedIndex,
      remaining: this.remainingSignable(next)
    })

    this.advanceTo(next)
    return "correct"
  }

  /**
   * Give up on the current letter and move on. Recorded as skipped, not as a
   * mistake. Exists so a letter that will not classify cannot dead-end a live
   * demo.
   */
  skipCurrentLetter(): boolean {
    if (this.status === "idle" || this.status === "complete" || this.index === -1) {
      return false
    }
    this.letterStatus[this.index] = "skipped"
    this.skipped++
    this.wrongLetter = null
    this.mistakesOnCurrentLetter = 0

    const skippedIndex = this.index
    const next = this.nextSignableFrom(this.index + 1)
    this.onLetterSkipped.invoke({
      letter: this.phrase[skippedIndex],
      index: skippedIndex,
      remaining: this.remainingSignable(next)
    })

    this.advanceTo(next)
    return true
  }

  /**
   * Drive timed transitions — the wrong-letter display expiring, and the
   * optional auto-advance after completion. Call once per frame with
   * `getDeltaTime()`.
   */
  update(deltaTime: number): void {
    if (this.status === "wrong") {
      this.timer -= deltaTime
      if (this.timer <= 0) {
        this.status = "signing"
        this.wrongLetter = null
        this.timer = 0
        this.onWrongCleared.invoke()
      }
      return
    }

    if (this.status === "complete" && this.autoAdvanceSeconds > 0) {
      this.timer -= deltaTime
      if (this.timer <= 0) {
        this.timer = 0
        this.nextPhrase()
      }
    }
  }

  // -------------------------------------------------------------------------
  // Output
  // -------------------------------------------------------------------------

  getState(): PhraseState {
    return {
      phrase: this.phrase,
      letterStatus: this.letterStatus.slice(),
      index: this.index,
      currentLetter: this.index === -1 ? null : this.phrase[this.index],
      status: this.status,
      wrongLetter: this.wrongLetter,
      progress: this.computeProgress(),
      mistakes: this.mistakes,
      mistakesOnCurrentLetter: this.mistakesOnCurrentLetter,
      skipped: this.skipped,
      phraseIndex: this.phraseIndex,
      phraseCount: this.phrases.length
    }
  }

  describe(): string {
    return (
      "'" +
      this.phrase +
      "' [" +
      (this.phraseIndex + 1) +
      "/" +
      this.phrases.length +
      "] " +
      this.status +
      " at " +
      this.index +
      " mistakes=" +
      this.mistakes
    )
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private advanceTo(next: number): void {
    this.index = next
    if (next === -1) {
      this.status = "complete"
      this.timer = this.autoAdvanceSeconds
      this.onPhraseComplete.invoke({phrase: this.phrase, mistakes: this.mistakes, skipped: this.skipped})
      return
    }
    this.letterStatus[next] = "current"
    this.status = "signing"
    this.timer = 0
  }

  /** First signable, not-yet-done index at or after `from`, or -1. */
  private nextSignableFrom(from: number): number {
    for (let i = from; i < this.phrase.length; i++) {
      if (this.letterStatus[i] === "pending" || this.letterStatus[i] === "current") {
        return i
      }
    }
    return -1
  }

  private remainingSignable(fromIndex: number): number {
    if (fromIndex === -1) {
      return 0
    }
    let n = 0
    for (let i = fromIndex; i < this.phrase.length; i++) {
      if (this.letterStatus[i] === "pending" || this.letterStatus[i] === "current") {
        n++
      }
    }
    return n
  }

  private computeProgress(): number {
    let total = 0
    let done = 0
    for (let i = 0; i < this.letterStatus.length; i++) {
      const s = this.letterStatus[i]
      if (s === "unsignable") {
        continue
      }
      total++
      if (s === "done" || s === "skipped") {
        done++
      }
    }
    return total === 0 ? 0 : done / total
  }

  /** Park the machine — the seated phrase cannot be completed. */
  private markUnsignable(): void {
    this.index = -1
    this.status = "idle"
    this.wrongLetter = null
  }
}
