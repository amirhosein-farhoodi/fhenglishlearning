import { Fragment, type ReactNode } from 'react'
import type { CompletionGroup, QuestionGroup } from '../../content/ielts-mock/types'
import { letter, limitText, roman, type Answers } from '../../lib/mock/engine'
import { renderInline } from '../../lib/markup'

/**
 * One block of questions ("Questions 1-6") exactly as the computer-delivered paper lays
 * it out: the bold rubric, any options box, then the items. Every answerable control
 * gets id="q-<number>" so the question navigator can jump to it.
 */

interface Props {
  group: QuestionGroup
  start: number
  end: number
  /** 1, 2 or 3 - the rubric names "Reading Passage 2". */
  passageNo: number
  /** Paragraph letters of the passage (A, B ...), for headings / matching information. */
  labels?: string[]
  /** Listening rubrics say "Write ..." and offer three choices; Reading says "Choose ... from the passage". */
  mode?: 'reading' | 'listening'
  answers: Answers
  onAnswer: (num: number, value: string) => void
  flagged: number[]
  disabled?: boolean
}

const range = (a: number, b: number) => (a === b ? `Question ${a}` : b === a + 1 ? `Questions ${a} and ${b}` : `Questions ${a}–${b}`)

const WORDS = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN']

/** Splits "text {1} more {2}" and renders each gap with `gap(localIndex)`. */
function withGaps(text: string, gap: (i: number) => ReactNode): ReactNode {
  const parts = text.split(/\{(\d+)\}/)
  return parts.map((part, i) => (i % 2 ? <Fragment key={i}>{gap(Number(part) - 1)}</Fragment> : <Fragment key={i}>{renderInline(part)}</Fragment>))
}

function Num({ n, flagged }: { n: number; flagged: boolean }) {
  return (
    <span className={`q-num${flagged ? ' is-flagged' : ''}`} aria-hidden="true">
      {n}
    </span>
  )
}

function GapInput({ num, value, onAnswer, disabled }: { num: number; value: string; onAnswer: Props['onAnswer']; disabled?: boolean }) {
  return (
    <input
      id={`q-${num}`}
      className={`q-gap${value ? ' is-filled' : ''}`}
      value={value}
      placeholder={String(num)}
      aria-label={`Question ${num}`}
      onChange={(e) => onAnswer(num, e.target.value)}
      disabled={disabled}
      spellCheck={false}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      maxLength={60}
    />
  )
}

function GapSelect({ num, value, options, onAnswer, disabled, wide }: { num: number; value: string; options: string[]; onAnswer: Props['onAnswer']; disabled?: boolean; wide?: boolean }) {
  return (
    <select id={`q-${num}`} className={`q-select${value ? ' is-filled' : ''}${wide ? ' is-wide' : ''}`} value={value} aria-label={`Question ${num}`} onChange={(e) => onAnswer(num, e.target.value)} disabled={disabled}>
      <option value="">{num}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  )
}

function Choice({ name, value, current, onPick, disabled, children, id }: { name: string; value: string; current: string; onPick: (v: string) => void; disabled?: boolean; children: ReactNode; id?: string }) {
  const on = current === value
  return (
    <label className={`q-choice${on ? ' is-on' : ''}`}>
      <input id={id} type="radio" name={name} value={value} checked={on} onChange={() => onPick(value)} disabled={disabled} />
      {children}
    </label>
  )
}

function completionRubric(g: CompletionGroup, listening: boolean) {
  const what = { sentences: 'Complete the sentences below.', summary: 'Complete the summary below.', notes: 'Complete the notes below.', flowchart: 'Complete the flow-chart below.', short: 'Answer the questions below.', table: 'Complete the table below.' }[g.layout]
  return (
    <>
      <p>{what}</p>
      {listening ? (
        <p>
          Write <b>{limitText(g.limit)}</b> for each answer.{g.anyOrder ? ' You may give the answers in any order.' : ''}
        </p>
      ) : (
        <p>
          Choose <b>{limitText(g.limit)}</b> from the passage for each answer.
        </p>
      )}
    </>
  )
}

