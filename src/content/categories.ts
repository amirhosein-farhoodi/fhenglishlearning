/**
 * The shelves on the home page.
 *
 * Every book declares a `category` in its book.json (see BookMeta in ./types). Categories are
 * rendered in the order below, so this array - not the book folders - decides what the home page
 * looks like. A category that has no books yet shows a "coming soon" teaser instead of a grid;
 * drop the first book into it and the grid appears on its own.
 */

export const CATEGORY_IDS = ['grammar', 'vocabulary', 'listening'] as const

export type CategoryId = (typeof CATEGORY_IDS)[number]

export interface Category {
  id: CategoryId
  title: string
  /** One line under the heading: what this shelf teaches. */
  blurb: string
  emoji: string
  /** Shown in the teaser panel while the shelf has no books. */
  teaser?: string
}

export const CATEGORIES: Category[] = [
  {
    id: 'grammar',
    title: 'Grammar',
    blurb: 'Three books, beginner to advanced - work up through them or jump straight to your level.',
    emoji: '📘',
  },
  {
    id: 'vocabulary',
    title: 'Vocabulary',
    blurb: 'Build the words you actually need, in topic sets with spaced practice.',
    emoji: '🗂️',
    teaser: 'Word sets by topic and level, with the same quiz types you already know.',
  },
  {
    id: 'listening',
    title: 'Listening',
    blurb: 'Train your ear on real speech - short clips, then questions on what you heard.',
    emoji: '🎧',
    teaser: 'Short audio clips with comprehension questions, gap-fills and dictation.',
  },
]

/** Books with a missing or unrecognised category land here. */
export const DEFAULT_CATEGORY: CategoryId = 'grammar'

export const isCategoryId = (v: unknown): v is CategoryId =>
  typeof v === 'string' && (CATEGORY_IDS as readonly string[]).includes(v)
