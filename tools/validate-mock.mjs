#!/usr/bin/env node
/**
 * validate-mock.mjs - checks the IELTS Mock Test content under src/content/ielts-mock.
 * Run: npm run validate  (or node tools/validate-mock.mjs [file ...] to check only some files)
 * Exits 1 on errors. Warnings do not fail.
 *
 * What it guarantees, so a randomly assembled test is always a valid 40-question paper:
 *   - slot 1 and 2 passages have exactly 13 questions, slot 3 exactly 14
 *   - every completion answer respects the word limit and appears in the passage
 *   - every `evidence` quote is verbatim passage text
 *   - option letters, heading indexes and paragraph labels all resolve
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, basename, resolve } from 'node:path'

const ROOT = join(process.cwd(), 'src', 'content', 'ielts-mock')
const errors = []
const warnings = []
const err = (f, m) => errors.push(`${f}: ${m}`)
const warn = (f, m) => warnings.push(`${f}: ${m}`)

/** Loose text form for "does this quote/answer appear in the passage" checks. */
const flat = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/** Tokens for word-limit counting: hyphenated words are one word; numbers are counted apart. */
function countWords(answer) {
  const toks = String(answer).trim().split(/\s+/).filter(Boolean)
  let words = 0
  let numbers = 0
  for (const t of toks) {
    if (/^[\d.,:/%£$€-]+(st|nd|rd|th|s)?$/i.test(t) && /\d/.test(t)) numbers++
    else words++
  }
  return { words, numbers }
}

/** "(the) harbour" -> ["the harbour", "harbour"] */
function expandOptional(a) {
  const m = a.match(/\(([^)]+)\)/)
  if (!m) return [a.replace(/\s+/g, ' ').trim()]
  const withIt = a.replace(m[0], m[1])
  const without = a.replace(m[0], '')
  return [...expandOptional(withIt), ...expandOptional(without)]
}

const gapNums = (s) => [...String(s).matchAll(/\{(\d+)\}/g)].map((m) => Number(m[1]))

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    err(file, `invalid JSON - ${e.message}`)
    return null
  }
}

const isStr = (v, min = 1) => typeof v === 'string' && v.trim().length >= min

/* --------------------------------------------------------------- Reading */

const EXPECTED = { 1: 13, 2: 13, 3: 14 }

function checkEvidence(f, where, item, text, { required = false } = {}) {
  if (!text) return
  if (item.evidence === undefined) {
    if (required) err(f, `${where}: missing evidence`)
    return
  }
  if (!isStr(item.evidence, 8)) return err(f, `${where}: evidence too short`)
  if (!text.includes(flat(item.evidence))) err(f, `${where}: evidence is not verbatim passage text: "${item.evidence.slice(0, 70)}..."`)
}

function questionsIn(g) {
  switch (g.type) {
    case 'multi':
      return Array.isArray(g.answers) ? g.answers.length : 0
    case 'completion':
    case 'summary-box':
      return Array.isArray(g.answers) ? g.answers.length : 0
    default:
      return Array.isArray(g.items) ? g.items.length : 0
  }
}

