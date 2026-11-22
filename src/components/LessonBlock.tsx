import { langAttr } from '../content/languages'
import type { LessonBlock as Block } from '../content/types'
import { renderInline } from '../lib/markup'
import { useTargetLang } from '../lib/targetLang'
import SpeakButton from './SpeakButton'

export default function LessonBlock({ block, index }: { block: Block; index: number }) {
  // Examples are the target language; headings, text and notes stay English. For an English
  // book `lang` is undefined and no speaker buttons render, so nothing changes there.
  const lang = langAttr(useTargetLang())
  if (block.type === 'tip') {
    return (
      <section className="block tip">
        <span className="icon" aria-hidden="true">
          💡
        </span>
        <p className="block-text">{renderInline(block.text)}</p>
      </section>
    )
  }

  const heading = block.heading && (
    <div className="block-heading">
      <span className="num">{String.fromCharCode(65 + index)}</span>
      <h3>{renderInline(block.heading)}</h3>
    </div>
  )

  if (block.type === 'explain') {
    return (
      <section className="block">
        {heading}
        <p className="block-text">{renderInline(block.text)}</p>
        {block.examples && block.examples.length > 0 && (
          <ul className="examples" lang={lang}>
            {block.examples.map((e, i) => (
              <li key={i} className={`example${lang ? ' speakable' : ''}`}>
                <span>{renderInline(e.text)}</span>
                {e.wrong && (
                  <span className="wrong">
                    (not <s>{e.wrong}</s>)
                  </span>
                )}
                {e.note && (
                  <span className="note" lang={lang && 'en'}>
                    {renderInline(e.note)}
                  </span>
                )}
                {lang && <SpeakButton text={e.text} />}
              </li>
            ))}
          </ul>
        )}
        {block.note && <p className="block-note">{renderInline(block.note)}</p>}
      </section>
    )
  }

  if (block.type === 'compare') {
    return (
      <section className="block">
        {heading}
        <div className="compare">
          {(['left', 'right'] as const).map((side) => {
            const s = block[side]
            return (
              <div key={side} className={`compare-side ${side}`}>
                <div className="label">{renderInline(s.label)}</div>
                {s.text && <p className="text">{renderInline(s.text)}</p>}
                <ul lang={lang}>
                  {s.examples.map((ex, i) => (
                    <li key={i}>
                      {renderInline(ex)}
                      {lang && <SpeakButton text={ex} />}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
        {block.note && <p className="block-note">{renderInline(block.note)}</p>}
      </section>
    )
  }

  // table
  return (
    <section className="block">
      {heading}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {block.columns.map((c, i) => (
                <th key={i}>{renderInline(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j}>{renderInline(c)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {block.note && <p className="block-note">{renderInline(block.note)}</p>}
    </section>
  )
}
