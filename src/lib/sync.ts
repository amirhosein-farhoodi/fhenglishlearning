import { cloudEnabled, getSupabase } from './supabase'
import { authStore, signOut } from './auth'
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
/** Backoff for a failed save. The last step gives up until the next edit. */
const RETRY_DELAYS_MS = [2000, 8000, 30000]
/**
 * Which account the local blob belongs to, so a shared device cannot fold one
 * learner's XP into the next person's account. Null means it was never synced
 * (someone practising before signing up), which *is* safe to merge.
 */
const OWNER_KEY = 'fhlanguagelearning:owner'

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

const ownerOf = () => {
  try {
    return localStorage.getItem(OWNER_KEY)
  } catch {
    return null
  }
}

const setOwner = (id: string | null) => {
  try {
    if (id) localStorage.setItem(OWNER_KEY, id)
    else localStorage.removeItem(OWNER_KEY)
  } catch {
    /* private mode - the worst case is a merge we would rather have skipped */
  }
}

async function pullAndMerge(userId: string) {
  const sb = await getSupabase()
  if (!sb) return
  setState('syncing')
  const { data, error } = await sb.from(TABLE).select('data').eq('user_id', userId).maybeSingle()
  if (error) {
    console.error('[sync] pull failed', error.message)
    scheduleRetry(userId)
    return
  }

  const remote = data ? normalise(data.data) : null
  const owner = ownerOf()
  // Someone else was signed in on this device. Their progress must not be
  // folded into this account, and the merge only ever adds, so it could never
  // be undone afterwards. Take the server's copy verbatim instead.
  const foreign = owner !== null && owner !== userId
  const local = progressStore.get()
  const merged = !remote
    ? local
    : foreign
      ? { ...remote, settings: local.settings }
      : mergeProgress(local, remote)

  applyRemoteProgress(merged)
  setOwner(userId)

  // A tab regaining focus usually has nothing new to say; skip the round-trip
  // unless the merge actually moved something the server has not seen.
  if (remote && !foreign && sameProgress(merged, remote)) {
    settle()
    return
  }
  await push(userId, merged)
}

const sameProgress = (a: Progress, b: Progress) =>
  a.xp === b.xp &&
  a.streak.count === b.streak.count &&
  a.streak.lastDay === b.streak.lastDay &&
  JSON.stringify(a.books) === JSON.stringify(b.books)

async function push(userId: string, snapshot: Progress) {
  const sb = await getSupabase()
  if (!sb) return
  setState('syncing')
  const { error } = await sb
    .from(TABLE)
    .upsert({ user_id: userId, data: snapshot }, { onConflict: 'user_id' })
  if (error) {
    console.error('[sync] push failed', error.message)
    // Hold the snapshot so the retry has something to send.
    pending = snapshot
    scheduleRetry(userId)
    return
  }
  settle()
}

/* ------------------------------------------------------- queue and retry */

let pushTimer: ReturnType<typeof setTimeout> | undefined
let retryTimer: ReturnType<typeof setTimeout> | undefined
let retryAttempt = 0
let pending: Progress | null = null

/** A save landed: clear the queue and stop backing off. */
function settle() {
  clearTimeout(retryTimer)
  retryAttempt = 0
  pending = null
  setState('idle')
}

function scheduleRetry(userId: string) {
  setState('error')
  const delay = RETRY_DELAYS_MS[retryAttempt]
  // Out of attempts. Nothing is lost - localStorage still holds the truth, and
  // the merge on the next load or focus will carry it up.
  if (delay === undefined) return
  retryAttempt++
  clearTimeout(retryTimer)
  retryTimer = setTimeout(() => {
    if (authStore.session()?.user.id !== userId) return
    if (pending) void push(userId, pending)
    else void pullAndMerge(userId)
  }, delay)
}

function schedulePush() {
  const userId = authStore.session()?.user.id
  if (!userId) return
  pending = progressStore.get()
  clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    const snapshot = pending
    if (snapshot) void push(userId, snapshot)
  }, PUSH_DEBOUNCE_MS)
}

/**
 * Send whatever is queued right now, without waiting out the debounce.
 * Awaitable, because sign-out wipes local progress and must not do so until
 * the last quiz result is safely on the server.
 */
function flush(): Promise<void> {
  const userId = authStore.session()?.user.id
  if (!pending || !userId) return Promise.resolve()
  clearTimeout(pushTimer)
  return push(userId, pending)
}

/* ------------------------------------------------------------- lifecycle */

/**
 * Flush first, then sign out, then wipe this device's progress. The wipe is
 * what stops the next person at the same browser from inheriting - and, worse,
 * merging up - someone else's XP. Nothing is lost: the flush put it on the
 * server, and signing back in pulls it down again.
 *
 * Theme and sound survive, being preferences of the device rather than of the
 * account.
 */
export async function signOutAndClear() {
  await flush()
  await signOut()
  setOwner(null)
  applyRemoteProgress({ ...emptyProgress(), settings: progressStore.get().settings })
}

/**
 * Wire local progress to the signed-in account. Safe to call when Supabase is
 * not configured - it does nothing and the app stays local-only.
 */
export function startSync() {
  if (!cloudEnabled) return

  let syncedUser: string | null = null
  const onAccountChange = () => {
    const userId = authStore.session()?.user.id ?? null
    if (userId === syncedUser) return
    const signedOut = syncedUser !== null && userId === null
    syncedUser = userId
    if (userId) {
      void pullAndMerge(userId)
      return
    }
    clearTimeout(pushTimer)
    clearTimeout(retryTimer)
    pending = null
    retryAttempt = 0
    setState('off')
    // Sign-out from another tab: match signOutAndClear so both tabs end up in
    // the same state.
    if (signedOut && ownerOf() !== null) {
      setOwner(null)
      applyRemoteProgress({ ...emptyProgress(), settings: progressStore.get().settings })
    }
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
    if (document.visibilityState === 'hidden') void flush()
    else void pullAndMerge(userId)
  })
  window.addEventListener('pagehide', () => void flush())
  // Coming back online is the one moment a retry is near-certain to succeed.
  window.addEventListener('online', () => {
    const userId = authStore.session()?.user.id
    if (!userId || syncStore.state() !== 'error') return
    retryAttempt = 0
    if (pending) void push(userId, pending)
    else void pullAndMerge(userId)
  })
}
