import { Navigate } from 'react-router-dom'
import Planos from './Planos.jsx'
import PlanoAtual from './PlanoAtual.jsx'
import PlanosPlay from './PlanosPlay.jsx'
import { isAndroidApp } from '../utils/androidApp.js'
import { useUser } from '../hooks/useUser.js'
import { usePlayBilling } from '../hooks/usePlayBilling.js'

// /planos: no site é a tela de planos e compra (Mercado Pago). No app Android da Play Store: com a cobrança do Google pronta, a tela de
// planos do app (PlanosPlay, compra pela Play); sem ela, só o plano atual, sem preço nem compra (política de pagamentos do Google).
export default function PlanosRoute() {
  const user = useUser()
  const { status } = usePlayBilling()
  if (!isAndroidApp()) return <Planos />
  if (!user?.id) return <Navigate to="/" replace />
  return status === 'ready' ? <PlanosPlay /> : <PlanoAtual />
}
