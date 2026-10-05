/**
 * Content schema for the IELTS Mock Test (Academic module).
 *
 * Content lives in src/content/ielts-mock/ as:
 *   reading/p<slot>-<slug>.json   -> ReadingPassage  (slot 1, 2 or 3 = Passage 1/2/3 difficulty)
 *   writing/task1/<slug>.json     -> WritingTask1    (Academic Task 1: chart, table, process ...)
 *   writing/task2/<slug>.json     -> WritingTask2    (Task 2 essay)
 *
 * A Reading test is assembled at random from one passage per slot, so every passage must
 * stand alone. Slot 1 and slot 2 passages carry exactly 13 questions, slot 3 passages
 * exactly 14, so any combination adds up to the real test's 40.
 *
 * Text conventions
 *   - Passage text is plain prose. *italic* is allowed for titles of works and Latin names.
 *   - Completion gaps are written {1}, {2} ... numbered locally inside their group, in order.
 *   - `evidence` is copied VERBATIM from the passage (the validator checks it) - it is what
 *     the answer review quotes. NOT GIVEN items have no evidence; they use `note`.
 *
 * Run `npm run validate` after editing - it checks counts, word limits and evidence.
 */

/** One paragraph. `label` (A, B, C ...) is set on passages whose questions refer to paragraphs. */
export interface Paragraph {
  label?: string
  text: string
}

/** Shared by every question item: why the answer is what it is. */
export interface Explained {
  /** A verbatim span of the passage that proves the answer. */
  evidence?: string
  /** One sentence of explanation, mainly for NOT GIVEN / FALSE / distractor reasoning. */
  note?: string
}

/**
 * Word limit for a completion task, rendered in the exam's own wording, e.g.
 * { words: 2, number: true }  -> "Choose NO MORE THAN TWO WORDS AND/OR A NUMBER from the passage for each answer."
 * { words: 1, number: false } -> "Choose ONE WORD ONLY from the passage for each answer."
 */
export interface WordLimit {
  words: 1 | 2 | 3
  number: boolean
}

export interface CompletionAnswer extends Explained {
  /**
   * Every accepted answer. A parenthesised word is optional: "(the) harbour" accepts
   * "the harbour" and "harbour". List British and American spellings when both are fine.
   */
  accept: string[]
}

interface GroupBase {
  /** Optional extra instruction line, printed under the standard one (rarely needed). */
  extra?: string
}

/** TRUE / FALSE / NOT GIVEN - "Do the following statements agree with the information ...". */
export interface TfngGroup extends GroupBase {
  type: 'tfng'
  items: ({ statement: string; answer: 'TRUE' | 'FALSE' | 'NOT GIVEN' } & Explained)[]
}

/** YES / NO / NOT GIVEN - "... agree with the claims/views of the writer". */
export interface YnngGroup extends GroupBase {
  type: 'ynng'
  /** 'claims' or 'views' - the exam uses both wordings. */
  of: 'claims' | 'views'
  items: ({ statement: string; answer: 'YES' | 'NO' | 'NOT GIVEN' } & Explained)[]
}

/**
 * Matching headings. `headings` is the list of headings (rendered i, ii, iii ...);
 * there are always more headings than paragraphs asked. `answer` is an index into `headings`.
 */
export interface HeadingsGroup extends GroupBase {
  type: 'headings'
  headings: string[]
  items: ({ paragraph: string; answer: number } & Explained)[]
}

/**
 * Every "match the item to a lettered option" task:
 *   kind 'information'      - Which paragraph contains the following information? (options = paragraph letters)
 *   kind 'features'         - Match each statement with the correct person / place / date.
 *   kind 'sentence-endings' - Complete each sentence with the correct ending.
 */
export interface MatchingGroup extends GroupBase {
  type: 'matching'
  kind: 'information' | 'features' | 'sentence-endings'
  /** Heading of the options box, e.g. "List of Researchers". Not used for 'information'. */
  optionsTitle?: string
  /** For 'information' this is one entry per paragraph letter with empty text. */
  options: { key: string; text: string }[]
  /** Whether an option may be used more than once ("NB You may use any letter more than once"). */
  reuse: boolean
  /**
   * A plan, map or diagram shown above the items (Listening map labelling). A URL or a
   * path under public/, e.g. "/mock/listening/<test>/map.png". The options are its letters.
   */
  image?: string
  items: ({ text: string; answer: string } & Explained)[]
}

/** Multiple choice, one answer each: four options A-D in Reading, three (A-C) in Listening. */
export interface McqGroup extends GroupBase {
  type: 'mcq'
  items: ({ stem: string; options: string[]; answer: number } & Explained)[]
}

/**
 * "Choose TWO letters, A-E." One stem, several correct options; it fills as many
 * question numbers as there are correct answers and each correct letter scores one mark.
 */
export interface MultiGroup extends GroupBase, Explained {
  type: 'multi'
  stem: string
  options: string[]
  answers: number[]
}

/**
 * Gap-fill from the passage: sentences, summary, notes, table, flow-chart or short answers.
 * Gaps are {1} {2} ... in order across `lines` (or table cells, row by row). `answers[i]` is gap i+1.
 *   layout 'sentences' - each line is one sentence with a gap
 *   layout 'summary'   - lines are paragraphs of a summary
 *   layout 'notes'     - lines starting "# " are sub-headings, lines starting "- " are bullets
 *   layout 'flowchart' - each line is a box, drawn with arrows between them
 *   layout 'short'     - each line is a question ending with its gap (short-answer questions)
 *   layout 'table'     - uses `table` instead of `lines`
 */
