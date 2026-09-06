import { useEffect, useRef, useState } from 'react'
import type { FillBlankExercise } from '../../content/types'
import { isCorrect } from '../../lib/answers'
import { renderInline } from '../../lib/markup'
import type { ExProps } from './solution'

export default function FillBlank({ exercise, onResult }: ExProps<FillBlankExercise>) {
  const [value, setValue] = useState('')
  const [state, setState] = useState<'idle' | 'correct' | 'wrong'>('idle')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // focus without scrolling the page on desktop; mobile users tap the field
    if (window.matchMedia('(pointer: fine)').matches) inputRef.current?.focus({ preventScroll: true })
  }, [exercise])

  const check = () => {
    if (state !== 'idle' || !value.trim()) return
    const ok = isCorrect(value, exercise.answers)
    setState(ok ? 'correct' : 'wrong')
    onResult(ok)
  }

  const [before, after] = exercise.prompt.split('___')
  const longest = Math.max(...exercise.answers.map((a) => a.length), 6)

  return (
    <div>
      <p className="q-prompt">Complete the sentence.</p>
      {exercise.hint && <p className="q-hint">Use: {renderInline(exercise.hint)}</p>}
      <div className="q-body">
        <p className="blank-sentence">
          {renderInline(before)}
          <input
            ref={inputRef}
            className={`blank-input ${state !== 'idle' ? state : ''}`}
            value={value}
            placeholder="type here"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={state !== 'idle'}
            style={{ width: `${Math.min(longest + 4, 34)}ch` }}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') check()
            }}
            aria-label="your answer"
          />
          {renderInline(after ?? '')}
        </p>
        {state === 'wrong' && (
          <div className="answer-reveal">
            Correct answer:
            {exercise.answers.slice(0, 3).map((a) => (
              <span key={a} className="pill">
                {a}
              </span>
            ))}
          </div>
        )}
      </div>
      {state === 'idle' && (
        <div className="q-actions">
          <button type="button" className="btn btn-primary" disabled={!value.trim()} onClick={check}>
            Check
          </button>
        </div>
      )}
    </div>
  )
}
