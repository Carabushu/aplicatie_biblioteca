import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../state/AppContext'
import BookForm from '../components/BookForm'
import { Cover } from '../components/BookCard'
import LoanPanel from '../components/LoanPanel'
import type { BookInput, ReadStatus } from '../lib/types'
import { LANGUAGES, STATUS_LABEL } from '../lib/constants'
import { todayLocal } from '../lib/loans'

export default function BookDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { books, rooms, members, activeMember, updateBook, deleteBook, setReadingStatus } = useApp()
  const book = books.find(b => b.id === id)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<BookInput | null>(null)
  const [busy, setBusy] = useState(false)

  const existingIsbns = useMemo(() => {
    const m = new Map<string, string>()
    books.forEach(b => { if (b.isbn) m.set(b.isbn, b.id) })
    return m
  }, [books])

  if (!book) return <p className="p-6 text-center text-stone-500">Cartea nu există (sau nu e încărcată încă).</p>
  const room = rooms.find(r => r.id === book.room_id)
  const myStatus = (book.reading_status ?? []).find(s => s.member_id === activeMember?.id)

  const startEdit = () => {
    const { id: _id, created_at: _c, updated_at: _u, reading_status: _r, loans: _l, ...rest } = book
    setDraft({ ...rest, author: rest.author ?? '', publisher: rest.publisher ?? '', isbn: rest.isbn ?? '', series: rest.series ?? '', sub_location: rest.sub_location ?? '', notes: rest.notes ?? '' })
    setEditing(true)
  }
  const save = async () => {
    if (!draft || !draft.title.trim()) return
    setBusy(true)
    try { await updateBook(book.id, draft); setEditing(false) } catch (e) { alert('Nu am putut salva: ' + (e as Error).message) }
    setBusy(false)
  }
  const remove = async () => {
    if (!confirm(`Ștergi „${book.title}” din bibliotecă?`)) return
    await deleteBook(book.id); nav('/')
  }
  const setStatus = (status: ReadStatus) => {
    if (!activeMember) return
    void setReadingStatus({
      book_id: book.id, member_id: activeMember.id, status,
      finished_at: status === 'read' ? (myStatus?.finished_at ?? todayLocal()) : null,
      current_page: status === 'reading' ? (myStatus?.current_page ?? null) : null,
    })
  }
  const setField = (patch: { rating?: number | null; impression?: string | null; current_page?: number | null; finished_at?: string | null }) => {
    if (!activeMember) return
    void setReadingStatus({ book_id: book.id, member_id: activeMember.id, status: myStatus?.status ?? 'read', ...patch })
  }

  if (editing && draft) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Editează cartea</h1>
        <BookForm value={draft} onChange={setDraft} rooms={rooms} excludeId={book.id} existingIsbns={existingIsbns} />
        <div className="flex gap-2">
          <button className="btn-secondary flex-1" onClick={() => setEditing(false)}>Renunță</button>
          <button className="btn-primary flex-1" disabled={busy} onClick={() => void save()}>Salvează</button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <button onClick={() => nav(-1)} className="text-amber-800">‹ Înapoi</button>
      <div className="flex gap-4">
        <Cover book={book} className="h-44 w-28 rounded-xl shrink-0 shadow" />
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-tight">{book.title}</h1>
          {book.author && <div className="text-stone-600">{book.author}</div>}
          {book.series && <div className="text-sm text-stone-500">{book.series}{book.series_volume ? `, vol. ${book.series_volume}` : ''}</div>}
          <div className="mt-2 text-sm space-y-0.5 text-stone-600">
            <div>📍 {room?.name ?? 'fără cameră'}{book.sub_location ? ` · ${book.sub_location}` : ''}</div>
            <div>{book.audience.map(a => (a === 'copii' ? 'Copii' : 'Adulți')).join(' + ')}{book.min_age ? ` · de la ${book.min_age} ani` : ''}</div>
            {book.genres.length > 0 && <div>{book.genres.join(', ')}</div>}
            {(book.publisher || book.year) && <div>{[book.publisher, book.year].filter(Boolean).join(', ')}</div>}
            {book.pages && <div>{book.pages} pagini · {LANGUAGES[book.language ?? 'ro'] ?? book.language}</div>}
            {book.isbn && <div className="text-xs text-stone-400">ISBN {book.isbn}</div>}
            {book.copies > 1 && <div>{book.copies} exemplare</div>}
            {book.tags.length > 0 && <div className="flex flex-wrap gap-1 pt-1">{book.tags.map(t => <span key={t} className="rounded-full bg-stone-100 px-2 text-xs">{t}</span>)}</div>}
          </div>
        </div>
      </div>
      {book.notes && <p className="text-sm text-stone-600 whitespace-pre-wrap">{book.notes}</p>}
      <LoanPanel book={book} />

      {activeMember && (
        <div className="card p-4 space-y-3">
          <div className="font-semibold">{activeMember.avatar} Pentru {activeMember.name}</div>
          <div className="flex gap-2">
            {(['unread', 'reading', 'read'] as ReadStatus[]).map(s => (
              <button key={s} onClick={() => setStatus(s)} className={(myStatus?.status ?? 'unread') === s ? 'chip-on' : 'chip-off'}>
                {s === 'read' ? '✅ ' : s === 'reading' ? '📖 ' : ''}{STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          {myStatus?.status === 'reading' && (
            <div className="flex items-center gap-2 text-sm">
              <span>Am ajuns la pagina</span>
              <input className="input !w-24 !py-1" inputMode="numeric" defaultValue={myStatus.current_page ?? ''}
                onBlur={e => setField({ current_page: e.target.value ? Number(e.target.value) : null })} />
              {book.pages && <span className="text-stone-500">din {book.pages}</span>}
            </div>
          )}
          {myStatus?.status === 'read' && (
            <>
              <div className="flex items-center gap-2 text-sm">
                <span>Terminată pe</span>
                <input className="input !w-auto !py-1" type="date" max={todayLocal()} defaultValue={myStatus.finished_at ?? ''}
                  onBlur={e => setField({ finished_at: e.target.value || null })} />
              </div>
              <div className="flex gap-1 text-2xl">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => setField({ rating: n })} className={n <= (myStatus.rating ?? 0) ? '' : 'opacity-30'}>⭐</button>
                ))}
              </div>
              <textarea className="input" rows={2} placeholder="Cum ți s-a părut? (o impresie scurtă)"
                defaultValue={myStatus.impression ?? ''} onBlur={e => setField({ impression: e.target.value || null })} />
            </>
          )}
        </div>
      )}

      {(book.reading_status ?? []).filter(s => s.member_id !== activeMember?.id && s.status !== 'unread').length > 0 && (
        <div className="card p-4 space-y-2 text-sm">
          <div className="font-semibold">Ceilalți</div>
          {(book.reading_status ?? []).filter(s => s.member_id !== activeMember?.id && s.status !== 'unread').map(s => {
            const m = members.find(x => x.id === s.member_id)
            return (
              <div key={s.member_id}>
                {m?.avatar} <b>{m?.name}</b>: {STATUS_LABEL[s.status]}
                {s.rating ? ` · ${'⭐'.repeat(s.rating)}` : ''}
                {s.impression && <div className="text-stone-600 italic">„{s.impression}”</div>}
              </div>
            )
          })}
        </div>
      )}

      {!activeMember?.is_child && (
        <div className="flex gap-2 pt-2">
          <button className="btn-secondary flex-1" onClick={startEdit}>✏️ Editează</button>
          <button className="btn-danger" onClick={() => void remove()}>Șterge</button>
        </div>
      )}
    </div>
  )
}
