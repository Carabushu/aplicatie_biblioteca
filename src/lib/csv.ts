import type { Book, BookInput, Room } from './types'
import { emptyBook } from './types'

const COLS = [
  'title', 'author', 'publisher', 'year', 'pages', 'language', 'isbn', 'audience', 'genres', 'tags',
  'min_age', 'series', 'series_volume', 'room', 'sub_location', 'copies', 'adults_only', 'notes', 'cover_url',
] as const

const esc = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function booksToCsv(books: Book[], rooms: Room[]): string {
  const roomName = (id: string | null) => rooms.find(r => r.id === id)?.name ?? ''
  const lines = [COLS.join(',')]
  for (const b of books) {
    lines.push([
      b.title, b.author, b.publisher, b.year, b.pages, b.language, b.isbn,
      b.audience.join('|'), b.genres.join('|'), b.tags.join('|'),
      b.min_age, b.series, b.series_volume, roomName(b.room_id), b.sub_location, b.copies,
      b.adults_only ? 'da' : 'nu', b.notes, b.cover_url,
    ].map(esc).join(','))
  }
  return '﻿' + lines.join('\n') // BOM ca Excel să afișeze diacriticele corect
}

/** Parser CSV simplu (ghilimele, virgule, linii noi în câmpuri). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let inQ = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQ) {
      if (c === '"') {
        if (src[i + 1] === '"') { cur += '"'; i++ } else inQ = false
      } else cur += c
    } else if (c === '"') inQ = true
    else if (c === ',') { row.push(cur); cur = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cur); rows.push(row); row = []; cur = ''
    } else cur += c
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row) }
  return rows.filter(r => r.some(x => x.trim() !== ''))
}

export function csvToBooks(text: string, rooms: Room[]): BookInput[] {
  const rows = parseCsv(text)
  if (rows.length < 2) return []
  const header = rows[0].map(h => h.trim().toLowerCase())
  const idx = (name: string) => header.indexOf(name)
  const num = (s?: string) => (s && s.trim() !== '' && !Number.isNaN(Number(s)) ? Number(s) : null)
  const list = (s?: string) => (s ? s.split(/[|;]/).map(x => x.trim()).filter(Boolean) : [])
  const out: BookInput[] = []
  for (const r of rows.slice(1)) {
    const get = (n: string) => { const i = idx(n); return i >= 0 ? (r[i] ?? '').trim() : '' }
    const title = get('title') || get('titlu')
    if (!title) continue
    const roomName = get('room') || get('camera')
    const aud = list(get('audience')).map(a => a.toLowerCase().replace('ț', 't').replace('ţ', 't'))
    out.push({
      ...emptyBook(),
      title,
      author: get('author') || get('autor'),
      publisher: get('publisher') || get('editura'),
      year: num(get('year') || get('an')),
      pages: num(get('pages') || get('pagini')),
      language: get('language') || 'ro',
      isbn: get('isbn'),
      audience: aud.filter((a): a is 'adulti' | 'copii' => a === 'adulti' || a === 'copii').length
        ? aud.filter((a): a is 'adulti' | 'copii' => a === 'adulti' || a === 'copii')
        : ['copii'],
      genres: list(get('genres')),
      tags: list(get('tags')),
      min_age: num(get('min_age')),
      series: get('series'),
      series_volume: num(get('series_volume')),
      room_id: rooms.find(x => x.name.toLowerCase() === roomName.toLowerCase())?.id ?? null,
      sub_location: get('sub_location'),
      copies: num(get('copies')) ?? 1,
      adults_only: ['da', 'yes', 'true', '1'].includes(get('adults_only').toLowerCase()),
      notes: get('notes'),
      cover_url: get('cover_url') || null,
      source: 'import',
    })
  }
  return out
}

export function download(filename: string, content: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
