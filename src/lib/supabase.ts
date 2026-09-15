import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Null whenever the env vars are missing, so a fresh checkout or a preview
 * build without secrets still runs - just with accounts switched off and
 * progress staying in localStorage, exactly as it behaved before sign-in
 * existed. Every caller must treat the cloud as optional.
 *
 * The key here is the publishable (anon) one and is meant to ship in the
 * bundle; Row Level Security on `public.progress` is what actually keeps one
 * learner out of another's row.
 */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          // The OAuth redirect comes back with the code in the URL; the client
          // exchanges it and then cleans the address bar itself.
          detectSessionInUrl: true,
          flowType: 'pkce',
        },
      })
    : null

export const cloudEnabled = supabase !== null
