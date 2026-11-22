import type { Language } from '../content/languages'

/**
 * "FR French · Français" - marks a book that teaches a language other than English. Text, not a
 * flag emoji: flags do not render on Windows, and a language is not a country.
 */
export default function LanguageChip({ language }: { language: Language }) {
  return (
    <span className="lang-chip" title={`This course teaches ${language.name}`}>
      <span className="lang-code" aria-hidden="true">
        {language.code.toUpperCase()}
      </span>
      {language.name}
      <span className="lang-native" lang={language.code}>
        · {language.nativeName}
      </span>
    </span>
  )
}
