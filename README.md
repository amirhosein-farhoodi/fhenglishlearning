# FH Language Learning

A gamified English-learning web app. Pick a book, read a short lesson, then prove it in a quiz
with six interactive exercise types. Everything (progress, XP, streaks) is stored in the browser's
`localStorage` - there is no backend.

Currently included: **English Grammar in Use** (145 units, based on Raymond Murphy's book, 5th edition).

## Features

- **Book -> Course -> Lesson -> Quiz** flow, with a course map grouped by section.
- **Lesson reader** that reveals the explanation step by step (or all at once), with examples, comparisons, tables and tips.
- **Six exercise types:** multiple choice, correct/incorrect, fill in the blank, connect the pairs
  (draw lines), build the sentence (word order) and sort into groups.
- **Gamification:** XP per correct answer, pass and perfect bonuses, 1-3 stars per unit, levels, a daily
  streak, confetti and sound effects (toggle on the home page).
- **When you fail a quiz** you get three ways forward: review the lesson, see the answers, or move on
  to the next lesson (plus "try again").
- **Offline-friendly, no accounts.** Reset progress from the home page footer.
- Responsive, light/dark aware, keyboard-accessible.

## Tech

Vite + React 18 + TypeScript, React Router, framer-motion, canvas-confetti. Plain CSS with design tokens.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run validate   # check all course content JSON
```

## Deploy to Netlify

`netlify.toml` is included (build `npm run build`, publish `dist/`, SPA redirect, Node 20).
Push the repo to GitHub/GitLab, click **Add new site -> Import an existing project** in Netlify,
pick the repo and deploy. Every push redeploys.

## Project layout

```
src/
  content/
    types.ts                 # content schema (BookMeta, Unit, LessonBlock, Exercise)
    registry.ts              # auto-discovers books with import.meta.glob
    books/<slug>/book.json   # book metadata: sections + unit titles
    books/<slug>/units/unit-001.json ... one JSON per unit (lesson + exercises)
  components/                # header, lesson blocks, exercise widgets
  pages/                     # Home, Course, Lesson, Quiz, Review
  lib/                       # localStorage progress store, answer checking, markup, sfx
tools/
  extract_book.py            # PDF -> per-unit raw text (needs pdftotext / poppler)
  validate-content.mjs       # content validator (npm run validate)
  prompts/author-unit.md     # the prompt used to turn raw text into unit JSON
.claude/commands/add-book.md # Claude Code slash command: /add-book <pdf> <slug> <units>
content-src/<slug>/raw/      # extraction output (git-ignored, regenerate any time)
source-books/                # put PDFs here (git-ignored)
```

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

1. Put the PDF in `source-books/` and run
   `python tools/extract_book.py source-books/my-book.pdf --slug my-book --units 120`
   (requires `pdftotext` from poppler on your PATH). This writes
   `content-src/my-book/raw/unit-001.md ...`, each with the lesson page, exercise page and answer key.
   Use `--first-page`, `--pages-per-unit`, `--key-marker` or `--no-key` if the book's layout differs.
2. Create `src/content/books/my-book/book.json` (schema: `BookMeta` in `src/content/types.ts`).
3. For each raw unit, write `src/content/books/my-book/units/unit-NNN.json` by following
   `tools/prompts/author-unit.md` (paste the prompt plus the raw unit into any capable LLM, or write it by hand).
   `unit-001.json` of the grammar book is the golden example.
4. `npm run validate` until it reports 0 errors, then `npm run build`.

Units listed in `book.json` but not yet authored show as "Coming soon" in the course map, so a book
can be published incrementally.

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
