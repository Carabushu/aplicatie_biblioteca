import { NavLink, Outlet } from 'react-router-dom'
import { useApp } from '../state/AppContext'

const tabs = [
  { to: '/', label: 'Cărți', icon: '📚' },
  { to: '/avem', label: 'Avem?', icon: '🔍' },
  { to: '/adauga', label: 'Adaugă', icon: '➕' },
  { to: '/setari', label: 'Setări', icon: '⚙️' },
]

export default function Layout() {
  const { activeMember, online } = useApp()
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      {!online && (
        <div className="bg-stone-800 text-white text-center text-xs py-1">Offline — vezi catalogul salvat, adăugările nu merg acum</div>
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
