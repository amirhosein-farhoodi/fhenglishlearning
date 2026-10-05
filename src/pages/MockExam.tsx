import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { loadListeningPart, loadPassage, loadTask1, loadTask2 } from '../content/ielts-mock'
import type { ListeningPart, ReadingPassage, WritingTask1, WritingTask2 } from '../content/ielts-mock/types'
import ListeningSection from '../components/mock/ListeningSection'
import ReadingSection from '../components/mock/ReadingSection'
import WritingSection from '../components/mock/WritingSection'
import { isAnswered, layoutPaper, listeningTimeline, markPaper, readingBand, scaledListeningBand, timelineLength, type GroupHolder } from '../lib/mock/engine'
import { getSession, saveResult, SECTION_MINUTES, setSession, updateSession, useMockState, type MockResult, type MockSession, type SectionId } from '../lib/mock/store'
import { recordMockTest } from '../lib/storage'
import { isLoaded, preloadAudio, type LoadProgress } from '../lib/mock/audioCache'
import { LISTENING_FRAME } from '../content/ielts-mock/listening-frame'
import '../styles/mock.css'

/**
 * /ielts-mock/exam - runs the session stored by the lobby, one section at a time:
 * an instructions page, then the timed paper. The clock is an absolute end time
 * saved with the session, so a refresh or a closed tab cannot pause it - just as
 * the real test does not stop. Answers are saved on every change.
 */

const SECTION_NAME: Record<SectionId, string> = { listening: 'Listening', reading: 'Reading', writing: 'Writing' }

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [active])
  return now
}

function Clock({ endsAt, hidden, onToggle }: { endsAt: number; hidden: boolean; onToggle: () => void }) {
  const now = useNow(true)
  const left = Math.max(0, endsAt - now)
  const mins = Math.floor(left / 60000)
  const secs = Math.floor((left % 60000) / 1000)
  const urgent = left <= 5 * 60000
  const warn = left <= 10 * 60000
  // Under ten minutes the real test shows a warning and switches to minutes and seconds.
  const whole = Math.ceil(left / 60000)
  const label = warn ? `${mins}:${String(secs).padStart(2, '0')} left` : `${whole} minutes left`
  const short = warn ? `${mins}:${String(secs).padStart(2, '0')}` : `${whole} min`
  return (
    <button type="button" className={`exam-clock${warn ? ' is-warn' : ''}${urgent ? ' is-urgent' : ''}`} onClick={onToggle} title={hidden ? 'Show the time' : 'Hide the time'} aria-live={warn ? 'polite' : 'off'}>
      <span aria-hidden="true">⏱</span>
      {hidden && !warn ? (
        'Show time'
      ) : (
        <>
          <span className="exam-clock-long">{label}</span>
          <span className="exam-clock-short">{short}</span>
        </>
      )}
    </button>
  )
}

/** Turn a finished session into a result: marks the Reading paper and stores everything. */
async function finalize(s: MockSession): Promise<MockResult> {
  const r: MockResult = { id: s.id, finishedAt: Date.now(), sections: s.sections }
  let correct = 0
  if (s.listening) {
    const parts = await Promise.all(s.listening.partIds.map(loadListeningPart))
    const marked = markPaper(parts, s.listening.answers)
    const raw = marked.filter((q) => q.correct).length
    correct += raw
    r.listening = { ...s.listening, raw, total: marked.length, band: scaledListeningBand(raw, marked.length) }
  }
  if (s.reading) {
    const passages = await Promise.all(s.reading.passageIds.map(loadPassage))
    const raw = markPaper(passages, s.reading.answers).filter((q) => q.correct).length
    correct += raw
    r.reading = { ...s.reading, raw, band: readingBand(raw) }
  }
  if (s.writing) r.writing = { ...s.writing }
  saveResult(r)
  recordMockTest(correct, s.sections.length)
  return r
}

