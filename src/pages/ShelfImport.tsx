import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../state/AppContext'
import { analyzeShelf, pickImage, type ShelfBook } from '../lib/ai'
import { searchCatalog, type CatalogHit } from '../lib/catalog'
import { supabase } from '../lib/supabase'
import { norm } from '../lib/text'
import { emptyBook, type Audience, type BookInput } from '../lib/types'
import { Cover } from '../components/BookCard'

interface Candidate {
  id: number
  title: string
  author: string
  publisher: string
  confidence: number
  include: boolean
  audience: Audience
  hit: CatalogHit | null          // potrivire din cataloage (ISBN, copertă, an)
  dup: { id: string; title: string } | null
  status: 'idle' | 'lookup' | 'done'
}

type Step = 'start' | 'analyzing' | 'review' | 'saving' | 'done'

/** Poza cu raftul: Claude citește cotoarele → confirmi lista → cărțile intră în bibliotecă. */
export default function ShelfImport() {
  const { rooms, activeMember, addBook, books } = useApp()
  const nav = useNavigate()
  const [step, setStep] = useState<Step>('start')
  const [preview, setPreview] = useState<string | null>(null)
  const [cands, setCands] = useState<Candidate[]>([])
  const [roomId, setRoomId] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<{ ok: number; fail: number }>({ ok: 0, fail: 0 })
  const [usage, setUsage] = useState<string | null>(null)

  const start = async () => {
    setError(null)
    const file = await pickImage(true)
    if (!file) return
    setPreview(URL.createObjectURL(file))
    setStep('analyzing')
    try {
      const { books: found, usage } = await analyzeShelf(file, activeMember?.id ?? null)
      if (usage) setUsage(`${usage.input_tokens + usage.output_tokens} tokeni`)
      if (found.length === 0) { setError('Nu am putut citi niciun titlu. Încearcă mai aproape, cu lumină mai bună, sau pe porțiuni de raft.'); setStep('start'); return }
      const list: Candidate[] = found.map((b: ShelfBook, i) => ({
        id: i, title: b.title, author: b.author ?? '', publisher: b.publisher ?? '', confidence: b.confidence ?? 0.5,
        include: (b.confidence ?? 0.5) >= 0.5, audience: activeMember?.is_child ? 'copii' : 'adulti',
        hit: null, dup: null, status: 'idle',
      }))
      setCands(list)
      setStep('review')
      void enrich(list)
    } catch (e) {
      setError((e as Error).message); setStep('start')
    }
  }

  /** Pentru fiecare carte: caută în cataloage (ISBN/copertă) și verifică dacă o avem deja. Secvențial, ca să nu bombardăm API-urile. */
  const enrich = async (list: Candidate[]) => {
    for (const c of list) {
      setCands(prev => prev.map(x => (x.id === c.id ? { ...x, status: 'lookup' } : x)))
      const [hits, dup] = await Promise.all([
        searchCatalog(`${c.title} ${c.author}`.trim()).catch(() => [] as CatalogHit[]),
        (async () => {
          try {
            const r = await supabase.rpc('find_similar_books', { p_title: c.title, p_author: c.author, p_limit: 1 })
            const row = (r.data as { id: string; title: string; score: number }[] | null)?.[0]
            return row && row.score > 0.6 ? { id: row.id, title: row.title } : null
          } catch { return null }
        })(),
      ])
      const hit = pickBestHit(c, hits)
      setCands(prev => prev.map(x => (x.id === c.id ? { ...x, hit, dup, include: dup ? false : x.include, status: 'done',
        audience: hit?.audience ?? x.audience } : x)))
    }
  }

  const update = (id: number, patch: Partial<Candidate>) => setCands(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)))

  const save = async () => {
    const chosen = cands.filter(c => c.include && c.title.trim())
    if (chosen.length === 0) return
    setStep('saving')
    let ok = 0, fail = 0
    for (const c of chosen) {
      const b: BookInput = {
        ...emptyBook(),
        title: c.title.trim(), author: c.author.trim() || null, publisher: c.hit?.publisher || c.publisher || null,
        year: c.hit?.year ?? null, pages: c.hit?.pages ?? null, isbn: c.hit?.isbn || null, cover_url: c.hit?.cover_url ?? null,
        language: c.hit?.language ?? 'ro', audience: [c.audience], room_id: roomId || null,
        source: 'shelf_photo', needs_review: c.confidence < 0.7 || !c.hit, created_by: activeMember?.id ?? null,
      }
      try { await addBook(b); ok++ } catch { fail++ }
    }
    setSaved({ ok, fail }); setStep('done')
  }

  const selectedCount = cands.filter(c => c.include).length

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => nav(-1)} className="text-amber-800">‹</button>
        <h1 className="text-2xl font-bold text-amber-900">📚 Poză cu raftul</h1>
      </div>

      {step === 'start' && (
        <div className="space-y-3">
          <p className="text-sm text-stone-600">Fotografiază un raft frontal, cu lumină bună. Cotoarele trebuie să fie lizibile cu ochiul liber în poză; pentru rafturi lungi, fă două poze.</p>
          <button className="btn-primary w-full !py-5 text-lg" onClick={() => void start()}>📷 Fotografiază raftul</button>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <p className="text-xs text-stone-500">Poza e trimisă la Claude (Anthropic) pentru citirea cotoarelor; costă în jur de un cent și nu e păstrată nicăieri.</p>
        </div>
      )}

      {step === 'analyzing' && (
        <div className="space-y-3 text-center">
          {preview && <img src={preview} alt="" className="mx-auto max-h-64 rounded-xl" />}
          <div className="animate-pulse text-amber-800 font-medium">Citesc cotoarele… (10–20 s)</div>
        </div>
      )}

      {(step === 'review' || step === 'saving') && (
        <div className="space-y-3">
          <div className="card p-3 space-y-2">
            <div className="text-sm text-stone-600">Am citit <b>{cands.length}</b> titluri{usage ? ` (${usage})` : ''}. Bifează ce e corect, corectează ce nu e, apoi salvează.</div>
            <div className="flex gap-2 items-center">
              <select className="input" value={roomId} onChange={e => setRoomId(e.target.value)}>
                <option value="">În ce cameră e raftul?</option>
                {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <button className="chip-off whitespace-nowrap" onClick={() => setCands(p => p.map(c => ({ ...c, include: true })))}>Toate</button>
              <button className="chip-off whitespace-nowrap" onClick={() => setCands(p => p.map(c => ({ ...c, include: false })))}>Niciuna</button>
            </div>
          </div>

          <div className="space-y-2">
            {cands.map(c => (
              <div key={c.id} className={`card p-2 flex gap-2 ${c.include ? '' : 'opacity-60'}`}>
                <input type="checkbox" className="h-6 w-6 mt-1 accent-amber-700 shrink-0" checked={c.include} onChange={e => update(c.id, { include: e.target.checked })} />
                <Cover book={{ title: c.title, cover_url: c.hit?.cover_url ?? null }} className="h-20 w-14 rounded-md shrink-0" />
                <div className="min-w-0 flex-1 space-y-1">
                  <input className="input !py-1.5 font-semibold" value={c.title} onChange={e => update(c.id, { title: e.target.value })} />
                  <input className="input !py-1.5 text-sm" placeholder="Autor" value={c.author} onChange={e => update(c.id, { author: e.target.value })} />
                  <div className="flex flex-wrap gap-1 items-center text-xs">
                    <button onClick={() => update(c.id, { audience: c.audience === 'copii' ? 'adulti' : 'copii' })}
                      className={`${c.audience === 'copii' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'} rounded-full px-2 py-0.5`}>
                      {c.audience === 'copii' ? '🧒 Copii' : '🧑 Adulți'} ⇄
                    </button>
                    {c.confidence < 0.7 && <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-yellow-800">citire nesigură</span>}
                    {c.status === 'lookup' && <span className="text-stone-400">caut în cataloage…</span>}
                    {c.status === 'done' && c.hit && <span className="text-green-700">✓ {c.hit.source === 'cip' ? 'CIP' : c.hit.source === 'google' ? 'Google' : 'Open Library'}{c.hit.year ? ` · ${c.hit.year}` : ''}</span>}
                    {c.status === 'done' && !c.hit && <span className="text-stone-400">negăsită în cataloage (se salvează cu datele citite)</span>}
                    {c.dup && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-orange-800">⚠ o avem deja: „{c.dup.title}”</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="sticky bottom-20 bg-amber-50/95 py-2">
            <button className="btn-primary w-full" disabled={step === 'saving' || selectedCount === 0} onClick={() => void save()}>
              {step === 'saving' ? 'Salvez…' : `💾 Adaugă ${selectedCount} cărți în bibliotecă`}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="card p-6 text-center space-y-3">
          <div className="text-4xl">🎉</div>
          <div className="text-lg font-semibold">Am adăugat {saved.ok} cărți{saved.fail ? `, ${saved.fail} au eșuat` : ''}.</div>
          <p className="text-sm text-stone-600">Cele cu citire nesigură sau negăsite în cataloage au eticheta „De verificat” — le poți corecta oricând din detaliile cărții.</p>
          <div className="flex gap-2">
            <button className="btn-secondary flex-1" onClick={() => { setStep('start'); setCands([]); setPreview(null) }}>📷 Încă un raft</button>
            <Link to="/" className="btn-primary flex-1">Vezi biblioteca ({books.length})</Link>
          </div>
        </div>
      )}
    </div>
  )
}

/** Alege rezultatul din cataloage care seamănă cu adevărat cu titlul citit (evită potriviri la întâmplare). */
function pickBestHit(c: Candidate, hits: CatalogHit[]): CatalogHit | null {
  const t = norm(c.title)
  const a = norm(c.author)
  for (const h of hits) {
    const ht = norm(h.title)
    const titleOk = ht === t || ht.startsWith(t) || t.startsWith(ht) || (t.length > 8 && ht.includes(t))
    const authorOk = !a || !h.author || norm(h.author).split(/[\s,]+/).some(w => w.length > 2 && a.includes(w))
    if (titleOk && authorOk) return h
  }
  return null
}
