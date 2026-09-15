import { useEffect, useRef, useState } from 'react'
import { signInWithGoogle, useAccount } from '../lib/auth'
import { cloudEnabled } from '../lib/supabase'
import { signOutAndClear, syncStore } from '../lib/sync'
import { GoogleMark } from './Icons'

/** Live sync status, so a failed save is visible instead of silent. */
function useSyncState() {
  const [s, setS] = useState(syncStore.state())
  useEffect(() => syncStore.subscribe(() => setS(syncStore.state())), [])
  return s
}

export default function AccountMenu() {
  const { account, ready } = useAccount()
  const sync = useSyncState()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Sign-in is an optional extra: with no Supabase keys configured the header
  // looks exactly as it did before accounts existed.
  if (!cloudEnabled) return null

  // Hold the space while the session is being restored so the header does not
  // flash "Sign in" at someone who is already signed in.
  if (!ready) return <span className="account-slot" aria-hidden="true" />

  if (!account) {
    return (
      <button type="button" className="signin-btn" onClick={() => void signInWithGoogle()}>
        <GoogleMark />
        <span>Sign in</span>
      </button>
    )
  }

  const label = account.name ?? account.email ?? 'Account'
  const initial = label.trim().charAt(0).toUpperCase() || '?'

  return (
    <div className="account" ref={box}>
      <button
        type="button"
        className="account-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={label}
        aria-label={`Account: ${label}`}
      >
        {account.avatar ? (
          <img src={account.avatar} alt="" width={30} height={30} referrerPolicy="no-referrer" />
        ) : (
          <span className="account-initial">{initial}</span>
        )}
        {sync === 'error' && <span className="account-dot" title="Progress not saved" />}
      </button>
      {open && (
        <div className="account-pop" role="menu">
          <p className="account-name">{label}</p>
          {account.email && <p className="account-mail">{account.email}</p>}
          <p className="account-sync">
            {sync === 'syncing'
              ? 'Saving progress…'
              : sync === 'error'
                ? 'Could not save - retrying'
                : 'Progress saved to your account'}
          </p>
          <button
            type="button"
            className="account-signout"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              void signOutAndClear()
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
