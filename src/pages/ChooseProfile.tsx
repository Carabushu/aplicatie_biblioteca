import { useNavigate } from 'react-router-dom'
import { useApp } from '../state/AppContext'

export default function ChooseProfile() {
  const { members, setActiveMember, signOut, activeMember } = useApp()
  const nav = useNavigate()
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center p-6">
      <h1 className="mb-6 text-2xl font-bold text-amber-900">Cine ești?</h1>
      <div className="grid w-full max-w-sm grid-cols-2 gap-4">
        {members.map(m => (
          <button key={m.id} onClick={() => { setActiveMember(m); nav('/') }}
            className={`card flex flex-col items-center gap-2 p-5 active:scale-95 transition ${activeMember?.id === m.id ? 'ring-2 ring-amber-600' : ''}`}>
            <span className="flex h-20 w-20 items-center justify-center rounded-full text-5xl" style={{ background: m.color + '22' }}>{m.avatar}</span>
            <span className="text-lg font-semibold">{m.name}</span>
          </button>
        ))}
      </div>
      {members.length === 0 && <p className="text-stone-500">Nu există profiluri — rulează SQL-ul din README.</p>}
      <button onClick={() => void signOut()} className="mt-10 text-sm text-stone-500 underline">Ieși din contul familiei</button>
    </div>
  )
}