function checkPassage(file) {
  const f = basename(file)
  const p = readJson(file)
  if (!p) return
  const id = f.replace(/\.json$/, '')
  if (p.id !== id) err(f, `id "${p.id}" must equal the file name "${id}"`)
  const slotFromName = Number((f.match(/^p([123])-/) || [])[1])
  if (!slotFromName) err(f, 'file name must start with p1-, p2- or p3-')
  if (p.slot !== slotFromName) err(f, `slot ${p.slot} does not match file name`)
  for (const k of ['title', 'topic']) if (!isStr(p[k])) err(f, `missing "${k}"`)
  if (!Array.isArray(p.paragraphs) || p.paragraphs.length < 4) return err(f, 'needs at least 4 paragraphs')
  const fullText = flat(p.paragraphs.map((x) => x.text).join(' '))
  const words = fullText.split(' ').length
  if (words < 650) err(f, `passage is only ${words} words (real passages run 700-950)`)
  else if (words < 720) warn(f, `passage is ${words} words - on the short side`)
  if (words > 1050) warn(f, `passage is ${words} words - long for one passage`)

  const labels = p.paragraphs.map((x) => x.label).filter(Boolean)
  if (labels.length && labels.length !== p.paragraphs.length) err(f, 'label every paragraph or none')
  labels.forEach((l, i) => {
    if (l !== String.fromCharCode(65 + i)) err(f, `paragraph ${i + 1} label should be ${String.fromCharCode(65 + i)}, got ${l}`)
  })
  const labelSet = new Set(labels)

  if (!Array.isArray(p.groups) || p.groups.length < 2) return err(f, 'needs at least 2 question groups')
  if (p.groups.length > 4) warn(f, `${p.groups.length} question groups - real passages use 2-4`)
  const total = checkGroups(f, p.groups, fullText, labels, { listening: false })
  if (EXPECTED[p.slot] && total !== EXPECTED[p.slot]) err(f, `has ${total} questions - slot ${p.slot} needs exactly ${EXPECTED[p.slot]}`)
}

/**
 * Checks one passage's or part's question groups and returns how many questions they hold.
 * `fullText` is the passage (Reading) or the transcript (Listening, may be empty).
 */
