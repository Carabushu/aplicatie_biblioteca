/*
 * Statistici și insigne pe profil — calculate la citire din `reading_status` (fără tabele noi).
 * Data unei lecturi = `finished_at` (setată când profilul apasă „Citită”); cărțile fără dată
 * contează la totaluri și insigne de număr, dar nu apar pe ani.
 */
import type { Book, ReadingStatus } from './types'
import { norm } from './text'

export interface ReadEntry { book: Book; rs: ReadingStatus }

export interface MemberStats {
  read: ReadEntry[]            // citite, cele mai recente primele (fără dată la final)
  reading: ReadEntry[]
  pages: number                // pagini din cărțile citite (doar cele cu număr de pagini cunoscut)
  withoutPages: number
  undated: number
  byYear: { year: number; count: number; pages: number }[]   // crescător, fără găuri între primul an și anul curent
  thisYear: { count: number; pages: number }
  genres: { name: string; count: number }[]
  authors: { name: string; count: number }[]
  avgRating: number | null
  favorites: ReadEntry[]       // nota 5
  longest: ReadEntry | null
}

export function memberEntries(books: Book[], memberId: string, status: ReadingStatus['status']): ReadEntry[] {
  const out: ReadEntry[] = []
  for (const book of books) {
    const rs = (book.reading_status ?? []).find(s => s.member_id === memberId && s.status === status)
    if (rs) out.push({ book, rs })
  }
  return out
}

const byDateDesc = (a: ReadEntry, b: ReadEntry) => {
  const da = a.rs.finished_at ?? '', db = b.rs.finished_at ?? ''
  if (!da !== !db) return da ? -1 : 1
  return db.localeCompare(da)
}

function countTop(values: string[], n: number) {
  const m = new Map<string, number>()
  values.forEach(v => m.set(v, (m.get(v) ?? 0) + 1))
  return [...m.entries()].map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ro')).slice(0, n)
}

export function computeStats(books: Book[], memberId: string, now = new Date()): MemberStats {
  const read = memberEntries(books, memberId, 'read').sort(byDateDesc)
  const reading = memberEntries(books, memberId, 'reading')
  const year = now.getFullYear()

  const years = new Map<number, { count: number; pages: number }>()
  for (const e of read) {
    if (!e.rs.finished_at) continue
    const y = Number(e.rs.finished_at.slice(0, 4))
    const v = years.get(y) ?? { count: 0, pages: 0 }
    v.count++; v.pages += e.book.pages ?? 0
    years.set(y, v)
  }
  const byYear: MemberStats['byYear'] = []
  if (years.size) {
    for (let y = Math.min(...years.keys()); y <= Math.max(year, ...years.keys()); y++) {
      byYear.push({ year: y, ...(years.get(y) ?? { count: 0, pages: 0 }) })
    }
  }

  const rated = read.filter(e => e.rs.rating)
  const withPages = read.filter(e => e.book.pages)
  return {
    read, reading,
    pages: withPages.reduce((s, e) => s + (e.book.pages ?? 0), 0),
    withoutPages: read.length - withPages.length,
    undated: read.filter(e => !e.rs.finished_at).length,
    byYear,
    thisYear: years.get(year) ?? { count: 0, pages: 0 },
    genres: countTop(read.flatMap(e => e.book.genres), 5),
    authors: countTop(read.map(e => e.book.author).filter((a): a is string => !!a), 3),
    avgRating: rated.length ? rated.reduce((s, e) => s + (e.rs.rating ?? 0), 0) / rated.length : null,
    favorites: read.filter(e => e.rs.rating === 5),
    longest: withPages.reduce<ReadEntry | null>((m, e) => (!m || (e.book.pages ?? 0) > (m.book.pages ?? 0) ? e : m), null),
  }
}

// ---------------- insigne ----------------

export interface Badge {
  id: string
  icon: string
  name: string
  desc: string
  earned: boolean
  /** data câștigării, dacă se știe */
  date: string | null
  progress: [number, number]
}

/** Data la care s-a atins al n-lea element (listă în ordine cronologică; null dacă nu se știe). */
const nthDate = (chrono: ReadEntry[], n: number) => chrono[n - 1]?.rs.finished_at ?? null

