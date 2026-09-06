import { useMemo, useState } from 'react'
import type { CategorizeExercise } from '../../content/types'
import { shuffle } from '../../lib/answers'
import { renderInline } from '../../lib/markup'
import { sfx } from '../../lib/sfx'
import type { ExProps } from './solution'

/** Pick an item from the pool, then tap the group it belongs to. */
export default function Categorize({ exercise, onResult, seed }: ExProps<CategorizeExercise>) {
  const order = useMemo(() => shuffle(exercise.items.map((_, i) => i), seed), [exercise, seed])
  const [selected, setSelected] = useState<number | null>(null)
  const [placement, setPlacement] = useState<Record<number, number>>({}) // item -> category
  const [checked, setChecked] = useState(false)

  const pool = order.filter((i) => placement[i] === undefined)
  const complete = pool.length === 0

  const pick = (i: number) => {
    if (checked) return
    sfx.tap()
    setSelected(selected === i ? null : i)
  }

  const drop = (cat: number) => {
    if (checked || selected === null) return
    sfx.tap()
    // Functional update: rapid taps must not overwrite each other with stale state.
    setPlacement((prev) => ({ ...prev, [selected]: cat }))
    setSelected(null)
  }

  const takeBack = (i: number) => {
    if (checked) return
    sfx.tap()
    setPlacement((prev) => {
      const next = { ...prev }
      delete next[i]
      return next
    })
    setSelected(i)
  }

  const check = () => {
    if (!complete || checked) return
    setChecked(true)
    onResult(exercise.items.every((it, i) => placement[i] === it.category))
  }

  return (
    <div>
      <p className="q-prompt">{renderInline(exercise.prompt)}</p>
      <p className="q-hint">Tap an item, then tap the group it belongs to.</p>
      <div className="q-body">
        <div className="pool-label">{pool.length ? `${pool.length} left to sort` : 'All sorted!'}</div>
        <div className="pool">
          {pool.map((i) => (
            <button
              key={i}
              type="button"
              className={`chip-word ${selected === i ? 'selected' : ''}`}
              onClick={() => pick(i)}
              disabled={checked}
            >
              {renderInline(exercise.items[i].text)}
            </button>
          ))}
        </div>
        <div className="buckets">
          {exercise.categories.map((cat, c) => {
            const inside = Object.entries(placement)
              .filter(([, v]) => v === c)
              .map(([k]) => Number(k))
            const isTarget = selected !== null && !checked
            return (
              <div
                key={c}
                className={`bucket ${isTarget ? 'target' : ''}`}
                role={isTarget ? 'button' : undefined}
                tabIndex={isTarget ? 0 : -1}
                onClick={() => drop(c)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') drop(c)
                }}
              >
                <div className="bucket-title">
                  <span>{renderInline(cat)}</span>
                  <span className="n">{inside.length}</span>
                </div>
                <div className="bucket-items">
                  {inside.map((i) => {
                    const ok = exercise.items[i].category === c
                    return (
                      <button
                        key={i}
                        type="button"
                        className={`chip-word ${checked ? (ok ? 'correct' : 'wrong') : 'placed'}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          takeBack(i)
                        }}
                        disabled={checked}
                        // While an item is selected the whole bucket is a drop target, so
                        // already-placed chips must not swallow the tap.
                        style={isTarget ? { pointerEvents: 'none' } : undefined}
                        title={isTarget ? undefined : 'Tap to take this back'}
                      >
                        {renderInline(exercise.items[i].text)}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
        {checked && !exercise.items.every((it, i) => placement[i] === it.category) && (
          <div className="answer-reveal" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
            Correct groups:
            {exercise.categories.map((cat, c) => (
              <span key={c} className="pill">
                {cat}: {exercise.items.filter((it) => it.category === c).map((it) => it.text).join(' · ')}
              </span>
            ))}
          </div>
        )}
      </div>
      {!checked && (
        <div className="q-actions">
          <button type="button" className="btn btn-primary" disabled={!complete} onClick={check}>
            Check
          </button>
        </div>
      )}
    </div>
  )
}
