import { useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import Navbar from '../components/layout/Navbar.jsx'
import { useIsDesktop } from '../hooks/useIsDesktop.js'
import { useForcedLightTheme } from '../hooks/useTheme.js'
import { setNiaSlot } from '../hooks/useNiaSlot.js'

// Nancy IA no desktop (design "Nancy Desktop", tela 13): a página reserva o espaço e o AgentChat (dono da conversa) desenha a lista de
// conversas e o chat nele. No celular o chat continua sendo o painel de tela cheia aberto pelo botão "+", então a rota volta ao Início.
export default function NancyIA() {
  useForcedLightTheme()
  const isDesktop = useIsDesktop()
  const ref = useCallback((el) => setNiaSlot(el), [])
  if (!isDesktop) return <Navigate to="/dashboard" replace />
  return (
    <>
      <Navbar />
      <div className="pwnav ndh-pwnav fade-in">
        <div className="nia-slot" ref={ref} />
      </div>
    </>
  )
}
