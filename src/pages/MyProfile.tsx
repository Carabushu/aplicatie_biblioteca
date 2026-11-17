import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useApp } from '../state/AppContext'
import { Cover } from '../components/BookCard'
import { computeBadges, computeStats, type Badge, type MemberStats } from '../lib/stats'
import { fmtDate } from '../lib/loans'

const nf = (n: number) => n.toLocaleString('ro-RO')
const carti = (n: number) => (n === 1 ? 'o carte' : n < 20 ? `${n} cărți` : `${nf(n)} de cărți`)
const pagini = (n: number) => (n === 1 ? 'o pagină' : n < 20 ? `${n} pagini` : `${nf(n)} de pagini`)

/** „Profilul meu”: statistici de lectură, insigne, și o privire asupra familiei. Se poate vedea și alt profil (?m=<id>). */
export default function MyProfile() {
  const { books, members, activeMember } = useApp()
  const [params, setParams] = useSearchParams()
  const member = members.find(m => m.id === params.get('m')) ?? activeMember
  const [year] = useState(() => new Date().getFullYear())

  const stats = useMemo(() => (member ? computeStats(books, member.id) : null), [books, member])
  const badges = useMemo(() => (stats ? computeBadges(books, stats) : []), [books, stats])
  const family = useMemo(
    () => members.map(m => ({ m, n: computeStats(books, m.id).thisYear.count })),
    [books, members],
  )

  if (!member || !stats) return <p className="p-6 text-center text-stone-500">Alege întâi un profil.</p>
  const isMe = member.id === activeMember?.id
  const earned = badges.filter(b => b.earned)
  const locked = badges.filter(b => !b.earned)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-4xl" style={{ background: member.color + '22' }}>{member.avatar}</span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-amber-900 truncate">{isMe ? 'Profilul meu' : member.name}</h1>
          <div className="text-sm text-stone-600">{isMe ? member.name + ' · ' : ''}{carti(stats.read.length)} citite · {earned.length} insigne</div>
        </div>
        {isMe
          ? <Link to="/profil" className="btn-secondary !px-3 !py-2 text-sm shrink-0">🔄 Schimbă</Link>
          : <button className="btn-secondary !px-3 !py-2 text-sm shrink-0" onClick={() => setParams({})}>‹ Al meu</button>}
      </div>

      {/* cifrele principale */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <Tile value={nf(stats.thisYear.count)} label={`citite în ${year}`} />
        <Tile value={nf(stats.read.length)} label="citite în total" />
        <Tile value={nf(stats.pages)} label="pagini citite" />
      </div>
      {stats.withoutPages > 0 && (
        <p className="-mt-2 text-xs text-stone-500">{stats.withoutPages === 1 ? 'O carte citită nu are' : `${carti(stats.withoutPages)} citite nu au`} numărul de pagini completat, deci nu intră în totalul de pagini.</p>
      )}

      {stats.reading.length > 0 && (
        <section className="card p-4 space-y-3">
          <h2 className="font-semibold">📖 În curs</h2>
          {stats.reading.map(({ book, rs }) => {
            const pct = book.pages && rs.current_page ? Math.min(100, Math.round((rs.current_page / book.pages) * 100)) : null
            return (
              <Link key={book.id} to={`/carte/${book.id}`} className="block">
                <div className="flex justify-between gap-2 text-sm">
                  <span className="truncate font-medium">{book.title}</span>
                  <span className="shrink-0 text-stone-500">{pct !== null ? `${rs.current_page} / ${book.pages}` : 'fără pagină notată'}</span>
                </div>
                {pct !== null && (
                  <div className="mt-1 h-2 rounded-full bg-stone-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-2 rounded-full bg-amber-600" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </Link>
            )
          })}
        </section>
      )}

      <section className="card p-4 space-y-3">
        <h2 className="font-semibold">🏅 Insigne ({earned.length} din {badges.length})</h2>
        {earned.length === 0 && <p className="text-sm text-stone-500">Încă nicio insignă. Marchează o carte ca <b>✅ Citită</b> și o primești pe prima!</p>}
        {earned.length > 0 && <div className="grid grid-cols-3 gap-2">{earned.map(b => <BadgeTile key={b.id} b={b} />)}</div>}
        {locked.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm text-stone-500">Următoarele insigne ({locked.length})</summary>
            <div className="mt-2 grid grid-cols-3 gap-2">{locked.map(b => <BadgeTile key={b.id} b={b} />)}</div>
          </details>
        )}
      </section>

      <YearsChart stats={stats} />

      {stats.genres.length > 0 && (
        <section className="card p-4 space-y-2">
          <h2 className="font-semibold">❤️ Genuri preferate</h2>
          {stats.genres.map(g => (
            <div key={g.name} className="flex items-center gap-2 text-sm">
              <span className="w-28 shrink-0 truncate">{g.name}</span>
              <div className="h-3 flex-1">
                <div className="h-3 rounded-r bg-amber-600" style={{ width: `${(g.count / stats.genres[0].count) * 100}%` }} />
              </div>
              <span className="w-6 text-right text-stone-600">{g.count}</span>
            </div>
          ))}
          {stats.authors.length > 0 && stats.authors[0].count > 1 && (
            <p className="pt-1 text-sm text-stone-600">Autori citiți cel mai des: {stats.authors.filter(a => a.count > 1).map(a => `${a.name} (${a.count})`).join(', ')}</p>
          )}
        </section>
      )}

      {(stats.favorites.length > 0 || stats.longest || stats.avgRating) && (
        <section className="card p-4 space-y-2 text-sm">
          <h2 className="font-semibold">⭐ Preferatele</h2>
          {stats.avgRating && <div>Nota medie dată: <b>{stats.avgRating.toFixed(1).replace('.', ',')}</b> din 5</div>}
          {stats.longest && <div>Cea mai lungă carte citită: <Link className="text-amber-800" to={`/carte/${stats.longest.book.id}`}>{stats.longest.book.title}</Link> ({pagini(stats.longest.book.pages ?? 0)})</div>}
          {stats.favorites.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pt-1 pb-1">
              {stats.favorites.map(({ book }) => (
                <Link key={book.id} to={`/carte/${book.id}`} className="w-16 shrink-0">
                  <Cover book={book} className="h-24 w-16 rounded-lg" />
                  <div className="mt-1 text-xs leading-tight line-clamp-2">{book.title}</div>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {stats.read.length > 0 && (
        <section className="card p-4 space-y-1 text-sm">
          <h2 className="font-semibold pb-1">✅ Citite recent</h2>
          {stats.read.slice(0, 8).map(({ book, rs }) => (
            <Link key={book.id} to={`/carte/${book.id}`} className="flex justify-between gap-2">
              <span className="truncate">{book.title}</span>
              <span className="shrink-0 text-stone-500">{rs.rating ? '⭐'.repeat(rs.rating) + ' ' : ''}{rs.finished_at ? fmtDate(rs.finished_at) : ''}</span>
            </Link>
          ))}
        </section>
      )}

      {members.length > 1 && (
        <section className="card p-4 space-y-2">
          <h2 className="font-semibold">👨‍👩‍👧‍👦 În familie, în {year}</h2>
          <div className="grid grid-cols-2 gap-2">
            {family.map(({ m, n }) => (
              <button key={m.id} onClick={() => setParams(m.id === activeMember?.id ? {} : { m: m.id })}
                className={`flex items-center gap-2 rounded-xl border p-2 text-left text-sm ${m.id === member.id ? 'border-amber-600 bg-amber-50' : 'border-stone-200'}`}>
                <span className="text-2xl">{m.avatar}</span>
                <span className="min-w-0"><span className="block font-medium truncate">{m.name}</span><span className="text-stone-500">{carti(n)}</span></span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="card px-2 py-3">
      <div className="text-2xl font-bold text-amber-900">{value}</div>
      <div className="text-xs text-stone-500 leading-tight">{label}</div>
    </div>
  )
}

function BadgeTile({ b }: { b: Badge }) {
  const [cur, target] = b.progress
  return (
    <div className={`rounded-xl border p-2 text-center ${b.earned ? 'border-amber-300 bg-amber-50' : 'border-stone-200 bg-stone-50'}`} title={b.desc}>
      <div className={`text-3xl ${b.earned ? '' : 'grayscale opacity-40'}`}>{b.icon}</div>
      <div className="text-xs font-semibold leading-tight">{b.name}</div>
      <div className="text-[11px] text-stone-500 leading-tight">
        {b.earned ? (b.date ? fmtDate(b.date) : 'câștigată') : `${nf(cur)} / ${nf(target)}`}
      </div>
      {!b.earned && <div className="text-[11px] text-stone-400 leading-tight">{b.desc}</div>}
    </div>
  )
}

/** Cărți citite pe ani: o singură serie, o singură culoare; atingerea unei coloane arată detaliile. */
function YearsChart({ stats }: { stats: MemberStats }) {
  const years = stats.byYear.slice(-6)
  const [sel, setSel] = useState<number | null>(null)
  if (years.length === 0) {
    return stats.read.length > 0
      ? <p className="text-xs text-stone-500">Cărțile citite nu au dată de terminare, așa că nu le pot arăta pe ani. De acum, data se salvează când apeși „Citită”.</p>
      : null
  }
  const max = Math.max(1, ...years.map(y => y.count))
  const picked = years.find(y => y.year === sel) ?? years[years.length - 1]
  return (
    <section className="card p-4 space-y-2">
      <h2 className="font-semibold">📅 Cărți citite pe ani</h2>
      <div className="flex h-36 items-end gap-2 border-b border-stone-200" role="img"
        aria-label={years.map(y => `${y.year}: ${carti(y.count)}`).join(', ')}>
        {years.map(y => (
          <button key={y.year} onClick={() => setSel(y.year)} className="flex h-full flex-1 flex-col items-center justify-end"
            aria-label={`${y.year}: ${carti(y.count)}, ${pagini(y.pages)}`}>
            <span className="text-xs text-stone-600">{y.count || ''}</span>
            <span className={`w-full max-w-10 rounded-t ${y.year === picked.year ? 'bg-amber-700' : 'bg-amber-500'}`}
              style={{ height: `${(y.count / max) * 85}%`, minHeight: y.count ? 4 : 0 }} />
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        {years.map(y => <span key={y.year} className={`flex-1 text-center text-xs ${y.year === picked.year ? 'font-semibold text-stone-800' : 'text-stone-500'}`}>{y.year}</span>)}
      </div>
      <p className="text-sm text-stone-600">{picked.year}: <b>{carti(picked.count)}</b>, {pagini(picked.pages)}</p>
      {stats.undated > 0 && <p className="text-xs text-stone-500">{stats.undated === 1 ? 'O carte fără dată de terminare nu apare' : `${carti(stats.undated)} fără dată de terminare nu apar`} în grafic. Data se poate pune din pagina cărții („Terminată pe”).</p>}
    </section>
  )
}