export function computeBadges(books: Book[], s: MemberStats): Badge[] {
  // cronologic crescător, cele fără dată la final
  const chrono = [...s.read].sort((a, b) => {
    const da = a.rs.finished_at ?? '', db = b.rs.finished_at ?? ''
    if (!da !== !db) return da ? -1 : 1
    return da.localeCompare(db)
  })
  const badges: Badge[] = []
  const add = (id: string, icon: string, name: string, desc: string, cur: number, target: number, date: string | null) =>
    badges.push({ id, icon, name, desc, earned: cur >= target, date: cur >= target ? date : null, progress: [Math.min(cur, target), target] })

  const n = s.read.length
  for (const [t, icon, name] of [
    [1, '📖', 'Prima carte'], [5, '🥉', '5 cărți'], [10, '🥈', '10 cărți'],
    [25, '🥇', '25 de cărți'], [50, '🏆', '50 de cărți'], [100, '👑', '100 de cărți'],
  ] as const) add(`n${t}`, icon, name, `Ai citit ${t === 1 ? 'prima carte' : `${t}${t >= 20 ? ' de' : ''} cărți`}`, n, t, nthDate(chrono, t))

  for (const [p, icon, name] of [[300, '🧱', 'Carte groasă'], [500, '🏔️', 'Cărămida']] as const) {
    const first = chrono.find(e => (e.book.pages ?? 0) >= p)
    add(`big${p}`, icon, name, `O carte de peste ${p} de pagini`, first ? 1 : 0, 1, first?.rs.finished_at ?? null)
  }

  // pagini cumulate
  let acc = 0
  const pageDates: Record<number, string | null> = {}
  for (const e of chrono) {
    const before = acc; acc += e.book.pages ?? 0
    for (const t of [1000, 5000, 10000]) if (before < t && acc >= t) pageDates[t] = e.rs.finished_at
  }
  for (const [t, icon, name] of [[1000, '📄', '1.000 de pagini'], [5000, '📚', '5.000 de pagini'], [10000, '🚀', '10.000 de pagini']] as const) {
    add(`p${t}`, icon, name, `Ai citit în total ${name}`, s.pages, t, pageDates[t] ?? null)
  }

  // genuri diferite
  const seen = new Set<string>(); let genreDate: string | null = null
  for (const e of chrono) { const had = seen.size; e.book.genres.forEach(g => seen.add(g)); if (had < 5 && seen.size >= 5) genreDate = e.rs.finished_at }
  add('explorer', '🧭', 'Explorator', 'Cărți din 5 genuri diferite', seen.size, 5, genreDate)

  const impressions = chrono.filter(e => e.rs.impression?.trim())
  add('critic', '✍️', 'Critic', '5 impresii scrise despre cărțile citite', impressions.length, 5, nthDate(impressions, 5))

  // serie terminată: toate cărțile unei serii (min. 2 în bibliotecă) citite
  const readIds = new Set(s.read.map(e => e.book.id))
  const series = new Map<string, Book[]>()
  books.forEach(b => { if (b.series) { const k = norm(b.series); series.set(k, [...(series.get(k) ?? []), b]) } })
  let bestSeries: [number, number] = [0, 2]; let seriesDone = false; let seriesDate: string | null = null
  for (const list of series.values()) {
    if (list.length < 2) continue
    const done = list.filter(b => readIds.has(b.id)).length
    if (done === list.length) {
      seriesDone = true
      const dates = s.read.filter(e => list.some(b => b.id === e.book.id)).map(e => e.rs.finished_at)
      const d = dates.every(Boolean) ? (dates as string[]).sort().at(-1)! : null
      if (!seriesDate || (d && d < seriesDate)) seriesDate = d
    } else if (done / list.length > bestSeries[0] / bestSeries[1]) bestSeries = [done, list.length]
  }
  add('series', '🔗', 'Serie terminată', 'Toate volumele unei serii din bibliotecă', seriesDone ? 1 : bestSeries[0], seriesDone ? 1 : bestSeries[1], seriesDate)

  // maraton: 3 cărți terminate în aceeași lună; cititor de an: 12 într-un an
  const best = (keyLen: number, target: number): [number, string | null] => {
    const m = new Map<string, ReadEntry[]>()
    chrono.forEach(e => { if (e.rs.finished_at) { const k = e.rs.finished_at.slice(0, keyLen); m.set(k, [...(m.get(k) ?? []), e]) } })
    let max = 0, date: string | null = null
    for (const list of m.values()) {
      if (list.length > max) max = list.length
      const d = nthDate(list, target)
      if (d && (!date || d < date)) date = d
    }
    return [max, date]
  }
  const [monthMax, monthDate] = best(7, 3)
  add('marathon', '🌙', 'Maraton', '3 cărți terminate în aceeași lună', monthMax, 3, monthDate)
  const [yearMax, yearDate] = best(4, 12)
  add('year12', '🗓️', 'O carte pe lună', '12 cărți terminate în același an', yearMax, 12, yearDate)

  return badges
}
