import { registerSW } from 'virtual:pwa-register'

/*
 * Actualizare automată a PWA.
 * - Verifică dacă există o versiune nouă la fiecare revenire în aplicație și o dată pe oră.
 *   (Pe Android, o aplicație redeschisă din „recente” nu face navigare, deci altfel nu ar verifica.)
 * - Când versiunea nouă e activă: pe lista de cărți reîncarcă imediat; pe alte ecrane (unde poate fi
 *   un formular început) arată un banner și reîncarcă singură la următoarea revenire în aplicație.
 */

let pending = false
const listeners = new Set<() => void>()
const notify = () => listeners.forEach(fn => fn())

export const updatePending = () => pending
export function subscribeUpdate(fn: () => void) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
export const applyUpdate = () => window.location.reload()

export function setupPwa() {
  registerSW({
    immediate: true,
    onNeedReload() {
      if (window.location.pathname === '/' || document.visibilityState === 'hidden') applyUpdate()
      else { pending = true; notify() }
    },
    onRegisteredSW(_url, reg) {
      if (!reg) return
      const check = () => { if (navigator.onLine) reg.update().catch(() => { /* fără rețea — încercăm data viitoare */ }) }
      setInterval(check, 60 * 60 * 1000)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return
        if (pending) applyUpdate(); else check()
      })
    },
  })
}
