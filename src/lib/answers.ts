/**
 * Normalise a learner's typed answer so small differences are forgiven: case, curly quotes,
 * spacing, and trailing punctuation. Accents are kept - see `checkTyped` for how they are graded.
 *
 * NFC first, so "é" typed as e + combining accent (some mobile keyboards) equals the single
 * code point in the content. French puts a (often non-breaking) space before ? ! : ; and \s
 * matches those spaces too, so "Ça va ?" and "Ça va?" compare equal.
 */
export function normalize(s: string): string {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    // Elision: "l' eau" -> "l'eau", "j' ai" -> "j'ai".
    .replace(/'\s+/g, "'")
    .replace(/[.,!?;:"]+$/g, '')
    .replace(/^"+/g, '')
    .trim()
}

/** Strip diacritics: "été" -> "ete", "garçon" -> "garcon". Ligatures (œ) are kept. */
export function foldAccents(s: string): string {
  return s.normalize('NFD').replace(/\p{M}+/gu, '').normalize('NFC')
}

export function isCorrect(input: string, accepted: string[]): boolean {
  const n = normalize(input)
  if (!n) return false
  return accepted.some((a) => normalize(a) === n)
}

/**
 * How a typed answer did:
 *   correct - matches an accepted answer exactly (after normalize)
 *   accents - right word, wrong or missing accents ("ete" for "été"). It counts as correct, but
 *             the learner is shown the proper spelling: a beginner on an English keyboard should
 *             not lose the point, and should not miss the lesson either.
 *   wrong   - anything else
 * `expected` is the accepted answer the input was matched against, for display.
 */
export type TypedVerdict = { result: 'correct' | 'accents' | 'wrong'; expected?: string }

export function checkTyped(input: string, accepted: string[]): TypedVerdict {
  const n = normalize(input)
  if (!n) return { result: 'wrong' }
  const exact = accepted.find((a) => normalize(a) === n)
  if (exact !== undefined) return { result: 'correct', expected: exact }
  const folded = foldAccents(n)
  const near = accepted.find((a) => foldAccents(normalize(a)) === folded)
  if (near !== undefined) return { result: 'accents', expected: near }
  return { result: 'wrong' }
}

/**
 * Loose comparison for word-order answers: ignores case and punctuation, keeps every letter.
 * \p{L} rather than a-z: an ASCII class would delete "à", "où" and "ç" outright, so a
 * French sentence with a misplaced "à" would compare equal to the right one.
 */
export function looseEquals(a: string, b: string): boolean {
  const f = (s: string) =>
    s
      .normalize('NFC')
      .toLowerCase()
      .replace(/[‘’ʼ]/g, "'")
      .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  return f(a) === f(b)
}

/** Deterministic Fisher-Yates shuffle (seeded) so a re-render never re-shuffles. */
export function shuffle<T>(arr: T[], seed = Date.now()): T[] {
  const out = arr.slice()
  let s = seed >>> 0 || 1
  const rnd = () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 100000) / 100000
  }
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Shuffle but guarantee the result differs from the input when possible. */
export function shuffleDifferent<T>(arr: T[], seed = Date.now()): T[] {
  if (arr.length < 2) return arr.slice()
  let out = shuffle(arr, seed)
  let tries = 0
  while (out.every((v, i) => v === arr[i]) && tries < 10) {
    out = shuffle(arr, seed + ++tries)
  }
  return out
}
