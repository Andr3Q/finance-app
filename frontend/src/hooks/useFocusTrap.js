import { useEffect } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Mantém o foco do teclado DENTRO de um diálogo em tela cheia (Tab e Shift+Tab dão a volta) e devolve o foco a quem o
// abriu quando fecha. Sem isso, o Tab saía do chat para a barra de baixo e os avisos que ficam escondidos atrás dele.
export function useFocusTrap(containerRef, active) {
  useEffect(() => {
    if (!active) return
    const opener = document.activeElement
    const onKeyDown = (e) => {
      if (e.key !== 'Tab') return
      const container = containerRef.current
      if (!container) return
      const items = [...container.querySelectorAll(FOCUSABLE)]
      if (items.length === 0) return
      const first = items[0]
      const last  = items[items.length - 1]
      if (!container.contains(document.activeElement)) { e.preventDefault(); first.focus(); return }
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus()
    }
  }, [active, containerRef])
}
