/**
 * The question navigator along the bottom of the computer-delivered test: a Review flag,
 * one block per part (numbers for the open part, "x of y" for the others) and
 * previous/next arrows. Shared by the Listening and Reading screens.
 */

interface Props {
  /** First and last question number of each part. */
  ranges: [number, number][]
  part: number
  current: number
  flagged: number[]
  isAnswered: (n: number) => boolean
  goTo: (n: number) => void
  onToggleFlag: (n: number) => void
}

export default function ExamNav({ ranges, part, current, flagged, isAnswered, goTo, onToggleFlag }: Props) {
  const total = ranges[ranges.length - 1]?.[1] ?? 0
  return (
    <nav className="exam-nav" aria-label="Questions">
      <button
        type="button"
        className={`exam-flag${flagged.includes(current) ? ' on' : ''}`}
        onClick={() => onToggleFlag(current)}
        aria-pressed={flagged.includes(current)}
        title="Mark this question to come back to it"
      >
        <span aria-hidden="true">⚑</span> Review
      </button>
      <div className="exam-parts">
        {ranges.map(([a, b], pi) => {
          const nums = Array.from({ length: b - a + 1 }, (_, i) => a + i)
          const done = nums.filter(isAnswered).length
          return (
            <div key={pi} className={`exam-part${pi === part ? ' is-active' : ''}`}>
              <button type="button" className="exam-part-name" onClick={() => goTo(a)}>
                Part {pi + 1}
                {pi !== part && (
                  <span className="exam-part-count">
                    {done} of {nums.length}
                  </span>
                )}
              </button>
              {pi === part && (
                <div className="exam-nums">
                  {nums.map((n) => (
                    <button
                      type="button"
                      key={n}
                      className={`exam-num${isAnswered(n) ? ' is-done' : ''}${flagged.includes(n) ? ' is-flagged' : ''}${n === current ? ' is-current' : ''}`}
                      onClick={() => goTo(n)}
                      aria-label={`Question ${n}${isAnswered(n) ? ', answered' : ''}${flagged.includes(n) ? ', marked for review' : ''}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="exam-arrows">
        <button type="button" className="exam-arrow" onClick={() => goTo(current - 1)} disabled={current <= 1} aria-label="Previous question">
          ‹
        </button>
        <button type="button" className="exam-arrow" onClick={() => goTo(current + 1)} disabled={current >= total} aria-label="Next question">
          ›
        </button>
      </div>
    </nav>
  )
}
