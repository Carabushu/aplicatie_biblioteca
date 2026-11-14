import { useEffect, useState } from 'react'
import type { Audience, BookInput, Room } from '../lib/types'
import { GENRES, LANGUAGES } from '../lib/constants'
import { Cover } from './BookCard'
import { supabase } from '../lib/supabase'

interface SimilarHit { id: string; title: string; author: string | null; isbn: string | null; score: number }

interface Props {
  value: BookInput
  onChange: (b: BookInput) => void
  rooms: Room[]
  excludeId?: string           // la editare: nu semnala cartea însăși ca duplicat
  existingIsbns?: Map<string, string> // isbn → id, pentru alerta de duplicat
}

export default function BookForm({ value, onChange, rooms, excludeId, existingIsbns }: Props) {
  const set = <K extends keyof BookInput>(k: K, v: BookInput[K]) => onChange({ ...value, [k]: v })
  const num = (s: string) => (s.trim() === '' ? null : Number(s))
  const [similar, setSimilar] = useState<SimilarHit[]>([])
  const [tagInput, setTagInput] = useState(value.tags.join(', '))

  // Alertă duplicate după titlu/autor (fuzzy, pe server), cu debounce
  useEffect(() => {
    const t = value.title.trim()
    if (t.length < 3) { setSimilar([]); return }
    const h = setTimeout(async () => {
      const { data } = await supabase.rpc('find_similar_books', { p_title: t, p_author: value.author ?? '', p_limit: 3 })
      setSimilar(((data ?? []) as SimilarHit[]).filter(x => x.id !== excludeId && x.score > 0.6))
    }, 500)
    return () => clearTimeout(h)
  }, [value.title, value.author, excludeId])

  const isbnClean = (value.isbn ?? '').replace(/[^0-9Xx]/g, '').toUpperCase()
  const isbnDupId = isbnClean ? existingIsbns?.get(isbnClean) : undefined
  const isbnDup = isbnDupId && isbnDupId !== excludeId

  const toggleAud = (a: Audience) => {
    const has = value.audience.includes(a)
    const next = has ? value.audience.filter(x => x !== a) : [...value.audience, a]
    if (next.length) set('audience', next)
  }
  const toggleGenre = (g: string) =>
    set('genres', value.genres.includes(g) ? value.genres.filter(x => x !== g) : [...value.genres, g])

  return (
    <div className="space-y-4">
      {(isbnDup || similar.length > 0) && (
        <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-3 text-sm">
          <div className="font-semibold text-yellow-900">⚠️ Posibil duplicat</div>
          {isbnDup && <div>Există deja o carte cu acest ISBN.</div>}
          {similar.map(s => (
            <div key={s.id}>„{s.title}”{s.author ? ` — ${s.author}` : ''}</div>
          ))}
          <div className="text-yellow-800 mt-1">Dacă e același titlu, poți mări „Exemplare” la cartea existentă în loc să adaugi una nouă.</div>
        </div>
      )}

      <div className="flex gap-3">
        <Cover book={{ title: value.title || 'Fără titlu', cover_url: value.cover_url }} className="h-28 w-20 rounded-lg shrink-0" />
        <div className="flex-1 space-y-2">
          <div>
            <label className="label">Titlu *</label>
            <input className="input" value={value.title} onChange={e => set('title', e.target.value)} required />
          </div>
          <div>
            <label className="label">Autor</label>
            <input className="input" value={value.author ?? ''} onChange={e => set('author', e.target.value)} />
          </div>
        </div>
      </div>

      <div>
        <label className="label">Public *</label>
        <div className="flex gap-2">
          {(['copii', 'adulti'] as Audience[]).map(a => (
            <button type="button" key={a} onClick={() => toggleAud(a)}
              className={value.audience.includes(a) ? 'chip-on' : 'chip-off'}>
              {a === 'copii' ? '🧒 Copii' : '🧑 Adulți'}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label">Camera</label>
        <select className="input" value={value.room_id ?? ''} onChange={e => set('room_id', e.target.value || null)}>
          <option value="">— fără cameră —</option>
          {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>

      <div>
        <label className="label">Gen</label>
        <div className="flex flex-wrap gap-1.5">
          {GENRES.map(g => (
            <button type="button" key={g} onClick={() => toggleGenre(g)}
              className={`${value.genres.includes(g) ? 'chip-on' : 'chip-off'} !px-2.5 !py-1 !text-xs`}>{g}</button>
          ))}
        </div>
      </div>

      <details className="card p-3">
        <summary className="cursor-pointer font-medium">Mai multe detalii</summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div><label className="label">ISBN</label>
            <input className="input" inputMode="numeric" value={value.isbn ?? ''} onChange={e => set('isbn', e.target.value)} /></div>
          <div><label className="label">Editură</label>
            <input className="input" value={value.publisher ?? ''} onChange={e => set('publisher', e.target.value)} /></div>
          <div><label className="label">An</label>
            <input className="input" inputMode="numeric" value={value.year ?? ''} onChange={e => set('year', num(e.target.value))} /></div>
          <div><label className="label">Pagini</label>
            <input className="input" inputMode="numeric" value={value.pages ?? ''} onChange={e => set('pages', num(e.target.value))} /></div>
          <div><label className="label">Limbă</label>
            <select className="input" value={value.language ?? 'ro'} onChange={e => set('language', e.target.value)}>
              {Object.entries(LANGUAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></div>
          <div><label className="label">Vârstă recomandată (de la)</label>
            <input className="input" inputMode="numeric" value={value.min_age ?? ''} onChange={e => set('min_age', num(e.target.value))} /></div>
          <div><label className="label">Serie</label>
            <input className="input" value={value.series ?? ''} onChange={e => set('series', e.target.value)} /></div>
          <div><label className="label">Volum nr.</label>
            <input className="input" inputMode="numeric" value={value.series_volume ?? ''} onChange={e => set('series_volume', num(e.target.value))} /></div>
          <div><label className="label">Sub-locație</label>
            <input className="input" placeholder="raftul de sus, cutia 3…" value={value.sub_location ?? ''} onChange={e => set('sub_location', e.target.value)} /></div>
          <div><label className="label">Exemplare</label>
            <input className="input" inputMode="numeric" value={value.copies} onChange={e => set('copies', Math.max(1, Number(e.target.value) || 1))} /></div>
          <div className="col-span-2"><label className="label">Etichete (separate prin virgulă)</label>
            <input className="input" placeholder="lectură școlară, cadou…" value={tagInput}
              onChange={e => { setTagInput(e.target.value); set('tags', e.target.value.split(',').map(x => x.trim()).filter(Boolean)) }} /></div>
          <div className="col-span-2"><label className="label">URL copertă</label>
            <input className="input" value={value.cover_url ?? ''} onChange={e => set('cover_url', e.target.value || null)} /></div>
          <div className="col-span-2"><label className="label">Note</label>
            <textarea className="input" rows={2} value={value.notes ?? ''} onChange={e => set('notes', e.target.value)} /></div>
          <label className="col-span-2 flex items-center gap-2">
            <input type="checkbox" className="h-5 w-5 accent-amber-700" checked={value.adults_only} onChange={e => set('adults_only', e.target.checked)} />
            <span>Ascunsă pe profilurile copiilor</span>
          </label>
        </div>
      </details>
    </div>
  )
}
