import { useEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

// Ao ir para outra tela (toque em link ou botão) ela abre no topo. Sem isso a tela nova herdava a rolagem da anterior:
// Termos e Privacidade abriam no meio do texto, sem o cabeçalho (achado N2-10). Voltar (POP) não mexe: o navegador
// devolve a posição de antes.
export default function ScrollToTop() {
  const { pathname } = useLocation()
  const navigationType = useNavigationType()
  // só quando a TELA muda (pathname): trocar apenas um parâmetro da mesma tela (?mes=…) não joga a pessoa para o topo
  useEffect(() => {
    // 'instant': o CSS global tem scroll-behavior: smooth, e a tela nova não deve aparecer deslizando de onde a anterior parou
    if (navigationType !== 'POP') window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}
