/**
 * Căutare în cataloage online gratuite: Google Books și Open Library.
 * Fără chei API. Rezultatele sunt normalizate într-un format comun.
 */
import type { BookInput } from './types'
import { supabase } from './supabase'

export interface CatalogHit {
  title: string
  author: string
  publisher: string
  year: number | null
  pages: number | null
  language: string
  isbn: string
  cover_url: string | null
  source: 'google' | 'openlibrary' | 'cip'
  audience?: 'copii' | 'adulti'
  needs_review?: boolean
}

export const normalizeIsbn = (s: string) => s.replace(/[^0-9Xx]/g, '').toUpperCase()

export function isValidIsbn(raw: string): boolean {
  const s = normalizeIsbn(raw)
  if (s.length === 10) {
    let sum = 0
    for (let i = 0; i < 10; i++) {
      const c = s[i] === 'X' ? 10 : Number(s[i])
      if (Number.isNaN(c)) return false
      sum += c * (10 - i)
    }
    return sum % 11 === 0
  }
  if (s.length === 13) {
    if (!/^\d{13}$/.test(s)) return false
    let sum = 0
    for (let i = 0; i < 12; i++) sum += Number(s[i]) * (i % 2 === 0 ? 1 : 3)
    return (10 - (sum % 10)) % 10 === Number(s[12])
  }
  return false
}

const yearOf = (s?: string) => {
  const m = s?.match(/\d{4}/)
  return m ? Number(m[0]) : null
}

const withTimeout = (ms: number) => {
  const c = new AbortController()
  setTimeout(() => c.abort(), ms)
  return c.signal
}

// ---------- Google Books ----------
interface GVolume {
  volumeInfo?: {
    title?: string; authors?: string[]; publisher?: string; publishedDate?: string
    pageCount?: number; language?: string
    industryIdentifiers?: { type: string; identifier: string }[]
    imageLinks?: { thumbnail?: string; smallThumbnail?: string }
  }
}

function fromGoogle(v: GVolume): CatalogHit | null {
  const i = v.volumeInfo
  if (!i?.title) return null
  const ids = i.industryIdentifiers ?? []
  const isbn = ids.find(x => x.type === 'ISBN_13')?.identifier ?? ids.find(x => x.type === 'ISBN_10')?.identifier ?? ''
  const thumb = i.imageLinks?.thumbnail ?? i.imageLinks?.smallThumbnail ?? null
  return {
    title: i.title,
    author: (i.authors ?? []).join(', '),
    publisher: i.publisher ?? '',
    year: yearOf(i.publishedDate),
    pages: i.pageCount ?? null,
    language: i.language ?? 'ro',
    isbn,
    cover_url: thumb ? thumb.replace('http://', 'https://').replace('&edge=curl', '') : null,
    source: 'google',
  }
}

async function googleSearch(q: string, max = 10): Promise<CatalogHit[]> {
  try {
    const r = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=${max}&printType=books`,
      { signal: withTimeout(8000) },
    )
    if (!r.ok) return []
    const j = (await r.json()) as { items?: GVolume[] }
    return (j.items ?? []).map(fromGoogle).filter((x): x is CatalogHit => x !== null)
  } catch {
    return []
  }
}

// ---------- Open Library ----------
interface OLBook {
  title?: string; authors?: { name: string }[]; publishers?: { name: string }[]
  publish_date?: string; number_of_pages?: number; cover?: { medium?: string; large?: string }
}
interface OLDoc {
  title?: string; author_name?: string[]; publisher?: string[]; first_publish_year?: number
  number_of_pages_median?: number; language?: string[]; isbn?: string[]; cover_i?: number
}

async function openLibraryIsbn(isbn: string): Promise<CatalogHit | null> {
  try {
    const r = await fetch(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`,
      { signal: withTimeout(8000) },
    )
    if (!r.ok) return null
    const j = (await r.json()) as Record<string, OLBook>
    const b = j[`ISBN:${isbn}`]
    if (!b?.title) return null
    return {
      title: b.title,
      author: (b.authors ?? []).map(a => a.name).join(', '),
      publisher: (b.publishers ?? []).map(p => p.name).join(', '),
      year: yearOf(b.publish_date),
      pages: b.number_of_pages ?? null,
      language: 'ro',
      isbn,
      cover_url: b.cover?.medium ?? b.cover?.large ?? `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`,
      source: 'openlibrary',
    }
  } catch {
    return null
  }
}

