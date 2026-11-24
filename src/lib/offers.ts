import { getSupabase } from './supabase'

/** What the "Offer a book" form sends. Schema: supabase/002_book_offers.sql. */
export interface OfferInput {
  title: string
  bookUrl: string
  name: string
  withDonation: boolean
  txLink: string
}

export type OfferStatus = 'new' | 'planned' | 'published' | 'declined'

export interface Offer {
  id: number
  created_at: string
  title: string | null
  book_url: string | null
  name: string | null
  with_donation: boolean
  tx_link: string | null
  status: OfferStatus
  email: string | null
}

export interface AdminUser {
  id: string
  email: string | null
  name: string | null
  created_at: string
  last_sign_in_at: string | null
  last_active_at: string | null
  xp: number
  streak: number
  passed: number
  books: number
}

export interface AdminStats {
  users_total: number
  users_new_7d: number
  users_new_30d: number
  active_1d: number
  active_7d: number
  active_30d: number
  xp_total: number
  passed_total: number
  offers_total: number
  offers_new: number
  offers_donated: number
  signups_by_day: { day: string; count: number }[]
  books: { slug: string; learners: number; passed: number }[]
}

const blank = (s: string) => (s.trim() === '' ? null : s.trim())

/** True for anything a browser would open; the table enforces the same rule. */
export const isHttpUrl = (s: string) => /^https?:\/\/\S+$/i.test(s.trim())

async function client() {
  const sb = await getSupabase()
  if (!sb) throw new Error('Offers are not available right now - please try again later.')
  return sb
}

export async function submitOffer(o: OfferInput): Promise<void> {
  const sb = await client()
  // No .select(): the table is unreadable to anyone but the admin, so asking
  // for the inserted row back would fail the whole request.
  const { error } = await sb.from('book_offers').insert({
    title: blank(o.title),
    book_url: blank(o.bookUrl),
    name: blank(o.name),
    with_donation: o.withDonation,
    tx_link: o.withDonation ? blank(o.txLink) : null,
  })
  if (error) {
    console.error('[offers] submit failed', error.message)
    throw new Error('Your offer could not be sent. Please check your connection and try again.')
  }
}

/* ------------------------------------------------------------------ admin */

export async function isAdmin(): Promise<boolean> {
  const sb = await client()
  const { data, error } = await sb.rpc('is_admin')
  if (error) throw new Error(error.message)
  return data === true
}

export async function loadAdmin(): Promise<{ stats: AdminStats; offers: Offer[]; users: AdminUser[] }> {
  const sb = await client()
  const [stats, offers, users] = await Promise.all([
    sb.rpc('admin_stats'),
    sb.rpc('admin_offers'),
    sb.rpc('admin_users'),
  ])
  const err = stats.error ?? offers.error ?? users.error
  if (err) throw new Error(err.message)
  return { stats: stats.data as AdminStats, offers: offers.data as Offer[], users: users.data as AdminUser[] }
}

export async function setOfferStatus(id: number, status: OfferStatus): Promise<void> {
  const sb = await client()
  const { error } = await sb.from('book_offers').update({ status }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteOffer(id: number): Promise<void> {
  const sb = await client()
  const { error } = await sb.from('book_offers').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
