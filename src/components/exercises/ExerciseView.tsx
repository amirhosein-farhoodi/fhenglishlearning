import type { Exercise } from '../../content/types'
import ContextBlock from './ContextBlock'
import RecapChip from './RecapChip'
import Mcq from './Mcq'
import TrueFalse from './TrueFalse'
import FillBlank from './FillBlank'
import Matching from './Matching'
import WordOrder from './WordOrder'
import Categorize from './Categorize'
import { TYPE_LABEL } from './solution'

interface Props {
  exercise: Exercise
  seed: number
  onResult: (correct: boolean) => void
  onTrackClick?: (track: string) => void
}

export default function ExerciseView({ exercise, seed, onResult, onTrackClick }: Props) {
  const meta = TYPE_LABEL[exercise.type]
  let body
  switch (exercise.type) {
    case 'mcq':
      body = <Mcq exercise={exercise} seed={seed} onResult={onResult} />
      break
    case 'true_false':
      body = <TrueFalse exercise={exercise} seed={seed} onResult={onResult} />
      break
    case 'fill_blank':
      body = <FillBlank exercise={exercise} seed={seed} onResult={onResult} />
      break
    case 'matching':
      body = <Matching exercise={exercise} seed={seed} onResult={onResult} />
      break
    case 'word_order':
      body = <WordOrder exercise={exercise} seed={seed} onResult={onResult} />
      break
    case 'categorize':
      body = <Categorize exercise={exercise} seed={seed} onResult={onResult} />
      break
  }
  return (
    <div className="quiz-card">
      <span className="q-type">
        <span aria-hidden="true">{meta.icon}</span> {meta.label}
      </span>
      <ContextBlock context={exercise.context} onTrackClick={onTrackClick} />
      <RecapChip recap={exercise.recap} />
      {body}
    </div>
  )
}
