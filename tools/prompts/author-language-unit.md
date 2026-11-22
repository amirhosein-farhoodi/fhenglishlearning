# Authoring prompt: a lesson from a foreign-language course book

For books on the **Other Languages** shelf (`"category": "languages"`, `"language": "fr"` ...).
Read `tools/prompts/author-unit.md` first: every rule there still applies (schema, block types,
exercise type rules, "answerable from the screen", validation). This file adds what is different
when the learner is an English speaker learning another language.

- **Input:** `content-src/<slug>/raw/unit-NNN.md` (one book unit, every page, labelled by PDF page)
- **Output:** `src/content/books/<slug>/units/unit-NNN.json` - one or more app units per book unit,
  as `book.json` lays them out
- **Golden examples:** `src/content/books/vite-et-bien-1/units/unit-001.json` (situations and
  vocabulary) and `unit-002.json` (grammar). Read both before writing anything and match their
  density, tone and markup.

## How a book unit becomes lessons

Course books like *Vite et Bien* run one theme over ~10 pages: dialogues, key expressions,
vocabulary, culture notes, a grammar section, then a long run of activities. One app lesson cannot
hold that, so each book unit `U` becomes **two** app units:

| App unit | Title in `book.json` | Lesson covers | Quiz draws on |
|---|---|---|---|
| `2U - 1` | the situation ("Ordering at the café") | dialogues, *expressions-clés*, vocabulary, *civilisation* | comprehension, vocabulary and communication activities |
| `2U` | the grammar ("Avoir, articles and the negative") | the grammar section, point by point | the grammar activities |

`title` must match `book.json` -> `unitTitles` character for character.

## Language of the page

- **Everything the app says is English**: headings, explanation `text`, `note`s, tips, prompts,
  `explanation`s, category labels. The learner is a beginner; a French instruction they cannot read
  is a question they cannot answer.
- **Everything the learner studies is French**: examples, dialogue lines, statements, answers,
  word-order chips, the sentences in `fill_blank`.
- Gloss new French in English. In `examples`, put the meaning in `note`
  (`{ "text": "**Je voudrais** un café, s'il vous plaît.", "note": "I'd like a coffee, please." }`).
  Gloss every example in a situations lesson; in a grammar lesson, gloss where the meaning is not
  obvious from the explanation.
- Tables of forms are welcome (`je suis / tu es / il est ...`): a verb table is the clearest way to
  show a conjugation. Add an English column only when it helps.
- Speaker labels in italics: `*Le serveur :* Et comme boisson ?`

## Typography

- Write French properly: every accent (é è ê à â ç ù û ô î ï ë œ), `œ` in *sœur*, *œuf*.
  The app grades typed answers accent-tolerantly but always shows the correct spelling.
- French puts a space before `? ! : ;` - keep it, as the book does (`Ça va ?`). Answer checking
  ignores that space, so it never costs a point.
- Straight apostrophe `'` (`l'eau`, `j'ai`, `s'il vous plaît`), never `’`.
- Guillemets `« »` are fine inside text.
- Bold (`**...**`) marks the form being taught - the verb ending, the article, the expression.

## Answers: this book has no key

There is no answer key, so **you** are the key. That raises the bar:

- Only use an item when it has **one clearly right answer** that follows from the lesson or the
  dialogue on screen. Skip open items ("répondez librement", "à vous !", "imaginez").
- `fill_blank.answers` lists **every** correct variant: with and without elision where both are
  possible, both genders where the sentence allows, inversion and `est-ce que` forms for questions,
  `ne ... pas` and spoken `pas` only if the lesson teaches both.
- Do not test a difference of accent alone with `fill_blank` (*a / à*, *ou / où*, *du / dû*): the
  typed check forgives accents. Use `mcq` for those.
- `word_order`: French chips keep hyphenated and elided groups whole (`"allez-vous"`, `"s'il vous plaît"`,
  `"qu'est-ce que"`). Add `alternatives` when French allows another order.
- Double-check gender, agreement, and every past participle. A wrong answer in a beginner course
  teaches the mistake.

## Exercises

10-12 per unit, at least 4 types, easy to hard. Convert the book's activities:

| Book activity | App type |
|---|---|
| *Vrai ou faux ?* about a dialogue | `true_false` with `"judge": "fact"` and the relevant dialogue lines in `context` (`"label": "From the dialogue"`) |
| *Complétez* / *Mettez le verbe au présent* | `fill_blank`, `hint` = the infinitive or cue, e.g. `"(avoir)"` |
| *Choisissez la bonne réponse* | `mcq` |
| *Associez* / match questions and answers | `matching` (French left, French or English right) |
| *Remettez dans l'ordre* | `word_order` |
| Sort words (masculine/feminine, *tu/vous*, polite/familiar) | `categorize` |
| Grammar-correctness ("Is this sentence correct French?") | `true_false` (default `judge`), corrected sentence in `explanation` |
| Crosswords, word searches, pictures | rebuild as `matching` or `mcq` from the words they practise, or skip |

- `context` quotes the French lines a question is about - the app shows no dialogue page, and
  **there is no audio**: turn *Réécoutez* / *Écoutez* activities into reading questions on the quoted
  text. Never write "listen".
- An `mcq` that asks what something means can have English options; one that asks for the right
  French has French options.
- `explanation` (English) names the rule: *"Avoir: nous **avons**, vous **avez**."*

## Copyright

Paraphrase the book's explanations in your own English. Quote dialogue lines only as short extracts
a question needs (a few lines), not whole dialogues; you may write your own short exchanges in the
same situation instead.

## Save and verify

1. Write each unit as UTF-8 JSON, 2-space indent, `"number"` matching the filename.
2. `node tools/validate-content.mjs` - 0 errors for your files.
