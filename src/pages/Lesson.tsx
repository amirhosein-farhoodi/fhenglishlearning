import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import LessonBlock from '../components/LessonBlock'
import { getBook, loadUnit, sectionOf } from '../content/registry'
import type { Unit } from '../content/types'
import { markLessonSeen } from '../lib/storage'
import { renderInline } from '../lib/markup'
import { ArrowLeft, ArrowRight } from '../components/Icons'

export default function Lesson() {
  const { slug, unit: unitParam } = useParams()
  const n = Number(unitParam)
  const book = getBook(slug)
  const nav = useNavigate()
  const [unit, setUnit] = useState<Unit | null | undefined>(undefined)
  const [shown, setShown] = useState(1)
  const lastRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    setUnit(undefined)
    setShown(1)
    if (!book || !Number.isInteger(n)) {
      setUnit(null)
      return
    }
    loadUnit(book.slug, n).then((u) => {
      if (!alive) return
      setUnit(u)
      if (u) markLessonSeen(book.slug, n)
    })
    return () => {
      alive = false
    }
  }, [book, n])

  useEffect(() => {
    if (shown > 1) lastRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [shown])

  if (!book || unit === null) {
    return (
      <main className="page">
        <div className="container center">
          <p>This lesson is not available yet.</p>
          <Link to={book ? `/learn/${book.slug}` : '/'} className="btn btn-secondary" style={{ marginTop: 16 }}>
            Back
          </Link>
        </div>
      </main>
    )
  }
  if (unit === undefined) {
    return (
      <main className="page">
        <div className="container center">
          <div className="spinner" />
          Loading lesson…
        </div>
      </main>
    )
  }

  const total = unit.lesson.length
  const allShown = shown >= total
  const blocks = unit.lesson.slice(0, shown)

  return (
    <main className="page">
      <div className="container narrow">
        <Link to={`/learn/${book.slug}`} className="back">
          <ArrowLeft size={16} /> {book.title}
        </Link>

        <header className="lesson-head">
          <p className="eyebrow">
            Unit {unit.number} · {sectionOf(book, unit.number)}
          </p>
          <h1>{unit.title}</h1>
          {unit.subtitle && (
            <p className="muted" style={{ marginTop: 6, fontSize: '1.05rem' }}>
              {renderInline(unit.subtitle)}
            </p>
          )}
          <p className="summary">{renderInline(unit.summary)}</p>
        </header>

        <div className="lesson-blocks">
          {blocks.map((b, i) => (
            <div key={i} ref={i === blocks.length - 1 ? lastRef : undefined} style={{ scrollMarginTop: 80 }}>
              <LessonBlock block={b} index={i} />
            </div>
          ))}
        </div>

        <div className="lesson-dots" aria-hidden="true">
          {unit.lesson.map((_, i) => (
            <span key={i} className={i < shown ? 'on' : ''} />
          ))}
        </div>

        <div className="reveal-bar">
          {!allShown ? (
            <div className="row">
              <button type="button" className="btn btn-secondary" onClick={() => setShown(total)}>
                Show everything
              </button>
              <button type="button" className="btn btn-primary btn-lg" onClick={() => setShown((s) => Math.min(s + 1, total))}>
                Continue <ArrowRight />
              </button>
            </div>
          ) : (
            <p className="muted" style={{ fontSize: '0.95rem' }}>
              That is the whole lesson. Ready to practise?
            </p>
          )}
        </div>
      </div>

      <div className="action-bar">
        <div className="action-bar-inner">
          <span className="muted" style={{ fontSize: '0.9rem' }}>
            {allShown ? `${unit.exercises.length} questions` : `Part ${shown} of ${total}`}
          </span>
          <button
            type="button"
            className={`btn ${allShown ? 'btn-success' : 'btn-secondary'}`}
            onClick={() => nav(`/learn/${book.slug}/${unit.number}/quiz`)}
          >
            {allShown ? 'Start the quiz 🎯' : 'Skip to quiz'}
            {allShown && <ArrowRight />}
          </button>
        </div>
      </div>
    </main>
  )
}
