/**
 * Downloads Listening recordings up front and plays them from memory.
 *
 * Two reasons:
 *  - Nothing streams during the test, so a slow connection cannot stall a recording
 *    halfway through a part (the real test never buffers).
 *  - The <audio> element only ever sees `blob:` URLs. Download managers (IDM and the
 *    like) watch for media files a page loads and pop up a "download this?" panel over the
 *    test; they do not intercept fetch() requests or blob URLs, so the panel never appears.
 *
 * The cache lives for the page session. A refresh loads the files again (the browser's
 * HTTP cache usually makes that quick).
 */

const blobs = new Map<string, string>()
const inflight = new Map<string, Promise<string>>()

/** The in-memory copy of a recording, or the original URL if it is not loaded (yet). */
export function playableUrl(src: string): string {
  return blobs.get(src) ?? src
}

export function isLoaded(srcs: string[]): boolean {
  return srcs.every((s) => blobs.has(s))
}

export interface LoadProgress {
  loaded: number
  /** 0 until every file has reported its size. */
  total: number
  done: boolean
  error?: string
}

/** Fetch one file, reporting bytes as they arrive. */
async function fetchOne(src: string, onBytes: (loaded: number, total: number) => void): Promise<string> {
  const cached = blobs.get(src)
  if (cached) return cached
  const running = inflight.get(src)
  if (running) return running
  const job = (async () => {
    const res = await fetch(src, { mode: 'cors' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const total = Number(res.headers.get('content-length')) || 0
    const type = res.headers.get('content-type') || 'audio/mpeg'
    let blob: Blob
    if (res.body) {
      const reader = res.body.getReader()
      const chunks: BlobPart[] = []
      let loaded = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        loaded += value.length
        onBytes(loaded, total)
      }
      blob = new Blob(chunks, { type })
    } else {
      blob = await res.blob()
      onBytes(blob.size, blob.size)
    }
    const url = URL.createObjectURL(blob)
    blobs.set(src, url)
    return url
  })()
  inflight.set(src, job)
  try {
    return await job
  } finally {
    inflight.delete(src)
  }
}

/**
 * Load every recording a section needs (in parallel), calling `onProgress` with the
 * combined byte count. Resolves when all are in memory; rejects on the first failure.
 */
export async function preloadAudio(srcs: string[], onProgress: (p: LoadProgress) => void): Promise<void> {
  const unique = [...new Set(srcs)]
  const sizes = new Map<string, { loaded: number; total: number }>()
  const report = () => {
    let loaded = 0
    let total = 0
    let known = true
    for (const s of unique) {
      const x = sizes.get(s)
      if (blobs.has(s) && !x) continue
      loaded += x?.loaded ?? 0
      if (!x?.total) known = false
      total += x?.total ?? 0
    }
    onProgress({ loaded, total: known ? total : 0, done: false })
  }
  try {
    await Promise.all(
      unique.map((s) =>
        fetchOne(s, (loaded, total) => {
          sizes.set(s, { loaded, total })
          report()
        }),
      ),
    )
    onProgress({ loaded: 1, total: 1, done: true })
  } catch (e) {
    onProgress({ loaded: 0, total: 0, done: false, error: e instanceof Error ? e.message : String(e) })
    throw e
  }
}
