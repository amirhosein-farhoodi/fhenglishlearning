import { Link, useNavigate, useParams } from 'react-router-dom'
import Stars from '../components/Stars'
import { availableUnits, getBook, orderedUnits } from '../content/registry'
import { bookStats, getUnitProgress, useProgress } from '../lib/storage'

export default function Course() {
  const { slug } = useParams()
  const book = getBook(slug)
  const p = useProgress()
  const nav = useNavigate()

  if (!book) {
    return (
      <main className="page">
        <div className="container center">
          <p>Book not found.</p>
          <Link to="/" className="btn btn-secondary" style={{ marginTop: 16 }}>
            Back to books
          </Link>
        </div>
      </main>
    )
  }

  const avail = availableUnits(book.slug)
  const stats = bookStats(p, book, avail)
  const order = orderedUnits(book)
  const bp = p.books[book.slug]

  // Where to continue: the last visited unit if not passed, otherwise the first available unit not yet passed.
  let continueUnit: number | null = null
  if (bp?.lastUnit && avail.has(bp.lastUnit) && getUnitProgress(p, book.slug, bp.lastUnit)?.status !== 'passed') {
    continueUnit = bp.lastUnit
  } else {
    continueUnit = order.find((n) => avail.has(n) && getUnitProgress(p, book.slug, n)?.status !== 'passed') ?? null
  }
  const continueStatus = continueUnit ? getUnitProgress(p, book.slug, continueUnit) : undefined

  return (
    <main className="page">
      <div className="container">
        <Link to="/" className="back">
          ← All books
        </Link>

        <section className="course-head" style={{ ['--book' as string]: book.accent }}>
          <div>
            <p className="eyebrow">
              {book.coverEmoji} {book.level ?? 'Course'}
            </p>
            <h1>{book.title}</h1>
            <p className="desc">{book.description}</p>
            {book.author && (
              <p className="muted" style={{ fontSize: '0.8rem', marginTop: 10 }}>
                {book.author}
              </p>
            )}
          </div>
          <div className="ring" style={{ ['--p' as string]: stats.percent }} title={`${stats.passed} of ${stats.total} passed`}>
            <span>{stats.percent}%</span>
          </div>
        </section>

        {continueUnit && (
          <div className="continue-card">
            <div>
              <p className="eyebrow">{continueStatus && continueStatus.status !== 'not_started' ? 'Pick up where you left off' : 'Up next'}</p>
              <h3>
                Unit {continueUnit} · {book.unitTitles[String(continueUnit)]}
              </h3>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => nav(`/learn/${book.slug}/${continueUnit}`)}>
              {continueStatus?.lessonSeen ? 'Continue' : 'Start lesson'} →
            </button>
          </div>
        )}

        {book.sections.map((section) => {
          const passedHere = section.units.filter((n) => getUnitProgress(p, book.slug, n)?.status === 'passed').length
          return (
            <section key={section.title} className="section-block">
              <div className="section-title">
                <h2>{section.title}</h2>
                <span className="count">
                  {passedHere}/{section.units.length}
                </span>
              </div>
              <div className="unit-list">
                {section.units.map((n) => {
                  const up = getUnitProgress(p, book.slug, n)
                  const has = avail.has(n)
                  const cls = ['unit-row']
                  if (!has) cls.push('locked')
                  else if (up?.status === 'passed') cls.push('passed')
                  else if (up?.status === 'failed') cls.push('failed')
                  else if (n === continueUnit) cls.push('current')
                  return (
                    <button
                      key={n}
                      type="button"
                      className={cls.join(' ')}
                      disabled={!has}
                      onClick={() => has && nav(`/learn/${book.slug}/${n}`)}
                      aria-label={`Unit ${n}: ${book.unitTitles[String(n)]}`}
                    >
                      <span className="unit-badge">{up?.status === 'passed' ? '✓' : n}</span>
                      <span className="unit-text">
                        <span className="title">{book.unitTitles[String(n)]}</span>
                        <span className="sub">
                          {!has
                            ? 'Coming soon'
                            : up?.status === 'passed'
                              ? `Best score ${up.bestScore}%`
                              : up?.status === 'failed'
                                ? `Last score ${up.bestScore}% - try again`
                                : up?.lessonSeen
                                  ? 'Lesson read - quiz pending'
                                  : `Unit ${n}`}
                        </span>
                      </span>
                      <span className="unit-status">
                        {!has ? <span>🔒</span> : up && up.attempts > 0 ? <Stars count={up.stars} /> : <span className="label-text">Start →</span>}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </main>
  )
}