/** Every recording a Listening paper plays: the opening/closing announcements and each part. */
const audioOf = (parts: ListeningPart[]) => [LISTENING_FRAME.audio, ...parts.map((p) => p.audio)]

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`

/** Progress of the recordings download, shown before Listening starts (and after a refresh). */
function AudioLoading({ progress, onRetry }: { progress: LoadProgress | null; onRetry: () => void }) {
  if (progress?.error)
    return (
      <div className="audio-load is-error" role="alert">
        <b>The recordings could not be downloaded.</b> Check your connection and try again.
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
          Try again
        </button>
      </div>
    )
  if (progress?.done)
    return (
      <div className="audio-load is-done">
        <span aria-hidden="true">✓</span> All recordings are ready. Nothing will need to download during the test.
      </div>
    )
  const pct = progress && progress.total ? Math.min(100, Math.round((progress.loaded / progress.total) * 100)) : null
  return (
    <div className="audio-load" aria-live="polite">
      <div className="audio-load-row">
        <span>Downloading the recordings{pct !== null ? ` · ${pct}%` : '…'}</span>
        {progress && progress.total > 0 && (
          <span className="muted">
            {mb(progress.loaded)} of {mb(progress.total)}
          </span>
        )}
      </div>
      <div className="audio-load-bar">
        <span style={{ width: `${pct ?? 3}%` }} className={pct === null ? 'is-indeterminate' : ''} />
      </div>
    </div>
  )
}

function Intro({
  section,
  session,
  onStart,
  minutes,
  audio,
  questions = 40,
}: {
  section: SectionId
  session: MockSession
  onStart: () => void
  minutes: number | null
  audio?: { progress: LoadProgress | null; retry: () => void }
  /** Questions in this paper (a Listening paper with short extracts has fewer than 40). */
  questions?: number
}) {
  const index = session.current
  return (
    <main className="exam-intro">
      <div className="exam-intro-card">
        <p className="exam-intro-kicker">
          IELTS Academic · {session.sections.length > 1 ? `Section ${index + 1} of ${session.sections.length}` : 'Mock test'}
        </p>
        <h1>{SECTION_NAME[section]}</h1>
        <p className="exam-intro-time">{section === 'listening' ? `Time: approximately ${minutes ?? 30} minutes` : 'Time: 1 hour'}</p>
        <h2>Instructions to candidates</h2>
        <ul>
          {section !== 'writing' ? (
            <>
              <li>Answer all the questions.</li>
              <li>You can change your answers at any time during the test.</li>
            </>
          ) : (
            <>
              <li>Answer both parts.</li>
              <li>You can change your answers at any time during the test.</li>
            </>
          )}
        </ul>
        <h2>Information for candidates</h2>
        <ul>
          {section === 'listening' ? (
            <>
              <li>There are {questions} questions in this test.</li>
              <li>Each question carries one mark.</li>
              <li>There are four parts to the test.</li>
              <li>You will hear each part once only. The recording starts as soon as you press Start and cannot be paused.</li>
              <li>For each part of the test there will be time for you to look through the questions and time for you to check your answers.</li>
              <li>When the recording ends you have two minutes to check your answers, then the test ends on its own.</li>
              <li>Spelling counts in typed answers, and an answer longer than the word limit is marked wrong.</li>
              <li>Use headphones if you can, and set the volume before you start.</li>
            </>
          ) : section === 'reading' ? (
            <>
              <li>There are 40 questions in this test.</li>
              <li>Each question carries one mark.</li>
              <li>There are three parts to the test.</li>
              <li>The test clock shows how much time you have left. The test ends on its own when the time is up.</li>
              <li>Use the numbers at the bottom of the screen to move between questions, and the Review flag to mark ones to come back to.</li>
              <li>To highlight words in a passage, select them and press Highlight.</li>
              <li>Spelling counts in typed answers, and an answer longer than the word limit is marked wrong.</li>
            </>
          ) : (
            <>
              <li>There are two parts in this test.</li>
              <li>Part 2 contributes twice as much as Part 1 to the Writing score.</li>
              <li>The test clock shows how much time you have left. The test ends on its own when the time is up.</li>
              <li>A word count is shown under the answer box. Spell-check is switched off, as in the exam.</li>
            </>
          )}
        </ul>
        <p className="exam-intro-note">The clock starts when you press Start and cannot be paused, even if you leave this page.</p>
        {audio && <AudioLoading progress={audio.progress} onRetry={audio.retry} />}
        <button type="button" className="btn btn-primary btn-lg" onClick={onStart} disabled={section === 'listening' && (minutes === null || !audio?.progress?.done)}>
          Start the {SECTION_NAME[section]} test
        </button>
      </div>
    </main>
  )
}

export default function MockExam() {
  const { session } = useMockState()
  const nav = useNavigate()
  const [listening, setListening] = useState<ListeningPart[] | null>(null)
  const [passages, setPassages] = useState<ReadingPassage[] | null>(null)
  const [tasks, setTasks] = useState<{ t1: WritingTask1; t2: WritingTask2 } | null>(null)
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [confirmQuit, setConfirmQuit] = useState(false)
  const [timeUp, setTimeUp] = useState(false)
  const [clockHidden, setClockHidden] = useState(false)
  const [fontSize, setFontSize] = useState(1)
  const [loadError, setLoadError] = useState(false)
  const [audioProgress, setAudioProgress] = useState<LoadProgress | null>(null)
  const [audioTry, setAudioTry] = useState(0)
  const finishing = useRef(false)

  const section = session ? session.sections[session.current] : undefined
  const live = session?.step === 'live'
  const endsAt = section ? session?.[section]?.endsAt : undefined

  // Load the material the session points at.
  useEffect(() => {
    if (!session?.listening || listening) return
    Promise.all(session.listening.partIds.map(loadListeningPart))
      .then(setListening)
      .catch(() => setLoadError(true))
  }, [session?.listening, listening])
  // Download every recording before the Listening section can start, so nothing streams
  // during the test (and download managers never see a media file to grab).
  useEffect(() => {
    if (!listening) return
    const srcs = audioOf(listening)
    if (isLoaded(srcs)) {
      setAudioProgress({ loaded: 1, total: 1, done: true })
      return
    }
    let alive = true
    setAudioProgress({ loaded: 0, total: 0, done: false })
    preloadAudio(srcs, (p) => alive && setAudioProgress(p)).catch(() => {})
    return () => {
      alive = false
    }
  }, [listening, audioTry])
  useEffect(() => {
    if (!session?.reading || passages) return
    Promise.all(session.reading.passageIds.map(loadPassage))
      .then(setPassages)
      .catch(() => setLoadError(true))
  }, [session?.reading, passages])
  useEffect(() => {
    if (!session?.writing || tasks) return
    Promise.all([loadTask1(session.writing.task1), loadTask2(session.writing.task2)])
      .then(([t1, t2]) => setTasks({ t1, t2 }))
      .catch(() => setLoadError(true))
  }, [session?.writing, tasks])

  const finishSection = useCallback(async () => {
    const s = getSession()
    if (!s || finishing.current) return
    finishing.current = true
    const sec = s.sections[s.current]
    const stamped: MockSession = { ...s, [sec]: { ...s[sec], finishedAt: Date.now() } }
    setConfirmSubmit(false)
    if (s.current + 1 < s.sections.length) {
      setSession({ ...stamped, current: s.current + 1, step: 'intro' })
      finishing.current = false
      window.scrollTo({ top: 0 })
      return
    }
    const result = await finalize(stamped)
    setSession(null)
    nav(`/ielts-mock/result/${result.id}`, { replace: true, state: { fresh: true } })
  }, [nav])

  // The clock: when it runs out, the section is submitted as it stands.
  const now = useNow(!!live && !!endsAt)
  useEffect(() => {
    if (live && endsAt && now >= endsAt && !timeUp) setTimeUp(true)
  }, [live, endsAt, now, timeUp])

  // Leaving mid-test asks first (the session itself is safe in storage either way).
  useEffect(() => {
    if (!live) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [live])

  if (!session || !section) return <Navigate to="/ielts-mock" replace />

  const start = () => {
    const t = Date.now()
    const seconds = section === 'listening' ? timelineLength(listeningTimeline(listening ?? [])) : SECTION_MINUTES[section] * 60
    const endsAtNext = t + seconds * 1000
    updateSession((s) => ({ ...s, step: 'live', [section]: { ...s[section], startedAt: t, endsAt: endsAtNext } }))
    setTimeUp(false)
  }

  if (loadError) {
    return (
      <main className="exam-intro">
        <div className="exam-intro-card">
          <h1>This paper could not be loaded</h1>
          <p>Some of its material is no longer available. Start a new mock test from the lobby.</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setSession(null)
              nav('/ielts-mock', { replace: true })
            }}
          >
            Back to mock tests
          </button>
        </div>
      </main>
    )
  }

  if (!live)
    return (
      <Intro
        section={section}
        session={session}
        onStart={start}
        minutes={section === 'listening' ? (listening ? Math.round(timelineLength(listeningTimeline(listening)) / 60) : null) : 60}
        audio={section === 'listening' ? { progress: audioProgress, retry: () => setAudioTry((n) => n + 1) } : undefined}
        questions={section === 'listening' && listening ? markPaper(listening, {}).length : 40}
      />
    )

  const ready = section === 'listening' ? !!listening : section === 'reading' ? !!passages : !!tasks
  if (ready && section === 'listening' && !audioProgress?.done) {
    return (
      <main className="exam-intro">
        <div className="exam-intro-card">
          <h1>Reloading the recordings</h1>
          <p>The page was reloaded, so the recordings are downloading again. The test clock is still running, as it would in the exam.</p>
          <AudioLoading progress={audioProgress} onRetry={() => setAudioTry((n) => n + 1)} />
        </div>
      </main>
    )
  }
  if (!ready) {
    return (
      <main className="page">
        <div className="container center">
          <div className="spinner" />
          Preparing your paper…
        </div>
      </main>
    )
  }

  const countBlank = (holders: GroupHolder[], answers: Record<string, string>) => {
    const slots = layoutPaper(holders)
    const total = slots[slots.length - 1].end
    let n = 0
    for (let q = 1; q <= total; q++) if (!isAnswered(holders, answers, q)) n++
    return n
  }
  const unanswered =
    section === 'reading' && passages && session.reading
      ? countBlank(passages, session.reading.answers)
      : section === 'listening' && listening && session.listening
        ? countBlank(listening, session.listening.answers)
        : 0
  const minutesLeft = endsAt ? Math.max(0, Math.ceil((endsAt - now) / 60000)) : 0

  return (
    <div className={`exam fs-${fontSize}`}>
      <header className="exam-bar">
        <div className="exam-bar-left">
          <span className="exam-brand">IELTS</span>
          <span className="exam-section">
            Academic {SECTION_NAME[section]}
            {session.sections.length > 1 && <span className="exam-step"> · {session.current + 1}/{session.sections.length}</span>}
          </span>
        </div>
        {endsAt && <Clock endsAt={endsAt} hidden={clockHidden} onToggle={() => setClockHidden((h) => !h)} />}
        <div className="exam-bar-right">
          <div className="exam-zoom" role="group" aria-label="Text size">
            {[0, 1, 2].map((z) => (
              <button key={z} type="button" className={fontSize === z ? 'on' : ''} onClick={() => setFontSize(z)} aria-pressed={fontSize === z} aria-label={['Small text', 'Standard text', 'Large text'][z]}>
                A
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmQuit(true)}>
            Leave
          </button>
          <button type="button" className="btn btn-dark btn-sm" onClick={() => setConfirmSubmit(true)}>
            Finish<span className="exam-hide-sm"> section</span>
          </button>
        </div>
      </header>

      {section === 'listening' && listening && session.listening?.startedAt && (
        <ListeningSection
          parts={listening}
          answers={session.listening.answers}
          flagged={session.listening.flagged}
          startedAt={session.listening.startedAt}
          onSkip={(seconds) =>
            updateSession((s) =>
              s.listening?.startedAt && s.listening.endsAt
                ? { ...s, listening: { ...s.listening, startedAt: s.listening.startedAt - seconds * 1000, endsAt: s.listening.endsAt - seconds * 1000 } }
                : s,
            )
          }
          onFinish={() => setConfirmSubmit(true)}
          onAnswer={(num, value) => updateSession((s) => (s.listening ? { ...s, listening: { ...s.listening, answers: { ...s.listening.answers, [String(num)]: value } } } : s))}
          onToggleFlag={(num) =>
            updateSession((s) =>
              s.listening
                ? { ...s, listening: { ...s.listening, flagged: s.listening.flagged.includes(num) ? s.listening.flagged.filter((n) => n !== num) : [...s.listening.flagged, num] } }
                : s,
            )
          }
        />
      )}
      {section === 'reading' && passages && session.reading && (
        <ReadingSection
          passages={passages}
          answers={session.reading.answers}
          flagged={session.reading.flagged}
          onAnswer={(num, value) => updateSession((s) => (s.reading ? { ...s, reading: { ...s.reading, answers: { ...s.reading.answers, [String(num)]: value } } } : s))}
          onToggleFlag={(num) =>
            updateSession((s) =>
              s.reading ? { ...s, reading: { ...s.reading, flagged: s.reading.flagged.includes(num) ? s.reading.flagged.filter((n) => n !== num) : [...s.reading.flagged, num] } } : s,
            )
          }
        />
      )}
      {section === 'writing' && tasks && session.writing && (
        <WritingSection
          task1={tasks.t1}
          task2={tasks.t2}
          text1={session.writing.text1}
          text2={session.writing.text2}
          onChange={(part, text) => updateSession((s) => (s.writing ? { ...s, writing: { ...s.writing, [part === 1 ? 'text1' : 'text2']: text } } : s))}
        />
      )}

      {confirmSubmit && !timeUp && (
        <div className="exam-modal" role="dialog" aria-modal="true" aria-labelledby="submit-title">
          <div className="exam-modal-card">
            <h2 id="submit-title">Finish the {SECTION_NAME[section]} section?</h2>
            <p>
              You still have {minutesLeft} {minutesLeft === 1 ? 'minute' : 'minutes'}.
              {section !== 'writing' && unanswered > 0 && (
                <>
                  {' '}
                  <b>
                    {unanswered} {unanswered === 1 ? 'question is' : 'questions are'} unanswered.
                  </b>{' '}
                  A blank answer scores nothing, so it is worth a guess.
                </>
              )}
              {section === 'writing' && session.writing && (
                <>
                  {' '}
                  Part 1 has {session.writing.text1.trim().split(/\s+/).filter(Boolean).length} words and Part 2 has {session.writing.text2.trim().split(/\s+/).filter(Boolean).length}.
                </>
              )}{' '}
              You cannot come back to this section once it is finished.
            </p>
            <div className="exam-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmSubmit(false)}>
                Keep working
              </button>
              <button type="button" className="btn btn-primary" onClick={finishSection}>
                Finish section
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmQuit && (
        <div className="exam-modal" role="dialog" aria-modal="true" aria-labelledby="quit-title">
          <div className="exam-modal-card">
            <h2 id="quit-title">Leave the test?</h2>
            <p>Your answers are saved, but the clock keeps running, as it would in the exam hall. You can come back from the mock test page before the time runs out, or abandon this paper altogether.</p>
            <div className="exam-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmQuit(false)}>
                Stay
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => nav('/ielts-mock')}>
                Leave for now
              </button>
              <button
                type="button"
                className="btn btn-ghost danger"
                onClick={() => {
                  setSession(null)
                  nav('/ielts-mock', { replace: true })
                }}
              >
                Abandon paper
              </button>
            </div>
          </div>
        </div>
      )}

      {timeUp && (
        <div className="exam-modal" role="alertdialog" aria-modal="true" aria-labelledby="timeup-title">
          <div className="exam-modal-card">
            <h2 id="timeup-title">Time is up</h2>
            <p>The {SECTION_NAME[section]} section has ended. Your answers have been saved exactly as you left them.</p>
            <div className="exam-modal-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setTimeUp(false)
                  finishSection()
                }}
              >
                {session.current + 1 < session.sections.length ? `Continue to ${SECTION_NAME[session.sections[session.current + 1]]}` : 'See my results'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
