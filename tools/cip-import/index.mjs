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
import https from 'node:https'
import http from 'node:http'

/** GET cu redirecturi; pentru serverul vechi (oldsite.bibnat.ro) acceptăm certificatul expirat/greșit. */
function getStream(url, hops = 0) {
  return new Promise((resolve, reject) => {
    if (hops > 5) return reject(new Error('prea multe redirecturi'))
    const u = new URL(url)
    const lib = u.protocol === 'http:' ? http : https
    const insecure = /oldsite\.bibnat\.ro$/i.test(u.hostname)
    const req = lib.get(u, { headers: { 'User-Agent': 'biblioteca-acasa-cip-import/1.0 (uz personal)' }, rejectUnauthorized: !insecure, timeout: 60_000 }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume()
        return resolve(getStream(new URL(res.headers.location, u).href, hops + 1))
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)) }
      resolve(res)
    })
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
  })
}

/** Toate capturile Wayback ale unui URL (status 200), cele mai mari primele — capturile trunchiate sunt frecvente la PDF-uri. */
async function waybackUrls(url) {
  try {
    const bare = url.replace(/^https?:\/\//, '')
    const r = await fetch(`https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(bare)}&output=json&fl=timestamp,length,statuscode,digest&filter=statuscode:200`, { signal: AbortSignal.timeout(30_000) })
    if (!r.ok) return []
    const rows = await r.json()
    const seen = new Set()
    return rows.slice(1)
      .map(([ts, len, , digest]) => ({ ts, len: Number(len) || 0, digest }))
      .filter(c => { if (seen.has(c.digest)) return false; seen.add(c.digest); return true })
      .sort((a, b) => b.len - a.len)
      .slice(0, 4)
      .map(c => `https://web.archive.org/web/${c.ts}id_/${url}`)
  } catch { return [] }
}

/** Un PDF întreg are marcajul %%EOF aproape de final. */
async function isValidPdf(file) {
  try {
    const st = await stat(file)
    if (st.size < 10_000) return false
    const fh = await (await import('node:fs/promises')).open(file, 'r')
    const buf = Buffer.alloc(Math.min(4096, st.size))
    await fh.read(buf, 0, buf.length, st.size - buf.length)
    await fh.close()
    return buf.includes('%%EOF')
  } catch { return false }
}

async function download(key, url) {
  const file = path.join('cache', `${key}.pdf`)
  if (await isValidPdf(file)) return file
  if (!url) throw new Error('lipsește din cache sau e trunchiat')
  const candidates = [url]
  if (url.startsWith('https://')) candidates.push(url.replace(/^https:/, 'http:'))
  // serverul vechi al BNaR nu mai are fișierele (404) → încercăm copiile din Internet Archive
  candidates.push(...await waybackUrls(url))
  let lastErr
  for (const u of candidates) {
    try {
      const res = await getStream(u)
      await pipeline(res, createWriteStream(file))
      if (!(await isValidPdf(file))) throw new Error('fișier incomplet sau nevalid')
      if (u.includes('web.archive.org')) console.log(`   (din Internet Archive)`)
      return file
    } catch (e) {
      lastErr = e
    }
  }
  throw new Error(`${lastErr?.message ?? lastErr}${lastErr?.cause ? ' / ' + lastErr.cause.message : ''} (${url})`)
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
    if (lines.length < 50) {
      report.push({ issue: key, scanned: true })
      console.log(`[${done}/${selected.length}] ${key}: PDF scanat (fără strat de text) — sărit; ar necesita OCR`)
      continue
    }
    const { records, problems, entries, stoppedEarly } = parseIssue(lines, key)
    let added = 0
    for (const r of records) {
      if (!r.isbn) continue
      const prev = byIsbn.get(r.isbn)
      if (!prev || prev.issue < key) { byIsbn.set(r.isbn, r); added++ } // numărul mai nou câștigă
    }
    const row = { issue: key, entries, stoppedEarly, records: records.length, withIsbn: records.filter(r => r.isbn).length, children: records.filter(r => r.audience === 'copii').length, needsReview: records.filter(r => r.needs_review).length, problems: problems.length, seconds: +((Date.now() - t0) / 1000).toFixed(1) }
    report.push(row)
    console.log(`[${done}/${selected.length}] ${key}: ${entries} intrări, ${row.withIsbn} ISBN, ${row.children} copii, ${row.needsReview} de verificat (${row.seconds}s)`)
    if (stoppedEarly) console.warn(`   ⚠ ${key}: parsarea s-a oprit la intrarea ${stoppedEarly.lastParsed}, dar PDF-ul pare să aibă cel puțin ${stoppedEarly.lastSeen}`)
    else if (entries < 100) console.warn(`   ⚠ puține intrări în ${key} — formatul poate diferi; verifică manual`)
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
const scanned = report.filter(r => r.scanned)
if (scanned.length) console.log(`Numere scanate, fără text (${scanned.length}): ${scanned.map(r => r.issue).join(', ')}`)
const failed = report.filter(r => r.error)
if (failed.length) console.log(`Numere nedescărcate (${failed.length}): ${failed.map(r => r.issue).join(', ')} — rulează din nou mai târziu; detalii în out/report.json`)
console.log('Raport per număr: out/report.json')
