import type { BookMeta, Unit } from './types'

/**
 * Books are discovered automatically: drop a folder into src/content/books/<slug>/
 * with a book.json and units/unit-NNN.json files and it shows up on the home screen.
 */
const bookModules = import.meta.glob<{ default: BookMeta }>('./books/*/book.json', { eager: true })
const unitModules = import.meta.glob<{ default: Unit }>('./books/*/units/unit-*.json')

export const books: BookMeta[] = Object.values(bookModules)
  .map((m) => m.default)
  .sort((a, b) => a.title.localeCompare(b.title))

export function getBook(slug: string | undefined): BookMeta | undefined {
  return books.find((b) => b.slug === slug)
}

export const pad = (n: number) => String(n).padStart(3, '0')

const unitKey = (slug: string, n: number) => `./books/${slug}/units/unit-${pad(n)}.json`

export function hasUnit(slug: string, n: number): boolean {
  return unitKey(slug, n) in unitModules
}

/** Set of unit numbers that have authored content. */
export function availableUnits(slug: string): Set<number> {
  const prefix = `./books/${slug}/units/unit-`
  const set = new Set<number>()
  for (const key of Object.keys(unitModules)) {
    if (key.startsWith(prefix)) set.add(parseInt(key.slice(prefix.length, -5), 10))
  }
  return set
}

const cache = new Map<string, Unit>()

export async function loadUnit(slug: string, n: number): Promise<Unit | null> {
  const key = unitKey(slug, n)
  const loader = unitModules[key]
  if (!loader) return null
  const cached = cache.get(key)
  if (cached) return cached
  const mod = await loader()
  cache.set(key, mod.default)
  return mod.default
}

/** All unit numbers of a book in teaching order (from sections). */
export function orderedUnits(book: BookMeta): number[] {
  return book.sections.flatMap((s) => s.units)
}

export function nextAvailableUnit(book: BookMeta, after: number): number | null {
  const order = orderedUnits(book)
  const avail = availableUnits(book.slug)
  const idx = order.indexOf(after)
  for (let i = idx + 1; i < order.length; i++) if (avail.has(order[i])) return order[i]
  return null
}

export function sectionOf(book: BookMeta, unit: number): string | undefined {
  return book.sections.find((s) => s.units.includes(unit))?.title
}
