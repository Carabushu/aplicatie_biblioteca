import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../state/AppContext'
import type { Book, Loan } from '../lib/types'
import { dueText, fmtDate, isOverdue, todayLocal } from '../lib/loans'

const REMIND_PRESETS = [14, 30, 60]

/** Secțiunea „Împrumut” din pagina unei cărți. */
export default function LoanPanel({ book }: { book: Book }) {
  const { books, activeMember, online, addLoan, returnLoan, deleteBook } = useApp()
  const nav = useNavigate()
  const canEdit = !activeMember?.is_child
  const loans = book.loans ?? []
  const open = loans.filter(l => !l.returned_at)
  const history = loans.filter(l => l.returned_at).sort((a, b) => (b.returned_at ?? '').localeCompare(a.returned_at ?? ''))
  const openOut = open.filter(l => l.direction === 'out').length
  const borrowedIn = open.some(l => l.direction === 'in')
  const canLend = canEdit && !borrowedIn && openOut < Math.max(1, book.copies)
  const canBorrow = canEdit && open.length === 0

  const [form, setForm] = useState<null | 'out' | 'in'>(null)
  const [person, setPerson] = useState('')
  const [date, setDate] = useState(todayLocal)
  const [days, setDays] = useState(30)
  const [busy, setBusy] = useState(false)

  // nume folosite înainte, ca sugestii
  const people = useMemo(() => {
    const s = new Set<string>()
    books.forEach(b => (b.loans ?? []).forEach(l => s.add(l.person)))
    return [...s].sort((a, b) => a.localeCompare(b, 'ro'))
  }, [books])

  const startForm = (dir: 'out' | 'in') => { setForm(dir); setPerson(''); setDate(todayLocal()); setDays(30) }

  const save = async () => {
    if (!form || !person.trim()) return
    setBusy(true)
    try {
      await addLoan({ book_id: book.id, direction: form, person, loaned_at: date, remind_after_days: days })
      setForm(null)
    } catch (e) { alert('Nu am putut salva: ' + (e as Error).message) }
    setBusy(false)
  }

  const giveBack = async (l: Loan) => {
    const msg = l.direction === 'out'
      ? `Confirmi că ${l.person} a adus înapoi „${book.title}”?`
      : `Confirmi că i-ai dat înapoi lui ${l.person} „${book.title}”?`
    if (!confirm(msg)) return
    setBusy(true)
    try {
      await returnLoan(l, todayLocal())
      if (l.direction === 'in' && confirm('Cartea nu mai e la noi. O ștergi și din bibliotecă?\n(Apasă „Anulează” dacă vrei s-o păstrezi în listă.)')) {
        await deleteBook(book.id); nav('/')
        return
      }
    } catch (e) { alert('Nu am putut salva: ' + (e as Error).message) }
    setBusy(false)
  }

  if (open.length === 0 && history.length === 0 && !canEdit) return null

  return (
    <div className="card p-4 space-y-3 text-sm">
      <div className="font-semibold">🤝 Împrumut</div>

      {open.map(l => (
        <div key={l.id} className={`rounded-xl border p-3 ${isOverdue(l) ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200'}`}>
          <div>
            {l.direction === 'out' ? 'Împrumutată lui' : 'Am împrumutat-o de la'} <b>{l.person}</b> pe {fmtDate(l.loaned_at)}
          </div>
          <div className={isOverdue(l) ? 'text-red-700 font-semibold' : 'text-stone-600'}>
            {isOverdue(l) ? '⏰ ' : ''}{dueText(l)}
          </div>
          {canEdit && (
            <button className="btn-secondary mt-2 w-full !py-2" disabled={busy || !online} onClick={() => void giveBack(l)}>
              {l.direction === 'out' ? '✅ A fost returnată' : '↩️ Am dat-o înapoi'}
            </button>
          )}
        </div>
      ))}

      {open.length === 0 && !form && <div className="text-stone-500">E acasă, nu e împrumutată.</div>}

      {canEdit && !form && (canLend || canBorrow) && (
        <div className="flex flex-wrap gap-2">
          {canLend && <button className="btn-primary flex-1 !py-2" disabled={!online} onClick={() => startForm('out')}>🤝 Împrumută</button>}
          {canBorrow && <button className="btn-secondary flex-1 !py-2" disabled={!online} onClick={() => startForm('in')}>📥 Am împrumutat-o de la…</button>}
        </div>
      )}
      {canEdit && !online && !form && <div className="text-xs text-stone-500">Fără internet nu se pot salva împrumuturi.</div>}

      {form && (
        <div className="space-y-3 rounded-xl bg-stone-50 p-3">
          <div>
            <label className="label">{form === 'out' ? 'Cui o împrumuți?' : 'De la cine ai împrumutat-o?'}</label>
            <input className="input" list="loan-people" autoFocus value={person} onChange={e => setPerson(e.target.value)} placeholder="ex. Ioana (colega Ameliei)" />
            <datalist id="loan-people">{people.map(p => <option key={p} value={p} />)}</datalist>
          </div>
          <div>
            <label className="label">Data</label>
            <input className="input" type="date" value={date} max={todayLocal()} onChange={e => setDate(e.target.value || todayLocal())} />
          </div>
          <div>
            <label className="label">Amintește-mi după</label>
            <div className="flex items-center gap-2">
              {REMIND_PRESETS.map(n => (
                <button key={n} type="button" className={days === n ? 'chip-on' : 'chip-off'} onClick={() => setDays(n)}>{n} zile</button>
              ))}
              <input className="input !w-20 !py-1.5" inputMode="numeric" value={days}
                onChange={e => setDays(Math.max(1, Math.min(365, Number(e.target.value.replace(/\D/g, '')) || 1)))} aria-label="Număr de zile" />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary flex-1 !py-2" onClick={() => setForm(null)}>Renunță</button>
            <button className="btn-primary flex-1 !py-2" disabled={busy || !person.trim()} onClick={() => void save()}>Salvează</button>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <details className="text-stone-600">
          <summary className="cursor-pointer text-stone-500">Istoric ({history.length})</summary>
          <ul className="mt-2 space-y-1">
            {history.map(l => (
              <li key={l.id}>
                {l.direction === 'out' ? '→' : '←'} {l.person}: {fmtDate(l.loaned_at)} – {fmtDate(l.returned_at)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
