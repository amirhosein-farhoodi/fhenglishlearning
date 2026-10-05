import { useEffect, useMemo, useRef, useState, type FocusEvent } from 'react'
import type { ReadingPassage } from '../../content/ielts-mock/types'
import { isAnswered, layoutPaper, passageRanges, roman, type Answers } from '../../lib/mock/engine'
import { renderInline } from '../../lib/markup'
import ExamNav from './ExamNav'
import QuestionGroupView from './QuestionGroupView'
import { highlightSupported, useHighlighter } from './useHighlighter'

/**
 * The live Reading paper: passage on the left, questions on the right, and the
 * part/question navigator along the bottom - the computer-delivered layout.
 * All three passages stay mounted (only the active one is shown), so highlights
 * and scroll positions survive switching parts.
 */

interface Props {
  passages: ReadingPassage[]
  answers: Answers
  flagged: number[]
  onAnswer: (num: number, value: string) => void
  onToggleFlag: (num: number) => void
}

const parseNum = (el: EventTarget | null): number | null => {
  const t = el as HTMLInputElement | null
  const m = (t?.id || t?.name || '').match(/^q-(\d+)$/)
  return m ? Number(m[1]) : null
}

export default function ReadingSection({ passages, answers, flagged, onAnswer, onToggleFlag }: Props) {
  const slots = useMemo(() => layoutPaper(passages), [passages])
  const ranges = useMemo(() => passageRanges(slots, passages.length), [slots, passages.length])
  const total = ranges[ranges.length - 1]?.[1] ?? 0
  const [part, setPart] = useState(0)
  const [current, setCurrent] = useState(1)
  /** Narrow screens show one pane at a time. */
  const [pane, setPane] = useState<'passage' | 'questions'>('passage')
  const passageRef = useRef<HTMLDivElement>(null)
  const tool = useHighlighter(passageRef)

  const partOf = (n: number) => Math.max(0, ranges.findIndex(([a, b]) => n >= a && n <= b))

  const goTo = (n: number) => {
    const clamped = Math.min(Math.max(1, n), total)
    setCurrent(clamped)
    setPart(partOf(clamped))
    setPane('questions')
    requestAnimationFrame(() => {
      const el = document.getElementById(`q-${clamped}`)
      if (!el) return
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      el.focus({ preventScroll: true })
    })
  }

  // Keep the current marker in step with whatever the candidate clicks or tabs into.
  const onFocus = (e: FocusEvent) => {
    const n = parseNum(e.target)
    if (n) setCurrent(n)
  }

  // Each part starts at the top of its passage and questions.
  useEffect(() => {
    document.querySelectorAll('.rp-scroll').forEach((el) => el.scrollTo({ top: 0 }))
  }, [part])

  /** Paragraph letter -> heading the candidate chose, shown above that paragraph like the real test. */
  const chosenHeadings = (pi: number) => {
    const out: Record<string, string> = {}
    slots
      .filter((s) => s.passage === pi)
      .forEach((s) => {
        const g = passages[pi].groups[s.group]
        if (g.type !== 'headings') return
        g.items.forEach((it, i) => {
          const pick = answers[String(s.start + i)]
          if (!pick) return
          const idx = g.headings.findIndex((_, hi) => roman(hi) === pick)
          if (idx >= 0) out[it.paragraph] = `${pick}  ${g.headings[idx]}`
        })
      })
    return out
  }

  return (
    <div className="rp">
      <div className="rp-panes-toggle" role="tablist" aria-label="Show">
        <button type="button" role="tab" aria-selected={pane === 'passage'} className={pane === 'passage' ? 'on' : ''} onClick={() => setPane('passage')}>
          Passage
        </button>
        <button type="button" role="tab" aria-selected={pane === 'questions'} className={pane === 'questions' ? 'on' : ''} onClick={() => setPane('questions')}>
          Questions {ranges[part][0]}–{ranges[part][1]}
        </button>
      </div>

      <div className="rp-part-head">
        <b>Part {part + 1}</b>
        <span>
          Read the text and answer questions {ranges[part][0]}–{ranges[part][1]}.
        </span>
      </div>

      <div className={`rp-split show-${pane}`}>
        <div className="rp-scroll rp-left" ref={passageRef}>
          {passages.map((p, pi) => {
            const heads = chosenHeadings(pi)
            return (
              <article key={p.id} className="rp-passage" hidden={pi !== part}>
                <p className="rp-kicker">Reading Passage {pi + 1}</p>
                <p className="rp-lead">
                  You should spend about 20 minutes on <b>Questions {ranges[pi][0]}–{ranges[pi][1]}</b>, which are based on Reading Passage {pi + 1} below.
                </p>
                <h2 className="rp-title">{p.title}</h2>
                {p.subtitle && <p className="rp-sub">{renderInline(p.subtitle)}</p>}
                {p.paragraphs.map((para, i) => (
                  <div key={i} className={`rp-para${para.label ? ' has-label' : ''}`}>
                    {para.label && heads[para.label] && <p className="rp-chosen-heading">{heads[para.label]}</p>}
                    {para.label && <span className="rp-label">{para.label}</span>}
                    <p>{renderInline(para.text)}</p>
                  </div>
                ))}
              </article>
            )
          })}
        </div>

        <div className="rp-scroll rp-right" onFocusCapture={onFocus}>
          {passages.map((p, pi) => (
            <div key={p.id} hidden={pi !== part}>
              {slots
                .filter((s) => s.passage === pi)
                .map((s) => (
                  <QuestionGroupView
                    key={`${pi}-${s.group}`}
                    group={p.groups[s.group]}
                    start={s.start}
                    end={s.end}
                    passageNo={pi + 1}
                    labels={p.paragraphs.map((x) => x.label).filter((x): x is string => !!x)}
                    answers={answers}
                    onAnswer={onAnswer}
                    flagged={flagged}
                  />
                ))}
            </div>
          ))}
          <div style={{ height: 80 }} />
        </div>
      </div>

      {highlightSupported && tool.at && (
        <div className="hl-tool" style={{ left: tool.at.x, top: tool.at.y }} onMouseDown={(e) => e.preventDefault()}>
          <button type="button" onClick={tool.highlight}>
            Highlight
          </button>
          {tool.canClear && (
            <button type="button" onClick={tool.clear}>
              Clear
            </button>
          )}
        </div>
      )}

      <ExamNav
        ranges={ranges}
        part={part}
        current={current}
        flagged={flagged}
        isAnswered={(n) => isAnswered(passages, answers, n)}
        goTo={goTo}
        onToggleFlag={onToggleFlag}
      />
    </div>
  )
}
