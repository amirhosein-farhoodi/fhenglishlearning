import { Link } from 'react-router-dom'
import Donate from '../components/Donate'
import { ArrowRight } from '../components/Icons'
import type { BookMeta } from '../content/types'
import { availableUnits, shelves } from '../content/registry'
import { bookStats, levelFor, resetAll, setSound, useProgress } from '../lib/storage'
import type { Progress } from '../lib/storage'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function BookCard({ book, progress }: { book: BookMeta; progress: Progress }) {
  const avail = availableUnits(book.slug)
  const s = bookStats(progress, book, avail)
  const started = s.started > 0
  return (
    <Link to={`/learn/${book.slug}`} className="book-card" style={{ ['--book' as string]: book.accent }}>
      <div className="book-cover">
        {book.cover ? (
          <img src={book.cover} alt={`Cover of ${book.title}`} loading="lazy" />
        ) : (
          <span className="cover-emoji" aria-hidden="true">
            {book.coverEmoji}
          </span>
        )}
        {book.level && <span className="badge">{book.level}</span>}
      </div>
      <div className="book-body">
        <h3>{book.title}</h3>
        {book.subtitle && (
          <p className="muted" style={{ fontSize: '0.9rem' }}>
            {book.subtitle}
          </p>
        )}
        <p className="desc">{book.description}</p>
        <ul className="book-meta">
          <li>{plural(s.total, 'lesson')}</li>
          <li>{plural(book.sections.length, 'topic')}</li>
          <li>6 exercise types</li>
          {s.passed > 0 && <li className="on">{s.passed} passed</li>}
        </ul>
        <div className="book-foot">
          <div className="progress thin" title={`${s.passed} of ${s.total} lessons passed`}>
            <span style={{ width: `${s.percent}%`, background: book.accent }} />
          </div>
          <span className="cta">
            {started ? `Continue · ${s.passed}/${s.total}` : `Start · ${plural(s.available, 'lesson')}`}
            <ArrowRight size={18} />
          </span>
        </div>
      </div>
    </Link>
  )
}

export default function Home() {
  const p = useProgress()
  const lvl = levelFor(p.xp)
  const totalPassed = Object.values(p.books).reduce(
    (n, b) => n + Object.values(b.units).filter((u) => u.status === 'passed').length,
    0,
  )
  const allShelves = shelves()

  return (
    <main className="page">
      <div className="container">
        <section className="hero">
          <p className="eyebrow">Welcome back</p>
          <h1>
            Learn English, <em>one lesson</em> at a time.
          </h1>
          <p>
            Pick a book, read a short lesson, then prove it in a playful quiz. Grammar now, vocabulary and listening
            next. Your progress is saved on this device, no account needed.
          </p>
          <div className="stats-row">
            <div className="stat">
              <div className="value">
                Lv {lvl.level}{' '}
                <span className="muted" style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                  {lvl.title}
                </span>
              </div>
              <div className="label">
                {p.xp} XP · {lvl.need - lvl.current} to next level
              </div>
              <div className="progress indigo thin" style={{ marginTop: 8 }}>
                <span style={{ width: `${Math.round(lvl.progress * 100)}%` }} />
              </div>
            </div>
            <div className="stat">
              <div className="value">🔥 {p.streak.count}</div>
              <div className="label">day streak - finish a quiz daily to keep it</div>
            </div>
            <div className="stat">
              <div className="value">✅ {totalPassed}</div>
              <div className="label">lessons passed</div>
            </div>
          </div>
        </section>

        {allShelves.map(({ category, books: shelfBooks }) => (
          <section className="shelf" key={category.id} aria-labelledby={`shelf-${category.id}`}>
            <div className="section-head">
              <div className="shelf-title">
                <h2 id={`shelf-${category.id}`}>
                  <span className="shelf-emoji" aria-hidden="true">
                    {category.emoji}
                  </span>
                  {category.title}
                </h2>
                <p className="muted">{category.blurb}</p>
              </div>
              <span className="shelf-count muted">
                {shelfBooks.length > 0 ? plural(shelfBooks.length, 'book') : 'Soon'}
              </span>
            </div>

            {shelfBooks.length > 0 ? (
              <div className="books-grid">
                {shelfBooks.map((b) => (
                  <BookCard key={b.slug} book={b} progress={p} />
                ))}
              </div>
            ) : (
              <div className="shelf-soon">
                <span className="shelf-soon-emoji" aria-hidden="true">
                  {category.emoji}
                </span>
                <div>
                  <h3>
                    {category.title} is in the works
                    <span className="pill">Coming soon</span>
                  </h3>
                  <p className="muted">{category.teaser ?? category.blurb}</p>
                </div>
              </div>
            )}
          </section>
        ))}

        <Donate />

        <footer className="footer">
          <span>
            Progress is stored in your browser only.{' '}
            <button
              type="button"
              className="link"
              onClick={() => {
                if (confirm('Reset all progress, XP and streaks on this device?')) resetAll()
              }}
            >
              Reset progress
            </button>
          </span>
          <label className="row" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={p.settings.sound} onChange={(e) => setSound(e.target.checked)} /> Sound
            effects
          </label>
        </footer>
      </div>
    </main>
  )
}
