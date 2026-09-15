import { supabase } from './supabase'
import { authStore } from './auth'
import {
  applyRemoteProgress,
  emptyProgress,
  onLocalWrite,
  progressStore,
  type BookProgress,
  type Progress,
  type UnitProgress,
} from './storage'

const TABLE = 'progress'
/** Quiz results arrive in bursts; one write per burst is plenty. */
const PUSH_DEBOUNCE_MS = 1500

export type SyncState = 'off' | 'idle' | 'syncing' | 'error'

let syncState: SyncState = 'off'
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function setState(next: SyncState) {
  if (syncState === next) return
  syncState = next
  emit()
}

export const syncStore = {
  state: () => syncState,
  subscribe: (l: () => void) => {
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  },
}

/* ------------------------------------------------------------------ merge */

const laterOf = (a: string | undefined, b: string | undefined) =>
  !a ? b ?? '' : !b ? a : a > b ? a : b

function mergeUnit(a: UnitProgress | undefined, b: UnitProgress | undefined): UnitProgress {
  if (!a) return b!
  if (!b) return a
  return {
    // A unit once passed stays passed; otherwise the more recent attempt wins.
    status:
      a.status === 'passed' || b.status === 'passed'
        ? 'passed'
        : a.lastAt >= b.lastAt
          ? a.status
          : b.status,
    lessonSeen: a.lessonSeen || b.lessonSeen,
    // Both sides may share history, so max is the honest bound - summing would
    // double-count every attempt made before the devices diverged.
    attempts: Math.max(a.attempts, b.attempts),
    bestScore: Math.max(a.bestScore, b.bestScore),
    stars: Math.max(a.stars, b.stars),
    lastAt: laterOf(a.lastAt, b.lastAt),
  }
}

const newestUnitAt = (book: BookProgress | undefined) =>
  Object.values(book?.units ?? {}).reduce((acc, u) => laterOf(acc, u.lastAt), '')

function mergeBook(a: BookProgress | undefined, b: BookProgress | undefined): BookProgress {
  if (!a) return b!
  if (!b) return a
  const units: Record<string, UnitProgress> = {}
  for (const key of new Set([...Object.keys(a.units), ...Object.keys(b.units)])) {
    units[key] = mergeUnit(a.units[key], b.units[key])
  }
  // "Continue where you left off" should point at the device used most recently.
  const lastUnit = newestUnitAt(a) >= newestUnitAt(b) ? a.lastUnit : b.lastUnit
  return { lastUnit: lastUnit ?? a.lastUnit ?? b.lastUnit, units }
}

/**
 * Union of two profiles, biased towards whatever the learner actually earned.
 * Progress is only ever added, so a phone that was offline for a week can be
 * folded in without erasing anything done on the laptop meanwhile.
 *
 * `settings` (theme, sound) deliberately stays on `local` - those are device
 * preferences, and a dark-mode laptop should not darken the phone.
 */
export function mergeProgress(local: Progress, remote: Progress): Progress {
  const books: Record<string, BookProgress> = {}
  for (const slug of new Set([...Object.keys(local.books), ...Object.keys(remote.books)])) {
    books[slug] = mergeBook(local.books[slug], remote.books[slug])
  }
  return {
    version: 1,
    xp: Math.max(local.xp, remote.xp),
    streak: mergeStreak(local.streak, remote.streak),
    books,
    settings: local.settings,
  }
}

function mergeStreak(a: Progress['streak'], b: Progress['streak']): Progress['streak'] {
  // Practising on two devices the same day is one day of streak, not two, so
  // take the longer count rather than adding them.
  if (a.lastDay === b.lastDay) return { count: Math.max(a.count, b.count), lastDay: a.lastDay }
  if (!a.lastDay) return b
  if (!b.lastDay) return a
  return a.lastDay > b.lastDay ? a : b
}

/** Server rows predate any field added later, so fill the gaps. */
function normalise(raw: unknown): Progress {
  const base = emptyProgress()
  if (!raw || typeof raw !== 'object') return base
  const p = raw as Partial<Progress>
  return {
    ...base,
    ...p,
    streak: { ...base.streak, ...p.streak },
    settings: { ...base.settings, ...p.settings },
    books: p.books ?? {},
  }
}

/* ------------------------------------------------------------- transport */

async function pullAndMerge(userId: string) {
  if (!supabase) return
  setState('syncing')
  const { data, error } = await supabase
    .from(TABLE)
    .select('data')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    console.error('[sync] pull failed', error.message)
    setState('error')
    return
  }
  const remote = data ? normalise(data.data) : null
  const merged = remote ? mergeProgress(progressStore.get(), remote) : progressStore.get()
  applyRemoteProgress(merged)
  // A tab regaining focus usually has nothing new to say; skip the round-trip
  // unless the merge actually moved something the server has not seen.
  if (remote && JSON.stringify(merged.books) === JSON.stringify(remote.books) &&
      merged.xp === remote.xp && merged.streak.count === remote.streak.count) {
    setState('idle')
    return
  }
  await push(userId, merged)
}

async function push(userId: string, snapshot: Progress) {
  if (!supabase) return
  setState('syncing')
  const { error } = await supabase
    .from(TABLE)
    .upsert({ user_id: userId, data: snapshot }, { onConflict: 'user_id' })
  if (error) {
    console.error('[sync] push failed', error.message)
    setState('error')
    return
  }
  setState('idle')
}

let pushTimer: ReturnType<typeof setTimeout> | undefined
let pending: Progress | null = null

function schedulePush() {
  const userId = authStore.session()?.user.id
  if (!userId) return
  pending = progressStore.get()
  clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    const snapshot = pending
    pending = null
    if (snapshot) void push(userId, snapshot)
  }, PUSH_DEBOUNCE_MS)
}

function flush() {
  if (!pending) return
  const userId = authStore.session()?.user.id
  if (!userId) return
  clearTimeout(pushTimer)
  const snapshot = pending
  pending = null
  void push(userId, snapshot)
}

/**
 * Wire local progress to the signed-in account. Safe to call when Supabase is
 * not configured - it simply does nothing and the app stays local-only.
 */
export function startSync() {
  if (!supabase) return

  let syncedUser: string | null = null
  const onAccountChange = () => {
    const userId = authStore.session()?.user.id ?? null
    if (userId === syncedUser) return
    syncedUser = userId
    if (userId) void pullAndMerge(userId)
    else setState('off')
  }
  authStore.subscribe(onAccountChange)
  // Covers the case where the stored session resolved before this ran.
  onAccountChange()

  onLocalWrite(schedulePush)

  // Coming back to the tab is the cheapest moment to notice another device's
  // progress, and leaving it is the last chance to save this device's.
  document.addEventListener('visibilitychange', () => {
    const userId = authStore.session()?.user.id
    if (!userId) return
    if (document.visibilityState === 'hidden') flush()
    else void pullAndMerge(userId)
  })
  window.addEventListener('pagehide', flush)
}
