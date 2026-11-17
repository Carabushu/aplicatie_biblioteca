import { lazy, Suspense, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../state/AppContext'
import { Cover } from '../components/BookCard'
import { lookupIsbn, normalizeIsbn, searchCatalog, type CatalogHit } from '../lib/catalog'
import { addWishChecked, emptyWish, ownedLocally, wishFromHit } from '../lib/wishes'
import { fmtDate } from '../lib/loans'
import type { Member, Wish, WishInput } from '../lib/types'
const BarcodeScanner = lazy(() => import('../components/BarcodeScanner'))

type Tab = 'mine' | 'family'

export default function Wishlist() {
  const app = useApp()
  const { books, wishes, members, activeMember, online, deleteWish } = app
  const nav = useNavigate()
  const isChild = !!activeMember?.is_child
  const [tab, setTab] = useState<Tab>('mine')
  const [adding, setAdding] = useState(false)
  const [forId, setForId] = useState<string | null>(activeMember?.id ?? null)
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [note, setNote] = useState('')
  const [hits, setHits] = useState<CatalogHit[] | null>(null)
  const [scanning, setScanning] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const [pendingIsbn, setPendingIsbn] = useState<string | null>(null)
  const visible = wishes
  const mine = visible.filter(w => w.added_by === activeMember?.id)
  const byMember = useMemo(() => {
    const groups: { member: Member | null; items: Wish[] }[] = members.map(m => ({ member: m, items: visible.filter(w => w.added_by === m.id) }))
    const orphan = visible.filter(w => !members.some(m => m.id === w.added_by))
    if (orphan.length) groups.push({ member: null, items: orphan })
    return groups.filter(g => g.items.length > 0)
  }, [members, visible])

  const resetForm = () => { setTitle(''); setAuthor(''); setNote(''); setHits(null); setMsg(null); setPendingIsbn(null) }
  const openForm = () => { resetForm(); setForId(activeMember?.id ?? null); setAdding(true) }

  const save = async (w: WishInput) => {
    setBusy('Verific dacă o avem…'); setMsg(null)
    const ok = await addWishChecked(app, { ...w, note: note.trim() || w.note })
    setBusy(null)
    if (ok) {
      resetForm(); setAdding(false)
      if (forId !== activeMember?.id) setTab('family')
    }
  }

  const doSearch = async () => {
    const q = `${title} ${author}`.trim()
    if (q.length < 2) return
    setBusy('Caut în cataloage…'); setMsg(null)
    const r = await searchCatalog(q).catch(() => [])
    setBusy(null); setHits(r)
    if (r.length === 0) setMsg('Nu am găsit-o în cataloage. O poți adăuga exact cum ai scris-o.')
  }

  const onScan = async (raw: string) => {
    setScanning(false)
    const isbn = normalizeIsbn(raw)
    setBusy('Caut cartea după cod…'); setMsg(null)
    const hit = await lookupIsbn(isbn).catch(() => null)
    setBusy(null)
    if (hit) await save(wishFromHit(hit, { added_by: forId, note: null, source: 'scan' }))
    else { setMsg('Nu am găsit codul în cataloage — scrie titlul și apasă „Adaugă așa”.'); setHits(null); setPendingIsbn(isbn) }
  }

  const remove = async (w: Wish) => {
    if (!confirm(`Scoți „${w.title}” de pe lista de dorințe?`)) return
    try { await deleteWish(w.id) } catch (e) { alert('Nu am putut șterge: ' + (e as Error).message) }
  }

  const canDelete = (w: Wish) => !isChild || w.added_by === activeMember?.id

  const card = (w: Wish) => {
    const have = ownedLocally(books, w)
    return (
      <div key={w.id} className="card flex gap-3 p-2">
        <Cover book={{ title: w.title, cover_url: w.cover_url }} className="h-20 w-14 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1 py-0.5 text-sm">
          <div className="font-semibold leading-tight line-clamp-2">{w.title}</div>
          {w.author && <div className="text-stone-600 truncate">{w.author}</div>}
          {w.note && <div className="text-stone-500 italic line-clamp-2">„{w.note}”</div>}
          <div className="text-xs text-stone-400">din {fmtDate(w.created_at)}{w.isbn ? ` · ISBN ${w.isbn}` : ''}</div>
          {have && <Link to={`/carte/${have.id}`} className="mt-1 inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">✅ O avem deja — vezi</Link>}
          <div className="mt-2 flex gap-2">
            <button className="btn-secondary !px-3 !py-1.5 text-sm" disabled={!online} onClick={() => nav(`/adauga?dorinta=${w.id}`)}>🛒 Am cumpărat-o</button>
            {canDelete(w) && <button className="btn-secondary !px-3 !py-1.5 text-sm" disabled={!online} onClick={() => void remove(w)} aria-label="Scoate de pe listă">🗑️</button>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-amber-900">⭐ Dorințe</h1>

      <div className="flex gap-2">
        <button className={tab === 'mine' ? 'chip-on' : 'chip-off'} onClick={() => setTab('mine')}>
          {activeMember?.avatar} Ale mele ({mine.length})
        </button>
        <button className={tab === 'family' ? 'chip-on' : 'chip-off'} onClick={() => setTab('family')}>
          👨‍👩‍👧‍👦 Toată familia ({visible.length})
        </button>
      </div>

      {!adding && (
        <button className="btn-primary w-full" disabled={!online} onClick={openForm}>➕ Adaugă o dorință</button>
      )}
      {!online && <p className="text-xs text-stone-500 text-center">Fără internet poți vedea lista, dar nu o poți modifica.</p>}

      {adding && (
        <div className="card p-4 space-y-3">
          {!isChild && (
            <div>
              <label className="label">Pentru cine?</label>
              <div className="flex flex-wrap gap-2">
                {members.map(m => (
                  <button key={m.id} type="button" className={forId === m.id ? 'chip-on' : 'chip-off'} onClick={() => setForId(m.id)}>{m.avatar} {m.name}</button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="label">Titlu</label>
            <input className="input" autoFocus value={title} onChange={e => { setTitle(e.target.value); setHits(null) }}
              onKeyDown={e => e.key === 'Enter' && void doSearch()} placeholder="ex. Cireșarii" />
          </div>
          <div>
            <label className="label">Autor (dacă știi)</label>
            <input className="input" value={author} onChange={e => { setAuthor(e.target.value); setHits(null) }} placeholder="ex. Constantin Chiriță" />
          </div>
          <div>
            <label className="label">Notă (opțional)</label>
            <input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="ex. volumul 2 · pentru ziua lui Alex · ediția cu ilustrații" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-secondary !py-2" disabled={!!busy || `${title}${author}`.trim().length < 2} onClick={() => void doSearch()}>🔎 Caută ediția</button>
            <button className="btn-secondary !py-2" disabled={!!busy} onClick={() => setScanning(true)}>📷 Scanează codul</button>
          </div>
          {busy && <p className="text-sm text-amber-800 animate-pulse">{busy}</p>}
          {msg && <p className="text-sm text-stone-600">{msg}</p>}

          {hits && hits.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm text-stone-600">Alege ediția (sau „Adaugă așa” mai jos):</div>
              {hits.slice(0, 8).map((h, i) => (
                <button key={i} disabled={!!busy} onClick={() => void save(wishFromHit(h, { added_by: forId, note: null, source: 'catalog' }))}
                  className="card flex w-full gap-3 p-2 text-left">
                  <Cover book={{ title: h.title, cover_url: h.source === 'cip' ? null : h.cover_url }} className="h-16 w-11 shrink-0 rounded-md" />
                  <div className="min-w-0 text-sm">
                    <div className="font-semibold leading-tight line-clamp-2">{h.title}</div>
                    <div className="text-stone-600 truncate">{h.author}</div>
                    <div className="text-xs text-stone-400">{[h.publisher, h.year].filter(Boolean).join(', ')}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <button className="btn-secondary flex-1 !py-2" onClick={() => { setAdding(false); resetForm(); setPendingIsbn(null) }}>Renunță</button>
            <button className="btn-primary flex-1 !py-2" disabled={!!busy || !title.trim()}
              onClick={() => void save({ ...emptyWish(forId, title, pendingIsbn ? 'scan' : 'manual'), author: author.trim() || null, isbn: pendingIsbn })}>
              💾 Adaugă așa
            </button>
          </div>
        </div>
      )}

      {scanning && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black text-white flex items-center justify-center">Pornesc camera…</div>}>
          <BarcodeScanner onDetected={code => void onScan(code)} onClose={() => setScanning(false)} />
        </Suspense>
      )}

      {tab === 'mine' && (
        <div className="space-y-2">
          {mine.length === 0 && !adding && (
            <div className="card p-5 text-center text-stone-600">
              Lista ta e goală.<br />
              <span className="text-sm text-stone-500">Adaugă cărțile pe care ți le-ai dori — familia le vede la „Toată familia”, bune de idei pentru cadouri. 🎁</span>
            </div>
          )}
          {mine.map(card)}
        </div>
      )}

      {tab === 'family' && (
        <div className="space-y-4">
          {byMember.length === 0 && <div className="card p-5 text-center text-stone-600">Nimeni nu are încă dorințe pe listă.</div>}
          {byMember.map(g => (
            <section key={g.member?.id ?? 'altii'} className="space-y-2">
              <h2 className="font-semibold text-stone-700">{g.member ? `${g.member.avatar} ${g.member.name}` : 'Fără profil'} ({g.items.length})</h2>
              {g.items.map(card)}
            </section>
          ))}
        </div>
      )}

    </div>
  )
}
