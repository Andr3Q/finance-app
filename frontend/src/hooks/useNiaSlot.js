import { useSyncExternalStore } from 'react'

// A tela Nancy IA do desktop (pages/NancyIA.jsx) só reserva o espaço na página; quem desenha o chat nele é o AgentChat, que está montado
// uma vez só por baixo de todas as telas e é o dono da conversa (histórico, voz, confirmações). Assim a conversa continua ao navegar.
let slot = null
const listeners = new Set()

export function setNiaSlot(el) {
  if (slot === el) return
  slot = el
  listeners.forEach(l => l())
}

const subscribe = (cb) => { listeners.add(cb); return () => listeners.delete(cb) }
export const useNiaSlot = () => useSyncExternalStore(subscribe, () => slot, () => null)
