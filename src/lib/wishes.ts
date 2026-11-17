import { supabase } from './supabase'
import { norm } from './text'
import type { Book, Member, Wish, WishInput } from './types'
import type { CatalogHit } from './catalog'

const cleanIsbn = (s: string | null | undefined) => (s ?? '').replace(/[^0-9Xx]/g, '').toUpperCase()

/** Aceeași carte? ISBN identic sau titlu identic (fără diacritice/majuscule). */
export function sameBook(a: { title: string; isbn?: string | null }, b: { title: string; isbn?: string | null }): boolean {
  const ia = cleanIsbn(a.isbn), ib = cleanIsbn(b.isbn)
  if (ia && ib) return ia === ib
  return norm(a.title) === norm(b.title)
}

/** Verificare rapidă, locală (fără rețea): dorința e deja în bibliotecă? */
export function ownedLocally(books: Book[], w: Pick<Wish, 'title' | 'isbn'>): Book | undefined {
  const isbn = cleanIsbn(w.isbn)
  return books.find(b => (isbn && b.isbn === isbn) || norm(b.title) === norm(w.title))
}

/** Căutare completă: ISBN exact + titlu asemănător pe server (`find_similar_books`). */
export async function findOwned(books: Book[], title: string, author: string | null, isbn: string | null): Promise<Book[]> {
  const found = new Map<string, Book>()
  const code = cleanIsbn(isbn)
  if (code) books.filter(b => b.isbn === code).forEach(b => found.set(b.id, b))
  try {
    const { data } = await supabase.rpc('find_similar_books', { p_title: title, p_author: author ?? '', p_limit: 3 })
    for (const r of (data ?? []) as { id: string; score: number }[]) {
      const b = books.find(x => x.id === r.id)
      if (b && r.score > 0.55) found.set(b.id, b)
    }
  } catch { /* offline — rămâne doar verificarea locală */ }
  const local = ownedLocally(books, { title, isbn })
  if (local) found.set(local.id, local)
  return [...found.values()]
}

export function wishFromHit(h: CatalogHit, base: Pick<WishInput, 'added_by' | 'note' | 'source'>): WishInput {
  return {
    ...base, title: h.title, author: h.author || null, isbn: h.isbn || null, publisher: h.publisher || null,
    year: h.year, cover_url: h.source === 'cip' ? null : h.cover_url,
  }
}

export function emptyWish(memberId: string | null, title = '', source = 'manual'): WishInput {
  return { title, author: null, isbn: null, note: null, added_by: memberId, publisher: null, year: null, cover_url: null, source }
}

interface Ctx { books: Book[]; wishes: Wish[]; members: Member[]; addWish: (w: WishInput) => Promise<Wish> }

/**
 * Adaugă o dorință după verificări (cu ferestre de confirmare):
 * deja pe lista aceluiași profil → nu; o avem deja → întreabă; o vrea și altcineva → anunță.
 * Întoarce true dacă a fost adăugată.
 */
export async function addWishChecked(ctx: Ctx, w: WishInput): Promise<boolean> {
  if (!w.title.trim()) return false
  const who = (id: string | null) => ctx.members.find(m => m.id === id)?.name ?? 'cineva'
  if (ctx.wishes.some(x => x.added_by === w.added_by && sameBook(x, w))) {
    alert(`„${w.title}” e deja pe lista de dorințe a lui ${who(w.added_by)}.`)
    return false
  }
  const owned = await findOwned(ctx.books, w.title, w.author, w.isbn)
  if (owned.length > 0) {
    const list = owned.map(b => `• ${b.title}${b.author ? ` – ${b.author}` : ''}`).join('\n')
    if (!confirm(`Se pare că o avem deja acasă:\n${list}\n\nO adaugi totuși la dorințe?`)) return false
  }
  const others = ctx.wishes.filter(x => x.added_by !== w.added_by && sameBook(x, w)).map(x => who(x.added_by))
  if (others.length > 0 && !confirm(`${[...new Set(others)].join(', ')} o are deja pe lista de dorințe. O adaugi și pentru ${who(w.added_by)}?`)) return false
  try {
    await ctx.addWish(w)
    return true
  } catch (e) {
    alert('Nu am putut salva: ' + (e as Error).message)
    return false
  }
}
