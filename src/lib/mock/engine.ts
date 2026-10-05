import type { ListeningPart, QuestionGroup, QuestionType, WordLimit } from '../../content/ielts-mock/types'
import { LISTENING_FRAME } from '../../content/ielts-mock/listening-frame'

/** Anything made of question groups: a Reading passage or a Listening part. */
export interface GroupHolder {
  groups: QuestionGroup[]
}

/**
 * The exam engine: question numbering, marking and band conversion.
 * Pure functions only - no React, no storage - so the exam screen and the
 * results screen mark a paper in exactly the same way.
 */

/* ------------------------------------------------------------ numbering */

/** How many question numbers a group occupies. */
export function questionCount(g: QuestionGroup): number {
  switch (g.type) {
    case 'multi':
    case 'completion':
    case 'summary-box':
      return g.answers.length
    default:
      return g.items.length
  }
}

export interface GroupSlot {
  passage: number
  group: number
  /** First and last question number, 1-based, across the whole paper. */
  start: number
  end: number
}

/** Numbers every group across the three passages: 1-13, 14-26, 27-40. */
export function layoutPaper(passages: GroupHolder[]): GroupSlot[] {
  const out: GroupSlot[] = []
  let n = 1
  passages.forEach((p, pi) =>
    p.groups.forEach((g, gi) => {
      const c = questionCount(g)
      out.push({ passage: pi, group: gi, start: n, end: n + c - 1 })
      n += c
    }),
  )
  return out
}

/** First and last question number of each passage. */
export function passageRanges(slots: GroupSlot[], passages: number): [number, number][] {
  return Array.from({ length: passages }, (_, pi) => {
    const own = slots.filter((s) => s.passage === pi)
    return [own[0]?.start ?? 0, own[own.length - 1]?.end ?? -1]
  })
}

/* ------------------------------------------------------------ answers */

/**
 * Answers are stored by question number as strings. A "multi" group (choose TWO)
 * stores its picks on its FIRST number as sorted letters, e.g. "21" -> "AC".
 */
export type Answers = Record<string, string>

export const letter = (i: number) => String.fromCharCode(65 + i)
export const roman = (i: number) =>
  ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv'][i] ?? String(i + 1)

/** Typed answers forgive case, spacing, curly quotes, trailing punctuation and number commas. */
export function normalizeTyped(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/[“”"]/g, '')
    .replace(/[–—]/g, '-')
    .replace(/(\d),(\d{3})/g, '$1$2')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,;:!?]+|[\s.,;:!?]+$/g, '')
    .trim()
}

/** "(the) harbour" -> ["the harbour", "harbour"] */
export function expandOptional(a: string): string[] {
  const m = a.match(/\(([^)]+)\)/)
  if (!m) return [a.replace(/\s+/g, ' ').trim()]
  return [...expandOptional(a.replace(m[0], m[1])), ...expandOptional(a.replace(m[0], ''))]
}

export function typedMatches(given: string, accept: string[]): boolean {
  const g = normalizeTyped(given)
  if (!g) return false
  return accept.flatMap(expandOptional).some((a) => normalizeTyped(a) === g)
}

/** Exam wording for a completion word limit. */
export function limitText(l: WordLimit): string {
  const words = l.words === 1 ? (l.number ? 'ONE WORD AND/OR A NUMBER' : 'ONE WORD ONLY') : `NO MORE THAN ${l.words === 2 ? 'TWO' : 'THREE'} WORDS${l.number ? ' AND/OR A NUMBER' : ''}`
  return words
}

/* ------------------------------------------------------------ marking */

export interface MarkedQuestion {
  num: number
  passage: number
  group: number
  type: QuestionType
  /** What the candidate gave, as displayed (letters, numerals or typed text). */
  given: string
  /** The answer key as displayed. */
  expected: string
  correct: boolean
  evidence?: string
  note?: string
}

const show = (v: string | undefined) => (v && v.trim() ? v.trim() : '')

