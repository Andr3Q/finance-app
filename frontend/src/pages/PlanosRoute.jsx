import { Navigate } from 'react-router-dom'
import Planos from './Planos.jsx'
import PlanoAtual from './PlanoAtual.jsx'
import { isAndroidApp } from '../utils/androidApp.js'
import { useUser } from '../hooks/useUser.js'

// /planos: no site é a tela de planos e compra; dentro do app Android da Play Store só o plano atual (sem preço nem compra).
export default function PlanosRoute() {
  const user = useUser()
  if (!isAndroidApp()) return <Planos />
  return user?.id ? <PlanoAtual /> : <Navigate to="/" replace />
}
