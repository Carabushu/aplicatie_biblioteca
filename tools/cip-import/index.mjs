// Import CIP (Bibliografia cărților în curs de apariție, BNaR) → CSV pentru tabelul cip_books.
//
//   node index.mjs                 # toate numerele disponibile (1998–prezent)
//   node index.mjs --from 2010     # doar din 2010 încoace
//   node index.mjs --only 2023-12  # un singur număr (test)
//
// PDF-urile se păstrează în ./cache (se descarcă o singură dată). Rezultate în ./out.
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import path from 'node:path'
import { extractLines } from './extract.mjs'
import { parseIssue } from './parse.mjs'

const PAGES = ['https://bibnat.ro/bibliografia-cip/', 'https://bibnat.ro/arhiva-cip/']
const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie']

const args = process.argv.slice(2)
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def }
const FROM = Number(opt('--from', '1998'))
const ONLY = opt('--only', null)

await mkdir('cache', { recursive: true })
await mkdir('out', { recursive: true })

// ---------- 1. lista de numere ----------
async function listIssues() {
  const issues = new Map() // "2023-12" → { url, label }
  for (const page of PAGES) {
    const html = await (await fetch(page, { headers: { 'User-Agent': 'biblioteca-acasa-cip-import/1.0 (uz personal)' } })).text()
    // <a href="...pdf">Bibliografia CIP – decembrie 2023</a>
    const re = /<a[^>]+href="([^"]+\.pdf)"[^>]*>([^<]*)<\/a>/gi
    let m
    while ((m = re.exec(html))) {
      const url = m[1].replace(/&amp;/g, '&')
      const label = m[2].replace(/\s+/g, ' ').trim()
      const probe = (label + ' ' + decodeURIComponent(url)).toLowerCase()
      const mi = MONTHS.findIndex(mo => new RegExp(`\\b${mo}\\b`).test(probe))
      const y = probe.match(/\b(19|20)\d{2}\b/)
      if (mi < 0 || !y) continue
      const key = `${y[0]}-${String(mi + 1).padStart(2, '0')}`
      if (!issues.has(key)) issues.set(key, { url, label })
    }
  }
  return [...issues.entries()].sort(([a], [b]) => a.localeCompare(b))
}

// ---------- 2. descărcare cu cache ----------
async function download(key, url) {
  const file = path.join('cache', `${key}.pdf`)
  try { if ((await stat(file)).size > 10_000) return file } catch { /* nu există */ }
  if (!url) throw new Error('lipsește din cache')
  const res = await fetch(url, { headers: { 'User-Agent': 'biblioteca-acasa-cip-import/1.0 (uz personal)' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(file))
  return file
}

// ---------- 3. CSV ----------
const COLS = ['isbn', 'title', 'author', 'statement', 'publisher', 'place', 'year', 'edition', 'udc', 'audience', 'series', 'series_volume', 'cip', 'issue', 'needs_review']
const esc = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }

// ---------- rulare ----------
const LOCAL = args.includes('--local') // doar PDF-urile deja din ./cache (fără internet)
const all = await (LOCAL
  ? (await import('node:fs/promises')).readdir('cache').then(fs => fs.filter(f => /^\d{4}-\d{2}\.pdf$/.test(f)).sort().map(f => [f.slice(0, 7), { url: null, label: f }]))
  : listIssues())

console.log(`Găsite ${all.length} numere CIP (${all[0]?.[0]} … ${all.at(-1)?.[0]})`)
const selected = all.filter(([k]) => Number(k.slice(0, 4)) >= FROM && (!ONLY || k === ONLY))
console.log(`Se procesează ${selected.length} numere`)

const byIsbn = new Map()
const report = []
let done = 0
for (const [key, { url }] of selected) {
  done++
  const t0 = Date.now()
  try {
    const file = await download(key, url)
    const lines = await extractLines(file)
    const { records, problems, entries } = parseIssue(lines, key)
    let added = 0
    for (const r of records) {
      if (!r.isbn) continue
      const prev = byIsbn.get(r.isbn)
      if (!prev || prev.issue < key) { byIsbn.set(r.isbn, r); added++ } // numărul mai nou câștigă
    }
    const row = { issue: key, entries, records: records.length, withIsbn: records.filter(r => r.isbn).length, children: records.filter(r => r.audience === 'copii').length, needsReview: records.filter(r => r.needs_review).length, problems: problems.length, seconds: +((Date.now() - t0) / 1000).toFixed(1) }
    report.push(row)
    console.log(`[${done}/${selected.length}] ${key}: ${entries} intrări, ${row.withIsbn} ISBN, ${row.children} copii, ${row.needsReview} de verificat (${row.seconds}s)`)
    if (entries < 100) console.warn(`   ⚠ puține intrări în ${key} — formatul poate diferi; verifică manual`)
  } catch (e) {
    report.push({ issue: key, error: String(e) })
    console.error(`[${done}/${selected.length}] ${key}: EROARE ${e}`)
  }
}

const rows = [...byIsbn.values()].sort((a, b) => a.issue.localeCompare(b.issue))
const csv = ['﻿' + COLS.join(','), ...rows.map(r => COLS.map(c => esc(r[c])).join(','))].join('\n')
await writeFile('out/cip_books.csv', csv)
await writeFile('out/report.json', JSON.stringify(report, null, 1))
console.log(`\nTotal: ${rows.length} ISBN-uri unice → out/cip_books.csv (${(Buffer.byteLength(csv) / 1e6).toFixed(1)} MB)`)
console.log(`Copii: ${rows.filter(r => r.audience === 'copii').length}; de verificat: ${rows.filter(r => r.needs_review).length}`)
console.log('Raport per număr: out/report.json')
