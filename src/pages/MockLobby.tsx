import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight } from '../components/Icons'
import { fmtBand, roundOverall } from '../lib/mock/engine'
import { listeningReady } from '../content/ielts-mock'
import { deleteResult, poolStats, startSession, useMockState, type MockResult, type SectionId } from '../lib/mock/store'
import '../styles/mock.css'

/**
 * /ielts-mock - the mock test lobby: choose which papers to sit, see the rules,
 * resume an unfinished paper, and look back at earlier results.
 */

type Choice = 'listening' | 'reading' | 'writing' | 'speaking'

const CHOICES: { id: Choice; title: string; meta: string; blurb: string; sections: SectionId[]; disabled?: string }[] = [
  {
    id: 'listening',
    title: 'Listening',
    meta: '30 minutes · 4 parts · 40 questions',
    blurb: 'Four recordings, heard once only, with the questions on screen as they play.',
    sections: ['listening'],
    disabled: listeningReady ? undefined : 'Coming soon - the recordings are being prepared.',
  },
  {
    id: 'reading',
    title: 'Reading',
    meta: '60 minutes · 3 passages · 40 questions',
    blurb: 'Three long academic texts, getting harder, with the full range of question types.',
    sections: ['reading'],
  },
  {
    id: 'writing',
    title: 'Writing',
    meta: '60 minutes · 2 tasks',
    blurb: 'Task 1: describe a chart, table, diagram or map. Task 2: an essay.',
    sections: ['writing'],
    disabled: 'Coming soon - automatic band scoring for essays is on its way.',
  },
  {
    id: 'speaking',
    title: 'Speaking',
    meta: '11-14 minutes · 3 parts',
    blurb: 'A face-to-face interview with an examiner.',
    sections: [],
    disabled: 'Coming soon - a recorded interview with automatic band scoring.',
  },
]

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export function overallOf(r: MockResult): number | null {
  const bands: number[] = []
  if (r.listening) bands.push(r.listening.band)
  if (r.reading) bands.push(r.reading.band)
  if (r.writing) {
    if (typeof r.writing.band !== 'number') return null
    bands.push(r.writing.band)
  }
  if (!bands.length) return null
  return roundOverall(bands.reduce((a, b) => a + b, 0) / bands.length)
}

function HistoryRow({ r }: { r: MockResult }) {
  const overall = overallOf(r)
  return (
    <li className="ml-history-row">
      <Link to={`/ielts-mock/result/${r.id}`} className="ml-history-link">
        <span className="ml-history-date">{dateFmt.format(r.finishedAt)}</span>
        <span className="ml-history-what">{r.sections.map((s) => s[0].toUpperCase() + s.slice(1)).join(' + ')}</span>
        <span className="ml-history-bands">
          {r.listening && (
            <span className="ml-chip">
              L {fmtBand(r.listening.band)} <small>({r.listening.raw}/40)</small>
            </span>
          )}
          {r.reading && (
            <span className="ml-chip">
              R {fmtBand(r.reading.band)} <small>({r.reading.raw}/40)</small>
            </span>
          )}
          {r.writing && <span className={`ml-chip${typeof r.writing.band === 'number' ? '' : ' is-pending'}`}>W {typeof r.writing.band === 'number' ? fmtBand(r.writing.band) : 'to rate'}</span>}
          {r.sections.length > 1 && overall !== null && <span className="ml-chip is-overall">Overall {fmtBand(overall)}</span>}
        </span>
        <ArrowRight size={16} />
      </Link>
      <button
        type="button"
        className="ml-history-del"
        aria-label="Delete this result"
        title="Delete this result"
        onClick={() => {
          if (confirm('Delete this result from your history?')) deleteResult(r.id)
        }}
      >
        ✕
      </button>
    </li>
  )
}

