---
description: Add a new book (PDF) as a course. Usage: /add-book <path-to-pdf> <slug> <unit-count>
---

Add a new course to this project from a PDF book. Arguments given: `$ARGUMENTS`
(expected: path to the PDF, a URL-safe slug such as `essential-grammar-in-use`, and the number of units).
If any argument is missing, infer it from the PDF's Contents pages or ask.

Follow these steps exactly and report progress after each one.

1. **Stage the PDF.** Copy it to `source-books/<slug>.pdf` if it is not already there
   (this folder is git-ignored).

2. **Extract the units.** First check whether the PDF has a text layer:
   `pdftotext -f 20 -l 20 source-books/<slug>.pdf -` - if that prints nothing, it is a scan; go to 2b.

   2a. **Text PDF.** Run
   `python tools/extract_book.py source-books/<slug>.pdf --slug <slug> --units <N>`.
   It writes `content-src/<slug>/raw/unit-001.md ... unit-NNN.md`, `toc.json` and `pages.txt`.
   - If it cannot auto-detect the first unit page, open `content-src/<slug>/raw/pages.txt`, find the
     page where unit 1's explanation starts and rerun with `--first-page <pdf-page-number>`.
   - If the book has a different number of pages per unit, pass `--pages-per-unit`.
   - If a unit's exercises overflow onto an extra page, fixed pagination drifts and every later unit
     is wrong. Pass `--detect-headings` to find each unit by its "Unit / N Title" heading instead.
   - If the answer key uses a different heading style, pass `--key-marker` (a regex with one capture group for the unit number), or `--no-key`.
   - Spot-check 3 random unit files **including the last one**: each should contain the right lesson,
     its exercises and its own answer key. A key that belongs to a neighbouring unit means the
     pagination is off - fix it here, not later.

   2b. **Scanned PDF.** `pip install pymupdf`, then run
   `python tools/render_scanned_book.py source-books/<slug>.pdf --slug <slug> --units <N> --first-page <P> --check`
   and confirm the printed unit -> page mapping at both ends of the book. Scans often drop pages,
   which shifts every later unit; find the break with a contact sheet of page headers, list the
   missing units in `--skip-units`, and re-check. Then rerun without `--check`, adding
   `--key-pages <first>-<last>` and `--key-starts "<page>:<first unit on it>,..."` so each unit
   records which key image holds its answers. Output lands in `content-src/<slug>/pages/`.

3. **Fetch the cover.** Find the book's ISBN (usually on its copyright page) and download the cover
   to `public/covers/<slug>.jpg`, e.g.
   `curl -L -o public/covers/<slug>.jpg https://covers.openlibrary.org/b/isbn/<isbn>-L.jpg`.
   Open the file to check it is the right book and not a placeholder; if it is not, find the cover
   elsewhere or skip it (the app falls back to `coverEmoji`).

4. **Create the book metadata** at `src/content/books/<slug>/book.json` following `BookMeta` in
   `src/content/types.ts`: title, subtitle, author credit, level, a 1-2 sentence description, a
   `coverEmoji`, `cover` set to `/covers/<slug>.jpg`, an `accent` colour that is not already used by
   another book, `sections` copied from the book's Contents pages (every unit in exactly one
   section) and `unitTitles` for **every** unit.
   Also set `category` (an id from `src/content/categories.ts`) and `order` (its slot on that shelf,
   ascending). Ask the user where the book belongs if it is not obviously grammar. A shelf shows its
   "coming soon" teaser only while it has no books, so nothing else needs flipping.
   Use `content-src/<slug>/raw/toc.json` as a starting point but fix any garbled titles by hand -
   for a scanned book, read the Contents pages as images instead.

5. **Author the units.** For every extracted unit create
   `src/content/books/<slug>/units/unit-NNN.json` by following `tools/prompts/author-unit.md`
   precisely. This is the long step:
   - Do units in batches of about 10 per subagent (about 6 for a scanned book, since each unit
     costs several page images) and run several subagents in parallel.
   - Each subagent must first read `tools/prompts/author-unit.md`, `src/content/types.ts`, the book's
     `book.json` and the golden example
     `src/content/books/english-grammar-in-use/units/unit-001.json`, then author its batch and run
     `node tools/validate-content.mjs` before finishing.
   - Tell each subagent its exact unit range and that `title` must match `book.json` -> `unitTitles`
     character for character; the validator enforces it.
   - After all batches, run `node tools/validate-content.mjs` yourself and fix every error.

6. **Build and check.** Run `npm run validate` then `npm run build`. Start `npm run dev`, open the
   home page and confirm the new book card appears, the first lesson opens and its quiz works.
   No app code changes are needed: `src/content/registry.ts` discovers books with `import.meta.glob`.

7. **Summarise** what was added (book, which shelf, number of units authored, any units skipped and
   why) and remind the user to commit and push so Netlify deploys it. Units listed in `book.json`
   but not authored show as "Coming soon", so a book can ship incrementally.
