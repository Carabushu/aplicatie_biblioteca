import { useState, type FormEvent } from 'react'
import { supabase, supabaseConfigured } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setError('Email sau parolă greșită.')
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
        <div className="text-center">
          <div className="text-5xl">📚</div>
          <h1 className="mt-2 text-2xl font-bold text-amber-900">Biblioteca de acasă</h1>
          <p className="text-sm text-stone-500">Intră cu contul familiei</p>
        </div>
        {!supabaseConfigured && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            Lipsesc VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Vezi README.
          </div>
        )}
        <div><label className="label">Email</label>
          <input className="input" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></div>
        <div><label className="label">Parolă</label>
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
        {error && <div className="text-sm text-red-600">{error}</div>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Se conectează…' : 'Intră'}</button>
      </form>
    </div>
  )
}
