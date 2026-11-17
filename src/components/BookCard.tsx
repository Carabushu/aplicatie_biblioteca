import { Link } from 'react-router-dom'
import type { Book, Member, Room } from '../lib/types'
import { isOverdue } from '../lib/loans'

interface Props { book: Book; rooms: Room[]; members: Member[]; selected?: boolean; onToggleSelect?: () => void }

export function Cover({ book, className = '' }: { book: Pick<Book, 'title' | 'cover_url'>; className?: string }) {
  return book.cover_url ? (
    <img src={book.cover_url} alt="" loading="lazy" className={`object-cover bg-stone-100 ${className}`} />
  ) : (
    <div className={`flex items-center justify-center bg-amber-100 text-amber-800 text-xs text-center p-1 ${className}`}>
      <span className="line-clamp-4 font-medium">{book.title}</span>
    </div>
  )
}

export default function BookCard({ book, rooms, members, selected, onToggleSelect }: Props) {
  const room = rooms.find(r => r.id === book.room_id)
  const readers = (book.reading_status ?? []).filter(s => s.status === 'read')
    .map(s => members.find(m => m.id === s.member_id)).filter(Boolean) as Member[]
  const reading = (book.reading_status ?? []).filter(s => s.status === 'reading')
    .map(s => members.find(m => m.id === s.member_id)).filter(Boolean) as Member[]
  const openLoans = (book.loans ?? []).filter(l => !l.returned_at)
  const onLoan = openLoans.find(l => l.direction === 'out')
  const borrowed = openLoans.find(l => l.direction === 'in')
  const late = openLoans.some(isOverdue)

  const inner = (
    <div className={`card flex gap-3 p-2 ${selected ? 'ring-2 ring-amber-600' : ''}`}>
      <Cover book={book} className="h-24 w-16 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1 py-1">
        <div className="font-semibold leading-tight line-clamp-2">{book.title}</div>
        {book.author && <div className="text-sm text-stone-600 truncate">{book.author}</div>}
        <div className="mt-1 flex flex-wrap gap-1 text-xs">
          {book.audience.map(a => (
            <span key={a} className={`rounded-full px-2 py-0.5 ${a === 'copii' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
              {a === 'copii' ? 'Copii' : 'Adulți'}
            </span>
          ))}
          {room && <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-700">📍 {room.name}</span>}
          {onLoan && <span className={`rounded-full px-2 py-0.5 ${late ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'}`}>{late ? '⏰ ' : ''}La {onLoan.person}</span>}
          {borrowed && <span className={`rounded-full px-2 py-0.5 ${late ? 'bg-red-100 text-red-800' : 'bg-purple-100 text-purple-800'}`}>{late ? '⏰ ' : ''}De la {borrowed.person}</span>}
          {book.needs_review && <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-yellow-800">De verificat</span>}
        </div>
        {(readers.length > 0 || reading.length > 0) && (
          <div className="mt-1 text-xs text-stone-500">
            {readers.length > 0 && <span>✅ {readers.map(m => m.name).join(', ')}</span>}
            {reading.length > 0 && <span className="ml-2">📖 {reading.map(m => m.name).join(', ')}</span>}
          </div>
        )}
      </div>
      {onToggleSelect && (
        <input type="checkbox" checked={!!selected} onChange={onToggleSelect} onClick={e => e.stopPropagation()}
          className="h-6 w-6 self-center accent-amber-700" aria-label="Selectează" />
      )}
    </div>
  )

  if (onToggleSelect) return <div onClick={onToggleSelect}>{inner}</div>
  return <Link to={`/carte/${book.id}`}>{inner}</Link>
}