export default function MockLobby() {
  const { session, history } = useMockState()
  const nav = useNavigate()
  const [choice, setChoice] = useState<Choice>('reading')
  const stats = poolStats()
  const picked = CHOICES.find((c) => c.id === choice)!

  const begin = () => {
    if (session && !confirm('You have an unfinished paper. Starting a new one abandons it. Continue?')) return
    startSession(picked.sections)
    nav('/ielts-mock/exam')
  }

  const resumeLeft = (() => {
    if (!session) return null
    const sec = session.sections[session.current]
    const endsAt = session[sec]?.endsAt
    if (session.step !== 'live' || !endsAt) return 'not started yet'
    const m = Math.ceil((endsAt - Date.now()) / 60000)
    return m > 0 ? `${m} min left on the clock` : 'time is up - submit it to see your score'
  })()

  return (
    <main className="page ml">
      <div className="container">
        <Link to="/" className="back">
          <ArrowLeft size={16} /> Home
        </Link>
        <section className="ml-hero">
          <p className="eyebrow">IELTS Academic · computer-delivered format</p>
          <h1>IELTS Mock Test</h1>
          <p className="ml-lead">
            Sit a full-length paper under exam conditions: the real timings, the real question types and the same on-screen layout as the computer-delivered test. Every paper is put together
            at random from a bank of exam-style passages and tasks, and you are always given material you have not seen before until the bank runs out.
          </p>
        </section>

        {session && (
          <div className="ml-resume">
            <div>
              <b>You have an unfinished paper</b>
              <span className="muted">
                {' '}
                · {session.sections.map((s) => s[0].toUpperCase() + s.slice(1)).join(' + ')} · {resumeLeft}
              </span>
            </div>
            <Link to="/ielts-mock/exam" className="btn btn-primary btn-sm">
              Resume <ArrowRight size={16} />
            </Link>
          </div>
        )}

        <h2 className="ml-h2">Choose your test</h2>
        <div className="ml-choices" role="radiogroup" aria-label="Which test">
          {CHOICES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={choice === c.id}
              disabled={!!c.disabled}
              className={`ml-choice${choice === c.id ? ' is-on' : ''}`}
              onClick={() => setChoice(c.id)}
            >
              <span className="ml-choice-title">
                {c.title}
                {c.disabled && <span className="pill">Coming soon</span>}
              </span>
              <span className="ml-choice-meta">{c.meta}</span>
              <span className="ml-choice-blurb">{c.disabled ?? c.blurb}</span>
            </button>
          ))}
        </div>

        <div className="ml-start">
          <div className="ml-rules">
            <h3>Before you start</h3>
            <ul>
              <li>Find somewhere quiet and allow {picked.sections.length > 2 ? 'nearly three hours' : picked.sections.length > 1 ? 'two hours' : picked.sections[0] === 'listening' ? 'about 40 minutes' : 'an hour'}. The clock cannot be paused.</li>
              {picked.sections.includes('listening') && <li>Listening plays each recording once, straight through. Use headphones and check your volume first.</li>}
              <li>Each section ends on its own when time is up, and you cannot go back to a finished section.</li>
              {picked.sections.includes('reading') && <li>Reading is marked out of 40 and converted to a band with the official Academic table.</li>}
              {picked.sections.includes('writing') && <li>After Writing you rate your scripts against the four official criteria, with a band-9 model answer beside yours.</li>}
              <li>No spell-check and no dictionary - as in the test centre.</li>
            </ul>
          </div>
          <div className="ml-start-cta">
            <button type="button" className="btn btn-primary btn-lg" onClick={begin}>
              Start the {picked.title} test <ArrowRight />
            </button>
            <p className="muted ml-pool">
              Bank: {stats.listening > 0 && <>{stats.listening} listening recordings ({stats.listeningPapers} different papers) · </>}
              {stats.passages} reading passages ({stats.papers} different papers). You have heard {stats.listeningSeen} of the recordings and read {stats.passagesSeen} of the passages; new
              papers always use ones you have not met yet.
            </p>
          </div>
        </div>

        <section className="ml-history">
          <div className="section-head">
            <h2 className="ml-h2">Your results</h2>
          </div>
          {history.length ? (
            <ul className="ml-history-list">
              {history.map((r) => (
                <HistoryRow key={r.id} r={r} />
              ))}
            </ul>
          ) : (
            <p className="muted">No mock tests yet. Your band scores will appear here.</p>
          )}
        </section>

        <p className="ml-disclaimer muted">
          This is a practice simulation for preparation. IELTS is jointly owned by the British Council, IDP IELTS and Cambridge University Press &amp; Assessment, who are not connected with
          this app. Bands here are estimates based on the published conversion tables and descriptors.
        </p>
      </div>
    </main>
  )
}