function checkGroups(f, groups, fullText, labels, { listening, prefix = '' }) {
  const labelSet = new Set(labels)
  let total = 0
  groups.forEach((g, gi) => {
    const at = `${prefix}group ${gi + 1} (${g.type})`
    total += questionsIn(g)
    switch (g.type) {
      case 'tfng':
      case 'ynng': {
        const vals = g.type === 'tfng' ? ['TRUE', 'FALSE', 'NOT GIVEN'] : ['YES', 'NO', 'NOT GIVEN']
        if (g.type === 'ynng' && !['claims', 'views'].includes(g.of)) err(f, `${at}: "of" must be claims or views`)
        if (!Array.isArray(g.items) || g.items.length < 3) return err(f, `${at}: needs 3+ items`)
        g.items.forEach((it, i) => {
          if (!isStr(it.statement)) err(f, `${at} item ${i + 1}: missing statement`)
          if (!vals.includes(it.answer)) err(f, `${at} item ${i + 1}: answer must be one of ${vals.join('/')}`)
          if (it.answer === 'NOT GIVEN') {
            if (!isStr(it.note)) err(f, `${at} item ${i + 1}: NOT GIVEN needs a note`)
            if (it.evidence) checkEvidence(f, `${at} item ${i + 1}`, it, fullText)
          } else checkEvidence(f, `${at} item ${i + 1}`, it, fullText, { required: true })
        })
        const used = new Set(g.items.map((x) => x.answer))
        if (used.size < 3 && g.items.length >= 4) warn(f, `${at}: uses only ${[...used].join('/')} - real sets mix all three`)
        break
      }
      case 'headings': {
        if (!labels.length) err(f, `${at}: headings need labelled paragraphs`)
        if (!Array.isArray(g.headings) || !Array.isArray(g.items)) return err(f, `${at}: needs headings and items`)
        if (g.headings.length < g.items.length + 2) err(f, `${at}: needs at least 2 more headings than paragraphs (${g.headings.length} for ${g.items.length})`)
        const seen = new Set()
        g.items.forEach((it, i) => {
          if (!labelSet.has(it.paragraph)) err(f, `${at} item ${i + 1}: unknown paragraph ${it.paragraph}`)
          if (!Number.isInteger(it.answer) || it.answer < 0 || it.answer >= g.headings.length) err(f, `${at} item ${i + 1}: answer index out of range`)
          if (seen.has(it.answer)) err(f, `${at} item ${i + 1}: heading ${it.answer} used twice`)
          seen.add(it.answer)
          if (seen.has(`p${it.paragraph}`)) err(f, `${at}: paragraph ${it.paragraph} asked twice`)
          seen.add(`p${it.paragraph}`)
        })
        break
      }
      case 'matching': {
        if (!['information', 'features', 'sentence-endings'].includes(g.kind)) err(f, `${at}: bad kind`)
        if (!Array.isArray(g.options) || !Array.isArray(g.items)) return err(f, `${at}: needs options and items`)
        const keys = g.options.map((o) => o.key)
        if (new Set(keys).size !== keys.length) err(f, `${at}: duplicate option keys`)
        keys.forEach((k, i) => {
          if (k !== String.fromCharCode(65 + i)) err(f, `${at}: option keys must run A, B, C ... (got ${k})`)
        })
        if (g.kind === 'information') {
          if (keys.join() !== labels.join()) err(f, `${at}: information options must be exactly the paragraph letters`)
        } else {
          if (!g.image) g.options.forEach((o, i) => isStr(o.text) || err(f, `${at} option ${i + 1}: missing text`))
          if (g.options.length <= g.items.length && !g.reuse) err(f, `${at}: needs more options than items`)
        }
        if (g.kind === 'sentence-endings' && g.options.length < g.items.length + 2) err(f, `${at}: sentence endings need 2+ spare endings`)
        const ans = g.items.map((x) => x.answer)
        g.items.forEach((it, i) => {
          if (!isStr(it.text)) err(f, `${at} item ${i + 1}: missing text`)
          if (!keys.includes(it.answer)) err(f, `${at} item ${i + 1}: answer ${it.answer} not an option`)
          checkEvidence(f, `${at} item ${i + 1}`, it, fullText, { required: !listening })
        })
        if (!g.reuse && new Set(ans).size !== ans.length) err(f, `${at}: an answer repeats but reuse is false`)
        if (g.reuse && new Set(ans).size === ans.length && g.kind === 'information') warn(f, `${at}: reuse is true but no letter repeats`)
        break
      }
      case 'mcq': {
        if (!Array.isArray(g.items)) return err(f, `${at}: needs items`)
        g.items.forEach((it, i) => {
          if (!isStr(it.stem)) err(f, `${at} item ${i + 1}: missing stem`)
          const n = listening ? [3, 4] : [4]
          if (!Array.isArray(it.options) || !n.includes(it.options.length)) err(f, `${at} item ${i + 1}: needs ${n.join(' or ')} options`)
          if (!Number.isInteger(it.answer) || it.answer < 0 || it.answer >= (it.options?.length ?? 4)) err(f, `${at} item ${i + 1}: answer out of range`)
          checkEvidence(f, `${at} item ${i + 1}`, it, fullText, { required: !listening })
        })
        const dist = new Set(g.items.map((x) => x.answer))
        if (g.items.length >= 3 && dist.size === 1) warn(f, `${at}: every answer is the same letter`)
        break
      }
      case 'multi': {
        if (!isStr(g.stem)) err(f, `${at}: missing stem`)
        const most = listening ? 8 : 7
        if (!Array.isArray(g.options) || g.options.length < 5 || g.options.length > most) err(f, `${at}: needs 5-${most} options`)
        if (!Array.isArray(g.answers) || g.answers.length < 2 || g.answers.length > 3) err(f, `${at}: needs 2-3 answers`)
        else {
          if (new Set(g.answers).size !== g.answers.length) err(f, `${at}: duplicate answers`)
          g.answers.forEach((a) => (Number.isInteger(a) && a >= 0 && a < (g.options?.length ?? 0)) || err(f, `${at}: answer ${a} out of range`))
        }
        if (g.evidence) checkEvidence(f, at, g, fullText)
        if (!listening && !g.evidence && !isStr(g.note)) err(f, `${at}: needs evidence or note`)
        break
      }
      case 'completion': {
        const layouts = ['sentences', 'summary', 'notes', 'flowchart', 'short', 'table']
        if (!layouts.includes(g.layout)) err(f, `${at}: bad layout`)
        if (!g.limit || ![1, 2, 3].includes(g.limit.words) || typeof g.limit.number !== 'boolean') err(f, `${at}: limit must be {words:1|2|3, number:boolean}`)
        const cells = g.layout === 'table' ? (g.table?.rows ?? []).flat().concat(g.table?.columns ?? []) : g.lines ?? []
        if (g.layout === 'table' && (!g.table || !Array.isArray(g.table.rows))) err(f, `${at}: table layout needs table`)
        if (g.layout === 'table' && g.table) g.table.rows.forEach((r, i) => r.length !== g.table.columns.length && err(f, `${at}: table row ${i + 1} has ${r.length} cells, expected ${g.table.columns.length}`))
        if (g.layout !== 'table' && (!Array.isArray(g.lines) || !g.lines.length)) err(f, `${at}: needs lines`)
        const nums = cells.flatMap(gapNums)
        const n = Array.isArray(g.answers) ? g.answers.length : 0
        if (nums.join() !== Array.from({ length: n }, (_, i) => i + 1).join()) err(f, `${at}: gaps ${nums.join(',')} must be {1}..{${n}} once each, in order`)
        ;(g.answers ?? []).forEach((a, i) => {
          if (!Array.isArray(a.accept) || !a.accept.length) return err(f, `${at} gap ${i + 1}: needs accept[]`)
          for (const acc of a.accept.flatMap(expandOptional)) {
            const c = countWords(acc)
            const limitOk = c.words <= (g.limit?.words ?? 0) && (g.limit?.number ? c.numbers <= 1 : c.numbers === 0)
            if (!limitOk) err(f, `${at} gap ${i + 1}: "${acc}" breaks the word limit`)
          }
          const primary = expandOptional(a.accept[0])
          // Reading answers are copied from the passage; Listening answers are heard, so only warn.
          if (fullText && !primary.some((x) => fullText.includes(flat(x)))) (listening ? warn : err)(f, `${at} gap ${i + 1}: "${a.accept[0]}" does not appear in the ${listening ? 'transcript' : 'passage (answers are taken from the text)'}`)
          checkEvidence(f, `${at} gap ${i + 1}`, a, fullText, { required: !listening })
        })
        break
      }
      case 'summary-box': {
        if (!Array.isArray(g.lines) || !Array.isArray(g.options) || !Array.isArray(g.answers)) return err(f, `${at}: needs lines, options, answers`)
        const keys = g.options.map((o) => o.key)
        keys.forEach((k, i) => k !== String.fromCharCode(65 + i) && err(f, `${at}: option keys must run A, B, C ...`))
        if (g.options.length < g.answers.length + 3) err(f, `${at}: needs at least 3 spare options`)
        const nums = g.lines.flatMap(gapNums)
        if (nums.join() !== Array.from({ length: g.answers.length }, (_, i) => i + 1).join()) err(f, `${at}: gaps must be {1}..{${g.answers.length}} in order`)
        g.answers.forEach((a, i) => {
          if (!keys.includes(a.answer)) err(f, `${at} gap ${i + 1}: answer ${a.answer} not an option`)
          checkEvidence(f, `${at} gap ${i + 1}`, a, fullText, { required: !listening })
        })
        break
      }
      default:
        err(f, `${at}: unknown group type`)
    }
  })
  return total
}

