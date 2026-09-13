#!/usr/bin/env node
/**
 * link-ielts-media.mjs - resolve media placeholders in the IELTS units.
 *
 * Units are authored with the book's own reference instead of a URL:
 *
 *   { "kind": "audio", "src": "AUDIO:14", "title": "..." }
 *
 * This script swaps each "AUDIO:n" / "VIDEO:n" for the real file URL from
 * tools/ielts-media.json (built from public/uploads/ielts-cambridge-uploads.md),
 * so a track number can never be mistyped into a wrong link by hand.
 * Re-running it is safe: an already-resolved src is left alone.
 *
 * Run: node tools/link-ielts-media.mjs [--check]
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const UNITS = join(process.cwd(), 'src', 'content', 'books', 'ielts-cambridge', 'units')
const MAP = JSON.parse(readFileSync(join(process.cwd(), 'tools', 'ielts-media.json'), 'utf8'))
const check = process.argv.includes('--check')

let changed = 0
let resolved = 0
const problems = []

for (const file of readdirSync(UNITS).filter((f) => f.endsWith('.json')).sort()) {
  const path = join(UNITS, file)
  const raw = readFileSync(path, 'utf8')
  const unit = JSON.parse(raw)
  if (!Array.isArray(unit.media)) continue

  for (const clip of unit.media) {
    const m = /^(AUDIO|VIDEO):(\d+)$/.exec(clip.src ?? '')
    if (!m) {
      if (!/^https?:\/\//.test(clip.src ?? '')) problems.push(`${file}: unresolved src "${clip.src}"`)
      continue
    }
    const [, kindToken, n] = m
    const kind = kindToken === 'VIDEO' ? 'video' : 'audio'
    const url = MAP[kind][n]
    if (!url) {
      problems.push(`${file}: no ${kind} ${n} in tools/ielts-media.json`)
      continue
    }
    if (clip.kind !== kind) problems.push(`${file}: "${clip.src}" but kind is "${clip.kind}"`)
    clip.src = url
    resolved++
  }

  const next = JSON.stringify(unit, null, 2) + '\n'
  if (next !== raw) {
    changed++
    if (!check) writeFileSync(path, next)
  }
}

for (const p of problems) console.error('ERROR ' + p)
console.log(`${resolved} clip(s) resolved, ${changed} file(s) ${check ? 'would change' : 'written'}`)
process.exit(problems.length ? 1 : 0)
