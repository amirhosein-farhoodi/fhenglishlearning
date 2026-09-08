import { Link } from "react-router-dom";
import { levelFor, setTheme, useProgress } from "../lib/storage";
import { Moon, Sun } from "./Icons";

export default function Header() {
  const p = useProgress();
  const lvl = levelFor(p.xp);
  const dark = p.settings.theme === "dark";
  return (
    <header className="header">
      <div className="container header-inner">
        <Link
          to="/"
          className="brand "
          aria-label="FH Language Learning - home"
        >
          {/* decorative: the link already carries the name for screen readers */}
          <img
            className="brand-mark"
            src="/logo-mark.png"
            alt=""
            width={38}
            height={38}
          />
          <span className="name">English Learning</span>
        </Link>
        <div className="header-stats">
          <span className="chip chip-fire" title="Daily streak">
            🔥 {p.streak.count}
          </span>
          <span
            className="chip chip-xp"
            title={`Level ${lvl.level} · ${lvl.current}/${lvl.need} XP to next level`}
          >
            ⭐ Lv {lvl.level}
            <span className="mini-bar">
              <span style={{ width: `${Math.round(lvl.progress * 100)}%` }} />
            </span>
          </span>
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme(dark ? "light" : "dark")}
            aria-pressed={dark}
            title={dark ? "Switch to light mode" : "Switch to dark mode"}
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {dark ? <Sun /> : <Moon />}
          </button>
        </div>
      </div>
    </header>
  );
}