/* --------------------------------------------------------------- Listening */

function checkListening(file) {
  const f = basename(file)
  const p = readJson(file)
  if (!p) return
  const id = f.replace(/\.json$/, '')
  if (p.id !== id) err(f, 'id must equal the file name')
  const slot = Number((f.match(/^p([1-4])-/) || [])[1])
  if (!slot) err(f, 'file name must start with p1- to p4-')
  if (p.part !== slot) err(f, `part ${p.part} does not match the file name`)
  for (const k of ['title', 'intro', 'audio']) if (!isStr(p[k])) err(f, `missing "${k}"`)
  const isLocal = (src) => typeof src === 'string' && src.startsWith('/')
  if (isLocal(p.audio) && !existsSync(join(process.cwd(), 'public', p.audio))) err(f, `audio ${p.audio} is not in public/`)
  for (const g of p.groups ?? []) if (g.type === 'matching' && g.image && isLocal(g.image) && !existsSync(join(process.cwd(), 'public', g.image))) err(f, `image ${g.image} is not in public/`)
  if (!Array.isArray(p.groups) || !p.groups.length) return err(f, 'needs question groups')
  const transcript = Array.isArray(p.transcript) ? flat(p.transcript.join(' ')) : ''
  const n = checkGroups(f, p.groups, transcript, [], { listening: true })
  if (n < 3) err(f, `only ${n} questions`)
  if (!Array.isArray(p.steps) || !p.steps.some((x) => x.kind === 'play')) return err(f, 'steps need at least one play step')
  let lastTo = -1
  p.steps.forEach((st, i) => {
    const at = `step ${i + 1} (${st.kind})`
    if (st.kind === 'play') {
      if (!(typeof st.from === 'number' && typeof st.to === 'number' && st.to > st.from && st.from >= 0)) err(f, `${at}: needs from < to`)
      if (st.from < lastTo) warn(f, `${at}: plays audio before the end of the previous clip`)
      lastTo = st.to
    } else if (st.kind === 'read') {
      if (!(st.seconds > 0)) err(f, `${at}: seconds must be positive`)
      const [a, b] = st.questions ?? []
      if (!(Number.isInteger(a) && Number.isInteger(b) && a >= 1 && b >= a && b <= n)) err(f, `${at}: questions must be a range inside 1-${n}`)
    } else if (st.kind === 'check') {
      if (!(st.seconds > 0)) err(f, `${at}: seconds must be positive`)
    } else err(f, `${at}: unknown step`)
  })
  if (!p.steps.some((x) => x.kind === 'read')) warn(f, 'a part normally gives reading time before its recording')
  return n
}

