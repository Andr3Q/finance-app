import { useEffect, useRef } from 'react'

// Esc fecha o que estiver aberto por cima (folha, confirmação). O handler mais recente fica num ref pra o
// listener não ser reinstalado a cada render nem usar um estado velho; `active=false` desliga a escuta.
export function useEscapeKey(handler, active = true) {
  const ref = useRef(handler)
  ref.current = handler

  useEffect(() => {
    if (!active) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape' && !e.defaultPrevented) ref.current(e)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [active])
}
