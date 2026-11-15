// Încarcă out/cip_books.csv în tabelul cip_books din Supabase, în loturi, cu upsert pe ISBN.
//
//   SUPABASE_URL=https://xxx.supabase.co SUPABASE_ANON_KEY=sb_publishable_... \
//   FAMILY_EMAIL=... FAMILY_PASSWORD=... node upload.mjs
//
// (pe Windows PowerShell: $env:SUPABASE_URL="..."; $env:SUPABASE_ANON_KEY="..."; $env:FAMILY_EMAIL="..."; $env:FAMILY_PASSWORD="..."; node upload.mjs)
import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'

const { SUPABASE_URL, SUPABASE_ANON_KEY, FAMILY_EMAIL, FAMILY_PASSWORD } = process.env
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !FAMILY_EMAIL || !FAMILY_PASSWORD) {
  console.error('Lipsesc variabilele de mediu SUPABASE_URL, SUPABASE_ANON_KEY, FAMILY_EMAIL, FAMILY_PASSWORD'); process.exit(1)
}

function parseCsv(text) {
  const rows = []; let row = []; let cur = ''; let q = false
  const s = text.replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += c }
    else if (c === '"') q = true
    else if (c === ',') { row.push(cur); cur = '' }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = '' }
    else if (c !== '\r') cur += c
  }
  if (cur || row.length) { row.push(cur); rows.push(row) }
  return rows
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
const { error: authErr } = await supabase.auth.signInWithPassword({ email: FAMILY_EMAIL, password: FAMILY_PASSWORD })
if (authErr) { console.error('Login eșuat:', authErr.message); process.exit(1) }

const [header, ...lines] = parseCsv(await readFile('out/cip_books.csv', 'utf8'))
const num = v => (v === '' ? null : Number(v))
// Coloanele păstrate în baza de date (varianta „slim”: fără mențiunea de responsabilitate, cod CIP, număr bibliografie)
const KEEP = ['isbn', 'title', 'author', 'publisher', 'place', 'year', 'edition', 'udc', 'audience', 'series', 'series_volume', 'needs_review']
const records = lines.filter(l => l.length === header.length).map(l => {
  const o = Object.fromEntries(header.map((h, i) => [h, l[i] === '' ? null : l[i]]))
  o.year = num(o.year); o.series_volume = num(o.series_volume); o.needs_review = o.needs_review === 'true'
  return Object.fromEntries(KEEP.map(k => [k, o[k] ?? null]))
})
const skipped = records.filter(r => !r.isbn || !r.title || !r.title.trim())
const toUpload = records.filter(r => r.isbn && r.title && r.title.trim())
console.log(`${toUpload.length} înregistrări de încărcat${skipped.length ? ` (${skipped.length} sărite: fără titlu sau ISBN)` : ''}`)

const BATCH = 1000
for (let i = 0; i < toUpload.length; i += BATCH) {
  const chunk = toUpload.slice(i, i + BATCH)
  const { error } = await supabase.from('cip_books').upsert(chunk, { onConflict: 'isbn' })
  if (error) { console.error(`Lot ${i / BATCH + 1}: ${error.message}`); process.exit(1) }
  process.stdout.write(`\r${Math.min(i + BATCH, toUpload.length)} / ${toUpload.length}`)
}
console.log('\nGata.')
