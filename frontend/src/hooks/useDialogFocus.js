import { useEffect } from 'react'

const DIALOG    = '[role="dialog"][aria-modal="true"]'
const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Gerenciador ÚNICO do foco dos diálogos modais do app (todo role="dialog" com aria-modal="true"), montado uma vez no App.
// Os ~12 diálogos (excluir, fechar mês, descartar, pular...) são JSX solto nas telas, sem componente próprio onde pendurar um
// hook por diálogo — por isso ele observa o documento. O achado N2-10: no diálogo de excluir conta, Tab e Shift+Tab saíam para
// os botões ATRÁS do véu e, ao fechar, o foco caía no <body>. Agora, enquanto um diálogo está aberto:
//   • o foco entra nele (se nada dentro já o pegou, ex. um campo com autoFocus) — no próprio diálogo, não num campo de texto,
//     para não abrir o teclado do celular;
//   • Tab/Shift+Tab dão a volta dentro do diálogo que está por cima;
//   • ao fechar, o foco volta a quem abriu — só se ele se perdeu (não rouba o foco de quem já foi para outro lugar).
export function useDialogFocus() {
  useEffect(() => {
    const openers = new Map()   // diálogo aberto -> elemento que tinha o foco antes dele (ou null)
    // Os dois últimos elementos que receberam foco. O diálogo que acabou de abrir pode já ter puxado o foco para um campo dele
    // (autoFocus, no mesmo commit) — aí quem o abriu é o "anterior".
    let current = null
    let previous = null

    const onFocusIn = (e) => { previous = current; current = e.target }
    // Foco que vai para o nada (toque numa área que não foca): esquece, para não devolver o foco a um campo antigo e abrir o teclado.
    const onFocusOut = (e) => { if (!e.relatedTarget) { previous = current; current = null } }

    const opened = (dialog) => {
      openers.set(dialog, dialog.contains(current) ? previous : current)
      if (dialog.contains(document.activeElement)) return
      if (!dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1')
      dialog.focus({ preventScroll: true })
    }

    const closed = (dialog) => {
      const opener = openers.get(dialog)
      openers.delete(dialog)
      const active = document.activeElement
      const lost = !active || active === document.body
      if (lost && opener && opener.isConnected && typeof opener.focus === 'function') opener.focus({ preventScroll: true })
    }

    // Compara os diálogos que existem agora com os que já eram conhecidos (cobre abrir, fechar e trocar um pelo outro).
    const reconcile = () => {
      if (openers.size === 0 && !document.querySelector(DIALOG)) return // caminho comum: nenhum diálogo, custo de uma consulta
      const now = new Set(document.querySelectorAll(DIALOG))
      for (const d of [...openers.keys()]) if (!now.has(d)) closed(d)
      for (const d of now) if (!openers.has(d)) opened(d)
    }

    const onKeyDown = (e) => {
      if (e.key !== 'Tab') return
      const all = document.querySelectorAll(DIALOG)
      const dialog = all[all.length - 1] // o de cima
      if (!dialog) return
      const items = [...dialog.querySelectorAll(FOCUSABLE)]
      if (items.length === 0) { e.preventDefault(); dialog.focus({ preventScroll: true }); return }
      const first = items[0]
      const last  = items[items.length - 1]
      const active = document.activeElement
      if (!dialog.contains(active) || active === dialog) {
        // foco fora (ou no próprio diálogo, que é só a porta de entrada): Tab vai ao primeiro, Shift+Tab ao último
        e.preventDefault(); (e.shiftKey ? last : first).focus(); return
      }
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
    }

    const observer = new MutationObserver(reconcile)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['role', 'aria-modal'] })
    document.addEventListener('focusin', onFocusIn, true)
    document.addEventListener('focusout', onFocusOut, true)
    document.addEventListener('keydown', onKeyDown)
    reconcile() // um diálogo que já estava na tela quando o gerenciador montou
    return () => {
      observer.disconnect()
      document.removeEventListener('focusin', onFocusIn, true)
      document.removeEventListener('focusout', onFocusOut, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])
}
