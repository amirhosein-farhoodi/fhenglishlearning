#!/usr/bin/env node
/**
 * validate-content.mjs - checks every book and unit JSON under src/content/books.
 * Run: npm run validate
 * Exits 1 on errors. Warnings (e.g. units listed in book.json without a file yet) do not fail.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(process.cwd(), 'src', 'content', 'books')
const CATEGORIES_FILE = join(process.cwd(), 'src', 'content', 'categories.ts')

/** Read the category ids straight out of categories.ts so the two cannot drift apart. */
const CATEGORY_IDS = (() => {
  const src = readFileSync(CATEGORIES_FILE, 'utf8')
  const m = src.match(/export const CATEGORY_IDS = \[([^\]]*)\]/)
  if (!m) throw new Error('could not find CATEGORY_IDS in src/content/categories.ts')
  return m[1].match(/'([^']+)'/g)?.map((q) => q.slice(1, -1)) ?? []
})()
const errors = []
const warnings = []
const err = (f, m) => errors.push(`${f}: ${m}`)
const warn = (f, m) => warnings.push(`${f}: ${m}`)

const norm = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

function checkStr(f, obj, key, { optional = false, min = 1 } = {}) {
  const v = obj[key]
  if (v === undefined) {
    if (!optional) err(f, `missing "${key}"`)
    return
  }
  if (typeof v !== 'string' || v.trim().length < min) err(f, `"${key}" must be a non-empty string`)
}

