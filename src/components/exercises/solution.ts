import type { Exercise } from '../../content/types'

export interface ExProps<T extends Exercise> {
  exercise: T
  /** Called exactly once, when the learner has checked their answer. */
  onResult: (correct: boolean) => void
  /** Stable per-question seed so shuffles do not change on re-render. */
  seed: number
}

export const TYPE_LABEL: Record<Exercise['type'], { label: string; icon: string }> = {
  mcq: { label: 'Choose the right answer', icon: '🎯' },
  true_false: { label: 'Correct or incorrect?', icon: '⚖️' },
  fill_blank: { label: 'Fill in the blank', icon: '✍️' },
  matching: { label: 'Connect the pairs', icon: '🔗' },
  word_order: { label: 'Build the sentence', icon: '🧩' },
  categorize: { label: 'Sort into groups', icon: '🗂️' },
}

/** Human-readable correct answer, used in the feedback sheet and the answers page. */
export function solutionLines(x: Exercise): string[] {
  switch (x.type) {
    case 'mcq':
      return [x.options[x.answer]]
    case 'true_false':
      return [x.answer ? 'The sentence is correct.' : 'The sentence is incorrect.']
    case 'fill_blank':
      return [x.prompt.replace('___', `**${x.answers[0]}**`), ...(x.answers.length > 1 ? [`Also accepted: ${x.answers.slice(1).join(' / ')}`] : [])]
    case 'matching':
      return x.pairs.map((p) => `${p.left} → ${p.right}`)
    case 'word_order':
      return [x.answer, ...(x.alternatives ?? []).map((a) => `or: ${a}`)]
    case 'categorize':
      return x.categories.map((c, i) => `**${c}:** ${x.items.filter((it) => it.category === i).map((it) => it.text).join(', ')}`)
  }
}

export function explanationOf(x: Exercise): string | undefined {
  return 'explanation' in x ? x.explanation : undefined
}
