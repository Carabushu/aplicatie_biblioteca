import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../state/AppContext'
import { supabase } from '../lib/supabase'
import { booksToCsv, csvToBooks, download } from '../lib/csv'
import { memberAge } from '../lib/suggest'
import { todayLocal } from '../lib/loans'

export default function Settings() {
  const { rooms, books, refreshRooms, refreshBooks, signOut, activeMember, members, updateMember } = useApp()
  const [newRoom, setNewRoom] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const isChild = activeMember?.is_child

  const addRoom = async () => {
    const name = newRoom.trim(); if (!name) return
    const { error } = await supabase.from('rooms').insert({ name, sort_order: rooms.length + 1 })
    if (error) setMsg(error.message); else { setNewRoom(''); await refreshRooms() }
  }
  const renameRoom = async (id: string, old: string) => {
    const name = prompt('Noul nume al camerei:', old)?.trim()
    if (!name || name === old) return
    await supabase.from('rooms').update({ name }).eq('id', id); await refreshRooms()
  }
  const deleteRoom = async (id: string, name: string) => {
    const n = books.filter(b => b.room_id === id).length
    if (!confirm(`Ștergi camera „${name}”?${n ? ` ${n} cărți vor rămâne fără cameră.` : ''}`)) return
    await supabase.from('rooms').delete().eq('id', id); await refreshRooms(); await refreshBooks()
  }

  const setBirthDate = async (id: string, raw: string) => {
    try { await updateMember(id, { birth_date: raw || null }); setMsg('Am salvat data nașterii.') }
    catch (e) { setMsg('Nu am putut salva: ' + (e as Error).message + ' — ai rulat migrarea 0006?') }
  }

  const exportCsv = () => download(`biblioteca-${new Date().toISOString().slice(0, 10)}.csv`, booksToCsv(books, rooms), 'text/csv')
  const exportJson = () => download(`biblioteca-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ rooms, members, books }, null, 2), 'application/json')

  const importCsv = async (f: File) => {
    const text = await f.text()
    const list = csvToBooks(text, rooms)
    if (list.length === 0) { setMsg('Nu am găsit rânduri valide (trebuie o coloană „title”).'); return }
    if (!confirm(`Import ${list.length} cărți?`)) return
    const { error } = await supabase.from('books').insert(list)
    if (error) setMsg('Eroare la import: ' + error.message)
    else { setMsg(`Am importat ${list.length} cărți.`); await refreshBooks() }
  }

  const stats = {
    total: books.reduce((s, b) => s + (b.copies || 1), 0),
    copii: books.filter(b => b.audience.includes('copii')).length,
    adulti: books.filter(b => b.audience.includes('adulti')).length,
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-amber-900">⚙️ Setări</h1>

      <div className="card p-4 text-sm">
        <div className="font-semibold mb-1">Biblioteca</div>
        <div>{books.length} titluri ({stats.total} exemplare) · {stats.copii} pentru copii · {stats.adulti} pentru adulți</div>
        <div className="mt-1 text-stone-500">{rooms.map(r => `${r.name}: ${books.filter(b => b.room_id === r.id).length}`).join(' · ')}</div>
      </div>

      {!isChild && (
        <>
          <div className="card p-4 space-y-2">
            <div className="font-semibold">Camere</div>
            {rooms.map(r => (
              <div key={r.id} className="flex items-center gap-2">
                <span className="flex-1">{r.name}</span>
                <button className="text-sm text-amber-800" onClick={() => void renameRoom(r.id, r.name)}>Redenumește</button>
                <button className="text-sm text-red-600" onClick={() => void deleteRoom(r.id, r.name)}>Șterge</button>
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <input className="input" placeholder="Cameră nouă" value={newRoom} onChange={e => setNewRoom(e.target.value)} />
              <button className="btn-primary" onClick={() => void addRoom()}>Adaugă</button>
            </div>
          </div>

          {members.some(m => m.is_child) && (
            <div className="card p-4 space-y-2">
              <div className="font-semibold">Vârsta copiilor</div>
              <p className="text-xs text-stone-500">Data nașterii — ca „Ce citesc în continuare?” să nu propună cărți pentru o vârstă mai mare.</p>
              {members.filter(m => m.is_child).map(m => (
                <div key={m.id} className="flex items-center gap-2">
                  <span className="flex-1">{m.avatar} {m.name}{memberAge(m) !== null ? ` · ${memberAge(m)} ani` : ''}</span>
                  <input className="input !w-auto !py-1.5" type="date" max={todayLocal()} defaultValue={m.birth_date ?? ''}
                    aria-label={`Data nașterii pentru ${m.name}`} onBlur={e => { if (e.target.value !== (m.birth_date ?? '')) void setBirthDate(m.id, e.target.value) }} />
                </div>
              ))}
            </div>
          )}

          <div className="card p-4 space-y-2">
            <div className="font-semibold">Copie de siguranță</div>
            <div className="flex gap-2">
              <button className="btn-secondary flex-1" onClick={exportCsv}>⬇️ Export CSV</button>
              <button className="btn-secondary flex-1" onClick={exportJson}>⬇️ Export JSON</button>
            </div>
            <button className="btn-secondary w-full" onClick={() => fileRef.current?.click()}>⬆️ Import CSV</button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) void importCsv(f); e.target.value = '' }} />
            <p className="text-xs text-stone-500">CSV-ul exportat poate fi reimportat (coloane: title, author, publisher, year, pages, language, isbn, audience, genres, tags, min_age, series, series_volume, room, sub_location, copies, adults_only, notes, cover_url).</p>
          </div>
        </>
      )}

      <Link to="/lecturi" className="btn-secondary w-full">🎒 Lecturi școlare</Link>
      {msg && <p className="text-sm text-stone-700">{msg}</p>}

      <button className="btn-secondary w-full" onClick={() => void refreshBooks()}>🔄 Reîncarcă datele</button>
      <button className="text-sm text-stone-500 underline w-full" onClick={() => void signOut()}>Ieși din contul familiei</button>
      <p className="text-center text-xs text-stone-400">Biblioteca de acasă · v2</p>
    </div>
  )
}