/* --------------------------------------------------------------- Writing */

const wc = (s) => String(s).trim().split(/\s+/).filter(Boolean).length

function checkVisual(f, v, i) {
  const at = `visual ${i + 1} (${v.type})`
  if (!isStr(v.title)) err(f, `${at}: missing title`)
  switch (v.type) {
    case 'line':
      if (!Array.isArray(v.xLabels) || v.xLabels.length < 3) err(f, `${at}: needs 3+ xLabels`)
      ;(v.series ?? []).forEach((s) => s.values?.length !== v.xLabels?.length && err(f, `${at}: series "${s.name}" length differs from xLabels`))
      if (!v.series?.length) err(f, `${at}: needs series`)
      break
    case 'bar':
      if (!Array.isArray(v.categories) || v.categories.length < 2) err(f, `${at}: needs categories`)
      ;(v.series ?? []).forEach((s) => s.values?.length !== v.categories?.length && err(f, `${at}: series "${s.name}" length differs from categories`))
      if (!v.series?.length) err(f, `${at}: needs series`)
      break
    case 'pie': {
      const sum = (v.slices ?? []).reduce((n, s) => n + s.value, 0)
      if (Math.abs(sum - 100) > 0.6) err(f, `${at}: slices add up to ${sum}, not 100`)
      if ((v.slices ?? []).length < 3 || v.slices.length > 8) err(f, `${at}: needs 3-8 slices`)
      break
    }
    case 'table':
      if (!Array.isArray(v.columns) || !Array.isArray(v.rows)) err(f, `${at}: needs columns and rows`)
      else v.rows.forEach((r, ri) => r.length !== v.columns.length && err(f, `${at}: row ${ri + 1} has ${r.length} cells`))
      break
    case 'process':
      if (!Array.isArray(v.steps) || v.steps.length < 4 || v.steps.length > 12) err(f, `${at}: needs 4-12 steps`)
      break
    case 'map':
      if (!Array.isArray(v.features) || v.features.length < 4) err(f, `${at}: needs 4+ features`)
      ;(v.features ?? []).forEach((ft) => {
        if (![ft.x, ft.y, ft.w, ft.h].every((n) => typeof n === 'number' && n >= 0 && n <= 12)) err(f, `${at}: feature "${ft.label}" outside the 12x12 grid`)
        if (ft.x + ft.w > 12 || ft.y + ft.h > 12) err(f, `${at}: feature "${ft.label}" spills off the grid`)
      })
      break
    default:
      err(f, `${at}: unknown visual type`)
  }
}

