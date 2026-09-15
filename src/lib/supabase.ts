import type { SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Whether accounts are switched on at all. Deliberately a plain env check with
 * no import of the client, so the header can decide what to render without
 * waiting on - or downloading - the auth library.
 *
 * False on a checkout with no secrets, which leaves the app exactly as it was
 * before sign-in existed: progress in localStorage and no account UI.
 */
export const cloudEnabled = Boolean(url && key)

let client: Promise<SupabaseClient | null> | null = null

/**
 * Loads @supabase/supabase-js on demand. It is 55 kB gzipped - a quarter of
 * the bundle - and nothing on the critical path needs it, so it rides in its
 * own chunk rather than delaying the first lesson render. Memoised: every
 * caller shares the one client, so there is a single auth listener and a
 * single token refresh timer.
 *
 * The key below is the publishable (anon) one and is meant to ship in the
 * bundle; Row Level Security on `public.progress` is what actually keeps one
 * learner out of another's row.
 */
export function getSupabase(): Promise<SupabaseClient | null> {
  if (!cloudEnabled) return Promise.resolve(null)
  client ??= import('@supabase/supabase-js')
    .then(({ createClient }) =>
      createClient(url as string, key as string, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          // The OAuth redirect returns with the code in the URL; the client
          // exchanges it and then cleans the address bar itself.
          detectSessionInUrl: true,
          flowType: 'pkce',
        },
      }),
    )
    .catch((err) => {
      // A failed chunk fetch (offline, cache miss mid-deploy) must not take the
      // lesson down with it - accounts simply stay unavailable this session.
      console.error('[auth] could not load the auth client', err)
      client = null
      return null
    })
  return client
}
