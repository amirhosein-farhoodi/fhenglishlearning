import { useEffect, useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import Donate from "../components/Donate";
import { ArrowRight } from "../components/Icons";
import type { CategoryId } from "../content/categories";
import { isCategoryId } from "../content/categories";
import { availableUnits, shelves } from "../content/registry";
import type { BookMeta } from "../content/types";
import { useAccount } from "../lib/auth";
import type { Progress } from "../lib/storage";
import {
  bookStats,
  levelFor,
  resetAll,
  setSound,
  useProgress,
} from "../lib/storage";
import { cloudEnabled } from "../lib/supabase";
import "../styles/mock-banner.css";

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

/** Which shelf tab was open last, so coming back to the home page doesn't reset it. */
const SHELF_KEY = "fhlanguagelearning:shelf";

function readStoredShelf(): CategoryId | null {
  try {
    const v = localStorage.getItem(SHELF_KEY);
    return isCategoryId(v) ? v : null;
  } catch {
    return null;
  }
}

function BookCard({ book, progress }: { book: BookMeta; progress: Progress }) {
  const avail = availableUnits(book.slug);
  const s = bookStats(progress, book, avail);
  const started = s.started > 0;
  return (
    <Link
      to={`/learn/${book.slug}`}
      className="book-card"
      style={{ ["--book" as string]: book.accent }}
    >
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
          <p className="muted" style={{ fontSize: "0.9rem" }}>
            {book.subtitle}
          </p>
        )}
        <p className="desc">{book.description}</p>
        <ul className="book-meta">
          <li>{plural(s.total, "lesson")}</li>
          <li>{plural(book.sections.length, "topic")}</li>
          <li>6 exercise types</li>
          {s.passed > 0 && <li className="on">{s.passed} passed</li>}
        </ul>
        <div className="book-foot">
          <div
            className="progress thin"
            title={`${s.passed} of ${s.total} lessons passed`}
          >
            <span style={{ width: `${s.percent}%`, background: book.accent }} />
          </div>
          <span className="cta">
            {started
              ? `Continue · ${s.passed}/${s.total}`
              : `Start · ${plural(s.available, "lesson")}`}
            <ArrowRight size={18} />
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function Home() {
  const p = useProgress();
  const { account } = useAccount();
  const lvl = levelFor(p.xp);
  const totalPassed = Object.values(p.books).reduce(
    (n, b) =>
      n + Object.values(b.units).filter((u) => u.status === "passed").length,
    0,
  );
  const allShelves = shelves();
  const categoryIds = allShelves.map((s) => s.category.id);

  const [activeId, setActiveId] = useState<CategoryId>(
    () => readStoredShelf() ?? categoryIds[0],
  );
  useEffect(() => {
    try {
      localStorage.setItem(SHELF_KEY, activeId);
    } catch {
      /* storage full or unavailable - the tab just won't be remembered */
    }
  }, [activeId]);

  const active =
    allShelves.find((s) => s.category.id === activeId) ?? allShelves[0];

  /** Roving-tabindex arrow-key navigation, per the ARIA tabs pattern. */
  function onTabKeyDown(e: KeyboardEvent<HTMLButtonElement>, id: CategoryId) {
    const idx = categoryIds.indexOf(id);
    let nextIdx = -1;
    if (e.key === "ArrowRight") nextIdx = (idx + 1) % categoryIds.length;
    else if (e.key === "ArrowLeft")
      nextIdx = (idx - 1 + categoryIds.length) % categoryIds.length;
    else if (e.key === "Home") nextIdx = 0;
    else if (e.key === "End") nextIdx = categoryIds.length - 1;
    if (nextIdx === -1) return;
    e.preventDefault();
    const next = categoryIds[nextIdx];
    setActiveId(next);
    document.getElementById(`shelf-tab-${next}`)?.focus();
  }

  return (
    <main className="page">
      <div className="container">
        <section className="hero">
          <p className="eyebrow">Welcome back</p>
          <h1>
            Learn English, <em>one lesson</em> at a time.
          </h1>
          <p>
            Pick a book, read a short lesson, then prove it in a playful quiz.
            Grammar, IELTS exam skills with the official recordings, and
            vocabulary next.{" "}
            {account
              ? "Your progress follows your account to every device."
              : cloudEnabled
                ? "Your progress is saved as you go - sign in to keep it on every device."
                : "Your progress is saved on this device, no account needed."}
          </p>
          <div className="stats-row">
            <div className="stat">
              <div className="value">
                Lv {lvl.level}{" "}
                <span
                  className="muted"
                  style={{ fontSize: "0.9rem", fontWeight: 500 }}
                >
                  {lvl.title}
                </span>
              </div>
              <div className="label">
                {p.xp} XP · {lvl.need - lvl.current} to next level
              </div>
              <div className="progress thin" style={{ marginTop: 8 }}>
                <span style={{ width: `${Math.round(lvl.progress * 100)}%` }} />
              </div>
            </div>
            <div className="stat">
              <div className="value">🔥 {p.streak.count}</div>
              <div className="label">
                day streak - finish a quiz daily to keep it
              </div>
            </div>
            <div className="stat">
              <div className="value">✅ {totalPassed}</div>
              <div className="label">lessons passed</div>
            </div>
          </div>
        </section>

        <div className="shelf-tabs" role="tablist" aria-label="Book categories">
          {allShelves.map(({ category, books: shelfBooks }) => {
            const isActive = category.id === active.category.id;
            return (
              <button
                key={category.id}
                type="button"
                role="tab"
                id={`shelf-tab-${category.id}`}
                aria-selected={isActive}
                aria-controls={`shelf-panel-${category.id}`}
                tabIndex={isActive ? 0 : -1}
                className={`shelf-tab${isActive ? " active" : ""}`}
                onClick={() => setActiveId(category.id)}
                onKeyDown={(e) => onTabKeyDown(e, category.id)}
              >
                <span className="shelf-tab-icon" aria-hidden="true">
                  {category.emoji}
                </span>
                <span className="shelf-tab-text">
                  <span className="shelf-tab-title">{category.title}</span>
                  <span className="shelf-tab-count">
                    {shelfBooks.length > 0
                      ? plural(shelfBooks.length, "book")
                      : "Coming soon"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {active && (
          <section
            className="shelf"
            role="tabpanel"
            id={`shelf-panel-${active.category.id}`}
            aria-labelledby={`shelf-tab-${active.category.id}`}
          >
            <div className="section-head">
              <div className="shelf-title">
                <h2>
                  <span className="shelf-emoji" aria-hidden="true">
                    {active.category.emoji}
                  </span>
                  {active.category.title}
                </h2>
                <p className="muted">{active.category.blurb}</p>
              </div>
              <span className="shelf-count muted">
                {active.books.length > 0
                  ? plural(active.books.length, "book")
                  : "Soon"}
              </span>
            </div>

            {active.category.id === "ielts" && (
              <Link to="/ielts-mock" className="mock-banner">
                <span className="mock-banner-icon" aria-hidden="true">
                  ⏱️
                </span>
                <span className="mock-banner-text">
                  <span className="mock-banner-title">
                    IELTS Mock Test <span className="pill">New</span>
                  </span>
                  <span className="muted">
                    Full-length Listening and Reading papers, each sat on its
                    own under real exam timing in the computer-delivered
                    layout, with a band score at the end. A different paper
                    every time.
                  </span>
                </span>
                <span className="cta">
                  Take a test <ArrowRight size={18} />
                </span>
              </Link>
            )}

            {active.books.length > 0 ? (
              <div className="books-grid">
                {active.books.map((b) => (
                  <BookCard key={b.slug} book={b} progress={p} />
                ))}
              </div>
            ) : (
              <div className="shelf-soon">
                <span className="shelf-soon-emoji" aria-hidden="true">
                  {active.category.emoji}
                </span>
                <div>
                  <h3>
                    {active.category.title} is in the works
                    <span className="pill">Coming soon</span>
                  </h3>
                  <p className="muted">
                    {active.category.teaser ?? active.category.blurb}
                  </p>
                </div>
              </div>
            )}
          </section>
        )}

        <Donate />

        <footer className="footer">
          <span>
            {account
              ? "Progress is saved to your account."
              : cloudEnabled
                ? "Progress is stored in this browser - sign in to save it to your account."
                : "Progress is stored in your browser only."}{" "}
            <button
              type="button"
              className="link"
              onClick={() => {
                const where = account
                  ? "on your account, on every device"
                  : "on this device";
                if (confirm(`Reset all progress, XP and streaks ${where}?`))
                  resetAll();
              }}
            >
              Reset progress
            </button>
          </span>
          <label className="row" style={{ cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={p.settings.sound}
              onChange={(e) => setSound(e.target.checked)}
            />{" "}
            Sound effects
          </label>
        </footer>
      </div>
    </main>
  );
}
