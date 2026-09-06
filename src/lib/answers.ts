/** Normalise a learner's typed answer so small differences are forgiven. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/[.,!?;:"]+$/g, '')
    .trim()
}

export function isCorrect(input: string, accepted: string[]): boolean {
  const n = normalize(input)
  if (!n) return false
  return accepted.some((a) => normalize(a) === n)
}

/** Loose comparison for word-order answers: ignores case and punctuation. */
export function looseEquals(a: string, b: string): boolean {
  const f = (s: string) =>
    s
      .toLowerCase()
      .replace(/[‘’]/g, "'")
      .replace(/[^a-z0-9' ]+/g, ' ')
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
