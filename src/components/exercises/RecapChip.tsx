import type { ExerciseRecap } from '../../content/types'
import { renderInline } from '../../lib/markup'

/**
 * A compact reprint of a lesson table, shown above the prompt for exercises whose
 * answer depends on it - so the rule is on screen during the question, not just
 * remembered from reading the lesson earlier. See ExerciseRecap for why this exists
 * alongside ContextBlock.
 */
export default function RecapChip({ recap }: { recap?: ExerciseRecap }) {
  if (!recap) return null
  return (
    <figure className="q-recap">
      <figcaption>{recap.label}</figcaption>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {recap.columns.map((c, i) => (
                <th key={i}>{renderInline(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recap.rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j}>{renderInline(c)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}
