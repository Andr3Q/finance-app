import { useState, useEffect, useCallback } from 'react'

// Atalhos com setas (Metas e Extrato): em que ponta o carrossel está. Na ponta em que não há mais pra onde rolar a seta
// apaga (disabled) em vez de fingir que clica. Quando os atalhos cabem todos (sem rolagem), nenhuma seta apaga.
// Atualiza ao rolar, ao redimensionar e quando a largura dos atalhos muda (fonte carregando).
export function useChipEdges(ref) {
  const [edges, setEdges] = useState({ prevDisabled: false, nextDisabled: false })

  const update = useCallback(() => {
    const el = ref.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    const overflow = max > 1
    const prevDisabled = overflow && el.scrollLeft <= 1
    const nextDisabled = overflow && el.scrollLeft >= max - 1
    setEdges(prev => (prev.prevDisabled === prevDisabled && prev.nextDisabled === nextDisabled ? prev : { prevDisabled, nextDisabled }))
  }, [ref])

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    update()
    el.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    let observer
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(update)
      observer.observe(el)
      Array.from(el.children).forEach(child => observer.observe(child))
    }
    return () => {
      el.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      if (observer) observer.disconnect()
    }
  }, [ref, update])

  return edges
}
