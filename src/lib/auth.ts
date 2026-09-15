import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export interface Account {
  id: string
  email: string | null
  name: string | null
  avatar: string | null
}

let session: Session | null = null
/** False only during the first `getSession()` round-trip, so the header can
 *  hold still instead of flashing "Sign in" at someone already signed in. */
let ready = supabase === null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

if (supabase) {
  // Fires immediately with INITIAL_SESSION, then on every sign-in, sign-out
  // and token refresh - including ones triggered in another tab.
  supabase.auth.onAuthStateChange((_event, next) => {
    session = next
    ready = true
    emit()
  })
}

export const authStore = {
  session: () => session,
  ready: () => ready,
  subscribe: (l: () => void) => {
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  },
}

function accountOf(s: Session | null): Account | null {
  if (!s) return null
  const meta = (s.user.user_metadata ?? {}) as Record<string, string | undefined>
  return {
    id: s.user.id,
    email: s.user.email ?? null,
    name: meta.full_name ?? meta.name ?? null,
    avatar: meta.avatar_url ?? meta.picture ?? null,
  }
}

/** React hook: the signed-in account, or null when nobody is signed in. */
export function useAccount(): { account: Account | null; ready: boolean } {
  const [, force] = useState(0)
  useEffect(() => authStore.subscribe(() => force((n) => n + 1)), [])
  return { account: accountOf(authStore.session()), ready: authStore.ready() }
}

export async function signInWithGoogle() {
  if (!supabase) return
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    // Come back to whichever page they started from.
    options: { redirectTo: window.location.origin },
  })
  if (error) console.error('[auth] Google sign-in failed', error.message)
}

export async function signOut() {
  await supabase?.auth.signOut()
}
