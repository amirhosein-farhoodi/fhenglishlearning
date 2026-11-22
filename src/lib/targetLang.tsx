import { createContext, useContext } from 'react'
import { Outlet, useParams } from 'react-router-dom'
import { LANGUAGES, languageOf, type Language } from '../content/languages'
import { getBook } from '../content/registry'

/**
 * The language the current book teaches. BookScope provides it for every /learn/:slug route, so
 * any component inside can mark target-language text (`lang`), offer accent keys or read an
 * example aloud without the book being threaded through every prop list.
 * Outside a book it is English, which leaves every English course exactly as it was.
 */
const TargetLangContext = createContext<Language>(LANGUAGES.en)

/** Layout route for /learn/:slug/* - the course map, lessons, quizzes and answer keys. */
export function BookScope() {
  const { slug } = useParams()
  return (
    <TargetLangContext.Provider value={languageOf(getBook(slug))}>
      <Outlet />
    </TargetLangContext.Provider>
  )
}

export const useTargetLang = () => useContext(TargetLangContext)
