import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../state/AppContext'
import { analyzeSchoolList, pickImage, type SchoolItem } from '../lib/ai'
import { supabase } from '../lib/supabase'
import { addWishChecked, emptyWish, sameBook } from '../lib/wishes'
import type { Wish } from '../lib/types'

interface MatchedItem extends SchoolItem { book_id: string | null; book_title: string | null; score: number }
interface SavedList { id: string; name: string; created_at: string; member_id: string | null; count?: number; have?: number }

/** Lecturi școlare: lista de la școală (tastată, lipită sau fotografiată) → ce avem acasă și ce lipsește. */
export default function SchoolLists() {
  const app = useApp()
  const { activeMember, members, books, wishes } = app
  const nav = useNavigate()
  const [lists, setLists] = useState<SavedList[]>([])
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [items, setItems] = useState<MatchedItem[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const loadLists = async () => {
    const { data } = await supabase.from('school_lists').select('*, school_list_items(book_id)').order('created_at', { ascending: false })
    setLists(((data ?? []) as (SavedList & { school_list_items: { book_id: string | null }[] })[]).map(l => ({
      ...l, count: l.school_list_items.length, have: l.school_list_items.filter(i => i.book_id).length,
    })))
  }
  useEffect(() => { void loadLists() }, [])

  /** Potrivește fiecare titlu cu biblioteca (fuzzy, pe server). */
  const match = async (raw: SchoolItem[]) => {
    const out: MatchedItem[] = []
    for (const it of raw) {
      const { data } = await supabase.rpc('find_similar_books', { p_title: it.title, p_author: it.author ?? '', p_limit: 1 })
      const row = (data as { id: string; title: string; score: number }[] | null)?.[0]
      const ok = row && row.score > 0.55
      out.push({ ...it, book_id: ok ? row.id : null, book_title: ok ? row.title : null, score: row?.score ?? 0 })
    }
    return out
  }

  const fromText = async () => {
    const raw = parseText(text)
    if (raw.length === 0) { setError('Scrie câte o carte pe rând, de ex. „Amintiri din copilărie – Ion Creangă”.'); return }
    setBusy('Caut în bibliotecă…'); setError(null)
    setItems(await match(raw)); setBusy(null)
  }

  const fromPhoto = async () => {
    const file = await pickImage(true)
    if (!file) return
    setBusy('Citesc lista… (10 s)'); setError(null)
    try {
      const { items: raw } = await analyzeSchoolList(file, activeMember?.id ?? null)
      if (raw.length === 0) { setError('Nu am găsit titluri în poză.'); setBusy(null); return }
      setText(raw.map(r => (r.author ? `${r.title} – ${r.author}` : r.title)).join('\n'))
      setBusy('Caut în bibliotecă…')
      setItems(await match(raw))
    } catch (e) { setError((e as Error).message) }
    setBusy(null)
  }

  const saveList = async () => {
    if (!items || !name.trim()) { setError('Dă-i un nume listei (ex. „Clasa a VII-a, 2026–2027”).'); return }
    setBusy('Salvez…')
    const { data: list, error: e1 } = await supabase.from('school_lists').insert({ name: name.trim(), member_id: activeMember?.id ?? null }).select().single()
    if (e1 || !list) { setError(e1?.message ?? 'Eroare'); setBusy(null); return }
    await supabase.from('school_list_items').insert(items.map((it, i) => ({ list_id: list.id, title: it.title, author: it.author, book_id: it.book_id, sort_order: i })))
    setBusy(null); setItems(null); setText(''); setName('')
    await loadLists(); setOpenId(list.id)
  }

  const removeList = async (id: string) => {
    if (!confirm('Ștergi lista?')) return
    await supabase.from('school_lists').delete().eq('id', id); await loadLists()
  }

  const have = items?.filter(i => i.book_id).length ?? 0
  const wishFor = activeMember?.id ?? null
  const toWish = (it: { title: string; author: string | null }, memberId: string | null, listName: string) =>
    addWishChecked(app, { ...emptyWish(memberId, it.title, 'school_list'), author: it.author, note: `Lectură școlară${listName ? `: ${listName}` : ''}` })
  const missingNotWished = (items ?? []).filter(i => !i.book_id && !isWished(wishes, i.title, wishFor))
  const allToWishes = async () => {
    for (const it of missingNotWished) { if (!(await toWish(it, wishFor, name.trim()))) break }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => nav(-1)} className="text-amber-800">‹</button>
        <h1 className="text-2xl font-bold text-amber-900">🎒 Lecturi școlare</h1>
      </div>

      {!items && (
        <div className="card p-4 space-y-3">
          <div className="font-semibold">Listă nouă</div>
          <input className="input" placeholder="Nume (ex. Clasa a VII-a, sem. I)" value={name} onChange={e => setName(e.target.value)} />
          <textarea className="input" rows={6} placeholder={'Câte o carte pe rând:\nAmintiri din copilărie – Ion Creangă\nBaltagul – Mihail Sadoveanu'} value={text} onChange={e => setText(e.target.value)} />
          <div className="flex gap-2">
            <button className="btn-secondary flex-1" disabled={!!busy} onClick={() => void fromPhoto()}>📷 Din poză</button>
            <button className="btn-primary flex-1" disabled={!!busy || !text.trim()} onClick={() => void fromText()}>Verifică ce avem</button>
          </div>
          {busy && <p className="text-sm text-amber-800 animate-pulse">{busy}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}

      {items && (
        <div className="space-y-3">
          <div className="card p-4">
            <div className="text-lg font-semibold">Avem {have} din {items.length}</div>
            <div className="text-sm text-stone-600">Lipsesc {items.length - have} — le poți pune pe lista de dorințe sau le cauți la bibliotecă.</div>
          </div>
          <div className="space-y-1">
            {items.map((it, i) => (
              <div key={i} className={`card p-3 flex items-center gap-3 ${it.book_id ? '' : 'border-red-200 bg-red-50/40'}`}>
                <span className="text-xl">{it.book_id ? '✅' : '❌'}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{it.title}</div>
                  <div className="text-xs text-stone-500 truncate">{it.author ?? ''}{it.book_id && it.book_title && it.book_title !== it.title ? ` · în bibliotecă: „${it.book_title}”` : ''}</div>
                </div>
                {it.book_id ? <Link to={`/carte/${it.book_id}`} className="text-xs text-amber-800">deschide</Link>
                  : isWished(wishes, it.title, wishFor) ? <span className="text-xs text-stone-500">⭐ pe listă</span>
                  : <button className="text-xs text-amber-800" onClick={() => void toWish(it, wishFor, name.trim())}>⭐ la dorințe</button>}
              </div>
            ))}
          </div>
          {missingNotWished.length > 1 && (
            <button className="btn-secondary w-full" onClick={() => void allToWishes()}>⭐ Pune toate cele {missingNotWished.length} lipsă la dorințe</button>
          )}
          <div className="flex gap-2">
            <button className="btn-secondary flex-1" onClick={() => setItems(null)}>Înapoi</button>
            <button className="btn-primary flex-1" disabled={!!busy} onClick={() => void saveList()}>💾 Salvează lista</button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}

      {lists.length > 0 && !items && (
        <div className="space-y-2">
          <div className="font-semibold">Liste salvate</div>
          {lists.map(l => (
            <SavedListCard key={l.id} list={l} open={openId === l.id} onToggle={() => setOpenId(openId === l.id ? null : l.id)}
              onDelete={() => void removeList(l.id)} memberName={members.find(m => m.id === l.member_id)?.name} booksVersion={books.length}
              wishes={wishes} onWish={it => void toWish(it, l.member_id ?? wishFor, l.name)} />
          ))}
        </div>
      )}
    </div>
  )
}

function SavedListCard({ list, open, onToggle, onDelete, memberName, booksVersion, wishes, onWish }: {
  list: SavedList; open: boolean; onToggle: () => void; onDelete: () => void; memberName?: string; booksVersion: number
  wishes: Wish[]; onWish: (it: { title: string; author: string | null }) => void
}) {
  const [items, setItems] = useState<{ id: string; title: string; author: string | null; book_id: string | null }[] | null>(null)
  useEffect(() => {
    if (!open) return
    void (async () => {
      const { data } = await supabase.from('school_list_items').select('*').eq('list_id', list.id).order('sort_order')
      const rows = (data ?? []) as { id: string; title: string; author: string | null; book_id: string | null }[]
      // re-potrivește ce lipsea — poate am adăugat cartea între timp
      for (const r of rows.filter(x => !x.book_id)) {
        const { data: sim } = await supabase.rpc('find_similar_books', { p_title: r.title, p_author: r.author ?? '', p_limit: 1 })
        const s = (sim as { id: string; score: number }[] | null)?.[0]
        if (s && s.score > 0.55) { r.book_id = s.id; await supabase.from('school_list_items').update({ book_id: s.id }).eq('id', r.id) }
      }
      setItems(rows)
    })()
  }, [open, list.id, booksVersion])
  const have = items?.filter(i => i.book_id).length ?? list.have ?? 0
  const total = items?.length ?? list.count ?? 0
  return (
    <div className="card p-3">
      <button className="w-full text-left flex items-center justify-between" onClick={onToggle}>
        <span><span className="font-medium">{list.name}</span><span className="text-xs text-stone-500 ml-2">{memberName ? `${memberName} · ` : ''}{new Date(list.created_at).toLocaleDateString('ro-RO')}</span></span>
        <span className={`text-sm font-semibold ${have === total ? 'text-green-700' : 'text-orange-700'}`}>{have}/{total}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-1">
          {!items && <div className="text-sm text-stone-500">Se încarcă…</div>}
          {items?.map(it => (
            <div key={it.id} className="flex items-center gap-2 text-sm">
              <span>{it.book_id ? '✅' : '❌'}</span>
              <span className="flex-1 truncate">{it.title}{it.author ? ` – ${it.author}` : ''}</span>
              {it.book_id ? <Link to={`/carte/${it.book_id}`} className="text-xs text-amber-800">deschide</Link>
                : isWished(wishes, it.title, list.member_id) ? <span className="text-xs text-stone-500">⭐ pe listă</span>
                : <button className="text-xs text-amber-800" onClick={() => onWish(it)}>⭐ la dorințe</button>}
            </div>
          ))}
          <button className="text-xs text-red-600 pt-2" onClick={onDelete}>Șterge lista</button>
        </div>
      )}
    </div>
  )
}

/** „Titlu – Autor” / „Autor: Titlu” / „Titlu (Autor)” / doar titlu, câte una pe rând; ignoră numerotarea. */
function parseText(text: string): SchoolItem[] {
  return text.split(/\n+/).map(l => l.replace(/^\s*[\d]+[.)]\s*|^\s*[-•*]\s*/, '').trim()).filter(Boolean).map(l => {
    let m = l.match(/^(.+?)\s+[–—-]\s+(.+)$/)
    if (m) return { title: m[1].trim(), author: m[2].trim() }
    m = l.match(/^(.+?)\s*\((.+)\)\s*$/)
    if (m) return { title: m[1].trim(), author: m[2].trim() }
    m = l.match(/^([^:]{3,40}):\s+(.+)$/)
    if (m) return { title: m[2].trim(), author: m[1].trim() }
    return { title: l, author: null }
  })
}

/** E deja pe lista de dorințe a profilului (sau a oricui, dacă lista școlară nu are profil)? */
function isWished(wishes: Wish[], title: string, memberId: string | null): boolean {
  return wishes.some(w => (memberId === null || w.added_by === memberId) && sameBook(w, { title }))
}
