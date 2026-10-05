import { useEffect, useState } from 'react'
import { listeningPool, listeningReady, passagePool, task1Pool, task2Pool } from '../../content/ielts-mock'
import type { CriterionRatings } from './descriptors'
import type { Answers } from './engine'
import { pickFresh } from './engine'

/**
 * Mock-test state, kept apart from the course progress (src/lib/storage.ts) because
 * it has a different shape and lifetime: one live exam session at a time, a history
 * of finished papers, and a record of which material each learner has already seen.
 * All three live in localStorage on this device.
 */

export type SectionId = 'listening' | 'reading' | 'writing'

/** Exam order. Listening's length comes from its recording (plus two minutes' checking time). */
export const SECTION_ORDER: SectionId[] = ['listening', 'reading', 'writing']
export const SECTION_MINUTES: Record<Exclude<SectionId, 'listening'>, number> = { reading: 60, writing: 60 }


export interface ListeningState {
  /** One part per slot, Part 1 to Part 4. */
  partIds: string[]
  answers: Answers
  flagged: number[]
  endsAt?: number
  startedAt?: number
  finishedAt?: number
}

export interface ReadingState {
  passageIds: string[]
  answers: Answers
  flagged: number[]
  /** Epoch ms when time runs out; unset until the candidate presses Start. */
  endsAt?: number
  startedAt?: number
  finishedAt?: number
}

export interface WritingState {
  task1: string
  task2: string
  text1: string
  text2: string
  endsAt?: number
  startedAt?: number
  finishedAt?: number
}

export interface MockSession {
  id: string
  createdAt: number
  /** In exam order. */
  sections: SectionId[]
  /** Index into sections of the one in progress. */
  current: number
  /** 'intro' = the instructions page before the clock starts. */
  step: 'intro' | 'live'
  listening?: ListeningState
  reading?: ReadingState
  writing?: WritingState
}

export interface WritingRatings {
  task1: CriterionRatings
  task2: CriterionRatings
}

export interface MockResult {
  id: string
  finishedAt: number
  sections: SectionId[]
  listening?: ListeningState & { raw: number; band: number; total: number }
  reading?: ReadingState & { raw: number; band: number }
  writing?: WritingState & { ratings?: WritingRatings; band?: number }
}

interface Seen {
  listening: Record<string, number>
  passages: Record<string, number>
  task1: Record<string, number>
  task2: Record<string, number>
}

const K_SESSION = 'fhlanguagelearning:mock:session'
const K_HISTORY = 'fhlanguagelearning:mock:history'
const K_SEEN = 'fhlanguagelearning:mock:seen'
const HISTORY_LIMIT = 50

function readKey<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeKey(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage full or blocked - the exam still runs from memory */
  }
}

const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

let session: MockSession | null = readKey<MockSession | null>(K_SESSION, null)
let history: MockResult[] = readKey<MockResult[]>(K_HISTORY, [])
const emptySeen = (): Seen => ({ listening: {}, passages: {}, task1: {}, task2: {} })
let seen: Seen = { ...emptySeen(), ...readKey<Partial<Seen>>(K_SEEN, {}) }

export const getSession = () => session
export const getHistory = () => history
export const getSeen = () => seen

export function setSession(next: MockSession | null) {
  session = next
  writeKey(K_SESSION, next)
  emit()
}

export function updateSession(fn: (s: MockSession) => MockSession) {
  if (session) setSession(fn(session))
}

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

/**
 * Assemble a fresh paper: one passage per slot and one task of each kind, each
 * picked from material this learner has not been given yet where possible.
 * The picks are marked as seen straight away, so quitting halfway still moves
 * the next paper on to new material.
 */
export function startSession(sections: SectionId[]): MockSession {
  const now = Date.now()
  sections = SECTION_ORDER.filter((x) => sections.includes(x))
  const s: MockSession = { id: newId(), createdAt: now, sections, current: 0, step: 'intro' }
  const nextSeen: Seen = { listening: { ...seen.listening }, passages: { ...seen.passages }, task1: { ...seen.task1 }, task2: { ...seen.task2 } }
  if (sections.includes('listening') && listeningReady) {
    const partIds = listeningPool.map((pool) => pickFresh(pool, seen.listening))
    partIds.forEach((id) => (nextSeen.listening[id] = now))
    s.listening = { partIds, answers: {}, flagged: [] }
  }
  if (sections.includes('reading')) {
    const passageIds = passagePool.map((pool) => pickFresh(pool, seen.passages))
    passageIds.forEach((id) => (nextSeen.passages[id] = now))
    s.reading = { passageIds, answers: {}, flagged: [] }
  }
  if (sections.includes('writing')) {
    const task1 = pickFresh(task1Pool, seen.task1)
    const task2 = pickFresh(task2Pool, seen.task2)
    nextSeen.task1[task1] = now
    nextSeen.task2[task2] = now
    s.writing = { task1, task2, text1: '', text2: '' }
  }
  seen = nextSeen
  writeKey(K_SEEN, seen)
  setSession(s)
  return s
}

export function saveResult(r: MockResult) {
  history = [r, ...history.filter((h) => h.id !== r.id)].slice(0, HISTORY_LIMIT)
  writeKey(K_HISTORY, history)
  emit()
}

export function updateResult(id: string, fn: (r: MockResult) => MockResult) {
  const r = history.find((h) => h.id === id)
  if (r) saveResult(fn(r))
}

export function deleteResult(id: string) {
  history = history.filter((h) => h.id !== id)
  writeKey(K_HISTORY, history)
  emit()
}

/** How much of each pool this learner has already been given. */
export function poolStats() {
  const count = (pool: string[], rec: Record<string, number>) => pool.filter((id) => id in rec).length
  return {
    listening: listeningPool.reduce((n, p) => n + p.length, 0),
    listeningSeen: listeningPool.reduce((n, p) => n + count(p, seen.listening), 0),
    listeningPapers: listeningPool.reduce((n, p) => n * Math.max(1, p.length), 1),
    passages: passagePool.reduce((n, p) => n + p.length, 0),
    passagesSeen: passagePool.reduce((n, p) => n + count(p, seen.passages), 0),
    papers: passagePool.reduce((n, p) => n * Math.max(1, p.length), 1),
    task1: task1Pool.length,
    task1Seen: count(task1Pool, seen.task1),
    task2: task2Pool.length,
    task2Seen: count(task2Pool, seen.task2),
  }
}

/** React hook: re-renders on any mock-state change, including from another tab. */
export function useMockState() {
  const [, setTick] = useState(0)
  useEffect(() => {
    const bump = () => setTick((t) => t + 1)
    listeners.add(bump)
    const onStorage = (e: StorageEvent) => {
      if (e.key === K_SESSION) session = readKey<MockSession | null>(K_SESSION, null)
      else if (e.key === K_HISTORY) history = readKey<MockResult[]>(K_HISTORY, [])
      else if (e.key === K_SEEN) seen = { ...emptySeen(), ...readKey<Partial<Seen>>(K_SEEN, {}) }
      else return
      bump()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      listeners.delete(bump)
      window.removeEventListener('storage', onStorage)
    }
  }, [])
  return { session, history, seen }
}
