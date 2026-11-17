import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../state/AppContext'
import { Cover } from '../components/BookCard'
import { supabase } from '../lib/supabase'
import { eligible, LENGTHS, memberAge, pick, rankSuggestions, type Length, type Suggestion } from '../lib/suggest'

/** „Ce citesc în continuare?” — o propunere pe rând, cu motivele ei; „🎲 Alta” trage din nou. */
export default function WhatNext() {
  const { books, rooms, members, activeMember, online, setReadingStatus } = useApp()
  const nav = useNavigate()
  const [genre, setGenre] = useState('')
  const [length, setLength] = useState<Length>('')
  const [schoolIds, setSchoolIds] = useState<Set<string>>(new Set())
  const [shown, setShown] = useState<Set<string>>(new Set())
  const [current, setCurrent] = useState<Suggestion | null>(null)
  const [busy, setBusy] = useState(false)

  // cărțile din listele de lecturi școlare ale profilului (cele găsite în bibliotecă)
  useEffect(() => {
    if (!activeMember || !online) return
    let alive = true
    void supabase.from('school_list_items').select('book_id, school_lists!inner(member_id)')
      .eq('school_lists.member_id', activeMember.id).not('book_id', 'is', null)
      .then(({ data }) => { if (alive && data) setSchoolIds(new Set((data as { book_id: string }[]).map(r => r.book_id))) })
    return () => { alive = false }
  }, [activeMember, online])

  const pool = useMemo(() => (activeMember ? eligible(books, activeMember) : []), [books, activeMember])
  const genres = useMemo(() => [...new Set(pool.flatMap(b => b.genres))].sort((a, b) => a.localeCompare(b, 'ro')), [pool])
  const ranked = useMemo(
    () => (activeMember ? rankSuggestions(books, activeMember, members, schoolIds, { genre, length }) : []),
    [books, activeMember, members, schoolIds, genre, length],
  )

  // o propunere nouă când se schimbă filtrele (sau la prima încărcare)
  useEffect(() => {
    const s = pick(ranked, new Set())
    setCurrent(s); setShown(new Set(s ? [s.book.id] : []))
  }, [ranked])

  if (!activeMember) return <p className="p-6 text-center text-stone-500">Alege întâi un profil.</p>

  const another = () => {
    const s = pick(ranked, shown)
    if (!s) return
    setCurrent(s)
    setShown(prev => (prev.size >= Math.min(ranked.length, 12) ? new Set([s.book.id]) : new Set(prev).add(s.book.id)))
  }

  const start = async () => {
    if (!current) return
    setBusy(true)
    try {
      await setReadingStatus({ book_id: current.book.id, member_id: activeMember.id, status: 'reading', current_page: null, finished_at: null })
      nav(`/carte/${current.book.id}`)
    } catch (e) { alert('Nu am putut salva: ' + (e as Error).message); setBusy(false) }
  }

  const age = memberAge(activeMember)
  const room = current ? rooms.find(r => r.id === current.book.room_id) : null
  const others = ranked.filter(s => s.book.id !== current?.book.id).slice(0, 4)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => nav(-1)} className="text-amber-800">‹</button>
        <h1 className="text-2xl font-bold text-amber-900">🎲 Ce citesc în continuare?</h1>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select className="input" value={genre} onChange={e => setGenre(e.target.value)} aria-label="Gen">
          <option value="">Orice gen</option>{genres.map(g => <option key={g}>{g}</option>)}
        </select>
        <select className="input" value={length} onChange={e => setLength(e.target.value as Length)} aria-label="Lungime">
          <option value="">Orice lungime</option>
          {(Object.keys(LENGTHS) as Exclude<Length, ''>[]).map(k => <option key={k} value={k}>{LENGTHS[k].label}</option>)}
        </select>
      </div>

      {current ? (
        <div className="card p-4 space-y-3">
          <Link to={`/carte/${current.book.id}`} className="flex gap-4">
            <Cover book={current.book} className="h-40 w-26 shrink-0 rounded-xl shadow" />
            <div className="min-w-0">
              <div className="text-xl font-bold leading-tight">{current.book.title}</div>
              {current.book.author && <div className="text-stone-600">{current.book.author}</div>}
              <div className="mt-2 space-y-0.5 text-sm text-stone-600">
                {current.book.series && <div>{current.book.series}{current.book.series_volume ? `, vol. ${current.book.series_volume}` : ''}</div>}
                {current.book.pages && <div>{current.book.pages} pagini</div>}
                <div>📍 {room?.name ?? 'fără cameră'}{current.book.sub_location ? ` · ${current.book.sub_location}` : ''}</div>
              </div>
            </div>
          </Link>
          <ul className="space-y-1 text-sm">
            {current.reasons.map(r => <li key={r}>{r}</li>)}
          </ul>
          <div className="flex gap-2">
            <button className="btn-secondary flex-1" onClick={another} disabled={ranked.length < 2}>🎲 Alta</button>
            <button className="btn-primary flex-1" disabled={busy || !online} onClick={() => void start()}>📖 Încep s-o citesc</button>
          </div>
          {!online && <p className="text-xs text-stone-500">Fără internet nu pot salva „În curs”, dar poți lua cartea de pe raft. 🙂</p>}
        </div>
      ) : (
        <div className="card p-5 text-center text-stone-600">
          {pool.length === 0
            ? 'Nu am găsit nicio carte necitită potrivită pentru tine — ai citit tot? 🎉'
            : 'Nimic nu se potrivește cu filtrele alese. Încearcă „Orice gen” sau „Orice lungime”.'}
        </div>
      )}

      {others.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold text-stone-700">Alte idei</h2>
          <div className="grid grid-cols-4 gap-2">
            {others.map(s => (
              <button key={s.book.id} className="flex flex-col text-left" onClick={() => { setCurrent(s); setShown(prev => new Set(prev).add(s.book.id)) }}>
                <Cover book={s.book} className="h-24 w-full rounded-lg" />
                <div className="mt-1 text-xs leading-tight line-clamp-2">{s.book.title}</div>
              </button>
            ))}
          </div>
        </section>
      )}

      <p className="text-xs text-stone-500">
        Aleg dintre {pool.length} cărți necitite de {activeMember.name}, aflate acasă
        {activeMember.is_child ? `, pentru copii${age !== null ? `, potrivite pentru ${age} ani` : ''}` : ''}.
        {activeMember.is_child && age === null && ' Roagă un părinte să pună data ta de naștere în Setări, ca să țin cont și de vârstă.'}
      </p>
    </div>
  )
}
