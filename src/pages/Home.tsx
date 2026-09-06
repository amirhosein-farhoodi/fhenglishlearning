import { Link } from 'react-router-dom'
import { availableUnits, books } from '../content/registry'
import { bookStats, levelFor, resetAll, setSound, useProgress } from '../lib/storage'

export default function Home() {
  const p = useProgress()
  const lvl = levelFor(p.xp)
  const totalPassed = Object.values(p.books).reduce(
    (n, b) => n + Object.values(b.units).filter((u) => u.status === 'passed').length,
    0,
  )

  return (
    <main className="page">
      <div className="container">
        <section className="hero">
          <p className="eyebrow">Welcome back</p>
          <h1>
            Learn English grammar, <em>one lesson</em> at a time.
          </h1>
          <p>
            Pick a book, read a short lesson, then prove it in a playful quiz. Your progress is saved on this device -
            no account needed.
          </p>
          <div className="stats-row">
            <div className="stat">
              <div className="value">
                Lv {lvl.level} <span className="muted" style={{ fontSize: '0.9rem', fontWeight: 500 }}>{lvl.title}</span>
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

        <div className="section-head">
          <h2>Choose a book</h2>
          <span className="muted" style={{ fontSize: '0.9rem' }}>
            {books.length} available
          </span>
        </div>

        <div className="books-grid">
          {books.map((b) => {
            const avail = availableUnits(b.slug)
            const s = bookStats(p, b, avail)
            const started = s.started > 0
            return (
              <Link key={b.slug} to={`/learn/${b.slug}`} className="book-card" style={{ ['--book' as string]: b.accent }}>
                <div className="book-cover">
                  {b.level && <span className="badge">{b.level}</span>}
                  <span aria-hidden="true">{b.coverEmoji}</span>
                </div>
                <div className="book-body">
                  <h3>{b.title}</h3>
                  {b.subtitle && <p className="muted" style={{ fontSize: '0.9rem' }}>{b.subtitle}</p>}
                  <p className="desc">{b.description}</p>
                  <div className="book-foot">
                    <div className="progress thin" title={`${s.passed} of ${s.total} lessons passed`}>
                      <span style={{ width: `${s.percent}%`, background: b.accent }} />
                    </div>
                    <span className="cta">{started ? `Continue · ${s.passed}/${s.total}` : `Start · ${s.available} lessons`}</span>
                  </div>
                </div>
              </Link>
            )
          })}
          <div className="add-book">
            <strong style={{ color: 'var(--ink)' }}>Add another book</strong>
            <span>
              Drop a PDF into <code>source-books/</code> and run <code>/add-book</code> in Claude Code, or follow{' '}
              <code>README.md</code>. New books appear here automatically.
            </span>
          </div>
        </div>

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
            <input type="checkbox" checked={p.settings.sound} onChange={(e) => setSound(e.target.checked)} /> Sound effects
          </label>
        </footer>
      </div>
    </main>
  )
}
