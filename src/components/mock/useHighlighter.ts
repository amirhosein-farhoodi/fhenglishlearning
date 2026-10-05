import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

/**
 * Highlighting for the reading passage, like the computer-delivered test's
 * "Highlight" tool: select text, press Highlight, it stays marked.
 *
 * It uses the CSS Custom Highlight API, which paints ranges without touching the
 * DOM - so React can keep owning the passage markup. Browsers without the API
 * (older Firefox) simply never show the tool.
 */

type HighlightCtor = new (...ranges: Range[]) => { add(r: Range): void; delete(r: Range): boolean; clear(): void; forEach(cb: (r: Range) => void): void; size: number }
type Registry = { set(name: string, h: unknown): void; delete(name: string): void }

const api = (() => {
  if (typeof window === 'undefined') return null
  const H = (window as unknown as { Highlight?: HighlightCtor }).Highlight
  const registry = (CSS as unknown as { highlights?: Registry }).highlights
  return H && registry ? { H, registry } : null
})()

export const highlightSupported = !!api

const NAME = 'mock-hl'

const overlaps = (a: Range, b: Range) => a.compareBoundaryPoints(Range.END_TO_START, b) < 0 && a.compareBoundaryPoints(Range.START_TO_END, b) > 0

export interface HighlightTool {
  /** Where to float the tool (viewport coordinates), or null when nothing is selected. */
  at: { x: number; y: number } | null
  /** The selection touches an existing highlight, so offer to clear it. */
  canClear: boolean
  highlight: () => void
  clear: () => void
  clearAll: () => void
  count: number
}

export function useHighlighter(container: RefObject<HTMLElement>): HighlightTool {
  const hl = useRef<InstanceType<HighlightCtor> | null>(null)
  const pending = useRef<Range | null>(null)
  const [at, setAt] = useState<HighlightTool['at']>(null)
  const [canClear, setCanClear] = useState(false)
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!api) return
    hl.current = new api.H()
    api.registry.set(NAME, hl.current)
    return () => api.registry.delete(NAME)
  }, [])

  useEffect(() => {
    if (!api) return
    const onSelect = () => {
      const sel = window.getSelection()
      const root = container.current
      if (!sel || sel.isCollapsed || !sel.rangeCount || !root) {
        pending.current = null
        setAt(null)
        return
      }
      const r = sel.getRangeAt(0)
      if (!root.contains(r.commonAncestorContainer)) {
        pending.current = null
        setAt(null)
        return
      }
      pending.current = r.cloneRange()
      const rect = r.getBoundingClientRect()
      let touches = false
      hl.current?.forEach((h) => {
        if (overlaps(h, r)) touches = true
      })
      setCanClear(touches)
      setAt({ x: rect.left + rect.width / 2, y: rect.top })
    }
    document.addEventListener('selectionchange', onSelect)
    return () => document.removeEventListener('selectionchange', onSelect)
  }, [container])

  const done = () => {
    window.getSelection()?.removeAllRanges()
    pending.current = null
    setAt(null)
    setCount(hl.current?.size ?? 0)
  }

  const highlight = useCallback(() => {
    if (pending.current) hl.current?.add(pending.current)
    done()
  }, [])

  const clear = useCallback(() => {
    const r = pending.current
    if (r && hl.current) {
      const hit: Range[] = []
      hl.current.forEach((h) => {
        if (overlaps(h, r)) hit.push(h)
      })
      hit.forEach((h) => hl.current!.delete(h))
    }
    done()
  }, [])

  const clearAll = useCallback(() => {
    hl.current?.clear()
    done()
  }, [])

  return { at, canClear, highlight, clear, clearAll, count }
}
