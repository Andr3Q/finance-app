import { useEffect, useState } from 'react'

// Quantas notificações novas existem. Quem calcula o feed (Início e a tela Notificações) publica o número; a bolinha do sino da
// barra de cima (desktop) e o subtítulo da tela Notificações só o leem — assim o feed não é recalculado a cada tela.
// null = ainda não foi calculado nesta sessão (a bolinha não aparece).
const EVENT = 'nancy:notif-unread'
let count = null

export function publishUnreadCount(n) {
  const next = Number.isFinite(n) ? n : null
  if (next === count) return
  count = next
  window.dispatchEvent(new Event(EVENT))
}

export function useUnreadCount() {
  const [value, setValue] = useState(() => count)
  useEffect(() => {
    const sync = () => setValue(count)
    window.addEventListener(EVENT, sync)
    sync()
    return () => window.removeEventListener(EVENT, sync)
  }, [])
  return value
}
