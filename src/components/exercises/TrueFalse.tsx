import { useState } from 'react'
import { langAttr } from '../../content/languages'
import type { TrueFalseExercise } from '../../content/types'
import { renderInline } from '../../lib/markup'
import { useTargetLang } from '../../lib/targetLang'
import type { ExProps } from './solution'

export default function TrueFalse({ exercise, onResult }: ExProps<TrueFalseExercise>) {
  const language = useTargetLang()
  const [choice, setChoice] = useState<boolean | null>(null)
  const fact = exercise.judge === 'fact'

  const pick = (v: boolean) => {
    if (choice !== null) return
    setChoice(v)
    onResult(v === exercise.answer)
  }

  const cls = (v: boolean) => {
    let c = 'option'
    if (choice !== null) {
      if (v === exercise.answer) c += ' correct'
      else if (v === choice) c += ' wrong'
    }
    return c
  }

  return (
    <div>
      <p className="q-prompt">{fact ? 'True or false?' : `Is this sentence correct ${language.name}?`}</p>
      <div className="q-body">
        <div className="statement" lang={langAttr(language)}>
          {renderInline(exercise.statement)}
        </div>
        <div className="tf">
          <button type="button" className={cls(true)} disabled={choice !== null} onClick={() => pick(true)}>
            {fact ? '✓ True' : '✓ Correct'}
          </button>
          <button type="button" className={cls(false)} disabled={choice !== null} onClick={() => pick(false)}>
            {fact ? '✗ False' : '✗ Incorrect'}
          </button>
        </div>
      </div>
    </div>
  )
}
