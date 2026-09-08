import { useEffect, useState } from 'react'
import type { BookMeta } from '../content/types'

/** Everything the app remembers lives in localStorage under this key. */
const KEY = 'fhlanguagelearning:v1'

export type UnitStatus = 'not_started' | 'in_progress' | 'passed' | 'failed'

export type Theme = 'light' | 'dark'

export interface UnitProgress {
  status: UnitStatus
  lessonSeen: boolean
  attempts: number
  /** Best percentage score 0-100. */
  bestScore: number
  /** 0-3 stars from the best attempt. */
  stars: number
  lastAt: string
}

export interface BookProgress {
  lastUnit: number | null
  units: Record<string, UnitProgress>
}

export interface Progress {
  version: 1
  xp: number
  streak: { count: number; lastDay: string | null }
  books: Record<string, BookProgress>
  settings: { sound: boolean; theme: Theme }
}

const empty = (): Progress => ({
  version: 1,
  xp: 0,
  streak: { count: 0, lastDay: null },
  books: {},
  settings: { sound: true, theme: 'light' },
})

function read(): Progress {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return empty()
    const parsed = JSON.parse(raw) as Partial<Progress>
    return { ...empty(), ...parsed, streak: { ...empty().streak, ...parsed.streak }, settings: { ...empty().settings, ...parsed.settings } }
  } catch {
    return empty()
  }
}

/**
 * Light is the product default, so the OS `prefers-color-scheme` is never
 * consulted - only a stored choice. index.html stamps the same attribute
 * before first paint, so there is no flash of the wrong theme on load.
 */
export function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'dark') root.dataset.theme = 'dark'
  else delete root.dataset.theme
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#202230' : '#ffffff')
}

let state: Progress = read()
applyTheme(state.settings.theme)
const listeners = new Set<() => void>()

function write(next: Progress) {
  state = next
  applyTheme(next.settings.theme)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* storage full or unavailable - keep in memory */
  }
  listeners.forEach((l) => l())
}

export const progressStore = {
  get: () => state,
  set: (updater: (p: Progress) => Progress) => write(updater(state)),
  subscribe: (l: () => void) => {
    listeners.add(l)
    return () => listeners.delete(l)
  },
}

/** React hook: re-renders when progress changes (also across tabs). */
export function useProgress(): Progress {
  const [p, setP] = useState(state)
  useEffect(() => {
    const unsub = progressStore.subscribe(() => setP(progressStore.get()))
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) write(read())
    }
    window.addEventListener('storage', onStorage)
    return () => {
      unsub()
      window.removeEventListener('storage', onStorage)
    }
  }, [])
  return p
}

const today = () => new Date().toISOString().slice(0, 10)

function ensureBook(p: Progress, slug: string): BookProgress {
  return p.books[slug] ?? { lastUnit: null, units: {} }
}

export function getUnitProgress(p: Progress, slug: string, unit: number): UnitProgress | undefined {
  return p.books[slug]?.units[String(unit)]
}

export function markLessonSeen(slug: string, unit: number) {
  progressStore.set((p) => {
    const book = ensureBook(p, slug)
    const prev = book.units[String(unit)]
    const next: UnitProgress = prev
      ? { ...prev, lessonSeen: true, lastAt: new Date().toISOString() }
      : { status: 'in_progress', lessonSeen: true, attempts: 0, bestScore: 0, stars: 0, lastAt: new Date().toISOString() }
    return { ...p, books: { ...p.books, [slug]: { lastUnit: unit, units: { ...book.units, [String(unit)]: next } } } }
  })
}

export const XP_PER_CORRECT = 10
export const XP_PASS_BONUS = 50
export const XP_PERFECT_BONUS = 25

export function starsFor(score: number, passScore: number): number {
  if (score >= 95) return 3
  if (score >= Math.max(passScore + 10, 80)) return 2
  if (score >= passScore) return 1
  return 0
}

export interface QuizOutcome {
  score: number
  passed: boolean
  stars: number
  xpGained: number
  streak: number
  newBest: boolean
}

function bumpStreak(s: Progress['streak']): Progress['streak'] {
  const t = today()
  if (s.lastDay === t) return s
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  return { count: s.lastDay === yesterday ? s.count + 1 : 1, lastDay: t }
}

export function recordQuiz(slug: string, unit: number, correct: number, total: number, passScore: number): QuizOutcome {
  const score = total === 0 ? 0 : Math.round((correct / total) * 100)
  const passed = score >= passScore
  const stars = starsFor(score, passScore)
  let xpGained = correct * XP_PER_CORRECT + (passed ? XP_PASS_BONUS : 0) + (score === 100 ? XP_PERFECT_BONUS : 0)
  let newBest = false
  let streakCount = 0
  progressStore.set((p) => {
    const book = ensureBook(p, slug)
    const prev = book.units[String(unit)]
    newBest = !prev || score > prev.bestScore
    const next: UnitProgress = {
      status: passed || prev?.status === 'passed' ? 'passed' : 'failed',
      lessonSeen: prev?.lessonSeen ?? true,
      attempts: (prev?.attempts ?? 0) + 1,
      bestScore: Math.max(prev?.bestScore ?? 0, score),
      stars: Math.max(prev?.stars ?? 0, stars),
      lastAt: new Date().toISOString(),
    }
    const streak = bumpStreak(p.streak)
    streakCount = streak.count
    return {
      ...p,
      xp: p.xp + xpGained,
      streak,
      books: { ...p.books, [slug]: { lastUnit: unit, units: { ...book.units, [String(unit)]: next } } },
    }
  })
  return { score, passed, stars, xpGained, streak: streakCount, newBest }
}

export function setSound(sound: boolean) {
  progressStore.set((p) => ({ ...p, settings: { ...p.settings, sound } }))
}

export function setTheme(theme: Theme) {
  progressStore.set((p) => ({ ...p, settings: { ...p.settings, theme } }))
}

export function resetAll() {
  write(empty())
}

export interface BookStats {
  passed: number
  started: number
  available: number
  total: number
  percent: number
  stars: number
}

export function bookStats(p: Progress, book: BookMeta, available: Set<number>): BookStats {
  const units = p.books[book.slug]?.units ?? {}
  let passed = 0
  let started = 0
  let stars = 0
  for (const u of Object.values(units)) {
    if (u.status === 'passed') passed++
    if (u.status !== 'not_started') started++
    stars += u.stars
  }
  const total = Object.keys(book.unitTitles).length
  return { passed, started, available: available.size, total, percent: total ? Math.round((passed / total) * 100) : 0, stars }
}

/** Levels grow quadratically so early levels feel quick. */
export function levelFor(xp: number) {
  let level = 1
  let need = 200
  let floor = 0
  while (xp >= floor + need) {
    floor += need
    level++
    need = Math.round(need * 1.25)
  }
  const titles = ['Beginner', 'Explorer', 'Learner', 'Achiever', 'Grammarian', 'Wordsmith', 'Scholar', 'Expert', 'Master', 'Legend']
  return {
    level,
    title: titles[Math.min(level - 1, titles.length - 1)],
    current: xp - floor,
    need,
    progress: (xp - floor) / need,
  }
}
