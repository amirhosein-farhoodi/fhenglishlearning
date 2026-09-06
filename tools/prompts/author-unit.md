# Authoring prompt: convert one raw unit into course JSON

You are converting **one unit** of an English grammar book into an interactive lesson for the
FH Language Learning app (React, no backend). Work carefully: the answer key in the raw file is
the source of truth for correct answers.

- **Input:** `content-src/<book-slug>/raw/unit-NNN.md`
  (three fenced blocks: lesson page, exercises page, answer key - produced by `tools/extract_book.py`)
- **Output:** `src/content/books/<book-slug>/units/unit-NNN.json`
  (must conform to `Unit` in `src/content/types.ts`; `NNN` is zero-padded to 3 digits)
- **Golden example:** `src/content/books/english-grammar-in-use/units/unit-001.json` - read it first
  and match its density and tone.

## 1. Unit header

```json
{
  "number": 12,
  "title": "for and since; when ... ? and how long ... ?",   // copy from book.json unitTitles
  "subtitle": "for two hours / since Monday",                // the short form, optional
  "summary": "Use for with a period of time and since with a point in time.",  // 1 sentence, learner-facing
  "lesson": [ ... ],
  "exercises": [ ... ]
}
```

## 2. Lesson blocks (4-8 blocks)

Follow the order of the book's sections (A, B, C, D ...). Paraphrase the explanation in clear,
friendly English (aim for 20-60 words of `text` per block) and **keep the book's example
sentences** - they are the heart of the lesson. 2-5 examples per block.

| Block | Use it for |
|---|---|
| `explain` | Default. `heading` (short), `text`, `examples[]` (`text`, optional `wrong`, optional `note`), optional `note`. |
| `compare` | When the book contrasts two forms side by side (present simple vs continuous, for vs since ...). Each side: `label`, optional `text`, `examples[]` (strings). |
| `table` | Form tables (I am / he is / they are ...) or word lists sorted into columns. |
| `tip` | A one-sentence memory aid or common-mistake warning. Max 2 per unit. |

Inline markup: `**bold**` the target grammar form in examples, `*italic*` for speaker labels
(`*A:* ... *B:* ...`) or emphasis, `~~wrong~~` inside text for incorrect forms. In `examples`,
put the incorrect alternative in `wrong` (without markup): `{ "text": "**I'm trying** to work.", "wrong": "I try" }`.

Rules:
- No references to pictures ("look at the picture", "in the photo") - the app has no images.
  Turn picture-based content into a described situation.
- No page/unit cross references ("see Unit 19"). Drop them.
- British spelling as in the book. Straight apostrophes `'`. Keep sentences short.

## 3. Exercises (8-12 items, at least 4 different types)

Build them from the **exercise page + answer key**, so every answer is guaranteed correct.
Convert each book exercise into the most natural interactive type:

| Book exercise | App type |
|---|---|
| "Put the verb into the correct form" / "Complete the sentences" | `fill_blank` (`hint` = the bracketed cue, e.g. `"(I / try)"`) |
| "Which sentence goes with which?" / match halves | `matching` |
| "Are these sentences OK? Correct them where necessary" | `true_false` (`explanation` = the corrected sentence) |
| "Choose the correct alternative" / underline the right form | `mcq` |
| "Write questions" / "Put the words in the right order" | `word_order` |
| Sort words by rule (countable/uncountable, for/since, -ing/to) | `categorize` |
| Sentences with picture prompts | rewrite the situation in words, then `fill_blank` or `mcq` |

Type rules:
- **fill_blank**: exactly one `___`. `answers` lists every accepted variant, contracted and full
  (`["I'm not listening", "I am not listening"]`). Blank = 1-4 words. If the book item has two
  blanks, split into two exercises or convert to `mcq`. Add `hint` whenever the book gives a cue.
- **mcq**: 3-4 distinct options; distractors are the typical wrong forms from the lesson.
- **true_false**: the statement is a full sentence the learner judges as correct/incorrect. Mix
  true and false. For false ones, `explanation` must contain the corrected sentence.
- **matching**: 4-6 pairs; left and right items must all be distinct and not trivially guessable.
- **word_order**: 5-10 chunks; short fixed phrases may stay together as one chunk
  (`"these days?"`). `answer` must equal the chunks joined with spaces (case/punctuation ignored).
  Add `alternatives` if another order is also correct.
- **categorize**: 2-3 categories, 6-8 items.
- Give `explanation` (one line, names the rule) to every `mcq`, `true_false` and `fill_blank`.
- Order: 2-3 easy items first, hardest last. Skip book items that need "your own ideas".
- Never invent an answer that is not supported by the key or the lesson text.

## 4. Save and verify

1. Write the JSON to `src/content/books/<book-slug>/units/unit-NNN.json` (UTF-8, 2-space indent).
2. Run `node tools/validate-content.mjs` - it must report 0 errors for your file.
3. Check: `number` matches the filename; `title` matches `book.json` -> `unitTitles`.
