import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import confetti from 'canvas-confetti'
import { loadListeningPart, loadPassage, loadTask1, loadTask2 } from '../content/ielts-mock'
import type { ListeningPart, QuestionType, ReadingPassage, WritingTask1, WritingTask2 } from '../content/ielts-mock/types'
import { ArrowLeft } from '../components/Icons'
import { Task1Prompt, Task2Prompt } from '../components/mock/WritingSection'
import { cefrFor, fmtBand, markPaper, nextBand, wordCount, type MarkedQuestion } from '../lib/mock/engine'
import { BANDS, taskBand, TASK1_CRITERIA, TASK2_CRITERIA, UNDER_LENGTH_CAP, writingBand, type Criterion, type CriterionRatings } from '../lib/mock/descriptors'
import { getHistory, startSession, updateResult, useMockState, type MockResult } from '../lib/mock/store'
import { renderInline } from '../lib/markup'
import { sfx } from '../lib/sfx'
import { overallOf } from './MockLobby'
import '../styles/mock.css'

/**
 * /ielts-mock/result/:id - the score report for one finished paper.
 * Reading is marked automatically; Writing is rated by the candidate against the
 * four official criteria, with a band-9 model answer beside their script.
 */

const TYPE_NAME: Record<QuestionType, string> = {
  tfng: 'True / False / Not Given',
  ynng: 'Yes / No / Not Given',
  headings: 'Matching headings',
  matching: 'Matching',
  mcq: 'Multiple choice',
  multi: 'Multiple choice (choose two)',
  completion: 'Completion (notes, sentences, tables)',
  'summary-box': 'Summary from a word list',
}

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const mmss = (ms: number) => {
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${m}:${String(s).padStart(2, '0')}`
}

function BandDial({ band, label, sub }: { band: number | null; label: string; sub?: ReactNode }) {
  const pct = band === null ? 0 : band / 9
  const R = 44
  const C = 2 * Math.PI * R
  return (
    <div className="mr-dial">
      <svg viewBox="0 0 110 110" aria-hidden="true">
        <circle cx="55" cy="55" r={R} className="mr-dial-track" />
        <circle cx="55" cy="55" r={R} className="mr-dial-fill" strokeDasharray={`${C * pct} ${C}`} transform="rotate(-90 55 55)" />
      </svg>
      <div className="mr-dial-text">
        <span className="mr-dial-band">{band === null ? '–' : fmtBand(band)}</span>
      </div>
      <div className="mr-dial-label">{label}</div>
      {sub && <div className="mr-dial-sub">{sub}</div>}
    </div>
  )
}

/** Paragraph text with every evidence quote for the open question marked. */
function markEvidence(text: string, quotes: string[]): ReactNode {
  const hits = quotes
    .map((q) => ({ q, at: text.indexOf(q) }))
    .filter((h) => h.q && h.at >= 0)
    .sort((a, b) => a.at - b.at)
  if (!hits.length) return renderInline(text)
  const out: ReactNode[] = []
  let pos = 0
  hits.forEach((h, i) => {
    if (h.at < pos) return
    out.push(<span key={`t${i}`}>{renderInline(text.slice(pos, h.at))}</span>)
    out.push(
      <mark key={`m${i}`} className="mr-evidence">
        {renderInline(h.q)}
      </mark>,
    )
    pos = h.at + h.q.length
  })
  out.push(<span key="end">{renderInline(text.slice(pos))}</span>)
  return out
}

/** What the review shows beside the answers: a passage, or a part's transcript. */
interface ReviewDoc {
  id: string
  tab: string
  title: string
  paragraphs: { label?: string; text: string }[]
}

const passageDocs = (ps: ReadingPassage[]): ReviewDoc[] => ps.map((p, i) => ({ id: p.id, tab: `Passage ${i + 1}`, title: p.title, paragraphs: p.paragraphs }))
const listeningDocs = (parts: ListeningPart[]): ReviewDoc[] =>
  parts.map((p, i) => ({
    id: p.id,
    tab: `Part ${i + 1}`,
    title: `${p.title} - ${p.intro}`,
    paragraphs: (p.transcript ?? ['No transcript is available for this part.']).map((text) => ({ text })),
  }))

function ReadingReview({ passages, marked }: { passages: ReviewDoc[]; marked: MarkedQuestion[] }) {
  const [open, setOpen] = useState(0)
  const [focus, setFocus] = useState<number | null>(null)
  const [onlyWrong, setOnlyWrong] = useState(false)
  const passageRef = useRef<HTMLDivElement>(null)
  const own = marked.filter((q) => q.passage === open)
  const shown = onlyWrong ? own.filter((q) => !q.correct) : own
  const focused = marked.find((q) => q.num === focus)
  const quotes = focused?.evidence && focused.passage === open ? [focused.evidence] : []

  useEffect(() => {
    if (!quotes.length) return
    requestAnimationFrame(() => passageRef.current?.querySelector('.mr-evidence')?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
  }, [focus]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mr-review">
      <div className="mr-tabs" role="tablist">
        {passages.map((p, i) => {
          const qs = marked.filter((q) => q.passage === i)
          return (
            <button key={p.id} type="button" role="tab" aria-selected={open === i} className={open === i ? 'on' : ''} onClick={() => (setOpen(i), setFocus(null))}>
              {p.tab}
              <small>
                {qs.filter((q) => q.correct).length}/{qs.length}
              </small>
            </button>
          )
        })}
        <label className="mr-only-wrong">
          <input type="checkbox" checked={onlyWrong} onChange={(e) => setOnlyWrong(e.target.checked)} /> Only show mistakes
        </label>
      </div>
      <div className="mr-review-split">
        <div className="mr-review-passage" ref={passageRef}>
          <h3>{passages[open].title}</h3>
          {passages[open].paragraphs.map((para, i) => (
            <p key={i}>
              {para.label && <b className="rp-label-inline">{para.label}</b>}
              {markEvidence(para.text, quotes)}
            </p>
          ))}
        </div>
        <ol className="mr-qs">
          {shown.map((q) => (
            <li key={q.num} className={`mr-q${q.correct ? ' ok' : ' bad'}${focus === q.num ? ' is-focus' : ''}`}>
              <button type="button" className="mr-q-head" onClick={() => setFocus(focus === q.num ? null : q.num)} aria-expanded={focus === q.num}>
                <span className="mr-q-num">{q.num}</span>
                <span className="mr-q-mark" aria-label={q.correct ? 'correct' : 'incorrect'}>
                  {q.correct ? '✓' : '✗'}
                </span>
                <span className="mr-q-ans">
                  {q.correct ? (
                    <b>{q.given}</b>
                  ) : (
                    <>
                      <s>{q.given || 'no answer'}</s> <b>{q.expected}</b>
                    </>
                  )}
                </span>
                <span className="mr-q-type">{TYPE_NAME[q.type]}</span>
              </button>
              {focus === q.num && (
                <div className="mr-q-why">
                  {q.evidence ? (
                    <p>
                      <span className="mr-why-label">{passages[open].tab.startsWith('Part') ? 'In the recording' : 'In the passage'}</span> “{renderInline(q.evidence)}”
                    </p>
                  ) : null}
                  {q.note && <p>{renderInline(q.note)}</p>}
                  {!q.evidence && !q.note && <p className="muted">The answer is stated in the {passages[open].tab.startsWith('Part') ? 'recording' : 'passage'}.</p>}
                </div>
              )}
            </li>
          ))}
          {!shown.length && <li className="muted">No mistakes in this {passages[open].tab.startsWith('Part') ? 'part' : 'passage'}.</li>}
        </ol>
      </div>
    </div>
  )
}

function CriterionPicker({ c, value, cap, onPick }: { c: Criterion; value?: number; cap?: number; onPick: (b: number) => void }) {
  return (
    <div className="mr-crit">
      <div className="mr-crit-head">
        <b>{c.name}</b>
        <span className="muted">{c.focus}</span>
      </div>
      <div className="mr-crit-bands" role="radiogroup" aria-label={c.name}>
        {BANDS.map((b) => {
          const blocked = cap !== undefined && b > cap
          return (
            <button key={b} type="button" role="radio" aria-checked={value === b} className={value === b ? 'on' : ''} disabled={blocked} onClick={() => onPick(b)} title={blocked ? 'Under-length scripts cannot score above this' : undefined}>
              {b}
            </button>
          )
        })}
      </div>
      {value !== undefined && <p className="mr-crit-desc">{c.bands[value]}</p>}
    </div>
  )
}

function WritingReview({ result, t1, t2 }: { result: MockResult; t1: WritingTask1; t2: WritingTask2 }) {
  const w = result.writing!
  const [part, setPart] = useState<1 | 2>(1)
  const [ratings, setRatings] = useState<{ task1: CriterionRatings; task2: CriterionRatings }>(w.ratings ?? { task1: {}, task2: {} })
  const words = [wordCount(w.text1), wordCount(w.text2)]
  const under = [words[0] < 150, words[1] < 250]

  const persist = (next: typeof ratings) => {
    setRatings(next)
    const b1 = taskBand(next.task1, TASK1_CRITERIA)
    const b2 = taskBand(next.task2, TASK2_CRITERIA)
    updateResult(result.id, (r) => ({ ...r, writing: { ...r.writing!, ratings: next, band: b1 !== null && b2 !== null ? writingBand(b1, b2) : undefined } }))
  }

  const crit = part === 1 ? TASK1_CRITERIA : TASK2_CRITERIA
  const key = part === 1 ? 'task1' : 'task2'
  const tb = taskBand(ratings[key], crit)
  const text = part === 1 ? w.text1 : w.text2
  const model = part === 1 ? t1.model : t2.model

  return (
    <div className="mr-writing">
      <div className="mr-tabs" role="tablist">
        {([1, 2] as const).map((p) => {
          const b = taskBand(ratings[p === 1 ? 'task1' : 'task2'], p === 1 ? TASK1_CRITERIA : TASK2_CRITERIA)
          return (
            <button key={p} type="button" role="tab" aria-selected={part === p} className={part === p ? 'on' : ''} onClick={() => setPart(p)}>
              Task {p}
              <small>{b === null ? 'not rated' : `band ${fmtBand(Math.round(b * 2) / 2)}`}</small>
            </button>
          )
        })}
      </div>

      <details className="mr-task-prompt">
        <summary>Show the task</summary>
        {part === 1 ? <Task1Prompt task={t1} /> : <Task2Prompt task={t2} />}
      </details>

      <div className="mr-scripts">
        <div className="mr-script">
          <h4>
            Your answer <span className={`mr-wc${under[part - 1] ? ' is-under' : ''}`}>{words[part - 1]} words</span>
          </h4>
          {under[part - 1] && (
            <p className="mr-warn">
              Under the {part === 1 ? 150 : 250}-word minimum. Examiners penalise short scripts, so {part === 1 ? 'Task Achievement' : 'Task Response'} is capped at band {UNDER_LENGTH_CAP} here.
            </p>
          )}
          <div className="mr-script-text">{text.trim() ? text.split(/\n+/).map((p, i) => <p key={i}>{p}</p>) : <p className="muted">You did not write anything for this task.</p>}</div>
        </div>
        <div className="mr-script is-model">
          <h4>
            Band 9 model answer <span className="mr-wc">{wordCount(model)} words</span>
          </h4>
          <div className="mr-script-text">
            {model.split(/\n+/).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </div>
      </div>

      <div className="mr-rate">
        <h4>Rate your Task {part} like an examiner</h4>
        <p className="muted">Compare your script with the model, then pick the band whose description fits best for each criterion. Be strict - examiners look for the lowest band that is fully met.</p>
        {crit.map((c) => (
          <CriterionPicker
            key={c.id}
            c={c}
            value={ratings[key][c.id]}
            cap={(c.id === 'ta' || c.id === 'tr') && under[part - 1] ? UNDER_LENGTH_CAP : undefined}
            onPick={(b) => persist({ ...ratings, [key]: { ...ratings[key], [c.id]: b } })}
          />
        ))}
        {tb !== null && (
          <p className="mr-task-band">
            Task {part} band: <b>{fmtBand(Math.round(tb * 2) / 2)}</b>
            {part === 1 && taskBand(ratings.task2, TASK2_CRITERIA) === null && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPart(2)}>
                Rate Task 2
              </button>
            )}
          </p>
        )}
      </div>
    </div>
  )
}

export default function MockResultPage() {
  const { id } = useParams()
  const { history } = useMockState()
  const result = history.find((r) => r.id === id)
  const nav = useNavigate()
  const fresh = !!(useLocation().state as { fresh?: boolean } | null)?.fresh
  const [listening, setListening] = useState<ListeningPart[] | null>(null)
  const [passages, setPassages] = useState<ReadingPassage[] | null>(null)
  const [tasks, setTasks] = useState<{ t1: WritingTask1; t2: WritingTask2 } | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    if (!result?.listening) return
    Promise.all(result.listening.partIds.map(loadListeningPart))
      .then(setListening)
      .catch(() => setMissing(true))
  }, [result?.listening?.partIds?.join()]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!result?.reading) return
    Promise.all(result.reading.passageIds.map(loadPassage))
      .then(setPassages)
      .catch(() => setMissing(true))
  }, [result?.reading?.passageIds]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!result?.writing) return
    Promise.all([loadTask1(result.writing.task1), loadTask2(result.writing.task2)])
      .then(([t1, t2]) => setTasks({ t1, t2 }))
      .catch(() => setMissing(true))
  }, [result?.writing?.task1, result?.writing?.task2]) // eslint-disable-line react-hooks/exhaustive-deps

  const marked = useMemo(() => (passages && result?.reading ? markPaper(passages, result.reading.answers) : null), [passages, result?.reading])
  const lMarked = useMemo(() => (listening && result?.listening ? markPaper(listening, result.listening.answers) : null), [listening, result?.listening])

  useEffect(() => {
    if (!fresh || !result) return
    const b = Math.max(result.reading?.band ?? 0, result.listening?.band ?? 0)
    if (b >= 7) {
      sfx.win()
      confetti({ particleCount: 140, spread: 80, origin: { y: 0.5 }, colors: ['#6d28d2', '#c0c4fc', '#c4710d', '#2a2b3f'] })
    }
    // Only on the first render after the test.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!result) {
    return (
      <main className="page">
        <div className="container center">
          <p>That result is not on this device.</p>
          <Link to="/ielts-mock" className="btn btn-secondary" style={{ marginTop: 16 }}>
            Mock tests
          </Link>
        </div>
      </main>
    )
  }

  const overall = overallOf(result)
  const typeBreakdown = (qs: MarkedQuestion[] | null) =>
    qs
    ? Object.entries(
        qs.reduce<Record<string, { ok: number; n: number }>>((acc, q) => {
          const k = q.type === 'multi' ? 'mcq' : q.type
          acc[k] = acc[k] ?? { ok: 0, n: 0 }
          acc[k].n++
          if (q.correct) acc[k].ok++
          return acc
        }, {}),
      ).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n)
    : []
  const byType = typeBreakdown(marked)
  const up = result.reading ? nextBand(result.reading.raw, 'reading') : null
  const lUp = result.listening && (result.listening.total ?? 40) === 40 ? nextBand(result.listening.raw, 'listening') : null
  const lTime = result.listening?.startedAt && result.listening.finishedAt ? result.listening.finishedAt - result.listening.startedAt : null
  const skillName = (x: string) => (x === 'listening' ? 'Listening' : x === 'reading' ? 'Reading' : 'Writing')
  const rTime = result.reading?.startedAt && result.reading.finishedAt ? result.reading.finishedAt - result.reading.startedAt : null

  const again = () => {
    startSession(result.sections)
    nav('/ielts-mock/exam')
  }

  return (
    <main className="page mr">
      <div className="container">
        <Link to="/ielts-mock" className="back">
          <ArrowLeft size={16} /> Mock tests
        </Link>
        <section className="mr-head">
          <div>
            <p className="eyebrow">Test report · {dateFmt.format(result.finishedAt)}</p>
            <h1>{fresh ? 'Test complete' : 'Your mock test result'}</h1>
            <p className="muted">
              IELTS Academic · {result.sections.map(skillName).join(' + ')}
            </p>
          </div>
          <div className="mr-dials">
            {result.listening && <BandDial band={result.listening.band} label="Listening" sub={<>{result.listening.raw}/{result.listening.total ?? 40} correct</>} />}
            {result.reading && (
              <BandDial
                band={result.reading.band}
                label="Reading"
                sub={
                  <>
                    {result.reading.raw}/40 correct
                    {rTime !== null && <> · {mmss(rTime)}</>}
                  </>
                }
              />
            )}
            {result.writing && <BandDial band={typeof result.writing.band === 'number' ? result.writing.band : null} label="Writing" sub={typeof result.writing.band === 'number' ? 'self-rated' : 'rate below'} />}
            {result.sections.length > 1 && <BandDial band={overall} label={`Overall (${result.sections.map((x) => x[0].toUpperCase()).join(' + ')})`} sub={overall !== null ? `CEFR ${cefrFor(overall)}` : 'after rating Writing'} />}
          </div>
        </section>

        {missing && <p className="mr-warn">Some of this paper's material is no longer in the bank, so parts of the review cannot be shown.</p>}

        {result.listening && (
          <section className="mr-section">
            <div className="section-head">
              <h2>Listening</h2>
              <span className="muted">
                {result.listening.total && result.listening.total !== 40 ? <>Band scaled from {result.listening.raw}/{result.listening.total} · </> : null}
                {lUp ? (
                  <>
                    {lUp.need} more correct {lUp.need === 1 ? 'answer' : 'answers'} would have made band {fmtBand(lUp.band)}.
                  </>
                ) : (
                  lTime !== null && <>Finished in {mmss(lTime)}</>
                )}
              </span>
            </div>
            {lMarked && (
              <div className="mr-types">
                {typeBreakdown(lMarked).map(([k, v]) => (
                  <div key={k} className="mr-type">
                    <span>{TYPE_NAME[k as QuestionType]}</span>
                    <span className="mr-type-bar">
                      <span style={{ width: `${(v.ok / v.n) * 100}%` }} />
                    </span>
                    <b>
                      {v.ok}/{v.n}
                    </b>
                  </div>
                ))}
              </div>
            )}
            {listening && lMarked ? <ReadingReview passages={listeningDocs(listening)} marked={lMarked} /> : !missing && <div className="spinner" />}
          </section>
        )}

        {result.reading && (
          <section className="mr-section">
            <div className="section-head">
              <h2>Reading</h2>
              {up && (
                <span className="muted">
                  {up.need} more correct {up.need === 1 ? 'answer' : 'answers'} would have made band {fmtBand(up.band)}.
                </span>
              )}
            </div>
            {byType.length > 0 && (
              <div className="mr-types">
                {byType.map(([k, v]) => (
                  <div key={k} className="mr-type">
                    <span>{TYPE_NAME[k as QuestionType]}</span>
                    <span className="mr-type-bar">
                      <span style={{ width: `${(v.ok / v.n) * 100}%` }} />
                    </span>
                    <b>
                      {v.ok}/{v.n}
                    </b>
                  </div>
                ))}
              </div>
            )}
            {passages && marked ? <ReadingReview passages={passageDocs(passages)} marked={marked} /> : !missing && <div className="spinner" />}
          </section>
        )}

        {result.writing && (
          <section className="mr-section">
            <div className="section-head">
              <h2>Writing</h2>
              {typeof result.writing.band === 'number' && <span className="muted">Task 2 counts twice as much as Task 1.</span>}
            </div>
            {tasks ? <WritingReview result={result} t1={tasks.t1} t2={tasks.t2} /> : !missing && <div className="spinner" />}
          </section>
        )}

        <div className="mr-actions">
          <button type="button" className="btn btn-primary btn-lg" onClick={again}>
            Take a new {result.sections.length > 1 ? 'mock test' : `${skillName(result.sections[0])} test`}
          </button>
          <Link to="/ielts-mock" className="btn btn-ghost">
            All results
          </Link>
          {getHistory().length > 1 && (
            <Link to="/learn/ielts-cambridge" className="btn btn-ghost">
              IELTS skills course
            </Link>
          )}
        </div>
      </div>
    </main>
  )
}
