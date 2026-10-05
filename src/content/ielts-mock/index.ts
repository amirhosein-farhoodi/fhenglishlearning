import type { ListeningPart, ReadingPassage, WritingTask1, WritingTask2 } from './types'

/**
 * The mock-test content pool. Files are discovered by glob, so adding a passage or a
 * writing task is just dropping a JSON file in the right folder (see ./types.ts).
 * Everything loads lazily - the lobby only needs the ids, the exam loads the three
 * passages and two tasks it actually uses.
 */
const passageModules = import.meta.glob<{ default: ReadingPassage }>('./reading/p*.json')
const listeningModules = import.meta.glob<{ default: ListeningPart }>('./listening/p*.json')
const task1Modules = import.meta.glob<{ default: WritingTask1 }>('./writing/task1/*.json')
const task2Modules = import.meta.glob<{ default: WritingTask2 }>('./writing/task2/*.json')

const idOf = (key: string) => key.slice(key.lastIndexOf('/') + 1, -5)

const byId = <T,>(mods: Record<string, () => Promise<{ default: T }>>) =>
  Object.fromEntries(Object.entries(mods).map(([k, load]) => [idOf(k), load])) as Record<string, () => Promise<{ default: T }>>

const passages = byId(passageModules)
const listenings = byId(listeningModules)
const task1s = byId(task1Modules)
const task2s = byId(task2Modules)

/** Passage ids per slot: index 0 = Passage 1 pool, 1 = Passage 2, 2 = Passage 3. */
export const passagePool: [string[], string[], string[]] = [1, 2, 3].map((slot) =>
  Object.keys(passages)
    .filter((id) => id.startsWith(`p${slot}-`))
    .sort(),
) as [string[], string[], string[]]

/** Listening part ids per slot: index 0 = Part 1 pool ... index 3 = Part 4 pool. */
export const listeningPool: string[][] = [1, 2, 3, 4].map((slot) =>
  Object.keys(listenings)
    .filter((id) => id.startsWith(`p${slot}-`))
    .sort(),
)
/** A Listening paper needs at least one recording for every part. */
export const listeningReady = listeningPool.every((p) => p.length > 0)
export const task1Pool = Object.keys(task1s).sort()
export const task2Pool = Object.keys(task2s).sort()

const loadFrom = async <T,>(table: Record<string, () => Promise<{ default: T }>>, id: string): Promise<T> => {
  const load = table[id]
  if (!load) throw new Error(`Unknown mock content: ${id}`)
  return (await load()).default
}

export const loadPassage = (id: string) => loadFrom(passages, id)
export const loadListeningPart = (id: string) => loadFrom(listenings, id)
export const loadTask1 = (id: string) => loadFrom(task1s, id)
export const loadTask2 = (id: string) => loadFrom(task2s, id)
