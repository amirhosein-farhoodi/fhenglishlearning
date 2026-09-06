import { useMemo, useState } from 'react'
import type { McqExercise } from '../../content/types'
import { renderInline } from '../../lib/markup'
import { shuffle } from '../../lib/answers'
import { sfx } from '../../lib/sfx'
import type { ExProps } from './solution'

export default function Mcq({ exercise, onResult, seed }: ExProps<McqExercise>) {
  const order = useMemo(() => shuffle(exercise.options.map((_, i) => i), seed), [exercise, seed])
  const [selected, setSelected] = useState<number | null>(null)
  const [checked, setChecked] = useState(false)

  const check = () => {
    if (selected === null || checked) return
    setChecked(true)
    onResult(selected === exercise.answer)
  }

  return (
    <div>
      <p className="q-prompt">{renderInline(exercise.prompt)}</p>
      <div className="q-body options" role="radiogroup">
        {order.map((idx, i) => {
          let cls = 'option'
          if (checked) {
            if (idx === exercise.answer) cls += ' correct'
            else if (idx === selected) cls += ' wrong'
          } else if (idx === selected) cls += ' selected'
          return (
            <button
              key={idx}
              type="button"
              role="radio"
              aria-checked={selected === idx}
              className={cls}
              disabled={checked}
              onClick={() => {
                sfx.tap()
                setSelected(idx)
              }}
            >
              <span className="key">{String.fromCharCode(65 + i)}</span>
              <span>{renderInline(exercise.options[idx])}</span>
            </button>
          )
        })}
      </div>
      {!checked && (
        <div className="q-actions">
          <button type="button" className="btn btn-primary" disabled={selected === null} onClick={check}>
            Check
          </button>
        </div>
      )}
    </div>
  )
}