export function markPaper(passages: GroupHolder[], answers: Answers): MarkedQuestion[] {
  const out: MarkedQuestion[] = []
  for (const slot of layoutPaper(passages)) {
    const g = passages[slot.passage].groups[slot.group]
    const base = { passage: slot.passage, group: slot.group, type: g.type }
    const at = (i: number) => String(slot.start + i)
    switch (g.type) {
      case 'tfng':
      case 'ynng':
        g.items.forEach((it, i) => {
          const given = show(answers[at(i)])
          out.push({ ...base, num: slot.start + i, given, expected: it.answer, correct: given === it.answer, evidence: it.evidence, note: it.note })
        })
        break
      case 'headings':
        g.items.forEach((it, i) => {
          const given = show(answers[at(i)])
          const expected = roman(it.answer)
          out.push({ ...base, num: slot.start + i, given, expected, correct: given === expected, evidence: it.evidence, note: it.note })
        })
        break
      case 'matching':
        g.items.forEach((it, i) => {
          const given = show(answers[at(i)])
          out.push({ ...base, num: slot.start + i, given, expected: it.answer, correct: given === it.answer, evidence: it.evidence, note: it.note })
        })
        break
      case 'mcq':
        g.items.forEach((it, i) => {
          const given = show(answers[at(i)])
          const expected = letter(it.answer)
          out.push({ ...base, num: slot.start + i, given, expected, correct: given === expected, evidence: it.evidence, note: it.note })
        })
        break
      case 'multi': {
        // Each correct letter scores one mark, in any order. Picks beyond the allowed
        // number never happen (the UI caps them), but are ignored if they do.
        const picks = (answers[at(0)] ?? '').split('').filter((c) => /[A-Z]/.test(c))
        const key = g.answers.map(letter).sort()
        const hits = picks.filter((c) => key.includes(c))
        const misses = picks.filter((c) => !key.includes(c))
        // Credit hits to the first numbers so a half-right answer reads naturally.
        key.forEach((_, i) => {
          const correct = i < hits.length
          const given = correct ? hits[i] : misses[i - hits.length] ?? ''
          out.push({ ...base, num: slot.start + i, given, expected: key.join(' / '), correct, evidence: g.evidence, note: g.note })
        })
        break
      }
      case 'completion': {
        // In any-order groups each typed answer may fill any unused slot of the key.
        const free = g.answers.map((_, i) => i)
        g.answers.forEach((a, i) => {
          const given = show(answers[at(i)])
          let correct: boolean
          let expected = a.accept[0]
          if (g.anyOrder) {
            const hit = free.findIndex((k) => typedMatches(given, g.answers[k].accept))
            correct = hit >= 0
            if (correct) free.splice(hit, 1)
            expected = g.answers.map((x) => x.accept[0]).join(' / ')
          } else correct = typedMatches(given, a.accept)
          out.push({ ...base, num: slot.start + i, given, expected, correct, evidence: a.evidence, note: a.note })
        })
        break
      }
      case 'summary-box':
        g.answers.forEach((a, i) => {
          const given = show(answers[at(i)])
          out.push({ ...base, num: slot.start + i, given, expected: a.answer, correct: given === a.answer, evidence: a.evidence, note: a.note })
        })
        break
    }
  }
  return out
}

/** Whether a question number has an answer, for the navigator. */
export function isAnswered(passages: GroupHolder[], answers: Answers, num: number): boolean {
  for (const slot of layoutPaper(passages)) {
    if (num < slot.start || num > slot.end) continue
    const g = passages[slot.passage].groups[slot.group]
    if (g.type === 'multi') {
      const picks = (answers[String(slot.start)] ?? '').length
      return picks > num - slot.start
    }
    return !!answers[String(num)]?.trim()
  }
  return false
}

/* ------------------------------------------------------------ bands */

/**
 * Academic Reading raw score -> band, as published with the Cambridge IELTS
 * practice tests. Below 4/40 the table is not published; those rows follow the
 * same slope down to band 0 for a paper with nothing correct.
 */
const ACADEMIC_READING: [number, number][] = [
  [39, 9],
  [37, 8.5],
  [35, 8],
  [33, 7.5],
  [30, 7],
  [27, 6.5],
  [23, 6],
  [19, 5.5],
  [15, 5],
  [13, 4.5],
  [10, 4],
  [8, 3.5],
  [6, 3],
  [4, 2.5],
  [3, 2],
  [2, 1.5],
  [1, 1],
]

/** Listening raw score -> band (the same table for Academic and General Training). */
const LISTENING: [number, number][] = [
  [39, 9],
  [37, 8.5],
  [35, 8],
  [32, 7.5],
  [30, 7],
  [26, 6.5],
  [23, 6],
  [18, 5.5],
  [16, 5],
  [13, 4.5],
  [11, 4],
  [8, 3.5],
  [6, 3],
  [4, 2.5],
  [3, 2],
  [2, 1.5],
  [1, 1],
]

export function listeningBand(raw: number): number {
  for (const [min, band] of LISTENING) if (raw >= min) return band
  return 0
}

export function readingBand(raw: number): number {
  for (const [min, band] of ACADEMIC_READING) if (raw >= min) return band
  return 0
}

