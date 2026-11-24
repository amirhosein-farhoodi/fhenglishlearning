import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Donate from '../components/Donate'
import { ArrowLeft, ArrowRight, Check, Heart } from '../components/Icons'
import { useAccount } from '../lib/auth'
import { isHttpUrl, submitOffer } from '../lib/offers'
import { cloudEnabled } from '../lib/supabase'
import '../styles/offer.css'

type Mode = 'donation' | 'free'
type Step = 'choose' | 'form' | 'done'

/** The donation step, shown over the page before the form. */
function DonateDialog({ sent, onSent, onContinue, onClose }: {
  sent: boolean
  onSent: (link: string) => void
  onContinue: () => void
  onClose: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    box.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose])

  return (
    <div className="offer-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="offer-dialog" role="dialog" aria-modal="true" aria-labelledby="donate-title" tabIndex={-1} ref={box}>
        <button type="button" className="offer-dialog-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <Donate
          className="donate-embedded"
          title="Step 1 · Send your donation"
          intro="Any amount moves your book to the front of the queue. Once it is sent, continue to tell us which book you want."
          onSent={onSent}
        />
        <div className="offer-dialog-foot">
          <span className="muted">
            {sent
              ? 'Got it - the transaction link is attached to your offer.'
              : 'Paid from another wallet? Continue and paste the transaction link or hash.'}
          </span>
          <button type="button" className={`btn ${sent ? 'btn-dark' : 'btn-primary'}`} onClick={onContinue}>
            {sent ? 'Continue to the form' : 'I have donated - continue'} <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function OfferBook() {
  const { account } = useAccount()
  const [step, setStep] = useState<Step>('choose')
  const [mode, setMode] = useState<Mode>('free')
  const [donateOpen, setDonateOpen] = useState(false)

  const [title, setTitle] = useState('')
  const [bookUrl, setBookUrl] = useState('')
  const [name, setName] = useState('')
  const [txLink, setTxLink] = useState('')
  /** Set when the wallet itself reported the transaction, so it cannot be edited. */
  const [txLocked, setTxLocked] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  // Fill in the name from the account, but never overwrite what was typed.
  useEffect(() => {
    if (account?.name) setName((n) => n || account.name || '')
  }, [account?.name])

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [step])

  const chooseDonation = () => {
    setMode('donation')
    setDonateOpen(true)
  }
  const chooseFree = () => {
    setMode('free')
    setStep('form')
  }
  const onSent = (link: string) => {
    setTxLink(link)
    setTxLocked(true)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!title.trim() && !bookUrl.trim()) return setError('Tell us the book: a title, a link, or both.')
    if (bookUrl.trim() && !isHttpUrl(bookUrl)) return setError('The link should start with http:// or https://.')
    if (mode === 'donation' && !txLink.trim())
      return setError('Add the transaction link or hash of your donation, or switch to offering without one.')
    setSending(true)
    try {
      await submitOffer({ title, bookUrl, name, withDonation: mode === 'donation', txLink })
      setStep('done')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSending(false)
    }
  }

  const reset = () => {
    setTitle('')
    setBookUrl('')
    setTxLink('')
    setTxLocked(false)
    setError(null)
    setStep('choose')
  }

  return (
    <main className="page">
      <div className="container offer-page">
        <Link to="/" className="back">
          <ArrowLeft size={16} /> All books
        </Link>

        <section className="hero offer-hero">
          <p className="eyebrow">Offer a book</p>
          <h1>
            Which book should we <em>teach next</em>?
          </h1>
          <p>
            Every course here started as a book. Tell us the one you want to learn from and we will turn it into lessons
            and quizzes.
          </p>
        </section>

        {!cloudEnabled ? (
          <div className="card offer-unavailable">
            {import.meta.env.DEV ? (
              <p>
                Supabase is not connected, so offers (and sign-in) are off. Copy <code>.env.example</code> to{' '}
                <code>.env</code>, fill in <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>, then
                restart <code>npm run dev</code>.
              </p>
            ) : (
              <p>Offering a book is unavailable right now. Please try again later.</p>
            )}
          </div>
        ) : step === 'choose' ? (
          <div className="offer-options">
            <button type="button" className="offer-option featured" onClick={chooseDonation}>
              <span className="offer-option-head">
                <span className="offer-option-mark" aria-hidden="true">
                  <Heart size={16} />
                </span>
                <span className="offer-option-title">With a donation</span>
                <span className="pill">Guaranteed</span>
              </span>
              <span className="offer-option-body">
                Support the app and your book goes to the front of the queue.{' '}
                <strong>We guarantee it is published within a few days.</strong>
              </span>
              <span className="cta">
                Donate and offer <ArrowRight size={18} />
              </span>
            </button>

            <button type="button" className="offer-option" onClick={chooseFree}>
              <span className="offer-option-head">
                <span className="offer-option-mark" aria-hidden="true">
                  📚
                </span>
                <span className="offer-option-title">Without a donation</span>
                <span className="pill pill-muted">Free</span>
              </span>
              <span className="offer-option-body">
                Your offer joins the list. The books more people ask for are published first, so yours may wait a while -
                or another book may go ahead of it.
              </span>
              <span className="cta">
                Offer for free <ArrowRight size={18} />
              </span>
            </button>
          </div>
        ) : step === 'form' ? (
          <form className="card offer-form" onSubmit={submit} noValidate>
            <div className="offer-mode">
              <span className={`pill ${mode === 'donation' ? '' : 'pill-muted'}`}>
                {mode === 'donation' ? 'With a donation · published within days' : 'Without a donation'}
              </span>
              <button type="button" className="link" onClick={() => setStep('choose')}>
                Change
              </button>
            </div>

            <label className="field">
              <span className="field-label">Book title</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Oxford Word Skills Intermediate"
                maxLength={300}
                autoFocus
              />
            </label>

            <label className="field">
              <span className="field-label">
                Link to the book <small>optional</small>
              </span>
              <input
                type="url"
                inputMode="url"
                value={bookUrl}
                onChange={(e) => setBookUrl(e.target.value)}
                placeholder="https://"
                maxLength={2000}
              />
              <span className="field-hint">A title, a link, or both - whatever helps us find it.</span>
            </label>

            <label className="field">
              <span className="field-label">
                Your name <small>optional</small>
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                maxLength={120}
              />
            </label>

            {mode === 'donation' && (
              <label className="field">
                <span className="field-label">Donation transaction</span>
                <input
                  type="text"
                  value={txLink}
                  onChange={(e) => setTxLink(e.target.value)}
                  disabled={txLocked}
                  placeholder="Paste the transaction link or hash"
                  maxLength={500}
                  spellCheck={false}
                />
                <span className="field-hint">
                  {txLocked ? (
                    <>
                      <Check size={14} /> Recorded from your wallet. We check it before publishing.
                    </>
                  ) : (
                    <>
                      We check it before publishing.{' '}
                      <button type="button" className="link" onClick={() => setDonateOpen(true)}>
                        Open the donation again
                      </button>
                    </>
                  )}
                </span>
              </label>
            )}

            {error && (
              <p className="offer-error" role="alert">
                {error}
              </p>
            )}

            <div className="offer-actions">
              <button type="submit" className="btn btn-dark" disabled={sending}>
                {sending ? 'Sending…' : 'Send my offer'}
              </button>
              {!account && <span className="muted offer-note">No account needed.</span>}
            </div>
          </form>
        ) : (
          <div className="card offer-done">
            <span className="offer-done-mark" aria-hidden="true">
              <Check size={22} />
            </span>
            <h2>Thank you - your offer is in.</h2>
            <p className="muted">
              {mode === 'donation'
                ? 'Once we have confirmed your donation, the book will be published within a few days.'
                : 'We publish the most requested books first. Keep an eye on the shelves.'}
            </p>
            <div className="offer-actions">
              <Link to="/" className="btn btn-primary">
                Back to the books
              </Link>
              <button type="button" className="btn btn-ghost" onClick={reset}>
                Offer another book
              </button>
            </div>
          </div>
        )}
      </div>

      {donateOpen && (
        <DonateDialog
          sent={txLocked}
          onSent={onSent}
          onClose={() => setDonateOpen(false)}
          onContinue={() => {
            setDonateOpen(false)
            setStep('form')
          }}
        />
      )}
    </main>
  )
}
