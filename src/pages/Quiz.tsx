import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import confetti from 'canvas-confetti'
import ExerciseView from '../components/exercises/ExerciseView'
import { explanationOf, solutionLines } from '../components/exercises/solution'
import Stars from '../components/Stars'
import { getBook, loadUnit, nextAvailableUnit } from '../content/registry'
import type { Unit } from '../content/types'
import { renderInline } from '../lib/markup'
import { recordQuiz, XP_PER_CORRECT, type QuizOutcome } from '../lib/storage'
import { sfx } from '../lib/sfx'
import { ArrowRight } from '../components/Icons'

type Phase = 'loading' | 'quiz' | 'result'

export default function Quiz() {
  const { slug, unit: unitParam } = useParams()
  const n = Number(unitParam)
  const book = getBook(slug)
  const nav = useNavigate()

  const [unit, setUnit] = useState<Unit | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [index, setIndex] = useState(0)
  const [results, setResults] = useState<boolean[]>([])
  const [answered, setAnswered] = useState<boolean | null>(null)
  const [outcome, setOutcome] = useState<QuizOutcome | null>(null)
  const [run, setRun] = useState(0) // increments on "try again" so components remount
  const seed = useMemo(() => Math.floor(Math.random() * 1e9), [run, n])

  useEffect(() => {
    if (!book) return
    loadUnit(book.slug, n).then((u) => {
      setUnit(u)
      setPhase(u ? 'quiz' : 'loading')
    })
  }, [book, n])

  const exercises = unit?.exercises ?? []
  const current = exercises[index]
  const correctSoFar = results.filter(Boolean).length

  const answeredAt = useRef(0)

  const onResult = (ok: boolean) => {
    if (answered !== null) return
    answeredAt.current = Date.now()
    setAnswered(ok)
    setResults((r) => [...r, ok])
    if (ok) sfx.correct()
    else sfx.wrong()
  }

  // Enter advances once feedback is showing - but not the same keystroke that submitted the answer.
  useEffect(() => {
    if (answered === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && Date.now() - answeredAt.current > 400) {
        e.preventDefault()
        next()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answered, index, results])

  const next = () => {
    if (index + 1 < exercises.length) {
      setIndex(index + 1)
      setAnswered(null)
      return
    }
    // finished
    const correct = results.filter(Boolean).length
    const out = recordQuiz(book!.slug, n, correct, exercises.length, unit?.passScore ?? 70)
    setOutcome(out)
    setPhase('result')
    if (out.passed) {
      sfx.win()
      confetti({ particleCount: 140, spread: 80, origin: { y: 0.6 }, colors: ['#ff6b4a', '#5b6cff', '#f5b301', '#1c9c6b'] })
      if (out.stars === 3) setTimeout(() => confetti({ particleCount: 80, spread: 120, origin: { y: 0.4 } }), 400)
    } else {
      sfx.fail()
    }
  }

  const restart = () => {
    setIndex(0)
    setResults([])
    setAnswered(null)
    setOutcome(null)
    setRun((r) => r + 1)
    setPhase('quiz')
  }

  if (!book) {
    return (
      <main className="page">
        <div className="container center">
          <p>Book not found.</p>
          <Link to="/" className="btn btn-secondary" style={{ marginTop: 16 }}>
            Home
          </Link>
        </div>
      </main>
    )
  }

  if (phase === 'loading' || !unit) {
    return (
      <main className="page">
        <div className="container center">
          <div className="spinner" />
          Preparing your quiz…
        </div>
      </main>
    )
  }

  if (phase === 'result' && outcome) {
    const nextUnit = nextAvailableUnit(book, n)
    return (
      <main className="page">
        <div className="container narrow result">
          {outcome.passed ? (
            <>
              <div className="emoji" aria-hidden="true">
                {outcome.stars === 3 ? '🏆' : outcome.stars === 2 ? '🎉' : '👏'}
              </div>
              <h1>{outcome.stars === 3 ? 'Perfect run!' : outcome.stars === 2 ? 'Great work!' : 'Lesson passed!'}</h1>
              <p className="sub">
                You got {results.filter(Boolean).length} of {exercises.length} right in Unit {unit.number}.
              </p>
              <Stars count={outcome.stars} size="lg" />
              <div className="score-grid">
                <div className="stat">
                  <div className="value">{outcome.score}%</div>
                  <div className="label">score {outcome.newBest && '· new best'}</div>
                </div>
                <div className="stat">
                  <div className="value" style={{ color: 'var(--indigo)' }}>
                    +{outcome.xpGained}
                  </div>
                  <div className="label">XP earned</div>
                </div>
                <div className="stat">
                  <div className="value">🔥 {outcome.streak}</div>
                  <div className="label">day streak</div>
                </div>
              </div>
              <div className="result-actions">
                {nextUnit ? (
                  <button type="button" className="btn btn-primary btn-lg" onClick={() => nav(`/learn/${book.slug}/${nextUnit}`)}>
                    Next lesson: Unit {nextUnit} <ArrowRight />
                  </button>
                ) : (
                  <p className="muted">You have reached the last available lesson. More are coming!</p>
                )}
                <div className="row" style={{ justifyContent: 'center' }}>
                  <Link to={`/learn/${book.slug}/${n}/answers`} className="btn btn-ghost">
                    See answers
                  </Link>
                  <button type="button" className="btn btn-ghost" onClick={restart}>
                    Play again
                  </button>
                  <Link to={`/learn/${book.slug}`} className="btn btn-ghost">
                    Course map
                  </Link>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="emoji" aria-hidden="true">
                🌱
              </div>
              <h1>Not quite there yet</h1>
              <p className="sub">
                You got {results.filter(Boolean).length} of {exercises.length} right ({outcome.score}%). You need {unit.passScore ?? 70}% to
                pass - but every attempt teaches you something. What would you like to do?
              </p>
              <div className="score-grid" style={{ maxWidth: 360 }}>
                <div className="stat" style={{ gridColumn: '1 / -1' }}>
                  <div className="value" style={{ color: 'var(--indigo)' }}>
                    +{outcome.xpGained} XP
                  </div>
                  <div className="label">earned for {results.filter(Boolean).length} correct answers</div>
                </div>
              </div>
              <div className="option-cards">
                <button type="button" className="option-card a" onClick={() => nav(`/learn/${book.slug}/${n}`)}>
                  <span className="icon" aria-hidden="true">
                    📖
                  </span>
                  <h3>Review the lesson</h3>
                  <p>Read the explanation again, then retake the quiz.</p>
                </button>
                <button type="button" className="option-card b" onClick={() => nav(`/learn/${book.slug}/${n}/answers`)}>
                  <span className="icon" aria-hidden="true">
                    💡
                  </span>
                  <h3>See the answers</h3>
                  <p>Check every question with its correct answer and why.</p>
                </button>
                <button
                  type="button"
                  className="option-card c"
                  disabled={!nextUnit}
                  onClick={() => nextUnit && nav(`/learn/${book.slug}/${nextUnit}`)}
                >
                  <span className="icon" aria-hidden="true">
                    ⏭️
                  </span>
                  <h3>Next lesson</h3>
                  <p>{nextUnit ? `Move on to Unit ${nextUnit} and come back later.` : 'No further lessons available yet.'}</p>
                </button>
              </div>
              <div className="result-actions" style={{ marginTop: 18 }}>
                <button type="button" className="btn btn-secondary" onClick={restart}>
                  Try the quiz again
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    )
  }

  const progress = ((index + (answered !== null ? 1 : 0)) / exercises.length) * 100

  return (
    <main className="page" style={{ paddingTop: 8 }}>
      <div className="container narrow">
        <div className="quiz-top">
          <button type="button" className="btn-icon" aria-label="Quit quiz" onClick={() => nav(`/learn/${book.slug}`)}>
            ✕
          </button>
          <div className="progress indigo" aria-label={`Question ${index + 1} of ${exercises.length}`}>
            <span style={{ width: `${progress}%` }} />
          </div>
          <span className="quiz-counter">
            {index + 1}/{exercises.length}
          </span>
          <span className="xp-float" key={correctSoFar}>
            +{correctSoFar * XP_PER_CORRECT} XP
          </span>
        </div>
        <p className="eyebrow" style={{ marginTop: 14 }}>
          Unit {unit.number} · {unit.title}
        </p>

        <AnimatePresence mode="wait">
          <motion.div
            key={`${run}-${index}`}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            {current && <ExerciseView exercise={current} seed={seed + index} onResult={onResult} />}
          </motion.div>
        </AnimatePresence>
        <div style={{ height: 140 }} />
      </div>

      {answered !== null && current && (
        <div className={`feedback ${answered ? 'ok' : 'bad'}`} role="status">
          <div className="feedback-inner">
            <div className="feedback-text">
              <div className="feedback-title">{answered ? <>✅ Correct!</> : <>❌ Not quite</>}</div>
              <div className="feedback-body">
                {!answered && current.type !== 'fill_blank' && current.type !== 'matching' && current.type !== 'categorize' && current.type !== 'word_order' && (
                  <div>
                    <b>Answer:</b> {renderInline(solutionLines(current)[0])}
                  </div>
                )}
                {explanationOf(current) && <div>{renderInline(explanationOf(current)!)}</div>}
              </div>
            </div>
            <button type="button" className={`btn ${answered ? 'btn-success' : 'btn-primary'} btn-lg`} onClick={next}>
              {index + 1 < exercises.length ? 'Continue' : 'See results'}
              <span className="kbd-hint" aria-hidden="true">
                ⏎
              </span>
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
