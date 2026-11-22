/**
 * The languages a book can teach.
 *
 * English is the app's own language - every explanation, button and instruction is written in
 * it - and the default, so English books leave `language` out of book.json. A book for another
 * language (on the "Other Languages" shelf) sets it, and this table then drives:
 *   - the language chip on its book card and course page,
 *   - the `lang` attribute on target-language text, so screen readers and read-aloud pronounce
 *     French as French instead of spelling it out with English rules,
 *   - the accent keys under typed answers, for learners without that keyboard layout.
 *
 * To add a language, append its code to LANGUAGE_CODES and an entry to LANGUAGES.
 * `npm run validate` reads LANGUAGE_CODES from this file, so a typo in book.json is caught.
 */

export const LANGUAGE_CODES = ['en', 'fr'] as const

export type LanguageCode = (typeof LANGUAGE_CODES)[number]

export interface Language {
  /** BCP 47 code, used as the HTML `lang` attribute. */
  code: LanguageCode
  /** Name in English, as the app talks about it ("French"). */
  name: string
  /** Name in the language itself ("Français"), shown next to the English name. */
  nativeName: string
  /** Locale handed to speech synthesis when picking a voice. */
  speechLang: string
  /**
   * Letters the learner may need to type that a US/UK keyboard lacks, in the order they are
   * offered. Empty for English.
   */
  accents: string[]
}

export const LANGUAGES: Record<LanguageCode, Language> = {
  en: { code: 'en', name: 'English', nativeName: 'English', speechLang: 'en-GB', accents: [] },
  fr: {
    code: 'fr',
    name: 'French',
    nativeName: 'Français',
    speechLang: 'fr-FR',
    // Most frequent first: é and è alone cover most of what a beginner types.
    accents: ['é', 'è', 'ê', 'à', 'â', 'ç', 'ù', 'û', 'ô', 'î', 'ï', 'ë', 'œ'],
  },
}

export const DEFAULT_LANGUAGE: LanguageCode = 'en'

export const isLanguageCode = (v: unknown): v is LanguageCode =>
  typeof v === 'string' && (LANGUAGE_CODES as readonly string[]).includes(v)

/** The language a book teaches, falling back to English. */
export const languageOf = (book: { language?: string } | undefined): Language =>
  LANGUAGES[isLanguageCode(book?.language) ? book.language : DEFAULT_LANGUAGE]

/**
 * The `lang` attribute for target-language text: undefined for English, which the page
 * already declares on <html>, so English books render exactly as before.
 */
export const langAttr = (language: Language): string | undefined =>
  language.code === DEFAULT_LANGUAGE ? undefined : language.code
