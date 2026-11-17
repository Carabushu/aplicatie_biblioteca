export type Audience = 'adulti' | 'copii'
export type ReadStatus = 'unread' | 'reading' | 'read'

export interface Member {
  id: string
  name: string
  avatar: string
  color: string
  is_child: boolean
  sort_order: number
  /** din migrarea 0006; poate lipsi dacă migrarea nu a fost rulată */
  birth_date?: string | null
}

export interface Room {
  id: string
  name: string
  sort_order: number
}

export interface ReadingStatus {
  book_id: string
  member_id: string
  status: ReadStatus
  current_page: number | null
  rating: number | null
  impression: string | null
  finished_at: string | null
}

export interface Loan {
  id: string
  book_id: string
  direction: 'out' | 'in'
  person: string
  loaned_at: string
  remind_after_days: number
  returned_at: string | null
}

export interface Book {
  id: string
  title: string
  author: string | null
  publisher: string | null
  year: number | null
  pages: number | null
  language: string | null
  isbn: string | null
  cover_url: string | null
  audience: Audience[]
  genres: string[]
  tags: string[]
  min_age: number | null
  series: string | null
  series_volume: number | null
  room_id: string | null
  sub_location: string | null
  copies: number
  adults_only: boolean
  notes: string | null
  source: string | null
  needs_review: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  // joined
  reading_status?: ReadingStatus[]
  loans?: Loan[]
}

/** Câmpurile editabile la creare/actualizare. */
export type BookInput = Omit<Book, 'id' | 'created_at' | 'updated_at' | 'reading_status' | 'loans'>

export const emptyBook = (): BookInput => ({
  title: '',
  author: '',
  publisher: '',
  year: null,
  pages: null,
  language: 'ro',
  isbn: '',
  cover_url: null,
  audience: ['copii'],
  genres: [],
  tags: [],
  min_age: null,
  series: '',
  series_volume: null,
  room_id: null,
  sub_location: '',
  copies: 1,
  adults_only: false,
  notes: '',
  source: 'manual',
  needs_review: false,
  created_by: null,
})

export interface Wish {
  id: string
  title: string
  author: string | null
  isbn: string | null
  note: string | null
  /** profilul a cărui dorință este */
  added_by: string | null
  publisher: string | null
  year: number | null
  cover_url: string | null
  source: string | null
  created_at: string
}

export type WishInput = Omit<Wish, 'id' | 'created_at'>
