import { useCallback, useEffect, useMemo, useState } from 'react'
import { getBook } from '../content/registry'
import { GoogleMark } from '../components/Icons'
import { signInWithGoogle, useAccount } from '../lib/auth'
import {
  deleteOffer,
  isAdmin,
  isHttpUrl,
  loadAdmin,
  setOfferStatus,
  type AdminStats,
  type AdminUser,
  type Offer,
  type OfferStatus,
} from '../lib/offers'
import { cloudEnabled } from '../lib/supabase'
import '../styles/offer.css'

type Tab = 'overview' | 'offers' | 'learners'
type OfferFilter = 'all' | 'new' | 'donated'

const STATUSES: OfferStatus[] = ['new', 'planned', 'published', 'declined']

const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
const timeFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

/** "3h ago", "2d ago" - falls back to the date past a month. */
function ago(iso: string | null): string {
  if (!iso) return '-'
  const mins = (Date.now() - new Date(iso).getTime()) / 60000
  if (mins < 1) return 'just now'
  if (mins < 60) return `${Math.floor(mins)}m ago`
  if (mins < 60 * 24) return `${Math.floor(mins / 60)}h ago`
  if (mins < 60 * 24 * 30) return `${Math.floor(mins / 1440)}d ago`
  return dateFmt.format(new Date(iso))
}

const n = (v: number) => v.toLocaleString()

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="page">
      <div className="container admin">{children}</div>
    </main>
  )
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="stat">
      <div className="value">{typeof value === 'number' ? n(value) : value}</div>
      <div className="label">{label}</div>
    </div>
  )
}

