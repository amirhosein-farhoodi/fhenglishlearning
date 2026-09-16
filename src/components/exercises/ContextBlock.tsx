import type { ExerciseContext } from '../../content/types'
import { renderInline } from '../../lib/markup'

/**
 * The extract a question is asked about, shown above the prompt.
 *
 * IELTS questions are written in the voice of the printed book - "you hear ...",
 * "the passage says ..." - which assumes the learner has the recording playing and
 * the page open beside them. Here they have neither, so the words themselves have to
 * be on screen. This block is where they go: the question then asks about something
 * visible rather than pointing at something absent.
 */
export default function ContextBlock({ context }: { context?: ExerciseContext }) {
  if (!context) return null
  return (
    <figure className="q-context">
      <figcaption>{context.label}</figcaption>
      <blockquote>{renderInline(context.text)}</blockquote>
    </figure>
  )
}
