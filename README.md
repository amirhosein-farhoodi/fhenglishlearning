# FH Language Learning

A gamified English-learning web app. Pick a book, read a short lesson, then prove it in a quiz
with six interactive exercise types. Everything (progress, XP, streaks) is stored in the browser's
`localStorage` - there is no backend.

Any English-learning book can become a course - grammar, vocabulary, phrasal verbs, exam practice.
Books are grouped into shelves on the home page. Currently:

**Grammar** (in learning order)

| # | Book | Level | Units |
|---|---|---|---|
| 1 | Essential Grammar in Use | Elementary - A1/A2 | 115 (based on Raymond Murphy, 3rd edition) |
| 2 | English Grammar in Use | Intermediate - B1/B2 | 145 (based on Raymond Murphy, 5th edition) |
| 3 | Advanced Grammar in Use | Advanced - C1/C2 | 100 (based on Martin Hewings, 3rd edition) |

**Vocabulary** and **Listening** are declared but have no books yet, so the home page shows them as
"in the works". Adding the first book with that `category` is all it takes to turn the shelf live -
see [Shelves (categories)](#shelves-categories).

## Features

- **Shelf -> Book -> Course -> Lesson -> Quiz** flow, with a course map grouped by section.
- **Lesson reader** that reveals the explanation step by step (or all at once), with examples, comparisons, tables and tips.
- **Six exercise types:** multiple choice, correct/incorrect, fill in the blank, connect the pairs
  (draw lines), build the sentence (word order) and sort into groups.
- **Gamification:** XP per correct answer, pass and perfect bonuses, 1-3 stars per unit, levels, a daily
  streak, confetti and sound effects (toggle on the home page).
- **When you fail a quiz** you get three ways forward: review the lesson, see the answers, or move on
  to the next lesson (plus "try again").
- **Offline-friendly, no accounts.** Reset progress from the home page footer.
- **Optional tip jar** on the home page: USDT on Ethereum (sent straight from MetaMask) or USDT on
  TRON (TronLink, or copy the address for any TRC-20 wallet).
- Responsive, light/dark aware, keyboard-accessible.

## Tech

Vite + React 18 + TypeScript, React Router, framer-motion, canvas-confetti. Plain CSS with design tokens.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run validate   # check all course content JSON
```

## Design system

The visual language follows [`../design-system.md`](../design-system.md) - a Udemy-style
"modern classroom whiteboard with violet ink". Everything lives in
`src/styles/global.css`, in two layers:

- **Primitives** (`--c-*`) are the palette itself: the cool ink scale
  (Ink -> Porcelain), Aubergine violet, Ember, and the two functional state
  colours. These are the only place a raw hex belongs.
- **Semantics** (`--ink`, `--surface`, `--line`, `--accent`, `--r-card`, ...) are
  what components reference. Dark mode remaps only this layer, so no component
  rule needs a dark-mode override.

**Light is the default and the OS setting is ignored**, so the app looks the same
on every machine. Dark mode is opt in: the header toggle writes
`settings.theme` to localStorage, and `applyTheme()` in `src/lib/storage.ts`
stamps `data-theme="dark"` on `<html>`. An inline script in `index.html` reads
the same value before first paint, so there is no flash of the wrong theme.

**Two content measures.** `--measure-page` (900px) for the home and course map,
`--measure-reading` (720px) for the lesson, quiz and answer key, where prose needs
a shorter line. The active one lives in `--container-max` on the app root
(`.app.reading`), so the header and the fixed bars share the page's column edge
instead of running wider than the text.

The rules worth knowing before you add a component:

| Rule | Why |
|---|---|
| Violet is an **outline**, never a flooded fill | `.btn-primary` is a 1.5px Aubergine border on transparent. `.btn-dark` (Solid Dark Action) is the loud one, for tinted or dark surfaces where an outline would lose contrast. |
| Border before shadow | Cards use a 1px `--line`. `--shadow-lift` is the one shadow, and only on hover. |
| No gradients | The surface language is flat. The only `*-gradient()` left is the course progress ring, where the sweep is data. |
| `.page` fades but never transforms | A transform there would become the containing block for the `position: fixed` action bar and feedback sheet, unpinning them from the viewport. The slide lives on `.block`. |
| One radius per component class | `--r-input` 4px, `--r-card` 8px (cards *and* buttons), `--r-lg` 16px, `--r-xl` 24px, `--r-pill`. |
| One type family | Inter stands in for Udemy Sans, weights 300/400/500/700 on the 12/14/16/18/24/32px scale. `--text-display` is the single step above it, for the home hero only. |
| Two chromatic accents | Aubergine + Ember. Green and red exist only as answer feedback, never decoration. Ember fails AA as text, so text uses `--ember-ink`. |

Each book still carries an `accent` in its `book.json`, but it now appears only as
a small mark - the level badge, the progress fill, the course rail and the card CTA -
so the three books read as a level progression (teal -> Aubergine -> Ember) rather
than three competing brand colours.

## Deploy to Netlify

`netlify.toml` is included (build `npm run build`, publish `dist/`, SPA redirect, Node 20).
Push the repo to GitHub/GitLab, click **Add new site -> Import an existing project** in Netlify,
pick the repo and deploy. Every push redeploys.

## Project layout

```
src/
  content/
    types.ts                 # content schema (BookMeta, Unit, LessonBlock, Exercise)
    categories.ts            # the home-page shelves (Grammar, Vocabulary, Listening)
    registry.ts              # auto-discovers books with import.meta.glob, groups them by shelf
    books/<slug>/book.json   # book metadata: category + order, sections, unit titles
    books/<slug>/units/unit-001.json ... one JSON per unit (lesson + exercises)
  components/                # header, lesson blocks, exercise widgets
  pages/                     # Home, Course, Lesson, Quiz, Review
  lib/                       # localStorage progress store, answer checking, markup, sfx
tools/
  extract_book.py            # text PDF -> per-unit raw text (needs pdftotext / poppler)
  render_scanned_book.py     # scanned PDF -> per-unit page images (needs pymupdf)
  make_icons.py              # logo-transparent.png -> header mark (needs pillow)
  validate-content.mjs       # content validator (npm run validate)
  prompts/author-unit.md     # the prompt used to turn a raw unit into unit JSON
.claude/commands/add-book.md # Claude Code slash command: /add-book <pdf> <slug> <units>
content-src/<slug>/raw/      # text extraction output (git-ignored, regenerate any time)
content-src/<slug>/pages/    # page images for scanned books (git-ignored, regenerate any time)
source-books/                # put PDFs here (git-ignored)
```

## Logo and icons

`public/icon.png` is the app icon. `index.html` points at it directly for both the browser tab
and the iOS home screen, so replacing that one file changes the icon everywhere.

`public/logo-transparent.png` is the master header artwork. It is ~1150px square and close to a
megabyte, so it is never shipped directly - `tools/make_icons.py` writes the small,
alpha-preserving derivative that the app actually loads:

```bash
pip install pillow
python tools/make_icons.py
```

| File | Size | Used by |
|---|---|---|
| `public/icon.png` | 959px | browser tab + iOS home screen (`index.html`) |
| `public/logo-mark.png` | 96px | the header mark (`.brand-mark`, drawn at 38px) |

Replace the master and re-run the script; the filenames in `index.html` stay the same. The script
trims the transparent margin before resizing, so the mark fills its box at small sizes.

## Donations

The tip jar lives in `src/components/Donate.tsx`. To change the wallets, edit the `NETWORKS`
array at the top of that file (address, USDT token contract, decimals). Amounts are the `AMOUNTS`
array. Ethereum uses an ERC-20 `transfer` through MetaMask; TRON uses TronLink, because MetaMask
cannot send TRON. Copying the address always works with any wallet.

## Shelves (categories)

The home page renders one shelf per entry in `src/content/categories.ts`, in that file's order.
Each book picks its shelf in `book.json`:

```jsonc
{
  "category": "grammar",   // must be a CATEGORY_IDS value from categories.ts
  "order": 1               // position within the shelf, ascending; ties fall back to title
}
```

A category with no books renders an "in the works" teaser (its `teaser` line) instead of a grid,
which is how Vocabulary and Listening appear today. There is no separate flag to flip: add a book
with that `category` and the grid appears. To add a whole new shelf, append an id to `CATEGORY_IDS`
and an entry to `CATEGORIES` - `npm run validate` reads that file, so it will reject a book whose
`category` is not in it, and will also flag two books claiming the same `order` on one shelf.

Books with no `category` fall back to `DEFAULT_CATEGORY` (a warning, not an error), so a
half-configured book never vanishes from the home page.

## Adding another book

The app has no hard-coded book list. Any folder under `src/content/books/` with a valid
`book.json` and `units/unit-NNN.json` files becomes a course automatically.

### The quick way (Claude Code)

```
/add-book source-books/my-book.pdf my-book 120
```

The command (see `.claude/commands/add-book.md`) extracts the PDF, builds `book.json`,
fans out the unit authoring to subagents using `tools/prompts/author-unit.md`, validates and builds.

### The manual way

1. Put the PDF in `source-books/` and its cover image in `public/covers/`, then run
   `python tools/extract_book.py source-books/my-book.pdf --slug my-book --units 120`
   (requires `pdftotext` from poppler on your PATH). This writes
   `content-src/my-book/raw/unit-001.md ...`, each with the lesson page, exercise page and answer key.
   Use `--first-page`, `--pages-per-unit`, `--key-marker` or `--no-key` if the book's layout differs.
   Pass `--detect-headings` to locate each unit by its "Unit / N Title" heading instead of assuming
   a fixed page count - needed when a unit's exercises overflow onto an extra page, which otherwise
   makes every later unit drift out of step.
   **If the PDF is a scan** (`pdftotext` returns nothing), use
   `python tools/render_scanned_book.py` instead - see [Scanned books](#scanned-books).
2. Create `src/content/books/my-book/book.json` (schema: `BookMeta` in `src/content/types.ts`).
   Set `category` and `order` so it lands on the right shelf, and `cover` to `/covers/my-book.jpg`
   so the real book cover shows on the home page. A cover can be lifted straight out of the PDF's
   first page with pymupdf if the book's own cover is page 1.
3. For each raw unit, write `src/content/books/my-book/units/unit-NNN.json` by following
   `tools/prompts/author-unit.md` (paste the prompt plus the raw unit into any capable LLM, or write it by hand).
   `unit-001.json` of the grammar book is the golden example.
4. `npm run validate` until it reports 0 errors, then `npm run build`.

Units listed in `book.json` but not yet authored show as "Coming soon" in the course map, so a book
can be published incrementally.

## Scanned books

Some PDFs are page images with no text layer, so `pdftotext` (and therefore `extract_book.py`)
returns nothing. `tools/render_scanned_book.py` renders each unit's pages to PNGs instead, which
an LLM or a human can read directly:

```bash
pip install pymupdf
python tools/render_scanned_book.py source-books/my-book.pdf --slug my-book --units 115 \
    --first-page 13 --key-pages 282-308 --check     # print the unit -> page mapping, render nothing
```

Units run two pages each (left = explanation, right = exercises) in book order, so a unit's first
page is `--first-page` plus two pages for every unit *present* before it. Always confirm the
mapping with `--check` at both ends of the book before rendering: if a scan is missing pages, every
later unit shifts. List those units in `--skip-units` - they then consume no pages, get no output,
and every unit after them stays aligned. Leave them unauthored; the course map shows them as
"Coming soon".

`--key-pages` renders the answer key, and `--key-starts "282:1,283:4,..."` (PDF page : first unit
on it) records in `index.json` which key page holds each unit's answers, so whoever authors a unit
knows exactly which images to read.

This is how **Essential Grammar in Use** is set up. Its scan is missing unit 27 (`will/shall 1`),
hence the `--skip-units 27`; the exact command is in the script's docstring.

## Content schema in one screen

```jsonc
{
  "number": 1,
  "title": "Present continuous (I am doing)",
  "subtitle": "I am doing",
  "summary": "Use the present continuous for ...",
  "passScore": 70,
  "lesson": [
    { "type": "explain", "heading": "...", "text": "...", "examples": [{ "text": "**I'm trying** to work.", "wrong": "I try" }] },
    { "type": "compare", "left": { "label": "...", "examples": ["..."] }, "right": { "label": "...", "examples": ["..."] } },
    { "type": "table", "columns": ["Subject", "Form"], "rows": [["I", "am"]] },
    { "type": "tip", "text": "..." }
  ],
  "exercises": [
    { "type": "mcq", "prompt": "...", "options": ["a", "b", "c"], "answer": 0, "explanation": "..." },
    { "type": "true_false", "statement": "...", "answer": false, "explanation": "..." },
    { "type": "fill_blank", "prompt": "She ___ to work.", "hint": "(drive)", "answers": ["is driving", "'s driving"] },
    { "type": "matching", "prompt": "...", "pairs": [{ "left": "...", "right": "..." }] },
    { "type": "word_order", "prompt": "...", "words": ["What", "are", "you", "doing?"], "answer": "What are you doing?" },
    { "type": "categorize", "prompt": "...", "categories": ["A", "B"], "items": [{ "text": "...", "category": 0 }] }
  ]
}
```

Inline markup: `**bold**` (target form), `*italic*`, `~~wrong~~`, and `___` for the blank.

## Note on content

Lesson texts are paraphrased summaries and the exercises are adapted from the source book for
personal study. The source PDFs are not committed to the repository.
