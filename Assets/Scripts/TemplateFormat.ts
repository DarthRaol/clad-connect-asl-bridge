/**
 * TemplateFormat — the shape of templates.json, and the rules for reading it.
 *
 * Shared by the recorder that writes it, the classifier that consumes it, and
 * the mock that replays it. Lives on its own so the classifier does not have to
 * import template schema out of a test-mock module.
 */

import {FEATURE_DIM} from "./LandmarkCapture"

/**
 * Reserved key for non-letter poses: hand at rest, mid-transition between
 * letters, flat palm, pointing, loose fist, hand in motion.
 *
 * These are NOT templates and must never be classification candidates. They
 * exist so a rejection threshold can be set from the measured separation
 * between letter distances and non-letter distances, instead of guessed.
 *
 * Margin confidence alone cannot reject them — it is scale-free, so a pose far
 * from every letter still scores high confidence if it is nearer one than the
 * rest. Only an absolute distance gate catches that, and this is the data that
 * calibrates it.
 */
export const NEGATIVE_KEY = "_NEGATIVE"

/**
 * Any key beginning with "_" is reserved and excluded from classification.
 * Letters are single uppercase characters; the prefix keeps the two apart with
 * no chance of collision.
 */
export function isReservedKey(key: string): boolean {
  return !key || key.charAt(0) === "_"
}

/**
 * A stored sample. Format v2 keeps both representations; v1 stored a bare
 * normalized vector. Readers accept either.
 */
export type TemplateSample = ArrayLike<number> | {normalized: number[]; raw?: number[] | null}

export type TemplatesFile = {letters: {[key: string]: TemplateSample[]}}

/** Pull the normalized vector out of either sample shape. Null if unusable. */
export function extractNormalized(sample: TemplateSample | null | undefined): ArrayLike<number> | null {
  if (!sample) {
    return null
  }
  const asArray = sample as ArrayLike<number>
  if (asArray.length !== undefined) {
    return asArray.length >= FEATURE_DIM ? asArray : null
  }
  const asObject = sample as {normalized: number[]}
  if (asObject.normalized && asObject.normalized.length >= FEATURE_DIM) {
    return asObject.normalized
  }
  return null
}

/** Pull the raw positions out of a v2 sample. Null for v1 samples. */
export function extractRaw(sample: TemplateSample | null | undefined): number[] | null {
  if (!sample) {
    return null
  }
  const asArray = sample as ArrayLike<number>
  if (asArray.length !== undefined) {
    return null
  }
  const asObject = sample as {raw?: number[] | null}
  return asObject.raw !== undefined && asObject.raw !== null ? asObject.raw : null
}

/** Keys that are actual letters — reserved keys filtered out. */
export function letterKeys(file: TemplatesFile): string[] {
  if (!file || !file.letters) {
    return []
  }
  const all = Object.keys(file.letters)
  const out: string[] = []
  for (let i = 0; i < all.length; i++) {
    if (!isReservedKey(all[i])) {
      out.push(all[i])
    }
  }
  return out
}

/** Negative samples, or an empty array when the file has none. */
export function negativeSamples(file: TemplatesFile): TemplateSample[] {
  if (!file || !file.letters || !file.letters[NEGATIVE_KEY]) {
    return []
  }
  return file.letters[NEGATIVE_KEY]
}