function Overview({ stats }: { stats: AdminStats }) {
  const max = Math.max(1, ...stats.signups_by_day.map((d) => d.count))
  return (
    <>
      <div className="admin-stats">
        <Stat value={stats.users_total} label={`users · ${n(stats.users_new_7d)} new this week`} />
        <Stat value={stats.active_1d} label="active today" />
        <Stat value={stats.active_7d} label="active this week" />
        <Stat value={stats.active_30d} label="active this month" />
        <Stat value={stats.passed_total} label="lessons passed" />
        <Stat value={stats.xp_total} label="XP earned" />
        <Stat value={stats.offers_new} label={`new offers · ${n(stats.offers_total)} total`} />
        <Stat value={stats.offers_donated} label="offers with a donation" />
      </div>

      <section className="card admin-panel">
        <h2>Sign-ups, last 30 days</h2>
        <div className="admin-bars" role="img" aria-label={`${n(stats.users_new_30d)} sign-ups in the last 30 days`}>
          {stats.signups_by_day.map((d) => (
            <span
              key={d.day}
              className="admin-bar"
              style={{ height: `${(d.count / max) * 100}%` }}
              title={`${dateFmt.format(new Date(d.day))}: ${d.count}`}
            />
          ))}
        </div>
        <p className="muted admin-caption">
          {n(stats.users_new_30d)} in 30 days · busiest day {n(max)}
        </p>
      </section>

      <section className="card admin-panel">
        <h2>Books by learners</h2>
        {stats.books.length === 0 ? (
          <p className="muted">No signed-in learner has started a book yet.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Book</th>
                  <th className="num">Learners</th>
                  <th className="num">Lessons passed</th>
                </tr>
              </thead>
              <tbody>
                {stats.books.map((b) => (
                  <tr key={b.slug}>
                    <td>{getBook(b.slug)?.title ?? b.slug}</td>
                    <td className="num">{n(b.learners)}</td>
                    <td className="num">{n(b.passed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

function Offers({ offers, onChange }: { offers: Offer[]; onChange: (next: Offer[]) => void }) {
  const [filter, setFilter] = useState<OfferFilter>('new')
  const [err, setErr] = useState<string | null>(null)
  const shown = offers.filter((o) =>
    filter === 'all' ? true : filter === 'new' ? o.status === 'new' : o.with_donation,
  )

  const update = async (o: Offer, status: OfferStatus) => {
    setErr(null)
    const before = offers
    onChange(offers.map((x) => (x.id === o.id ? { ...x, status } : x)))
    try {
      await setOfferStatus(o.id, status)
    } catch (e) {
      onChange(before)
      setErr((e as Error).message)
    }
  }

  const remove = async (o: Offer) => {
    if (!confirm(`Delete the offer "${o.title ?? o.book_url}"?`)) return
    setErr(null)
    try {
      await deleteOffer(o.id)
      onChange(offers.filter((x) => x.id !== o.id))
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  return (
    <section className="card admin-panel">
      <div className="admin-panel-head">
        <h2>Book offers</h2>
        <div className="segmented" role="radiogroup" aria-label="Filter offers">
          {(['new', 'donated', 'all'] as OfferFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={filter === f}
              className={`segment ${filter === f ? 'on' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'new' ? 'New' : f === 'donated' ? 'With donation' : 'All'}
            </button>
          ))}
        </div>
      </div>
      {err && <p className="offer-error">{err}</p>}
      {shown.length === 0 ? (
        <p className="muted">Nothing here.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table stack-sm">
            <thead>
              <tr>
                <th>Book</th>
                <th>From</th>
                <th>Donation</th>
                <th>Received</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {shown.map((o) => (
                <tr key={o.id} className={o.with_donation ? 'donated' : ''}>
                  <td className="lead">
                    <strong>{o.title ?? '(no title)'}</strong>
                    {o.book_url && (
                      <a className="link admin-url" href={o.book_url} target="_blank" rel="noreferrer noopener">
                        {o.book_url}
                      </a>
                    )}
                  </td>
                  <td data-label="From">
                    <span>
                      {o.name ?? <span className="muted">anonymous</span>}
                      {o.email && <span className="muted admin-sub">{o.email}</span>}
                    </span>
                  </td>
                  <td data-label="Donation">
                    {!o.with_donation ? (
                      <span className="muted">-</span>
                    ) : o.tx_link && isHttpUrl(o.tx_link) ? (
                      <a className="link" href={o.tx_link} target="_blank" rel="noreferrer noopener">
                        View transaction
                      </a>
                    ) : (
                      <code className="admin-hash" title={o.tx_link ?? ''}>
                        {o.tx_link}
                      </code>
                    )}
                  </td>
                  <td data-label="Received" title={timeFmt.format(new Date(o.created_at))}>
                    {ago(o.created_at)}
                  </td>
                  <td data-label="Status">
                    <select
                      className={`admin-status s-${o.status}`}
                      value={o.status}
                      onChange={(e) => void update(o, e.target.value as OfferStatus)}
                      aria-label="Status"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="actions">
                    <button type="button" className="link" onClick={() => void remove(o)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function Learners({ users }: { users: AdminUser[] }) {
  const [q, setQ] = useState('')
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return users
    return users.filter((u) => `${u.email ?? ''} ${u.name ?? ''}`.toLowerCase().includes(needle))
  }, [q, users])

  return (
    <section className="card admin-panel">
      <div className="admin-panel-head">
        <h2>Learners ({n(users.length)})</h2>
        <input
          type="search"
          className="admin-search"
          placeholder="Search name or email"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table stack-sm">
          <thead>
            <tr>
              <th>Learner</th>
              <th>Joined</th>
              <th>Last active</th>
              <th className="num">XP</th>
              <th className="num">Streak</th>
              <th className="num">Passed</th>
              <th className="num">Books</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.id}>
                <td className="lead">
                  {u.name ?? u.email ?? u.id}
                  {u.name && u.email && <span className="muted admin-sub">{u.email}</span>}
                </td>
                <td data-label="Joined" title={timeFmt.format(new Date(u.created_at))}>
                  {dateFmt.format(new Date(u.created_at))}
                </td>
                <td data-label="Last active">{ago(u.last_active_at ?? u.last_sign_in_at)}</td>
                <td data-label="XP" className="num">{n(u.xp)}</td>
                <td data-label="Streak" className="num">{u.streak}</td>
                <td data-label="Passed" className="num">{u.passed}</td>
                <td data-label="Books" className="num">{u.books}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted admin-caption">
        Only signed-in learners appear here. Anyone practising without an account keeps their progress in their own
        browser.
      </p>
    </section>
  )
}

export default function Admin() {
  const { account, ready } = useAccount()
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [data, setData] = useState<{ stats: AdminStats; offers: Offer[]; users: AdminUser[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await loadAdmin())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!account) {
      setAllowed(null)
      setData(null)
      return
    }
    let live = true
    isAdmin()
      .then((ok) => {
        if (!live) return
        setAllowed(ok)
        if (ok) void refresh()
      })
      .catch((e) => live && setError((e as Error).message))
    return () => {
      live = false
    }
  }, [account?.id, refresh])

  if (!cloudEnabled) return <Shell><p className="muted">The admin page needs Supabase to be configured.</p></Shell>

  if (!ready || (account && allowed === null && !error))
    return (
      <Shell>
        <div className="center"><div className="spinner" /></div>
      </Shell>
    )

  if (!account)
    return (
      <Shell>
        <div className="card admin-gate">
          <h1>Admin</h1>
          <p className="muted">Sign in with the owner account to continue.</p>
          <button type="button" className="signin-btn" onClick={() => void signInWithGoogle()}>
            <GoogleMark />
            <span>Sign in</span>
          </button>
        </div>
      </Shell>
    )

  if (allowed === false)
    return (
      <Shell>
        <div className="card admin-gate">
          <h1>Admin</h1>
          <p className="muted">This page is only for the site owner. You are signed in as {account.email}.</p>
        </div>
      </Shell>
    )

  const newOffers = data?.offers.filter((o) => o.status === 'new').length ?? 0

  return (
    <Shell>
      <div className="admin-head">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Dashboard</h1>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void refresh()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="segmented admin-tabs" role="tablist" aria-label="Admin sections">
        {(['overview', 'offers', 'learners'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={`segment ${tab === t ? 'on' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'overview' ? 'Overview' : t === 'offers' ? `Offers${newOffers ? ` (${newOffers})` : ''}` : 'Learners'}
          </button>
        ))}
      </div>

      {error && <p className="offer-error">{error}</p>}

      {data ? (
        tab === 'overview' ? (
          <Overview stats={data.stats} />
        ) : tab === 'offers' ? (
          <Offers offers={data.offers} onChange={(offers) => setData({ ...data, offers })} />
        ) : (
          <Learners users={data.users} />
        )
      ) : (
        !error && <div className="center"><div className="spinner" /></div>
      )}
    </Shell>
  )
}
