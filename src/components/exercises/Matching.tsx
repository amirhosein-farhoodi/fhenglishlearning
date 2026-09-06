import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { MatchingExercise } from '../../content/types'
import { shuffleDifferent } from '../../lib/answers'
import { renderInline } from '../../lib/markup'
import { sfx } from '../../lib/sfx'
import type { ExProps } from './solution'

interface Line {
  x1: number
  y1: number
  x2: number
  y2: number
  state: 'pending' | 'correct' | 'wrong'
}

/**
 * Connect-the-pairs: tap an item on the left, then its partner on the right.
 * Lines are drawn with SVG between the two cards.
 */
export default function Matching({ exercise, onResult, seed }: ExProps<MatchingExercise>) {
  const rightOrder = useMemo(
    () => shuffleDifferent(exercise.pairs.map((_, i) => i), seed),
    [exercise, seed],
  )
  const [active, setActive] = useState<number | null>(null) // left index
  const [pairs, setPairs] = useState<Record<number, number>>({}) // left -> right
  const [checked, setChecked] = useState(false)
  const [lines, setLines] = useState<Line[]>([])
  const wrap = useRef<HTMLDivElement>(null)
  const leftRefs = useRef<(HTMLButtonElement | null)[]>([])
  const rightRefs = useRef<(HTMLButtonElement | null)[]>([])

  const rightOf = (l: number) => pairs[l]
  const leftOf = (r: number) => Number(Object.keys(pairs).find((k) => pairs[Number(k)] === r) ?? -1)

  const clickLeft = (l: number) => {
    if (checked) return
    sfx.tap()
    if (rightOf(l) !== undefined) {
      const next = { ...pairs }
      delete next[l]
      setPairs(next)
      setActive(l)
      return
    }
    setActive(active === l ? null : l)
  }

  const clickRight = (r: number) => {
    if (checked) return
    sfx.tap()
    const existingLeft = leftOf(r)
    if (existingLeft >= 0) {
      const next = { ...pairs }
      delete next[existingLeft]
      setPairs(next)
      setActive(existingLeft)
      return
    }
    if (active === null) return
    setPairs({ ...pairs, [active]: r })
    setActive(null)
  }

  const allPaired = Object.keys(pairs).length === exercise.pairs.length

  const check = () => {
    if (!allPaired || checked) return
    setChecked(true)
    onResult(exercise.pairs.every((_, i) => pairs[i] === i))
  }

  useLayoutEffect(() => {
    const compute = () => {
      const box = wrap.current?.getBoundingClientRect()
      if (!box) return
      const out: Line[] = []
      for (const [lStr, r] of Object.entries(pairs)) {
        const l = Number(lStr)
        const a = leftRefs.current[l]?.getBoundingClientRect()
        const b = rightRefs.current[r]?.getBoundingClientRect()
        if (!a || !b) continue
        out.push({
          x1: a.right - box.left,
          y1: a.top + a.height / 2 - box.top,
          x2: b.left - box.left,
          y2: b.top + b.height / 2 - box.top,
          state: checked ? (l === r ? 'correct' : 'wrong') : 'pending',
        })
      }
      setLines(out)
    }
    compute()
    const ro = new ResizeObserver(compute)
    if (wrap.current) ro.observe(wrap.current)
    window.addEventListener('resize', compute)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', compute)
    }
  }, [pairs, checked])

  const itemClass = (base: string, paired: boolean, isActive: boolean, correct: boolean | null) => {
    let c = base
    if (checked && paired) c += correct ? ' correct' : ' wrong'
    else if (isActive) c += ' active'
    else if (paired) c += ' paired'
    return c
  }

  return (
    <div>
      <p className="q-prompt">{renderInline(exercise.prompt)}</p>
      <p className="q-hint">Tap a sentence on the left, then its partner on the right. Tap a connected item to undo.</p>
      <div className="q-body matching" ref={wrap}>
        <svg className="match-lines" aria-hidden="true">
          {lines.map((ln, i) => {
            const dx = Math.max(24, (ln.x2 - ln.x1) / 2)
            const d = `M ${ln.x1} ${ln.y1} C ${ln.x1 + dx} ${ln.y1}, ${ln.x2 - dx} ${ln.y2}, ${ln.x2} ${ln.y2}`
            return <path key={i} d={d} className={ln.state === 'pending' ? '' : ln.state} />
          })}
        </svg>
        <div className="match-col left">
          {exercise.pairs.map((p, l) => {
            const paired = rightOf(l) !== undefined
            return (
              <button
                key={l}
                type="button"
                ref={(el) => (leftRefs.current[l] = el)}
                className={itemClass('match-item', paired, active === l, paired ? pairs[l] === l : null)}
                onClick={() => clickLeft(l)}
                disabled={checked}
              >
                {paired && !checked && <span className="badge-n">{Object.keys(pairs).indexOf(String(l)) + 1}</span>}
                {renderInline(p.left)}
              </button>
            )
          })}
        </div>
        <div className="match-col right">
          {rightOrder.map((r) => {
            const l = leftOf(r)
            const paired = l >= 0
            return (
              <button
                key={r}
                type="button"
                ref={(el) => (rightRefs.current[r] = el)}
                className={itemClass('match-item', paired, false, paired ? l === r : null)}
                onClick={() => clickRight(r)}
                disabled={checked}
              >
                {paired && !checked && <span className="badge-n">{Object.keys(pairs).indexOf(String(l)) + 1}</span>}
                {renderInline(exercise.pairs[r].right)}
              </button>
            )
          })}
        </div>
      </div>
      {checked && !exercise.pairs.every((_, i) => pairs[i] === i) && (
        <div className="answer-reveal" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
          Correct pairs:
          {exercise.pairs.map((p, i) => (
            <span key={i} className="pill">
              {p.left} → {p.right}
            </span>
          ))}
        </div>
      )}
      {!checked && (
        <div className="q-actions">
          <button type="button" className="btn btn-primary" disabled={!allPaired} onClick={check}>
            Check
          </button>
        </div>
      )}
    </div>
  )
}