function checkTask1(file) {
  const f = basename(file)
  const t = readJson(file)
  if (!t) return
  if (t.id !== f.replace(/\.json$/, '')) err(f, 'id must equal the file name')
  if (!['line', 'bar', 'pie', 'table', 'process', 'map', 'mixed'].includes(t.kind)) err(f, 'bad kind')
  if (!isStr(t.prompt, 20)) err(f, 'missing prompt')
  if (!Array.isArray(t.visuals) || !t.visuals.length) err(f, 'needs visuals')
  else t.visuals.forEach((v, i) => checkVisual(f, v, i))
  const w = wc(t.model ?? '')
  if (w < 160 || w > 260) err(f, `model answer is ${w} words (want 170-220)`)
}

function checkTask2(file) {
  const f = basename(file)
  const t = readJson(file)
  if (!t) return
  if (t.id !== f.replace(/\.json$/, '')) err(f, 'id must equal the file name')
  if (!['opinion', 'discussion', 'advantages', 'problem-solution', 'two-part'].includes(t.kind)) err(f, 'bad kind')
  for (const k of ['topic', 'statement', 'question']) if (!isStr(t[k])) err(f, `missing ${k}`)
  const w = wc(t.model ?? '')
  if (w < 260 || w > 380) err(f, `model answer is ${w} words (want 270-330)`)
}

/* --------------------------------------------------------------- Run */

const only = process.argv.slice(2).map((p) => resolve(p))
const list = (dir) => (existsSync(dir) ? readdirSync(dir).filter((x) => x.endsWith('.json')).map((x) => join(dir, x)) : [])
const pick = (files) => (only.length ? files.filter((x) => only.includes(resolve(x))) : files)

const listenings = pick(list(join(ROOT, 'listening')).filter((x) => /[\\/]p[1-4]-/.test(x)))
const passages = pick(list(join(ROOT, 'reading')))
const t1 = pick(list(join(ROOT, 'writing', 'task1')))
const t2 = pick(list(join(ROOT, 'writing', 'task2')))
listenings.forEach(checkListening)
passages.forEach(checkPassage)
t1.forEach(checkTask1)
t2.forEach(checkTask2)

if (!only.length) {
  const bySlot = [1, 2, 3].map((s) => passages.filter((x) => basename(x).startsWith(`p${s}-`)).length)
  bySlot.forEach((n, i) => n === 0 && err('reading', `no passages for slot ${i + 1}`))
  if (!t1.length) err('writing', 'no Task 1 prompts')
  if (!t2.length) err('writing', 'no Task 2 prompts')
  const lSlots = [1, 2, 3, 4].map((k) => listenings.filter((x) => basename(x).startsWith(`p${k}-`)).length)
  if (listenings.length && lSlots.includes(0)) warn('listening', `parts per slot ${lSlots.join(' / ')} - every slot needs one before Listening can run`)
  console.log(`IELTS mock: ${lSlots.join(' / ')} listening parts per slot, ${bySlot.join(' / ')} passages per slot, ${t1.length} Task 1, ${t2.length} Task 2`)
}

warnings.forEach((w) => console.log(`warn  ${w}`))
errors.forEach((e) => console.log(`ERROR ${e}`))
if (errors.length) {
  console.log(`\n${errors.length} error(s)`)
  process.exit(1)
}
console.log('IELTS mock content OK')