function validateBook(dir, slug) {
  const f = `${slug}/book.json`
  const p = join(dir, 'book.json')
  if (!existsSync(p)) {
    err(f, 'book.json missing')
    return null
  }
  let b
  try {
    b = JSON.parse(readFileSync(p, 'utf8'))
  } catch (e) {
    err(f, `invalid JSON: ${e.message}`)
    return null
  }
  if (b.slug !== slug) err(f, `slug "${b.slug}" must equal folder name "${slug}"`)
  for (const k of ['title', 'description', 'coverEmoji', 'accent']) checkStr(f, b, k)
  checkStr(f, b, 'cover', { optional: true })
  if (b.cover) {
    if (!b.cover.startsWith('/')) err(f, 'cover must be an absolute path like "/covers/my-book.jpg"')
    else if (!existsSync(join(process.cwd(), 'public', b.cover.replace(/^\//, ''))))
      err(f, `cover file public${b.cover} does not exist`)
  }
  if (b.accent && !/^#[0-9a-fA-F]{6}$/.test(b.accent)) err(f, 'accent must be a #rrggbb colour')
  if (b.category === undefined) warn(f, 'no "category" - the book falls back to the default shelf')
  else if (!CATEGORY_IDS.includes(b.category))
    err(f, `category "${b.category}" is not one of ${CATEGORY_IDS.join(', ')} (see src/content/categories.ts)`)
  if (b.order !== undefined && !Number.isInteger(b.order)) err(f, '"order" must be an integer')
  if (!Array.isArray(b.sections) || b.sections.length === 0) err(f, 'sections must be a non-empty array')
  if (!b.unitTitles || typeof b.unitTitles !== 'object') err(f, 'unitTitles must be an object')
  const listed = new Set()
  for (const s of b.sections ?? []) {
    if (typeof s.title !== 'string') err(f, 'section.title must be a string')
    if (!Array.isArray(s.units)) {
      err(f, `section "${s.title}" needs a units array`)
      continue
    }
    for (const n of s.units) {
      if (!Number.isInteger(n) || n < 1) err(f, `section "${s.title}" has invalid unit number ${n}`)
      if (listed.has(n)) err(f, `unit ${n} appears in more than one section`)
      listed.add(n)
      if (!b.unitTitles?.[String(n)]) err(f, `unitTitles is missing unit ${n}`)
    }
  }
  return { meta: b, listed }
}

function validateUnit(f, u, expectedNumber, bookTitles) {
  if (!Number.isInteger(u.number)) err(f, '"number" must be an integer')
  else if (expectedNumber !== null && u.number !== expectedNumber) err(f, `"number" ${u.number} does not match filename`)
  checkStr(f, u, 'title')
  const listedTitle = bookTitles?.[String(u.number)]
  if (listedTitle && u.title && u.title !== listedTitle)
    err(f, `"title" does not match book.json unitTitles["${u.number}"]:
         unit: ${u.title}
         book: ${listedTitle}`)
  checkStr(f, u, 'summary')
  checkStr(f, u, 'subtitle', { optional: true })
  if (u.passScore !== undefined && !(Number.isInteger(u.passScore) && u.passScore >= 1 && u.passScore <= 100))
    err(f, 'passScore must be an integer 1-100')

  if (!Array.isArray(u.lesson) || u.lesson.length < 2) err(f, 'lesson must have at least 2 blocks')
  ;(u.lesson ?? []).forEach((b, i) => {
    const bf = `${f} lesson[${i}]`
    switch (b.type) {
      case 'explain':
        checkStr(bf, b, 'text')
        checkStr(bf, b, 'heading', { optional: true })
        checkStr(bf, b, 'note', { optional: true })
        if (b.examples !== undefined) {
          if (!Array.isArray(b.examples)) err(bf, 'examples must be an array')
          else
            b.examples.forEach((e, j) => {
              checkStr(`${bf}.examples[${j}]`, e, 'text')
              checkStr(`${bf}.examples[${j}]`, e, 'wrong', { optional: true })
              checkStr(`${bf}.examples[${j}]`, e, 'note', { optional: true })
            })
        }
        break
      case 'compare':
        for (const side of ['left', 'right']) {
          if (!b[side]) {
            err(bf, `missing ${side}`)
            continue
          }
          checkStr(`${bf}.${side}`, b[side], 'label')
          if (!Array.isArray(b[side].examples) || b[side].examples.length === 0)
            err(bf, `${side}.examples must be a non-empty array`)
        }
        break
      case 'table':
        if (!Array.isArray(b.columns) || b.columns.length === 0) err(bf, 'columns must be a non-empty array')
        if (!Array.isArray(b.rows) || b.rows.length === 0) err(bf, 'rows must be a non-empty array')
        else
          b.rows.forEach((r, j) => {
            if (!Array.isArray(r) || r.length !== b.columns?.length) err(bf, `row ${j} must have ${b.columns?.length} cells`)
          })
        break
      case 'tip':
        checkStr(bf, b, 'text')
        break
      default:
        err(bf, `unknown lesson block type "${b.type}"`)
    }
  })

  if (!Array.isArray(u.exercises) || u.exercises.length < 5) err(f, 'exercises must have at least 5 items')
  const types = new Set()
  ;(u.exercises ?? []).forEach((x, i) => {
    const xf = `${f} exercises[${i}]`
    types.add(x.type)
    switch (x.type) {
      case 'mcq':
        checkStr(xf, x, 'prompt')
        if (!Array.isArray(x.options) || x.options.length < 2) err(xf, 'options needs 2+ entries')
        else if (new Set(x.options.map(norm)).size !== x.options.length) err(xf, 'options must be distinct')
        if (!Number.isInteger(x.answer) || x.answer < 0 || x.answer >= (x.options?.length ?? 0))
          err(xf, 'answer must index into options')
        break
      case 'true_false':
        checkStr(xf, x, 'statement')
        if (typeof x.answer !== 'boolean') err(xf, 'answer must be true/false')
        if (x.answer === false && !x.explanation)
          warn(xf, 'false statement without an explanation (add the corrected sentence)')
        break
      case 'fill_blank':
        checkStr(xf, x, 'prompt')
        if (((x.prompt ?? '').match(/___/g) ?? []).length !== 1) err(xf, 'prompt must contain exactly one ___')
        if (
          !Array.isArray(x.answers) ||
          x.answers.length === 0 ||
          x.answers.some((a) => typeof a !== 'string' || !a.trim())
        )
          err(xf, 'answers must be a non-empty string array')
        break
      case 'matching':
        checkStr(xf, x, 'prompt')
        if (!Array.isArray(x.pairs) || x.pairs.length < 3 || x.pairs.length > 6) err(xf, 'pairs must have 3-6 entries')
        else {
          x.pairs.forEach((p, j) => {
            checkStr(`${xf}.pairs[${j}]`, p, 'left')
            checkStr(`${xf}.pairs[${j}]`, p, 'right')
          })
          if (new Set(x.pairs.map((p) => norm(p.right))).size !== x.pairs.length)
            err(xf, 'right-hand items must be distinct')
          if (new Set(x.pairs.map((p) => norm(p.left))).size !== x.pairs.length)
            err(xf, 'left-hand items must be distinct')
        }
        break
      case 'word_order': {
        checkStr(xf, x, 'prompt')
        checkStr(xf, x, 'answer')
        if (!Array.isArray(x.words) || x.words.length < 3) err(xf, 'words needs 3+ entries')
        else {
          const joined = norm(x.words.join(' '))
          const ok = [x.answer, ...(x.alternatives ?? [])].some((a) => norm(a) === joined)
          if (!ok)
            err(
              xf,
              `words joined ("${x.words.join(' ')}") must equal answer ("${x.answer}") ignoring case/punctuation`,
            )
        }
        break
      }
      case 'categorize':
        checkStr(xf, x, 'prompt')
        if (!Array.isArray(x.categories) || x.categories.length < 2 || x.categories.length > 3)
          err(xf, 'categories must have 2-3 entries')
        if (!Array.isArray(x.items) || x.items.length < 4 || x.items.length > 8) err(xf, 'items must have 4-8 entries')
        else
          x.items.forEach((it, j) => {
            checkStr(`${xf}.items[${j}]`, it, 'text')
            if (!Number.isInteger(it.category) || it.category < 0 || it.category >= (x.categories?.length ?? 0))
              err(`${xf}.items[${j}]`, 'category must index into categories')
          })
        break
      default:
        err(xf, `unknown exercise type "${x.type}"`)
    }
  })
  if ((u.exercises ?? []).length >= 5 && types.size < 3)
    warn(f, `only ${types.size} exercise type(s) used - aim for 4+ for variety`)
}

if (!existsSync(ROOT)) {
  console.error(`No books folder at ${ROOT}`)
  process.exit(1)
}
const books = readdirSync(ROOT).filter((d) => statSync(join(ROOT, d)).isDirectory())
let unitCount = 0
/** category -> order -> slug, so two books cannot claim the same slot on a shelf. */
const shelfSlots = new Map()
const accents = new Map()
for (const slug of books) {
  const dir = join(ROOT, slug)
  const res = validateBook(dir, slug)
  if (res) {
    const { category = '(default)', order, accent } = res.meta
    if (order !== undefined) {
      const key = `${category}#${order}`
      const taken = shelfSlots.get(key)
      if (taken) err(`${slug}/book.json`, `order ${order} in category "${category}" is already used by ${taken}`)
      else shelfSlots.set(key, slug)
    }
    if (accent) {
      const taken = accents.get(accent.toLowerCase())
      if (taken) warn(`${slug}/book.json`, `accent ${accent} is already used by ${taken}`)
      else accents.set(accent.toLowerCase(), slug)
    }
  }
  const unitsDir = join(dir, 'units')
  const files = existsSync(unitsDir) ? readdirSync(unitsDir).filter((f) => f.endsWith('.json')).sort() : []
  const have = new Set()
  for (const file of files) {
    const f = `${slug}/units/${file}`
    const m = /^unit-(\d{3})\.json$/.exec(file)
    if (!m) {
      err(f, 'filename must look like unit-001.json')
      continue
    }
    const n = parseInt(m[1], 10)
    have.add(n)
    let u
    try {
      u = JSON.parse(readFileSync(join(unitsDir, file), 'utf8'))
    } catch (e) {
      err(f, `invalid JSON: ${e.message}`)
      continue
    }
    validateUnit(f, u, n, res?.meta?.unitTitles)
    unitCount++
    if (res && !res.listed.has(n)) err(f, `unit ${n} has a file but is not listed in any book.json section`)
  }
  if (res) {
    const missing = [...res.listed].filter((n) => !have.has(n)).sort((a, b) => a - b)
    if (missing.length)
      warn(
        `${slug}`,
        `${missing.length} unit(s) listed but not authored yet: ${missing.slice(0, 20).join(', ')}${missing.length > 20 ? ' ...' : ''}`,
      )
  }
}

for (const w of warnings) console.warn('WARN  ' + w)
for (const e of errors) console.error('ERROR ' + e)
console.log(
  `\n${books.length} book(s), ${unitCount} unit file(s) checked - ${errors.length} error(s), ${warnings.length} warning(s)`,
)
process.exit(errors.length ? 1 : 0)
