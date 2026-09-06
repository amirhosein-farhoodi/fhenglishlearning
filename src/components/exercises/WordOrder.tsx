import { useMemo, useState } from 'react'
import type { WordOrderExercise } from '../../content/types'
import { looseEquals, shuffleDifferent } from '../../lib/answers'
import { renderInline } from '../../lib/markup'
import { sfx } from '../../lib/sfx'
import type { ExProps } from './solution'

/** Tap chips to build the sentence; tap a placed chip to send it back. */
export default function WordOrder({ exercise, onResult, seed }: ExProps<WordOrderExercise>) {
  const chips = useMemo(
    () => shuffleDifferent(exercise.words.map((w, i) => ({ id: i, w })), seed),
    [exercise, seed],
  )
  const [placed, setPlaced] = useState<number[]>([])
  const [state, setState] = useState<'idle' | 'correct' | 'wrong'>('idle')

  const place = (id: number) => {
    if (state !== 'idle') return
    sfx.tap()
    setPlaced([...placed, id])
  }
  const unplace = (id: number) => {
    if (state !== 'idle') return
    sfx.tap()
    setPlaced(placed.filter((p) => p !== id))
  }

  const sentence = placed.map((id) => exercise.words[id]).join(' ')
  const complete = placed.length === exercise.words.length

  const check = () => {
    if (!complete || state !== 'idle') return
    const ok = [exercise.answer, ...(exercise.alternatives ?? [])].some((a) => looseEquals(a, sentence))
    setState(ok ? 'correct' : 'wrong')
    onResult(ok)
  }

  return (
    <div>
      <p className="q-prompt">{renderInline(exercise.prompt)}</p>
      <p className="q-hint">Tap the words in the right order.</p>
      <div className="q-body">
        <div className={`answer-line ${state !== 'idle' ? state : ''}`} aria-live="polite">
          {placed.length === 0 && <span className="placeholder">Your sentence will appear here…</span>}
          {placed.map((id) => (
            <button
              key={id}
              type="button"
              className={`chip-word ${state === 'idle' ? 'placed' : state}`}
              onClick={() => unplace(id)}
              disabled={state !== 'idle'}
            >
              {exercise.words[id]}
            </button>
          ))}
        </div>
        <div className="pool">
          {chips.map(({ id, w }) => (
            <button
              key={id}
              type="button"
              className={`chip-word ${placed.includes(id) ? 'ghost' : ''}`}
              onClick={() => place(id)}
              disabled={state !== 'idle' || placed.includes(id)}
              tabIndex={placed.includes(id) ? -1 : 0}
            >
              {w}
            </button>
          ))}
        </div>
        {state === 'wrong' && (
          <div className="answer-reveal">
            Correct: <span className="pill">{exercise.answer}</span>
          </div>
        )}
      </div>
      {state === 'idle' && (
        <div className="q-actions">
          <button type="button" className="btn btn-ghost" disabled={placed.length === 0} onClick={() => setPlaced([])}>
            Clear
          </button>
          <button type="button" className="btn btn-primary" disabled={!complete} onClick={check}>
            Check
          </button>
        </div>
      )}
    </div>
  )
}
