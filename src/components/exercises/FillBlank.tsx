import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { langAttr } from '../../content/languages'
import type { FillBlankExercise } from '../../content/types'
import { checkTyped } from '../../lib/answers'
import { renderInline } from '../../lib/markup'
import { useTargetLang } from '../../lib/targetLang'
import type { ExProps } from './solution'

type State = 'idle' | 'correct' | 'accents' | 'wrong'

/** Keep focus (and the caret) in the input when an accent key is pressed. */
const keepFocus = (e: MouseEvent | PointerEvent) => e.preventDefault()

export default function FillBlank({ exercise, onResult }: ExProps<FillBlankExercise>) {
  const language = useTargetLang()
  const lang = langAttr(language)
  const [value, setValue] = useState('')
  const [state, setState] = useState<State>('idle')
  const [expected, setExpected] = useState<string | undefined>()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // focus without scrolling the page on desktop; mobile users tap the field
    if (window.matchMedia('(pointer: fine)').matches) inputRef.current?.focus({ preventScroll: true })
  }, [exercise])

  const check = () => {
    if (state !== 'idle' || !value.trim()) return
    const verdict = checkTyped(value, exercise.answers)
    setState(verdict.result)
    setExpected(verdict.expected)
    onResult(verdict.result !== 'wrong')
  }

  /** Type an accented letter at the caret. Shift gives the capital (É, À, Ç). */
  const insert = (letter: string, upper: boolean) => {
    const el = inputRef.current
    if (!el || state !== 'idle') return
    const ch = upper ? letter.toLocaleUpperCase(language.code) : letter
    const start = el.selectionStart ?? value.length
    const end = el.selectionEnd ?? value.length
    setValue(value.slice(0, start) + ch + value.slice(end))
    requestAnimationFrame(() => {
      el.focus({ preventScroll: true })
      el.setSelectionRange(start + ch.length, start + ch.length)
    })
  }

  const [before, after] = exercise.prompt.split('___')
  const longest = Math.max(...exercise.answers.map((a) => a.length), 6)
  // An accent slip still counts, so the field goes green; the note below says what to fix.
  const inputState = state === 'accents' ? 'correct' : state

  return (
    <div>
      <p className="q-prompt">Complete the sentence.</p>
      {exercise.hint && <p className="q-hint">Use: {renderInline(exercise.hint)}</p>}
      <div className="q-body">
        <p className="blank-sentence" lang={lang}>
          {renderInline(before)}
          <input
            ref={inputRef}
            className={`blank-input ${inputState !== 'idle' ? inputState : ''}`}
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
        {state === 'idle' && language.accents.length > 0 && (
          <div className="accent-keys" role="group" aria-label={`${language.name} letters`}>
            {language.accents.map((a) => (
              <button
                key={a}
                type="button"
                className="accent-key"
                lang={lang}
                onPointerDown={keepFocus}
                onMouseDown={keepFocus}
                onClick={(e) => insert(a, e.shiftKey)}
                aria-label={`Type ${a}`}
                title="Shift-click for a capital"
              >
                {a}
              </button>
            ))}
          </div>
        )}
        {state === 'accents' && expected && (
          <div className="answer-reveal accents">
            Right word - mind the accents:
            <span className="pill" lang={lang}>
              {expected}
            </span>
          </div>
        )}
        {state === 'wrong' && (
          <div className="answer-reveal">
            Correct answer:
            {exercise.answers.slice(0, 3).map((a) => (
              <span key={a} className="pill" lang={lang}>
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
