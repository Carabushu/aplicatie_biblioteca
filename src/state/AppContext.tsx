/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Book, BookInput, Member, ReadingStatus, Room } from '../lib/types'
import { ACTIVE_MEMBER_KEY, BOOKS_CACHE_KEY } from '../lib/constants'

interface AppState {
  session: Session | null
  authLoading: boolean
  members: Member[]
  rooms: Room[]
  books: Book[]
  booksLoading: boolean
  online: boolean
  activeMember: Member | null
  setActiveMember: (m: Member | null) => void
  refreshBooks: () => Promise<void>
  refreshRooms: () => Promise<void>
  addBook: (b: BookInput) => Promise<Book>
  updateBook: (id: string, b: Partial<BookInput>) => Promise<void>
  deleteBook: (id: string) => Promise<void>
  setReadingStatus: (s: Partial<ReadingStatus> & { book_id: string; member_id: string }) => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AppState | null>(null)

const BOOK_SELECT = '*, reading_status(*), loans(*)'

function loadCache(): Book[] {
  try { return JSON.parse(localStorage.getItem(BOOKS_CACHE_KEY) ?? '[]') as Book[] } catch { return [] }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [members, setMembers] = useState<Member[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [books, setBooks] = useState<Book[]>(loadCache)
  const [booksLoading, setBooksLoading] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [activeMemberId, setActiveMemberId] = useState<string | null>(() => localStorage.getItem(ACTIVE_MEMBER_KEY))

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthLoading(false) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const refreshRooms = useCallback(async () => {
    const { data } = await supabase.from('rooms').select('*').order('sort_order')
    if (data) setRooms(data as Room[])
  }, [])

  const refreshMembers = useCallback(async () => {
    const { data } = await supabase.from('members').select('*').order('sort_order')
    if (data) setMembers(data as Member[])
  }, [])

  const refreshBooks = useCallback(async () => {
    setBooksLoading(true)
    const { data, error } = await supabase.from('books').select(BOOK_SELECT).order('title')
    setBooksLoading(false)
    if (!error && data) {
      const list = data as Book[]
      setBooks(list)
      try { localStorage.setItem(BOOKS_CACHE_KEY, JSON.stringify(list)) } catch { /* cache prea mare — ignorăm */ }
    }
  }, [])

  useEffect(() => {
    if (!session) return
    void refreshMembers(); void refreshRooms(); void refreshBooks()
  }, [session, refreshMembers, refreshRooms, refreshBooks])

  const addBook = useCallback(async (b: BookInput) => {
    const { data, error } = await supabase.from('books').insert(clean(b)).select(BOOK_SELECT).single()
    if (error) throw error
    const book = data as Book
    setBooks(prev => [...prev, book].sort((x, y) => x.title.localeCompare(y.title, 'ro')))
    return book
  }, [])

  const updateBook = useCallback(async (id: string, b: Partial<BookInput>) => {
    const { data, error } = await supabase.from('books').update(clean(b)).eq('id', id).select(BOOK_SELECT).single()
    if (error) throw error
    setBooks(prev => prev.map(x => (x.id === id ? (data as Book) : x)))
  }, [])

  const deleteBook = useCallback(async (id: string) => {
    const { error } = await supabase.from('books').delete().eq('id', id)
    if (error) throw error
    setBooks(prev => prev.filter(x => x.id !== id))
  }, [])

  const setReadingStatus = useCallback(async (s: Partial<ReadingStatus> & { book_id: string; member_id: string }) => {
    const { data, error } = await supabase.from('reading_status').upsert(s, { onConflict: 'book_id,member_id' }).select().single()
    if (error) throw error
    const rs = data as ReadingStatus
    setBooks(prev => prev.map(b => {
      if (b.id !== rs.book_id) return b
      const others = (b.reading_status ?? []).filter(x => x.member_id !== rs.member_id)
      return { ...b, reading_status: [...others, rs] }
    }))
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    localStorage.removeItem(BOOKS_CACHE_KEY)
    setBooks([])
  }, [])

  const activeMember = useMemo(() => members.find(m => m.id === activeMemberId) ?? null, [members, activeMemberId])
  const setActiveMember = useCallback((m: Member | null) => {
    setActiveMemberId(m?.id ?? null)
    if (m) localStorage.setItem(ACTIVE_MEMBER_KEY, m.id); else localStorage.removeItem(ACTIVE_MEMBER_KEY)
  }, [])

  const value: AppState = {
    session, authLoading, members, rooms, books, booksLoading, online,
    activeMember, setActiveMember, refreshBooks, refreshRooms,
    addBook, updateBook, deleteBook, setReadingStatus, signOut,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp(): AppState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp în afara AppProvider')
  return v
}

/** Șiruri goale → null pentru câmpurile opționale; ISBN normalizat. */
function clean<T extends Partial<BookInput>>(b: T): T {
  const out: Record<string, unknown> = { ...b }
  for (const k of ['author', 'publisher', 'isbn', 'series', 'sub_location', 'notes', 'cover_url'] as const) {
    if (k in out && typeof out[k] === 'string' && (out[k] as string).trim() === '') out[k] = null
  }
  if (typeof out.isbn === 'string') out.isbn = out.isbn.replace(/[^0-9Xx]/g, '').toUpperCase()
  if (typeof out.title === 'string') out.title = out.title.trim()
  return out as T
}
