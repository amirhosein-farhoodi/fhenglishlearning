import type { ExerciseContext } from '../../content/types'
import { renderInline } from '../../lib/markup'
import { Headphones } from '../Icons'

/**
 * The extract a question is asked about, shown above the prompt.
 *
 * IELTS questions are written in the voice of the printed book - "you hear ...",
 * "the passage says ..." - which assumes the learner has the recording playing and
 * the page open beside them. Here they have neither, so the words themselves have to
 * be on screen. This block is where they go: the question then asks about something
 * visible rather than pointing at something absent.
 *
 * When `context.track` names the clip the extract is spoken on, that label becomes a
 * jump straight to it (only where `onTrackClick` is wired up - the answer-key page has
 * no player to jump to, so it falls back to a plain, non-interactive badge there).
 */
export default function ContextBlock({
  context,
  onTrackClick,
}: {
  context?: ExerciseContext
  onTrackClick?: (track: string) => void
}) {
  if (!context) return null
  return (
    <figure className="q-context">
      <figcaption>
        {context.label}
        {context.track &&
          (onTrackClick ? (
            <button type="button" className="q-track" onClick={() => onTrackClick(context.track!)}>
              <Headphones size={12} /> {context.track}
            </button>
          ) : (
            <span className="q-track">
              <Headphones size={12} /> {context.track}
            </span>
          ))}
      </figcaption>
      <blockquote>{renderInline(context.text)}</blockquote>
    </figure>
  )
}
