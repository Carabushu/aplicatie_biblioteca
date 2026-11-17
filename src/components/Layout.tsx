import { useMemo, useState, useSyncExternalStore } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useApp } from '../state/AppContext'
import { allLoans, isOverdue } from '../lib/loans'
import { applyUpdate, subscribeUpdate, updatePending } from '../lib/pwa'

const tabs = [
  { to: '/', label: 'Cărți', icon: '📚' },
  { to: '/avem', label: 'Avem?', icon: '🔍' },
  { to: '/adauga', label: 'Adaugă', icon: '➕' },
  { to: '/dorinte', label: 'Dorințe', icon: '⭐' },
  { to: '/setari', label: 'Setări', icon: '⚙️' },
]

export default function Layout() {
  const { activeMember, online, books } = useApp()
  const { pathname } = useLocation()
  const updateReady = useSyncExternalStore(subscribeUpdate, updatePending)
  // bannerul de întârzieri apare o dată la deschiderea aplicației; „×” îl ascunde până la următoarea deschidere
  const [overdueDismissed, setOverdueDismissed] = useState(false)
  const overdue = useMemo(
    () => allLoans(books, !!activeMember?.is_child).filter(x => isOverdue(x.loan)).length,
    [books, activeMember],
  )
  const showOverdue = overdue > 0 && !overdueDismissed && pathname !== '/imprumuturi'
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      {!online && (
        <div className="bg-stone-800 text-white text-center text-xs py-1">Offline — vezi catalogul salvat, adăugările nu merg acum</div>
      )}
      {updateReady && (
        <div className="flex items-center justify-between gap-2 bg-amber-700 text-white text-sm px-3 py-2">
          <span>✨ Versiune nouă a aplicației</span>
          <button className="rounded-lg bg-white/20 px-3 py-1 font-semibold" onClick={applyUpdate}>Actualizează</button>
        </div>
      )}
      {showOverdue && (
        <div className="flex items-center gap-2 bg-red-50 border-b border-red-200 text-red-800 text-sm px-3 py-2">
          <Link to="/imprumuturi" className="flex-1" onClick={() => setOverdueDismissed(true)}>
            ⏰ {overdue === 1 ? 'Un împrumut a depășit termenul' : `${overdue} împrumuturi au depășit termenul`} — <u>vezi</u>
          </Link>
          <button className="px-2 text-lg leading-none" aria-label="Ascunde" onClick={() => setOverdueDismissed(true)}>×</button>
        </div>
      )}
      <main className="flex-1 px-3 pb-24 pt-3">
        <Outlet />
      </main>
      <nav className="fixed bottom-0 left-0 right-0 border-t border-stone-200 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-2xl">
          {tabs.map(t => (
            <NavLink key={t.to} to={t.to} end={t.to === '/'}
              className={({ isActive }) => `flex flex-1 flex-col items-center py-2 text-xs ${isActive ? 'text-amber-800 font-semibold' : 'text-stone-500'}`}>
              <span className="text-xl">{t.icon}</span>{t.label}
            </NavLink>
          ))}
          <NavLink to="/profil" className="flex flex-1 flex-col items-center py-2 text-xs text-stone-500">
            <span className="text-xl">{activeMember?.avatar ?? '👤'}</span>{activeMember?.name ?? 'Profil'}
          </NavLink>
        </div>
      </nav>
    </div>
  )
}
