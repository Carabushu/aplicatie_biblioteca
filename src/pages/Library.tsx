import { useMemo, useState } from 'react'
import { useApp } from '../state/AppContext'
import BookCard from '../components/BookCard'
import { matches } from '../lib/text'
import { GENRES } from '../lib/constants'
import type { Audience } from '../lib/types'

type ReadFilter = '' | `read:${string}` | `unread:${string}` | `reading:${string}`

export default function Library() {
  const { books, rooms, members, activeMember, booksLoading, updateBook } = useApp()
  const [q, setQ] = useState('')
  const [audience, setAudience] = useState<Audience | ''>(() => (activeMember?.is_child ? 'copii' : ''))
  const [genre, setGenre] = useState('')
  const [room, setRoom] = useState('')
  const [author, setAuthor] = useState('')
  const [maxAge, setMaxAge] = useState('')
  const [readF, setReadF] = useState<ReadFilter>('')
  const [loan, setLoan] = useState<'' | 'da' | 'nu'>('')
  const [showMore, setShowMore] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkRoom, setBulkRoom] = useState('')

  const authors = useMemo(() => {
    const s = new Set<string>()
    books.forEach(b => { if (b.author) s.add(b.author) })
    return [...s].sort((a, b) => a.localeCompare(b, 'ro'))
  }, [books])

  const visible = useMemo(() => books.filter(b => {
    if (activeMember?.is_child && b.adults_only) return false
    if (audience && !b.audience.includes(audience)) return false
    if (genre && !b.genres.includes(genre)) return false
    if (room && b.room_id !== room) return false
    if (author && b.author !== author) return false
    if (maxAge && (b.min_age ?? 0) > Number(maxAge)) return false
    if (loan) {
      const out = (b.loans ?? []).some(l => !l.returned_at && l.direction === 'out')
      if ((loan === 'da') !== out) return false
    }
    if (readF) {
      const [st, mid] = readF.split(':')
      const s = (b.reading_status ?? []).find(x => x.member_id === mid)
      const status = s?.status ?? 'unread'
      if (status !== st) return false
    }
    if (q && !(matches(b.title, q) || matches(b.author, q) || matches(b.series, q) || b.tags.some(t => matches(t, q)))) return false
    return true
  }), [books, activeMember, audience, genre, room, author, maxAge, loan, readF, q])

  const toggle = (id: string) => setSelected(prev => {
    const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n
  })

  const applyBulk = async () => {
    if (!bulkRoom || selected.size === 0) return
    if (!confirm(`Muți ${selected.size} cărți în „${rooms.find(r => r.id === bulkRoom)?.name}”?`)) return
    for (const id of selected) await updateBook(id, { room_id: bulkRoom })
    setSelected(new Set()); setSelectMode(false)
  }

  const activeFilters = [genre, room, author, maxAge, readF, loan].filter(Boolean).length

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-amber-900">📚 Cărțile noastre</h1>
        <span className="text-sm text-stone-500">{visible.length} / {books.length}</span>
      </div>

      <input className="input" type="search" placeholder="Caută titlu, autor, serie… (🎤 din tastatură)" value={q} onChange={e => setQ(e.target.value)} />

      <div className="flex gap-2">
        {([['', 'Toate'], ['copii', '🧒 Copii'], ['adulti', '🧑 Adulți']] as [Audience | '', string][]).map(([v, l]) => (
          <button key={v} onClick={() => setAudience(v)} className={audience === v ? 'chip-on' : 'chip-off'}>{l}</button>
        ))}
        <button onClick={() => setShowMore(s => !s)} className={`${activeFilters ? 'chip-on' : 'chip-off'} ml-auto`}>
          Filtre{activeFilters ? ` (${activeFilters})` : ''} {showMore ? '▴' : '▾'}
        </button>
      </div>

      {showMore && (
        <div className="card grid grid-cols-2 gap-2 p-3">
          <select className="input" value={genre} onChange={e => setGenre(e.target.value)}>
            <option value="">Orice gen</option>{GENRES.map(g => <option key={g}>{g}</option>)}
          </select>
          <select className="input" value={room} onChange={e => setRoom(e.target.value)}>
            <option value="">Orice cameră</option>{rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <select className="input" value={author} onChange={e => setAuthor(e.target.value)}>
            <option value="">Orice autor</option>{authors.map(a => <option key={a}>{a}</option>)}
          </select>
          <select className="input" value={maxAge} onChange={e => setMaxAge(e.target.value)}>
            <option value="">Orice vârstă</option>
            {[6, 8, 10, 12, 14, 16].map(a => <option key={a} value={a}>Potrivite până la {a} ani</option>)}
          </select>
          <select className="input" value={readF} onChange={e => setReadF(e.target.value as ReadFilter)}>
            <option value="">Citită / necitită…</option>
            {members.map(m => (
              <optgroup key={m.id} label={m.name}>
                <option value={`read:${m.id}`}>Citite de {m.name}</option>
                <option value={`reading:${m.id}`}>În curs — {m.name}</option>
                <option value={`unread:${m.id}`}>Necitite de {m.name}</option>
              </optgroup>
            ))}
          </select>
          <select className="input" value={loan} onChange={e => setLoan(e.target.value as '' | 'da' | 'nu')}>
            <option value="">Împrumutată sau nu</option>
            <option value="da">Doar împrumutate</option>
            <option value="nu">Doar acasă</option>
          </select>
          <button className="btn-secondary col-span-2" onClick={() => { setGenre(''); setRoom(''); setAuthor(''); setMaxAge(''); setReadF(''); setLoan('') }}>
            Șterge filtrele
          </button>
        </div>
      )}

      {!activeMember?.is_child && (
        <div className="flex items-center gap-2 text-sm">
          <button className="chip-off" onClick={() => { setSelectMode(s => !s); setSelected(new Set()) }}>
            {selectMode ? 'Anulează selecția' : '☑️ Selectează mai multe'}
          </button>
          {selectMode && (
            <>
              <select className="input !py-1.5 flex-1" value={bulkRoom} onChange={e => setBulkRoom(e.target.value)}>
                <option value="">Mută în…</option>{rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <button className="btn-primary !py-1.5" disabled={!bulkRoom || selected.size === 0} onClick={() => void applyBulk()}>
                Mută ({selected.size})
              </button>
            </>
          )}
        </div>
      )}

      {booksLoading && books.length === 0 && <p className="text-center text-stone-500">Se încarcă…</p>}
      {!booksLoading && books.length === 0 && (
        <div className="card p-6 text-center text-stone-600">
          Nicio carte încă. Apasă <b>➕ Adaugă</b> ca să începi.
        </div>
      )}
      {books.length > 0 && visible.length === 0 && <p className="text-center text-stone-500 py-6">Nimic nu se potrivește cu filtrele.</p>}

      <div className="space-y-2">
        {visible.map(b => (
          <BookCard key={b.id} book={b} rooms={rooms} members={members}
            selected={selected.has(b.id)} onToggleSelect={selectMode ? () => toggle(b.id) : undefined} />
        ))}
      </div>
    </div>
  )
}
