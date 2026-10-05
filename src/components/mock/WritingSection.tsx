import { useState } from 'react'
import type { WritingTask1, WritingTask2 } from '../../content/ielts-mock/types'
import { wordCount } from '../../lib/mock/engine'
import TaskVisual from './TaskVisual'

/**
 * The live Writing paper. Task on the left, answer box on the right with a live word
 * count, parts switched from the bottom bar - as on the computer-delivered test.
 * Spell-check, autocorrect and autocomplete are switched off: the exam has none.
 */

export const TASK1_RUBRIC = 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.'
export const TASK2_RUBRIC = 'Give reasons for your answer and include any relevant examples from your own knowledge or experience.'

export function Task1Prompt({ task }: { task: WritingTask1 }) {
  return (
    <div className="wt-task">
      <p className="wt-time">You should spend about 20 minutes on this task.</p>
      <div className="wt-box">
        <p>{task.prompt}</p>
        <p>{TASK1_RUBRIC}</p>
      </div>
      <p className="wt-min">Write at least 150 words.</p>
      <div className={`wt-visuals${task.visuals.length > 1 ? ' is-multi' : ''}`}>
        {task.visuals.map((v, i) => (
          <TaskVisual key={i} visual={v} />
        ))}
      </div>
    </div>
  )
}

export function Task2Prompt({ task }: { task: WritingTask2 }) {
  return (
    <div className="wt-task">
      <p className="wt-time">You should spend about 40 minutes on this task.</p>
      <p>Write about the following topic:</p>
      <div className="wt-box wt-box-statement">
        <p>
          <i>{task.statement}</i>
        </p>
        <p>
          <i>{task.question}</i>
        </p>
      </div>
      <p>{TASK2_RUBRIC}</p>
      <p className="wt-min">Write at least 250 words.</p>
    </div>
  )
}

interface Props {
  task1: WritingTask1
  task2: WritingTask2
  text1: string
  text2: string
  onChange: (part: 1 | 2, text: string) => void
}

export default function WritingSection({ task1, task2, text1, text2, onChange }: Props) {
  const [part, setPart] = useState<1 | 2>(1)
  const [pane, setPane] = useState<'task' | 'answer'>('task')
  const text = part === 1 ? text1 : text2
  const words = wordCount(text)
  const min = part === 1 ? 150 : 250

  return (
    <div className="rp wt">
      <div className="rp-panes-toggle" role="tablist" aria-label="Show">
        <button type="button" role="tab" aria-selected={pane === 'task'} className={pane === 'task' ? 'on' : ''} onClick={() => setPane('task')}>
          Task
        </button>
        <button type="button" role="tab" aria-selected={pane === 'answer'} className={pane === 'answer' ? 'on' : ''} onClick={() => setPane('answer')}>
          Your answer · {words} words
        </button>
      </div>

      <div className="rp-part-head">
        <b>Part {part}</b>
        <span>
          You should spend about {part === 1 ? 20 : 40} minutes on this task. Write at least {min} words.
        </span>
      </div>

      <div className={`rp-split show-${pane === 'task' ? 'passage' : 'questions'}`}>
        <div className="rp-scroll rp-left">{part === 1 ? <Task1Prompt task={task1} /> : <Task2Prompt task={task2} />}</div>
        <div className="rp-scroll rp-right wt-right">
          <textarea
            key={part}
            className="wt-editor"
            value={text}
            onChange={(e) => onChange(part, e.target.value)}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            autoComplete="off"
            aria-label={`Your answer to Writing Part ${part}`}
            placeholder={part === 1 ? 'Type your Task 1 answer here.' : 'Type your Task 2 essay here.'}
          />
          <div className={`wt-count${words >= min ? ' is-ok' : ''}`} aria-live="polite">
            Words: {words}
          </div>
        </div>
      </div>

      <nav className="exam-nav" aria-label="Parts">
        <div className="exam-parts">
          {([1, 2] as const).map((p) => {
            const w = wordCount(p === 1 ? text1 : text2)
            return (
              <div key={p} className={`exam-part${p === part ? ' is-active' : ''}`}>
                <button type="button" className="exam-part-name" onClick={() => setPart(p)}>
                  Part {p}
                  <span className="exam-part-count">{w} words</span>
                </button>
              </div>
            )
          })}
        </div>
        <div className="exam-arrows">
          <button type="button" className="exam-arrow" onClick={() => setPart(1)} disabled={part === 1} aria-label="Part 1">
            ‹
          </button>
          <button type="button" className="exam-arrow" onClick={() => setPart(2)} disabled={part === 2} aria-label="Part 2">
            ›
          </button>
        </div>
      </nav>
    </div>
  )
}