export interface CompletionGroup extends GroupBase {
  type: 'completion'
  layout: 'sentences' | 'summary' | 'notes' | 'flowchart' | 'short' | 'table'
  limit: WordLimit
  /** Heading above the summary / notes / table, as in the exam. */
  title?: string
  lines?: string[]
  table?: { columns: string[]; rows: string[][] }
  /** "Answers may be given in any order" - e.g. "List THREE types of staff ...". */
  anyOrder?: boolean
  answers: CompletionAnswer[]
}

/** Summary completion choosing from a lettered box of words (A-H ...). Gaps are {1} {2} ... */
export interface SummaryBoxGroup extends GroupBase {
  type: 'summary-box'
  title?: string
  lines: string[]
  options: { key: string; text: string }[]
  answers: ({ answer: string } & Explained)[]
}

export type QuestionGroup =
  | TfngGroup
  | YnngGroup
  | HeadingsGroup
  | MatchingGroup
  | McqGroup
  | MultiGroup
  | CompletionGroup
  | SummaryBoxGroup

export type QuestionType = QuestionGroup['type']

export interface ReadingPassage {
  /** Same as the file name without .json, e.g. "p1-honey-bees". */
  id: string
  slot: 1 | 2 | 3
  title: string
  /** Optional standfirst under the title, e.g. "The story of how ...". */
  subtitle?: string
  /** One or two words for the history list, e.g. "Biology". */
  topic: string
  paragraphs: Paragraph[]
  groups: QuestionGroup[]
}

/* ------------------------------------------------------------------ Listening */

/**
 * One step of a part's timeline, as the candidate experiences it:
 *   play  - a stretch of the part's recording, `from`/`to` in seconds of that file
 *   read  - silent time to look at questions (`questions` are this part's own numbers, 1-based)
 *   check - silent time to check this part's answers
 * The durations copy the official recording, so a paper runs exactly as long as the real test.
 */
export type ListeningStep =
  | { kind: 'play'; from: number; to: number }
  | { kind: 'read'; seconds: number; questions: [number, number] }
  | { kind: 'check'; seconds: number }

/**
 * One Listening part. A paper is assembled at random from one part per slot, so files are
 * named p<slot>-<slug>.json and every part stands alone (its own audio, questions and timing).
 * Uses the same question groups as Reading; `note`/`evidence` quote the recording.
 */
export interface ListeningPart {
  /** Same as the file name without .json, e.g. "p2-summer-camp". */
  id: string
  /** Which part of the test this is (1-4) - also the file prefix. */
  part: 1 | 2 | 3 | 4
  /** Short name for the results, e.g. "Second-hand furniture". */
  title: string
  /** The situation, shown at the top of the part: "You will hear a telephone conversation about ...". */
  intro: string
  /** Where the material comes from, e.g. "British Council sample test". */
  source?: string
  /** The recording: a path under public/ or a URL. */
  audio: string
  steps: ListeningStep[]
  /** The recording transcript, one speaker turn per entry. Shown after the test. */
  transcript?: string[]
  groups: QuestionGroup[]
}

/* ------------------------------------------------------------------ Writing */

export interface Series {
  name: string
  values: (number | null)[]
}

export type Visual =
  | {
      type: 'line'
      title: string
      xLabels: string[]
      /** Axis label, e.g. "Millions of tonnes". */
      yLabel: string
      series: Series[]
    }
  | {
      type: 'bar'
      title: string
      categories: string[]
      yLabel: string
      series: Series[]
      /** Long category names read better as horizontal bars. */
      horizontal?: boolean
    }
  | {
      type: 'pie'
      title: string
      /** Values are percentages and add up to 100. */
      slices: { label: string; value: number }[]
    }
  | {
      type: 'table'
      title: string
      columns: string[]
      rows: string[][]
    }
  | {
      type: 'process'
      title: string
      steps: { label: string; detail?: string }[]
      /** A natural cycle (e.g. a life cycle) draws an arrow from the last step back to the first. */
      cycle?: boolean
    }
  | {
      type: 'map'
      title: string
      /**
       * A plan drawn on a 12 x 12 grid: each feature is a labelled rectangle.
       * x/y are the top-left corner, w/h the size, all in grid units (0-12).
       */
      features: { label: string; x: number; y: number; w: number; h: number; kind?: 'building' | 'green' | 'water' | 'road' }[]
    }

export interface WritingTask1 {
  id: string
  /** Main visual family, for variety in random selection. */
  kind: 'line' | 'bar' | 'pie' | 'table' | 'process' | 'map' | 'mixed'
  /** The first sentence of the task, e.g. "The graph below shows ...". */
  prompt: string
  visuals: Visual[]
  /** A band 8-9 model answer, 170-220 words, paragraphs separated by blank lines. */
  model: string
}

export interface WritingTask2 {
  id: string
  kind: 'opinion' | 'discussion' | 'advantages' | 'problem-solution' | 'two-part'
  topic: string
  /** The statement/background, printed in the box. */
  statement: string
  /** The question line(s) after the statement, e.g. "To what extent do you agree or disagree?". */
  question: string
  /** A band 8-9 model answer, 270-330 words, paragraphs separated by blank lines. */
  model: string
}
