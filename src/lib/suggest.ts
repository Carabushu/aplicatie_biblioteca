/*
 * „Ce citesc în continuare?” — propune o carte necitită de profilul activ.
 * Filtre stricte: necitită și neînceputa de profil, acasă (nu e dată cu împrumut), public potrivit,
 * fără „doar adulți” pentru copii, vârsta minimă respectată (dacă știm anul nașterii).
 * Apoi un scor din: următorul volum dintr-o serie începută, genuri și autori pe care le-a citit
 * (cu greutate mai mare pentru notele bune), notele bune date de familie, lecturile școlare ale profilului.
 * Alegerea e aleatoare ponderată dintre cele mai bune, ca „🎲 Alta” să dea variație.
 */
import type { Book, Member } from './types'
import { norm } from './text'

export interface Suggestion { book: Book; score: number; reasons: string[] }

export type Length = '' | 'scurta' | 'medie' | 'lunga'
export const LENGTHS: Record<Exclude<Length, ''>, { label: string; test: (p: number) => boolean }> = {
  scurta: { label: 'Scurtă (sub 150 pagini)', test: p => p < 150 },
  medie: { label: 'Medie (150–300)', test: p => p >= 150 && p <= 300 },
  lunga: { label: 'Lungă (peste 300)', test: p => p > 300 },
}

/** Vârsta în ani împliniți (null dacă nu știm data nașterii). */
export function memberAge(m: Member, now = new Date()): number | null {
  if (!m.birth_date) return null
  const [y, mo, d] = m.birth_date.slice(0, 10).split('-').map(Number)
  const hadBirthday = now.getMonth() + 1 > mo || (now.getMonth() + 1 === mo && now.getDate() >= d)
  return now.getFullYear() - y - (hadBirthday ? 0 : 1)
}

const statusOf = (b: Book, memberId: string) => (b.reading_status ?? []).find(s => s.member_id === memberId)
const isOut = (b: Book) => (b.loans ?? []).some(l => !l.returned_at && l.direction === 'out')

/** Cărțile care trec filtrele stricte (fără genul/lungimea alese de utilizator). */
export function eligible(books: Book[], m: Member): Book[] {
  const age = memberAge(m)
  return books.filter(b => {
    const st = statusOf(b, m.id)?.status ?? 'unread'
    if (st !== 'unread') return false
    if (isOut(b)) return false
    if (m.is_child) {
      if (b.adults_only) return false
      if (!b.audience.includes('copii')) return false
      if (age !== null && b.min_age !== null && b.min_age > age) return false
    } else if (!b.audience.includes('adulti')) return false
    return true
  })
}

export function rankSuggestions(books: Book[], m: Member, members: Member[], schoolBookIds: Set<string>,
  opts: { genre: string; length: Length }): Suggestion[] {
  const age = memberAge(m)
  const read = books.flatMap(b => {
    const s = statusOf(b, m.id)
    return s && (s.status === 'read' || s.status === 'reading') ? [{ b, s }] : []
  })

  // genuri și autori citiți — nota 4–5 contează dublu, nota 1–2 aproape deloc
  const w = (rating: number | null) => (rating === null ? 1 : rating >= 4 ? 2 : rating <= 2 ? 0.25 : 1)
  const genreW = new Map<string, number>()
  const authorW = new Map<string, number>()
  for (const { b, s } of read) {
    b.genres.forEach(g => genreW.set(g, (genreW.get(g) ?? 0) + w(s.rating)))
    if (b.author) authorW.set(norm(b.author), (authorW.get(norm(b.author)) ?? 0) + w(s.rating))
  }
  const maxGenre = Math.max(1, ...genreW.values())

  // serii: cel mai mare volum citit, pe serie
  const seriesMax = new Map<string, number>()
  for (const { b } of read) if (b.series) seriesMax.set(norm(b.series), Math.max(seriesMax.get(norm(b.series)) ?? 0, b.series_volume ?? 1))

  const name = (id: string) => members.find(x => x.id === id)?.name ?? ''

  return eligible(books, m).filter(b => {
    if (opts.genre && !b.genres.includes(opts.genre)) return false
    if (opts.length && !(b.pages && LENGTHS[opts.length].test(b.pages))) return false
    return true
  }).map(b => {
    let score = 1
    const reasons: string[] = []

    if (schoolBookIds.has(b.id)) { score += 3; reasons.push('🎒 E pe lista ta de lecturi școlare') }

    if (b.series) {
      const k = norm(b.series), done = seriesMax.get(k)
      const vol = b.series_volume
      if (done !== undefined && vol !== null && vol === done + 1) { score += 5; reasons.push(`🔗 Următorul volum din „${b.series}”`) }
      else if (done !== undefined) { score += 1.5; reasons.push(`🔗 Din seria „${b.series}”, pe care ai început-o`) }
      // un volum mai târziu, când cel dinainte e în bibliotecă și necitit → să nu sară peste
      if (vol && vol > 1) {
        const prev = books.find(x => x.series && norm(x.series) === k && x.series_volume === vol - 1)
        if (prev && (statusOf(prev, m.id)?.status ?? 'unread') === 'unread') score *= 0.2
      }
    }

    const gScore = b.genres.reduce((s, g) => s + (genreW.get(g) ?? 0), 0) / maxGenre
    if (gScore > 0) {
      score += Math.min(3, gScore * 2)
      const top = b.genres.filter(g => genreW.get(g)).sort((x, y) => (genreW.get(y) ?? 0) - (genreW.get(x) ?? 0))[0]
      if (top) reasons.push(`❤️ Îți plac cărțile de tip ${top}`)
    }

    const aw = b.author ? authorW.get(norm(b.author)) ?? 0 : 0
    if (aw >= 1) { score += Math.min(2.5, aw); reasons.push(`✍️ Ai mai citit de ${b.author}`) }

    const fans = (b.reading_status ?? []).filter(s => s.member_id !== m.id && s.status === 'read' && (s.rating ?? 0) >= 4)
    if (fans.length) {
      score += fans.reduce((s, f) => s + ((f.rating ?? 0) === 5 ? 1.5 : 1), 0)
      reasons.push(`⭐ ${fans.map(f => `${name(f.member_id)} i-a dat ${f.rating} stele`).join(', ')}`)
    }

    // pentru copii: o carte mult sub vârsta lor (ex. carte ilustrată la 13 ani) e mai puțin probabilă
    if (m.is_child && age !== null && b.min_age !== null && b.min_age <= age - 5) score *= 0.4

    const days = (Date.now() - Date.parse(b.created_at)) / 86_400_000
    if (days < 60) { score += 0.5; reasons.push('🆕 Adăugată de curând în bibliotecă') }

    if (reasons.length === 0) reasons.push('📚 Încă n-ai citit-o — poate e o surpriză bună')
    return { book: b, score, reasons }
  }).sort((a, b) => b.score - a.score)
}

/** Alegere aleatoare ponderată dintre primele `top`, ignorând ce s-a arătat deja. */
export function pick(list: Suggestion[], shown: Set<string>, top = 12): Suggestion | null {
  let pool = list.filter(s => !shown.has(s.book.id)).slice(0, top)
  if (pool.length === 0) pool = list.slice(0, top)       // am trecut prin toate — o luăm de la capăt
  if (pool.length === 0) return null
  const total = pool.reduce((s, x) => s + x.score * x.score, 0)
  let r = Math.random() * total
  for (const s of pool) { r -= s.score * s.score; if (r <= 0) return s }
  return pool[pool.length - 1]
}
