import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../state/AppContext'
import { Cover } from '../components/BookCard'
import { allLoans, dueText, fmtDate, isOverdue, sortActive, todayLocal, type LoanWithBook } from '../lib/loans'
import type { Loan } from '../lib/types'

export default function Loans() {
  const { books, activeMember, online, returnLoan } = useApp()
  const canEdit = !activeMember?.is_child
  const [busy, setBusy] = useState<string | null>(null)
  const [showAllHistory, setShowAllHistory] = useState(false)

  const all = useMemo(() => allLoans(books, !!activeMember?.is_child), [books, activeMember])
  const active = all.filter(x => !x.loan.returned_at)
  const out = sortActive(active.filter(x => x.loan.direction === 'out'))
  const inn = sortActive(active.filter(x => x.loan.direction === 'in'))
  const history = all.filter(x => x.loan.returned_at)
    .sort((a, b) => (b.loan.returned_at ?? '').localeCompare(a.loan.returned_at ?? ''))
  const overdue = active.filter(x => isOverdue(x.loan)).length

  const giveBack = async (l: Loan, title: string) => {
    const msg = l.direction === 'out'
      ? `Confirmi că ${l.person} a adus înapoi „${title}”?`
      : `Confirmi că i-ai dat înapoi lui ${l.person} „${title}”?`
    if (!confirm(msg)) return
    setBusy(l.id)
    try { await returnLoan(l, todayLocal()) } catch (e) { alert('Nu am putut salva: ' + (e as Error).message) }
    setBusy(null)
  }

  const row = ({ loan, book }: LoanWithBook) => {
    const late = isOverdue(loan)
    return (
      <div key={loan.id} className={`card flex gap-3 p-2 ${late ? 'border-red-300 bg-red-50' : ''}`}>
        <Link to={`/carte/${book.id}`} className="shrink-0"><Cover book={book} className="h-20 w-14 rounded-lg" /></Link>
        <div className="min-w-0 flex-1 py-0.5 text-sm">
          <Link to={`/carte/${book.id}`} className="font-semibold leading-tight line-clamp-2">{book.title}</Link>
          <div className="text-stone-700">{loan.direction === 'out' ? 'la' : 'de la'} <b>{loan.person}</b> · din {fmtDate(loan.loaned_at)}</div>
          <div className={late ? 'text-red-700 font-semibold' : 'text-stone-500'}>{late ? '⏰ ' : ''}{dueText(loan)}</div>
        </div>
        {canEdit && (
          <button className="btn-secondary self-center !px-3 !py-2 text-sm" disabled={!online || busy === loan.id}
            onClick={() => void giveBack(loan, book.title)} title={loan.direction === 'out' ? 'A fost returnată' : 'Am dat-o înapoi'}>
            {loan.direction === 'out' ? '✅ Returnată' : '↩️ Dată înapoi'}
          </button>
        )}
      </div>
    )
  }

  const shownHistory = showAllHistory ? history : history.slice(0, 10)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-amber-900">🤝 Împrumuturi</h1>
        {overdue > 0 && <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-800">{overdue} peste termen</span>}
      </div>

      {active.length === 0 && (
        <div className="card p-5 text-center text-stone-600">
          Nicio carte împrumutată acum.<br />
          <span className="text-sm text-stone-500">Ca să împrumuți o carte, deschide-o din listă și apasă <b>🤝 Împrumută</b>.</span>
        </div>
      )}

      {out.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold text-stone-700">Cărți date altora ({out.length})</h2>
          {out.map(row)}
        </section>
      )}

      {inn.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold text-stone-700">Cărți luate de la alții ({inn.length})</h2>
          {inn.map(row)}
        </section>
      )}

      {history.length > 0 && (
        <section className="space-y-1">
          <h2 className="font-semibold text-stone-700">Istoric</h2>
          <div className="card divide-y divide-stone-100 text-sm">
            {shownHistory.map(({ loan, book }) => (
              <Link key={loan.id} to={`/carte/${book.id}`} className="block px-3 py-2">
                <div className="font-medium truncate">{book.title}</div>
                <div className="text-stone-500">
                  {loan.direction === 'out' ? '→' : '←'} {loan.person} · {fmtDate(loan.loaned_at)} – {fmtDate(loan.returned_at)}
                </div>
              </Link>
            ))}
          </div>
          {history.length > 10 && (
            <button className="text-sm text-amber-800" onClick={() => setShowAllHistory(s => !s)}>
              {showAllHistory ? 'Arată mai puține' : `Arată tot istoricul (${history.length})`}
            </button>
          )}
        </section>
      )}
    </div>
  )
}