async function openLibrarySearch(q: string, max = 10): Promise<CatalogHit[]> {
  try {
    const r = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=${max}&fields=title,author_name,publisher,first_publish_year,number_of_pages_median,language,isbn,cover_i`,
      { signal: withTimeout(8000) },
    )
    if (!r.ok) return []
    const j = (await r.json()) as { docs?: OLDoc[] }
    return (j.docs ?? []).filter(d => d.title).map(d => ({
      title: d.title!,
      author: (d.author_name ?? []).join(', '),
      publisher: d.publisher?.[0] ?? '',
      year: d.first_publish_year ?? null,
      pages: d.number_of_pages_median ?? null,
      language: d.language?.includes('rum') ? 'ro' : (d.language?.[0] === 'eng' ? 'en' : 'ro'),
      isbn: d.isbn?.[0] ?? '',
      cover_url: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
      source: 'openlibrary',
    }))
  } catch {
    return []
  }
}

// ---------- CIP (BNaR) — tabelul local cip_books, umplut cu tools/cip-import ----------
interface CipRow {
  isbn: string; title: string; author: string | null; statement: string | null; publisher: string | null
  place: string | null; year: number | null; audience: string | null; needs_review: boolean
}

function fromCip(r: CipRow): CatalogHit {
  return {
    title: r.title,
    author: r.author ?? '',
    publisher: r.publisher ?? '',
    year: r.year,
    pages: null,
    language: 'ro',
    isbn: r.isbn,
    cover_url: `https://covers.openlibrary.org/b/isbn/${r.isbn}-M.jpg?default=false`,
    source: 'cip',
    audience: r.audience === 'copii' ? 'copii' : 'adulti',
    needs_review: r.needs_review,
  }
}

async function cipIsbn(isbn: string): Promise<CatalogHit | null> {
  try {
    const { data } = await supabase.from('cip_books').select('*').eq('isbn', isbn).maybeSingle()
    return data ? fromCip(data as CipRow) : null
  } catch { return null }
}

async function cipSearch(q: string): Promise<CatalogHit[]> {
  try {
    const { data } = await supabase.rpc('search_cip', { p_q: q, p_limit: 15 })
    return ((data ?? []) as CipRow[]).map(fromCip)
  } catch { return [] }
}

/** Coperta din Open Library există doar uneori; verificăm înainte să o păstrăm. */
async function coverExists(url: string | null): Promise<string | null> {
  if (!url) return null
  try {
    const r = await fetch(url, { method: 'HEAD', signal: withTimeout(5000) })
    return r.ok ? url : null
  } catch { return null }
}

// ---------- API public ----------

/** Caută după ISBN în ambele cataloage; întoarce prima potrivire bună. */
export async function lookupIsbn(raw: string): Promise<CatalogHit | null> {
  const isbn = normalizeIsbn(raw)
  if (!isbn) return null
  const [cip, g, ol] = await Promise.all([cipIsbn(isbn), googleSearch(`isbn:${isbn}`, 1), openLibraryIsbn(isbn)])
  const online = g[0] ?? ol
  if (cip) {
    // CIP are datele oficiale ale ediției românești; cataloagele online completează coperta și paginile
    cip.cover_url = online?.cover_url ?? (await coverExists(cip.cover_url))
    cip.pages = online?.pages ?? null
    return cip
  }
  if (!online) return null
  if (ol && g[0]) {
    online.cover_url ??= ol.cover_url
    online.publisher ||= ol.publisher
    online.pages ??= ol.pages
    online.year ??= ol.year
  }
  online.isbn ||= isbn
  return online
}

/** Căutare liberă după titlu / autor. Rezultate din ambele surse, fără duplicate după ISBN. */
export async function searchCatalog(q: string): Promise<CatalogHit[]> {
  const query = q.trim()
  if (query.length < 2) return []
  const [cip, g, ol] = await Promise.all([cipSearch(query), googleSearch(query, 10), openLibrarySearch(query, 10)])
  const seen = new Set<string>()
  const out: CatalogHit[] = []
  for (const h of [...cip, ...g, ...ol]) {
    const key = h.isbn ? normalizeIsbn(h.isbn) : `${h.title}|${h.author}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(h)
  }
  return out
}

export function hitToBookInput(h: CatalogHit, base: BookInput): BookInput {
  return {
    ...base,
    title: h.title,
    author: h.author,
    publisher: h.publisher,
    year: h.year,
    pages: h.pages,
    language: h.language,
    isbn: h.isbn,
    cover_url: h.cover_url,
    audience: h.audience ? [h.audience] : base.audience,
    needs_review: h.needs_review ?? false,
    source: h.source === 'cip' ? 'cip' : h.isbn ? 'isbn' : 'search',
  }
}
