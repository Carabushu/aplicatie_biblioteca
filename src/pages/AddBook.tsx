import { useCallback, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../state/AppContext'
import BookForm from '../components/BookForm'
import { lazy, Suspense } from 'react'
const BarcodeScanner = lazy(() => import('../components/BarcodeScanner'))
import { Cover } from '../components/BookCard'
import { hitToBookInput, isValidIsbn, lookupIsbn, normalizeIsbn, searchCatalog, type CatalogHit } from '../lib/catalog'
import { GENRES } from '../lib/constants'
const GENRE_SET = new Set<string>(GENRES)
import { emptyBook, type BookInput } from '../lib/types'
import { analyzeCover, pickImage } from '../lib/ai'
import { norm } from '../lib/text'

type Mode = 'alege' | 'scan' | 'isbn' | 'cauta' | 'manual' | 'formular' | 'coperta'

function Big({ icon, title, sub, onClick }: { icon: string; title: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="card flex w-full items-center gap-4 p-4 text-left active:scale-[0.98] transition">
      <span className="text-3xl">{icon}</span>
      <span><span className="block font-semibold">{title}</span><span className="text-sm text-stone-500">{sub}</span></span>
    </button>
  )
}

export default function AddBook() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const { books, rooms, activeMember, addBook } = useApp()
  const [mode, setMode] = useState<Mode>(() => (params.get('isbn') ? 'isbn' : 'alege'))
  const [draft, setDraft] = useState<BookInput>(() => ({ ...emptyBook(), created_by: activeMember?.id ?? null, audience: [activeMember?.is_child ? 'copii' : 'adulti'] }))
  const [isbn, setIsbn] = useState(params.get('isbn') ?? '')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<CatalogHit[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const existingIsbns = useMemo(() => {
    const m = new Map<string, string>()
    books.forEach(b => { if (b.isbn) m.set(b.isbn, b.id) })
    return m
  }, [books])

  const base = useCallback((): BookInput => ({
    ...emptyBook(), created_by: activeMember?.id ?? null,
    audience: [activeMember?.is_child ? 'copii' : 'adulti'],
  }), [activeMember])

  const fromIsbn = useCallback(async (raw: string) => {
    const code = normalizeIsbn(raw)
    setMode('isbn'); setIsbn(code); setMsg(null)
    if (!isValidIsbn(code)) { setMsg('Codul nu pare un ISBN valid (10 sau 13 cifre).'); return }
    const dupId = existingIsbns.get(code)
    if (dupId) {
      const b = books.find(x => x.id === dupId)
      if (!confirm(`„${b?.title}” e deja în bibliotecă. Adaugi totuși un alt exemplar ca o carte nouă?`)) { nav(`/carte/${dupId}`); return }
    }
    setBusy(true)
    const hit = await lookupIsbn(code)
    setBusy(false)
    if (hit) {
      setDraft(hitToBookInput(hit, base())); setMode('formular')
    } else {
      setMsg('Nu am găsit cartea în cataloage (des la cărțile românești). Completeaz-o manual — ISBN-ul rămâne salvat.')
      setDraft({ ...base(), isbn: code, source: 'isbn' })
    }
  }, [existingIsbns, books, nav, base])

  const onScan = useCallback((code: string) => { void fromIsbn(code) }, [fromIsbn])

  const doSearch = async () => {
    setBusy(true); setHits([]); setMsg(null)
    const r = await searchCatalog(query)
    setBusy(false)
    setHits(r)
    if (r.length === 0) setMsg('Nimic găsit. Încearcă alt titlu sau adaugă manual.')
  }

  /** Poza cu coperta: Claude citește titlul/autorul/editura; apoi încercăm să găsim ediția în cataloage pentru ISBN și copertă. */
  const fromCover = async (keepIsbn?: string) => {
    const file = await pickImage(true)
    if (!file) return
    setMode('coperta'); setMsg(null); setBusy(true)
    try {
      const { cover } = await analyzeCover(file, activeMember?.id ?? null)
      let d: BookInput = {
        ...base(), title: cover.title ?? '', author: cover.author ?? '', publisher: cover.publisher ?? '', year: cover.year ?? null,
        pages: cover.pages ?? null, series: cover.series ?? '', series_volume: cover.series_volume ?? null, language: cover.language ?? 'ro',
        audience: cover.audience ? [cover.audience] : base().audience, min_age: cover.min_age ?? null,
        genres: (cover.genres ?? []).filter(g => (GENRE_SET as Set<string>).has(g)), isbn: keepIsbn ?? '',
        source: 'cover_photo', needs_review: (cover.confidence ?? 0) < 0.7,
      }
      // potrivire în cataloage (CIP/Google/OL) pentru ISBN, copertă, an
      const hits = await searchCatalog(`${d.title} ${d.author ?? ''}`.trim()).catch(() => [])
      const t = norm(d.title)
      const hit = hits.find(h => { const ht = norm(h.title); return ht === t || ht.startsWith(t) || t.startsWith(ht) })
      if (hit) {
        d = { ...d, isbn: keepIsbn || hit.isbn || d.isbn, cover_url: hit.cover_url ?? null, publisher: d.publisher || hit.publisher,
          year: d.year ?? hit.year, pages: d.pages ?? hit.pages }
      }
      setDraft(d); setMode('formular')
    } catch (e) {
      setMsg((e as Error).message); setMode('alege')
    }
    setBusy(false)
  }

  const save = async () => {
    if (!draft.title.trim()) { setMsg('Titlul e obligatoriu.'); return }
    setBusy(true)
    try {
      const b = await addBook(draft)
      nav(`/carte/${b.id}`, { replace: true })
    } catch (e) { setMsg('Nu am putut salva: ' + (e as Error).message) }
    setBusy(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {mode !== 'alege' && <button onClick={() => { setMode('alege'); setMsg(null) }} className="text-amber-800">‹</button>}
        <h1 className="text-2xl font-bold text-amber-900">➕ Adaugă o carte</h1>
      </div>

      {mode === 'alege' && (
        <div className="space-y-3">
          <Big icon="📷" title="Scanează codul de bare" sub="Codul ISBN de pe spatele cărții" onClick={() => setMode('scan')} />
          <Big icon="🔢" title="Tastează ISBN-ul" sub="Când codul nu se scanează" onClick={() => setMode('isbn')} />
          <Big icon="🔎" title="Caută după titlu sau autor" sub="Completare automată din cataloage" onClick={() => setMode('cauta')} />
          <Big icon="🖼️" title="Poză cu coperta" sub="AI citește titlul, autorul, editura — pentru cărți fără cod de bare" onClick={() => void fromCover()} />
          <Big icon="📚" title="Poză cu raftul întreg" sub="AI citește toate cotoarele; tu confirmi lista" onClick={() => nav('/raft')} />
          <Big icon="✍️" title="Introdu manual" sub="Când nimic altceva nu merge" onClick={() => { setDraft(base()); setMode('formular') }} />
          {msg && <p className="text-sm text-red-600">{msg}</p>}
        </div>
      )}

      {mode === 'scan' && <Suspense fallback={<div className="fixed inset-0 z-50 bg-black text-white flex items-center justify-center">Pornesc camera…</div>}><BarcodeScanner onDetected={onScan} onClose={() => setMode('alege')} /></Suspense>}

      {mode === 'isbn' && (
        <div className="space-y-3">
          <label className="label">ISBN (10 sau 13 cifre)</label>
          <input className="input text-lg tracking-wider" inputMode="numeric" autoFocus value={isbn}
            onChange={e => setIsbn(e.target.value)} onKeyDown={e => e.key === 'Enter' && void fromIsbn(isbn)} />
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => setMode('scan')}>📷 Scanează</button>
            <button className="btn-primary flex-1" disabled={busy || !isbn} onClick={() => void fromIsbn(isbn)}>{busy ? 'Caut…' : 'Caută'}</button>
          </div>
          {msg && <p className="text-sm text-stone-600">{msg}</p>}
          {msg && draft.isbn && (
            <div className="flex gap-2">
              <button className="btn-primary flex-1" onClick={() => void fromCover(draft.isbn ?? undefined)}>🖼️ Fotografiază coperta</button>
              <button className="btn-secondary flex-1" onClick={() => setMode('formular')}>Completează manual</button>
            </div>
          )}
        </div>
      )}

      {mode === 'cauta' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input className="input" type="search" placeholder="Titlu sau autor (🎤 din tastatură)" autoFocus value={query}
              onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && void doSearch()} />
            <button className="btn-primary" disabled={busy || query.trim().length < 2} onClick={() => void doSearch()}>{busy ? '…' : 'Caută'}</button>
          </div>
          {msg && <p className="text-sm text-stone-600">{msg}</p>}
          <div className="space-y-2">
            {hits.map((h, i) => (
              <button key={i} onClick={() => { setDraft(hitToBookInput(h, base())); setMode('formular') }}
                className="card flex w-full gap-3 p-2 text-left">
                <Cover book={{ title: h.title, cover_url: h.source === 'cip' ? null : h.cover_url }} className="h-20 w-14 rounded-md shrink-0" />
                <div className="min-w-0">
                  <div className="font-semibold leading-tight line-clamp-2">{h.title}</div>
                  <div className="text-sm text-stone-600 truncate">{h.author}</div>
                  <div className="text-xs text-stone-400">{[h.publisher, h.year].filter(Boolean).join(', ')} · {h.source === 'cip' ? 'CIP (Biblioteca Națională)' : h.source === 'google' ? 'Google Books' : 'Open Library'}</div>
                </div>
              </button>
            ))}
          </div>
          {hits.length > 0 && <button className="btn-secondary w-full" onClick={() => { setDraft({ ...base(), title: query }); setMode('formular') }}>Nu e niciuna — adaug manual</button>}
        </div>
      )}

      {mode === 'coperta' && (
        <div className="text-center space-y-2 py-10">
          <div className="text-4xl">🖼️</div>
          <div className="animate-pulse text-amber-800 font-medium">Citesc coperta… (5–10 s)</div>
        </div>
      )}

      {mode === 'formular' && (
        <div className="space-y-4">
          {draft.source !== 'manual' && <p className="text-sm text-green-700">{draft.source === 'cover_photo' ? 'Date citite de pe copertă' : 'Date completate automat'} — verifică-le și corectează ce nu e bine.</p>}
          <BookForm value={draft} onChange={setDraft} rooms={rooms} existingIsbns={existingIsbns} />
          {msg && <p className="text-sm text-red-600">{msg}</p>}
          <button className="btn-primary w-full" disabled={busy} onClick={() => void save()}>{busy ? 'Salvez…' : '💾 Salvează în bibliotecă'}</button>
        </div>
      )}
    </div>
  )
}
