/**
 * Content schema for FH Language Learning.
 * Every book lives in src/content/books/<slug>/ as:
 *   book.json           -> BookMeta
 *   units/unit-001.json -> Unit   (one file per unit, zero-padded to 3 digits)
 *
 * Inline text markup (used in lesson text, examples, prompts):
 *   **bold**   highlight the target grammar form
 *   *italic*   emphasis / speaker labels
 *   ~~wrong~~  an incorrect form ("not ~~I try~~")
 *   ___        the blank in fill_blank prompts (exactly one per exercise)
 */

export interface BookSection {
  title: string
  units: number[]
}

export interface BookMeta {
  slug: string
  title: string
  subtitle?: string
  author?: string
  level?: string
  description: string
  coverEmoji: string
  /** Accent colour (hex) used for the book card and course theming. */
  accent: string
  sections: BookSection[]
  /** Unit number (as string) -> title. Lists every unit even if its JSON is not authored yet. */
  unitTitles: Record<string, string>
}

export interface Example {
  text: string
  /** The incorrect alternative, shown as "not ~~...~~". */
  wrong?: string
  note?: string
}

export interface CompareSide {
  label: string
  text?: string
  examples: string[]
}

export type LessonBlock =
  | {
      type: 'explain'
      heading?: string
      text: string
      examples?: Example[]
      note?: string
    }
  | {
      type: 'compare'
      heading?: string
      left: CompareSide
      right: CompareSide
      note?: string
    }
  | {
      type: 'table'
      heading?: string
      columns: string[]
      rows: string[][]
      note?: string
    }
  | {
      type: 'tip'
      text: string
    }

export interface McqExercise {
  type: 'mcq'
  prompt: string
  options: string[]
  /** Index into options. */
  answer: number
  explanation?: string
}

export interface TrueFalseExercise {
  type: 'true_false'
  /** A sentence the learner judges as correct (true) or incorrect (false). */
  statement: string
  answer: boolean
  /** Shown after answering; for false statements give the corrected sentence. */
  explanation?: string
}

export interface FillBlankExercise {
  type: 'fill_blank'
  /** Contains exactly one ___ placeholder. */
  prompt: string
  /** All accepted answers (case-insensitive; apostrophes and spacing normalised). */
  answers: string[]
  /** e.g. "(I / try)" or "(work)". */
  hint?: string
  explanation?: string
}

export interface MatchingExercise {
  type: 'matching'
  prompt: string
  /** 3-6 pairs. Right-hand items are shuffled in the UI. */
  pairs: { left: string; right: string }[]
}

export interface WordOrderExercise {
  type: 'word_order'
  prompt: string
  /** The words/chunks to arrange. The UI shuffles them. */
  words: string[]
  /** The correct sentence. */
  answer: string
  alternatives?: string[]
  explanation?: string
}

export interface CategorizeExercise {
  type: 'categorize'
  prompt: string
  /** 2-3 category labels. */
  categories: string[]
  /** 4-8 items; category is an index into categories. */
  items: { text: string; category: number }[]
}

export type Exercise =
  | McqExercise
  | TrueFalseExercise
  | FillBlankExercise
  | MatchingExercise
  | WordOrderExercise
  | CategorizeExercise

export type ExerciseType = Exercise['type']

export interface Unit {
  number: number
  title: string
  /** The grammar form in short, e.g. "I am doing". */
  subtitle?: string
  /** One sentence: what the learner will be able to do after this unit. */
  summary: string
  lesson: LessonBlock[]
  exercises: Exercise[]
  /** Percentage needed to pass. Default 70. */
  passScore?: number
}
