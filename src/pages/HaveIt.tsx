import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../state/AppContext'
import { lazy, Suspense } from 'react'
const BarcodeScanner = lazy(() => import('../components/BarcodeScanner'))
import BookCard from '../components/BookCard'
import { lookupIsbn, normalizeIsbn, type CatalogHit } from '../lib/catalog'
import { matches } from '../lib/text'
import type { Book } from '../lib/types'
import { addWishChecked, emptyWish, wishFromHit } from '../lib/wishes'

/** Modul „Avem cartea?” — răspuns rapid în librărie: scanezi sau tastezi, vezi DA/NU. */
export default function HaveIt() {
  const app = useApp()
  const { books, rooms, members, online, activeMember } = app
  const [wishMsg, setWishMsg] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [q, setQ] = useState('')
  const [result, setResult] = useState<{ isbn: string; found: Book[]; info: CatalogHit | null } | null>(null)
  const [busy, setBusy] = useState(false)

  const check = useCallback(async (raw: string) => {
    const isbn = normalizeIsbn(raw)
    setScanning(false)
    const found = books.filter(b => b.isbn === isbn)
    setResult({ isbn, found, info: null })
    if (found.length === 0 && online) {
      setBusy(true)
      const info = await lookupIsbn(isbn)
      setBusy(false)
      setResult({ isbn, found, info })
    }
  }, [books, online])

  const toWishlist = async (title: string, hit: CatalogHit | null, isbn: string | null) => {
    if (!title.trim()) return
    const base = { added_by: activeMember?.id ?? null, note: null, source: 'have_it' }
    const w = hit ? wishFromHit(hit, base) : { ...emptyWish(base.added_by, title, 'have_it'), isbn }
    if (await addWishChecked(app, w)) setWishMsg(`⭐ „${w.title}” e pe lista ta de dorințe.`)
  }
  const askTitle = () => prompt('Ce titlu are cartea?')?.trim() ?? ''

  const textHits = q.trim().length >= 2
    ? books.filter(b => matches(b.title, q) || matches(b.author, q)).slice(0, 20)
    : []

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-amber-900">🔍 Avem cartea?</h1>
      <p className="text-sm text-stone-600">Ești în librărie? Scanează codul sau scrie titlul și afli pe loc dacă o avem deja acasă.</p>

      <button className="btn-primary w-full !py-5 text-lg" onClick={() => { setResult(null); setWishMsg(null); setScanning(true) }}>📷 Scanează codul de bare</button>
      <input className="input" type="search" placeholder="…sau scrie titlul / autorul" value={q} onChange={e => { setQ(e.target.value); setResult(null); setWishMsg(null) }} />

      {scanning && <Suspense fallback={<div className="fixed inset-0 z-50 bg-black text-white flex items-center justify-center">Pornesc camera…</div>}><BarcodeScanner onDetected={code => void check(code)} onClose={() => setScanning(false)} /></Suspense>}

      {result && result.found.length > 0 && (
        <div className="space-y-2">
          <div className="rounded-2xl bg-green-100 p-5 text-center text-2xl font-bold text-green-800">✅ DA, o avem!</div>
          {result.found.map(b => <BookCard key={b.id} book={b} rooms={rooms} members={members} />)}
        </div>
      )}
      {result && result.found.length === 0 && (
        <div className="space-y-2">
          <div className="rounded-2xl bg-red-100 p-5 text-center text-2xl font-bold text-red-800">❌ NU o avem</div>
          {busy && <p className="text-center text-sm text-stone-500">Caut ce carte e…</p>}
          {result.info && (
            <div className="card p-3 text-sm">
              <div className="font-semibold">{result.info.title}</div>
              <div className="text-stone-600">{result.info.author}</div>
            </div>
          )}
          <p className="text-xs text-stone-500 text-center">Verificarea e după ISBN; aceeași carte în altă ediție ar putea avea alt cod — caută și după titlu.</p>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-primary" disabled={!online || busy || !!wishMsg}
              onClick={() => void toWishlist(result.info?.title ?? askTitle(), result.info, result.isbn)}>⭐ La dorințe</button>
            <Link to={`/adauga?isbn=${result.isbn}`} className="btn-secondary">➕ Am cumpărat-o</Link>
          </div>
          {wishMsg && <p className="text-center text-sm text-green-700">{wishMsg} <Link to="/dorinte" className="underline">Vezi lista</Link></p>}
        </div>
      )}

      {textHits.length > 0 && (
        <div className="space-y-2">
          <div className="rounded-2xl bg-green-100 p-3 text-center font-bold text-green-800">✅ Avem {textHits.length} potriviri</div>
          {textHits.map(b => <BookCard key={b.id} book={b} rooms={rooms} members={members} />)}
        </div>
      )}
      {q.trim().length >= 2 && textHits.length === 0 && (
        <div className="space-y-2">
          <div className="rounded-2xl bg-red-100 p-3 text-center font-bold text-red-800">❌ Nimic cu „{q}”</div>
          {online && !wishMsg && <button className="btn-secondary w-full" onClick={() => void toWishlist(q, null, null)}>⭐ Pune „{q.trim()}” la dorințe</button>}
          {wishMsg && <p className="text-center text-sm text-green-700">{wishMsg} <Link to="/dorinte" className="underline">Vezi lista</Link></p>}
        </div>
      )}
    </div>
  )
}
