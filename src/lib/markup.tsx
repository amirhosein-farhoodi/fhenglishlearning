import { Fragment, type ReactNode } from 'react'

/**
 * Renders the tiny inline markup used in content:
 *   **bold**  -> <strong class="mk-b">
 *   *italic*  -> <em>
 *   ~~wrong~~ -> <s class="mk-wrong">
 *   ___       -> a blank placeholder
 */
const TOKEN = /(\*\*[^*]+\*\*|~~[^~]+~~|\*[^*\n]+\*|___)/g

export function renderInline(text: string): ReactNode {
  const parts = text.split(TOKEN)
  return parts.map((part, i) => {
    if (!part) return null
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="mk-b">{part.slice(2, -2)}</strong>
    if (part.startsWith('~~') && part.endsWith('~~')) return <s key={i} className="mk-wrong">{part.slice(2, -2)}</s>
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>
    if (part === '___') return <span key={i} className="mk-blank" aria-label="blank" />
    return <Fragment key={i}>{part}</Fragment>
  })
}

export function Inline({ text, className }: { text: string; className?: string }) {
  return <span className={className}>{renderInline(text)}</span>
}

/** Strip markup for places where plain text is needed (aria labels, comparisons). */
export function plain(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/~~([^~]+)~~/g, '$1').replace(/\*([^*\n]+)\*/g, '$1')
}