export default function QuestionGroupView({ group: g, start, end, passageNo, labels = [], mode = 'reading', answers, onAnswer, flagged, disabled }: Props) {
  const listening = mode === 'listening'
  const val = (n: number) => answers[String(n)] ?? ''
  const isFlagged = (n: number) => flagged.includes(n)
  const paraSpan = labels.length ? `${labels[0]}–${labels[labels.length - 1]}` : ''
  const paraCount = labels.length ? `${WORDS[labels.length] ? WORDS[labels.length].toLowerCase() : labels.length} paragraphs, ${paraSpan}` : ''

  let rubric: ReactNode = null
  let body: ReactNode = null

  switch (g.type) {
    case 'tfng':
    case 'ynng': {
      const tf = g.type === 'tfng'
      const vals = tf ? (['TRUE', 'FALSE', 'NOT GIVEN'] as const) : (['YES', 'NO', 'NOT GIVEN'] as const)
      rubric = (
        <>
          <p>
            {tf ? (
              <>Do the following statements agree with the information given in Reading Passage {passageNo}?</>
            ) : (
              <>
                Do the following statements agree with the {g.of} of the writer in Reading Passage {passageNo}?
              </>
            )}
          </p>
          <p>Choose</p>
          <dl className="q-key">
            {tf ? (
              <>
                <dt>TRUE</dt>
                <dd>if the statement agrees with the information</dd>
                <dt>FALSE</dt>
                <dd>if the statement contradicts the information</dd>
                <dt>NOT GIVEN</dt>
                <dd>if there is no information on this</dd>
              </>
            ) : (
              <>
                <dt>YES</dt>
                <dd>if the statement agrees with the {g.of} of the writer</dd>
                <dt>NO</dt>
                <dd>if the statement contradicts the {g.of} of the writer</dd>
                <dt>NOT GIVEN</dt>
                <dd>if it is impossible to say what the writer thinks about this</dd>
              </>
            )}
          </dl>
        </>
      )
      body = (
        <ol className="q-items">
          {g.items.map((it, i) => {
            const n = start + i
            return (
              <li key={n} className="q-item">
                <Num n={n} flagged={isFlagged(n)} />
                <div className="q-item-body">
                  <p className="q-stem">{renderInline(it.statement)}</p>
                  <div className="q-choices q-choices-row" role="radiogroup" aria-label={`Question ${n}`}>
                    {vals.map((v, vi) => (
                      <Choice key={v} id={vi === 0 ? `q-${n}` : undefined} name={`q-${n}`} value={v} current={val(n)} onPick={(x) => onAnswer(n, x)} disabled={disabled}>
                        {v}
                      </Choice>
                    ))}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )
      break
    }

    case 'headings': {
      const opts = g.headings.map((_, i) => roman(i))
      rubric = (
        <>
          <p>
            Reading Passage {passageNo} has {paraCount}.
          </p>
          <p>Choose the correct heading for each paragraph from the list of headings below.</p>
        </>
      )
      body = (
        <>
          <div className="q-box">
            <h5>List of Headings</h5>
            <ol className="q-box-list">
              {g.headings.map((h, i) => (
                <li key={i}>
                  <b>{roman(i)}</b>
                  <span>{renderInline(h)}</span>
                </li>
              ))}
            </ol>
          </div>
          <ol className="q-items">
            {g.items.map((it, i) => {
              const n = start + i
              return (
                <li key={n} className="q-item q-item-inline">
                  <Num n={n} flagged={isFlagged(n)} />
                  <span className="q-stem">Paragraph {it.paragraph}</span>
                  <GapSelect num={n} value={val(n)} options={opts} onAnswer={onAnswer} disabled={disabled} />
                </li>
              )
            })}
          </ol>
        </>
      )
      break
    }

    case 'matching': {
      const keys = g.options.map((o) => o.key)
      const span = `${keys[0]}–${keys[keys.length - 1]}`
      rubric =
        g.kind === 'information' ? (
          <>
            <p>
              Reading Passage {passageNo} has {paraCount}.
            </p>
            <p>Which paragraph contains the following information?</p>
            {g.reuse && (
              <p>
                <b>NB</b> You may use any letter more than once.
              </p>
            )}
          </>
        ) : g.kind === 'features' ? (
          <>
            <p>
              Look at the following statements ({range(start, end).replace('Questions ', 'Questions ')}) and the {g.optionsTitle ? g.optionsTitle.replace(/^List of /i, 'list of ').toLowerCase() : 'list below'}.
            </p>
            <p>Match each statement with the correct option, {span}.</p>
            {g.reuse && (
              <p>
                <b>NB</b> You may use any letter more than once.
              </p>
            )}
          </>
        ) : (
          <p>Complete each sentence with the correct ending, {span}, below.</p>
        )
      if (listening && g.kind === 'features') {
        rubric = g.image ? (
          <p>
            Label the {g.optionsTitle ? g.optionsTitle.replace(/^(map|plan|diagram) of /i, '').toLowerCase() && g.optionsTitle.split(' ')[0].toLowerCase() : 'plan'} below.{' '}
            {g.options.some((o) => o.text) ? `Choose the correct answer, ${span}, from the box.` : `Choose the correct letter, ${span}, for each answer.`}
          </p>
        ) : (
          <>
            <p>
              {g.optionsTitle ? `What does the speaker say about each of the following? Choose your answers from the box.` : 'Choose your answers from the box.'}
            </p>
            {g.reuse && (
              <p>
                <b>NB</b> You may use any letter more than once.
              </p>
            )}
          </>
        )
      }
      body = (
        <>
          {g.image && <img className="q-image" src={g.image} alt={g.optionsTitle ?? 'Plan for the labelling questions'} />}
          {g.kind === 'features' && (!g.image || g.options.some((o) => o.text)) && (
            <div className="q-box">
              <h5>{g.optionsTitle ?? 'List of options'}</h5>
              <ol className="q-box-list">
                {g.options.map((o) => (
                  <li key={o.key}>
                    <b>{o.key}</b>
                    <span>{renderInline(o.text)}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <ol className="q-items">
            {g.items.map((it, i) => {
              const n = start + i
              return (
                <li key={n} className="q-item q-item-inline">
                  <Num n={n} flagged={isFlagged(n)} />
                  <span className="q-stem">{renderInline(it.text)}</span>
                  <GapSelect num={n} value={val(n)} options={keys} onAnswer={onAnswer} disabled={disabled} />
                </li>
              )
            })}
          </ol>
          {g.kind === 'sentence-endings' && (
            <div className="q-box">
              <ol className="q-box-list">
                {g.options.map((o) => (
                  <li key={o.key}>
                    <b>{o.key}</b>
                    <span>{renderInline(o.text)}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )
      break
    }

    case 'mcq':
      rubric = <p>Choose the correct letter, {g.items[0]?.options.length === 3 ? 'A, B or C' : 'A, B, C or D'}.</p>
      body = (
        <ol className="q-items">
          {g.items.map((it, i) => {
            const n = start + i
            return (
              <li key={n} className="q-item">
                <Num n={n} flagged={isFlagged(n)} />
                <div className="q-item-body">
                  <p className="q-stem">{renderInline(it.stem)}</p>
                  <div className="q-choices" role="radiogroup" aria-label={`Question ${n}`}>
                    {it.options.map((o, oi) => (
                      <Choice key={oi} id={oi === 0 ? `q-${n}` : undefined} name={`q-${n}`} value={letter(oi)} current={val(n)} onPick={(x) => onAnswer(n, x)} disabled={disabled}>
                        <b className="q-letter">{letter(oi)}</b>
                        <span>{renderInline(o)}</span>
                      </Choice>
                    ))}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )
      break

    case 'multi': {
      const want = g.answers.length
      const picks = val(start).split('').filter(Boolean)
      const toggle = (l: string) => {
        const next = picks.includes(l) ? picks.filter((p) => p !== l) : picks.length < want ? [...picks, l] : picks
        onAnswer(start, next.sort().join(''))
      }
      rubric = (
        <p>
          Choose <b>{WORDS[want]}</b> letters, A–{letter(g.options.length - 1)}.
        </p>
      )
      body = (
        <div className="q-item">
          <Num n={start} flagged={isFlagged(start)} />
          <div className="q-item-body">
            <p className="q-stem">{renderInline(g.stem)}</p>
            <div className="q-choices" role="group" aria-label={range(start, end)}>
              {g.options.map((o, oi) => {
                const l = letter(oi)
                const on = picks.includes(l)
                return (
                  <label key={l} className={`q-choice${on ? ' is-on' : ''}`}>
                    <input id={oi === 0 ? `q-${start}` : undefined} type="checkbox" checked={on} onChange={() => toggle(l)} disabled={disabled || (!on && picks.length >= want)} />
                    <b className="q-letter">{l}</b>
                    <span>{renderInline(o)}</span>
                  </label>
                )
              })}
            </div>
            <p className="q-hint">
              {picks.length} of {want} chosen
            </p>
          </div>
        </div>
      )
      break
    }

    case 'completion': {
      rubric = completionRubric(g, listening)
      const gap = (i: number) => <GapInput num={start + i} value={val(start + i)} onAnswer={onAnswer} disabled={disabled} />
      const lines = g.lines ?? []
      if (g.layout === 'table' && g.table) {
        body = (
          <div className="q-table-wrap">
            {g.title && <h5 className="q-title">{g.title}</h5>}
            <table className="q-table">
              <thead>
                <tr>
                  {g.table.columns.map((c, i) => (
                    <th key={i}>{withGaps(c, gap)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {g.table.rows.map((r, ri) => (
                  <tr key={ri}>
                    {r.map((c, ci) => (
                      <td key={ci}>{withGaps(c, gap)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      } else if (g.layout === 'notes') {
        body = (
          <div className="q-notes">
            {g.title && <h5 className="q-title">{g.title}</h5>}
            {lines.map((l, i) =>
              l.startsWith('# ') ? (
                <h6 key={i}>{withGaps(l.slice(2), gap)}</h6>
              ) : l.startsWith('- ') ? (
                <p key={i} className="q-bullet">
                  {withGaps(l.slice(2), gap)}
                </p>
              ) : (
                <p key={i}>{withGaps(l, gap)}</p>
              ),
            )}
          </div>
        )
      } else if (g.layout === 'flowchart') {
        body = (
          <div className="q-flow">
            {g.title && <h5 className="q-title">{g.title}</h5>}
            {lines.map((l, i) => (
              <Fragment key={i}>
                {i > 0 && (
                  <span className="q-flow-arrow" aria-hidden="true">
                    ↓
                  </span>
                )}
                <div className="q-flow-box">{withGaps(l, gap)}</div>
              </Fragment>
            ))}
          </div>
        )
      } else if (g.layout === 'summary') {
        body = (
          <div className="q-summary">
            {g.title && <h5 className="q-title">{g.title}</h5>}
            {lines.map((l, i) => (
              <p key={i}>{withGaps(l, gap)}</p>
            ))}
          </div>
        )
      } else {
        body = (
          <ol className="q-lines">
            {lines.map((l, i) => (
              <li key={i}>{withGaps(l, gap)}</li>
            ))}
          </ol>
        )
      }
      break
    }

    case 'summary-box': {
      const keys = g.options.map((o) => o.key)
      rubric = (
        <p>
          Complete the summary using the list of words{g.options.some((o) => o.text.includes(' ')) ? ' and phrases' : ''}, {keys[0]}–{keys[keys.length - 1]}, below.
        </p>
      )
      const gap = (i: number) => <GapSelect num={start + i} value={val(start + i)} options={keys} onAnswer={onAnswer} disabled={disabled} />
      body = (
        <>
          <div className="q-summary">
            {g.title && <h5 className="q-title">{g.title}</h5>}
            {g.lines.map((l, i) => (
              <p key={i}>{withGaps(l, gap)}</p>
            ))}
          </div>
          <div className="q-box q-box-grid">
            <ol className="q-box-list">
              {g.options.map((o) => (
                <li key={o.key}>
                  <b>{o.key}</b>
                  <span>{renderInline(o.text)}</span>
                </li>
              ))}
            </ol>
          </div>
        </>
      )
      break
    }
  }

  return (
    <section className="q-group" aria-label={range(start, end)}>
      <h4 className="q-range">{range(start, end)}</h4>
      <div className="q-rubric">
        {rubric}
        {g.extra && <p>{renderInline(g.extra)}</p>}
      </div>
      {body}
    </section>
  )
}
