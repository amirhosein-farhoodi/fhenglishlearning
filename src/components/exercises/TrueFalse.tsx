import { useState } from 'react'
import type { TrueFalseExercise } from '../../content/types'
import { renderInline } from '../../lib/markup'
import type { ExProps } from './solution'

export default function TrueFalse({ exercise, onResult }: ExProps<TrueFalseExercise>) {
  const [choice, setChoice] = useState<boolean | null>(null)

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
      <p className="q-prompt">Is this sentence correct English?</p>
      <div className="q-body">
        <div className="statement">{renderInline(exercise.statement)}</div>
        <div className="tf">
          <button type="button" className={cls(true)} disabled={choice !== null} onClick={() => pick(true)}>
            ✓ Correct
          </button>
          <button type="button" className={cls(false)} disabled={choice !== null} onClick={() => pick(false)}>
            ✗ Incorrect
          </button>
        </div>
      </div>
    </div>
  )
}
