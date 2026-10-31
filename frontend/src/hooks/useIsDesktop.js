import { useSyncExternalStore } from 'react'

// Telas com layout próprio no desktop (design "Nancy Desktop") trocam de árvore a partir de 901px — o mesmo corte do CSS
// (a barra de baixo do celular vale até 900px). Acompanha o redimensionamento da janela. Sem matchMedia (testes, ambientes
// antigos) vale o celular.
const QUERY = '(min-width: 901px)'
const media = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null)

const subscribe = (onChange) => {
  const m = media()
  if (!m) return () => {}
  m.addEventListener('change', onChange)
  return () => m.removeEventListener('change', onChange)
}
const getSnapshot = () => !!media()?.matches

export function useIsDesktop() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
