import { useEffect } from 'react'

// Quanto a parte visível da tela precisa encolher para valer como "teclado aberto". A barra de endereço do Safari
// também mexe na altura, mas só uns 100px; o menor teclado (com a barra de sugestões) passa de 200.
const MIN_KEYBOARD_PX = 120

// No iPhone (e no Chrome do Android) o teclado NÃO encolhe a tela do app: ele cobre a parte de baixo e o navegador rola a
// página para mostrar o campo. Uma folha ancorada no rodapé (position: fixed) continua do tamanho da tela inteira, então
// o topo dela sobe para baixo do relógio e o botão Salvar fica atrás do teclado.
//
// Este hook mede a parte REALMENTE visível (window.visualViewport) e, com o teclado aberto, escreve no elemento:
//   --vv-top  distância do topo da tela inteira até o topo da parte visível
//   --vv-h    altura da parte visível (acima do teclado)
//   data-kb   marca "teclado aberto" (o CSS usa para compactar a folha)
// Sem teclado, tira tudo e o elemento volta ao CSS normal. Escreve direto no elemento (sem estado do React): o
// visualViewport dispara "scroll" a cada quadro enquanto o teclado sobe, e renderizar o formulário a cada um pesaria.
export function useKeyboardViewport(ref, enabled = true) {
  useEffect(() => {
    const el = ref.current
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    if (!enabled || !el || !vv) return undefined

    // Altura "de repouso" da tela, sem teclado: a maior já vista (no Android o teclado às vezes encolhe o innerHeight).
    // Girar a tela (largura diferente) recomeça a medida.
    let base = { w: window.innerWidth, h: window.innerHeight }

    const update = () => {
      if (window.innerWidth !== base.w) base = { w: window.innerWidth, h: window.innerHeight }
      else base.h = Math.max(base.h, window.innerHeight)

      // Com zoom (scale > 1) a parte visível também encolhe, mas não é teclado.
      const open = vv.scale <= 1.01 && base.h - vv.height > MIN_KEYBOARD_PX
      if (open) {
        el.style.setProperty('--vv-top', `${Math.round(vv.offsetTop)}px`)
        el.style.setProperty('--vv-h', `${Math.round(vv.height)}px`)
        el.setAttribute('data-kb', '')
      } else {
        el.removeAttribute('data-kb')
        el.style.removeProperty('--vv-top')
        el.style.removeProperty('--vv-h')
      }
    }

    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      el.removeAttribute('data-kb')
      el.style.removeProperty('--vv-top')
      el.style.removeProperty('--vv-h')
    }
  }, [ref, enabled])
}