/** Next band up and how many more correct answers it needs - for the results screen. */
export function nextBand(raw: number, skill: 'reading' | 'listening' = 'reading'): { band: number; need: number } | null {
  const rows = [...(skill === 'reading' ? ACADEMIC_READING : LISTENING)].reverse()
  const current = skill === 'reading' ? readingBand(raw) : listeningBand(raw)
  const up = rows.find(([, b]) => b > current)
  return up ? { band: up[1], need: up[0] - raw } : null
}

/**
 * Overall band: the mean of the section bands rounded to the nearest half band,
 * where .25 rounds up to .5 and .75 rounds up to the next whole band.
 */
export function roundOverall(mean: number): number {
  return Math.round(mean * 2) / 2
}

export const fmtBand = (b: number) => (Number.isInteger(b) ? `${b}.0` : String(b))

/** CEFR level the IELTS partners map each band to. */
export function cefrFor(band: number): string {
  if (band >= 8.5) return 'C2'
  if (band >= 7) return 'C1'
  if (band >= 5.5) return 'B2'
  if (band >= 4) return 'B1'
  return 'A2 or below'
}

/* ------------------------------------------------------------ randomness */

/** Fisher-Yates on Math.random - the paper is meant to differ every time. */
export function shuffled<T>(arr: T[]): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Pick one id from a pool, preferring ones this learner has never been given, then
 * the ones seen longest ago - so repeats only start once the whole pool is used up,
 * and even then you get the material you are least likely to remember.
 */
export function pickFresh(pool: string[], seen: Record<string, number>): string {
  if (!pool.length) throw new Error('empty pool')
  const unseen = pool.filter((id) => !(id in seen))
  if (unseen.length) return shuffled(unseen)[0]
  const oldestFirst = [...pool].sort((a, b) => seen[a] - seen[b])
  // Random among the oldest third, so two learners sharing a device still get variety.
  const span = Math.max(1, Math.ceil(oldestFirst.length / 3))
  return shuffled(oldestFirst.slice(0, span))[0]
}

/* ------------------------------------------------------------ writing */

export const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0)

/* ------------------------------------------------------------ listening timeline */


/**
 * One stretch of a Listening paper on the wall clock. `t0`/`t1` are seconds from the
 * moment the candidate pressed Start; for audio stretches `src` + `from` say what plays.
 */
export interface ListeningSeg {
  t0: number
  t1: number
  kind: 'intro' | 'play' | 'read' | 'check' | 'final'
  /** Index of the part (0-3), or -1 for the opening and closing announcements. */
  part: number
  src?: string
  from?: number
  /** Global question numbers for a reading step. */
  questions?: [number, number]
}

/**
 * Lays the whole paper out in time: the opening announcement, then each part's own steps
 * (reading time, recording, checking time) with question numbers made global, then the
 * closing announcement with the final two minutes' checking time.
 */
export function listeningTimeline(parts: ListeningPart[]): ListeningSeg[] {
  const out: ListeningSeg[] = []
  let t = 0
  const push = (seg: Omit<ListeningSeg, 't0' | 't1'>, seconds: number) => {
    out.push({ ...seg, t0: t, t1: t + seconds })
    t += seconds
  }
  const f = LISTENING_FRAME
  push({ kind: 'intro', part: -1, src: f.audio, from: f.intro.from }, f.intro.to - f.intro.from)
  const ranges = passageRanges(layoutPaper(parts), parts.length)
  parts.forEach((p, pi) => {
    const offset = ranges[pi][0] - 1
    for (const step of p.steps) {
      if (step.kind === 'play') push({ kind: 'play', part: pi, src: p.audio, from: step.from }, step.to - step.from)
      else if (step.kind === 'read') push({ kind: 'read', part: pi, questions: [step.questions[0] + offset, step.questions[1] + offset] }, step.seconds)
      else push({ kind: 'check', part: pi }, step.seconds)
    }
  })
  push({ kind: 'final', part: -1, src: f.audio, from: f.outro.from }, f.outro.to - f.outro.from)
  return out
}

export const timelineLength = (segs: ListeningSeg[]) => segs[segs.length - 1]?.t1 ?? 0

/**
 * Band for a Listening paper that may hold fewer than 40 questions (some parts are short
 * official extracts): the raw score is scaled to 40 before the published table is applied.
 */
export function scaledListeningBand(raw: number, total: number): number {
  if (!total) return 0
  return listeningBand(total === 40 ? raw : Math.round((raw * 40) / total))
}
