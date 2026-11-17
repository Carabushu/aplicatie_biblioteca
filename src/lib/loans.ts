import type { Book, Loan } from './types'

/** Data de azi în fusul local, „YYYY-MM-DD” (toISOString ar da ziua UTC). */
export function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const toDay = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000
}

/** Data până la care ar trebui returnată. */
export function dueDate(l: Loan): string {
  const d = new Date((toDay(l.loaned_at) + l.remind_after_days) * 86_400_000)
  return d.toISOString().slice(0, 10)
}

/** Zile peste termen (>0 = întârziat); negativ = câte zile mai sunt. */
export function daysOverdue(l: Loan, today = todayLocal()): number {
  return toDay(today) - (toDay(l.loaned_at) + l.remind_after_days)
}

export const isOverdue = (l: Loan) => !l.returned_at && daysOverdue(l) > 0

/** „17 nov. 2026” */
export function fmtDate(s: string | null): string {
  if (!s) return ''
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function zile(n: number): string {
  return n === 1 ? 'o zi' : n < 20 ? `${n} zile` : `${n} de zile`
}

/** Textul de termen: „întârziată cu 5 zile” / „mai are 3 zile” / „termen azi”. */
export function dueText(l: Loan): string {
  const n = daysOverdue(l)
  if (n > 0) return `peste termen cu ${zile(n)}`
  if (n === 0) return 'termenul e azi'
  return `termen: ${fmtDate(dueDate(l))} (mai ${-n === 1 ? 'este' : 'sunt'} ${zile(-n)})`
}

export interface LoanWithBook { loan: Loan; book: Book }

/** Toate împrumuturile, cu cartea lor; copiii nu văd cărțile „doar adulți”. */
export function allLoans(books: Book[], isChild: boolean): LoanWithBook[] {
  const out: LoanWithBook[] = []
  for (const book of books) {
    if (isChild && book.adults_only) continue
    for (const loan of book.loans ?? []) out.push({ loan, book })
  }
  return out
}

/** Active: întârziatele primele (cele mai vechi sus), apoi după termen. */
export function sortActive(list: LoanWithBook[]): LoanWithBook[] {
  return [...list].sort((a, b) => daysOverdue(b.loan) - daysOverdue(a.loan))
}
