import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { explanationOf, solutionLines, TYPE_LABEL } from '../components/exercises/solution'
import { getBook, loadUnit, nextAvailableUnit } from '../content/registry'
import type { Exercise, Unit } from '../content/types'
import { renderInline } from '../lib/markup'
import { ArrowLeft, ArrowRight } from '../components/Icons'

function questionText(x: Exercise): string {
  switch (x.type) {
    case 'true_false':
      return `Is this correct? "${x.statement}"`
    case 'fill_blank':
      return x.prompt + (x.hint ? `  ${x.hint}` : '')
    default:
      return x.prompt
  }
}

export default function Review() {
  const { slug, unit: unitParam } = useParams()
  const n = Number(unitParam)
  const book = getBook(slug)
  const nav = useNavigate()
  const [unit, setUnit] = useState<Unit | null | undefined>(undefined)

  useEffect(() => {
    if (!book) return
    loadUnit(book.slug, n).then(setUnit)
  }, [book, n])

  if (!book || unit === null) {
    return (
      <main className="page">
        <div className="container center">
          <p>Nothing to show here.</p>
          <Link to="/" className="btn btn-secondary" style={{ marginTop: 16 }}>
            Home
          </Link>
        </div>
      </main>
    )
  }
  if (!unit) {
    return (
      <main className="page">
        <div className="container center">
          <div className="spinner" />
        </div>
      </main>
    )
  }

  const nextUnit = nextAvailableUnit(book, n)

  return (
    <main className="page">
      <div className="container narrow">
        <Link to={`/learn/${book.slug}`} className="back">
          <ArrowLeft size={16} /> {book.title}
        </Link>
        <header className="lesson-head">
          <p className="eyebrow">Answer key · Unit {unit.number}</p>
          <h1>{unit.title}</h1>
          <p className="muted" style={{ marginTop: 8 }}>
            Every question from the quiz with its correct answer and the rule behind it.
          </p>
        </header>

        <div className="stack">
          {unit.exercises.map((x, i) => (
            <article key={i} className="card review-item">
              <div className="review-num">
                {i + 1} · {TYPE_LABEL[x.type].icon} {TYPE_LABEL[x.type].label}
              </div>
              <p className="q-prompt">{renderInline(questionText(x))}</p>
              <div className="review-answer">
                {solutionLines(x).length === 1 ? (
                  renderInline(solutionLines(x)[0])
                ) : (
                  <ul>
                    {solutionLines(x).map((l, j) => (
                      <li key={j}>{renderInline(l)}</li>
                    ))}
                  </ul>
                )}
              </div>
              {explanationOf(x) && <p className="review-expl">{renderInline(explanationOf(x)!)}</p>}
            </article>
          ))}
        </div>

        <div className="result-actions">
          <button type="button" className="btn btn-primary btn-lg" onClick={() => nav(`/learn/${book.slug}/${n}/quiz`)}>
            Retake the quiz
          </button>
          <div className="row" style={{ justifyContent: 'center' }}>
            <Link to={`/learn/${book.slug}/${n}`} className="btn btn-ghost">
              Review the lesson
            </Link>
            {nextUnit && (
              <Link to={`/learn/${book.slug}/${nextUnit}`} className="btn btn-ghost">
                Next lesson <ArrowRight size={18} />
              </Link>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
