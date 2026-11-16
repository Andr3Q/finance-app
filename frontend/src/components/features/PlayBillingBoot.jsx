import { useEffect } from 'react'
import { useUser, saveUser } from '../../hooks/useUser.js'
import { usePlayBilling } from '../../hooks/usePlayBilling.js'
import { initPlayBilling, restorePurchases } from '../../services/playBilling.js'
import { isAndroidApp } from '../../utils/androidApp.js'
import { authAPI } from '../../services/api.js'

// Liga a cobrança do Google no app Android (só nele; no site não faz nada). Sem tela própria:
//  1) depois do login, descobre se dá para vender (aparelho + servidor + produtos) e busca os preços;
//  2) uma vez por sessão, para quem NÃO tem plano pago ativo, reenvia ao servidor as assinaturas que o Google diz que a conta Google tem
//     (compra paga mas não confirmada por falha de rede, reinstalação, aparelho novo). O servidor decide e recusa compra de outra conta.
export default function PlayBillingBoot() {
  const user = useUser()
  const { status } = usePlayBilling()

  useEffect(() => {
    if (user?.id && isAndroidApp()) initPlayBilling()
  }, [user?.id])

  useEffect(() => {
    if (status !== 'ready' || !user?.id || !isAndroidApp()) return
    const noPaidPlan = user.plan === 'free' || !!user.isOnTrial
    if (!noPaidPlan) return
    const key = `nancy-play-restore-${user.id}`
    try {
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, '1')
    } catch { return }
    restorePurchases().then(async (results) => {
      if (!results.some((r) => r?.applied)) return
      const me = await authAPI.me()
      const cur = JSON.parse(sessionStorage.getItem('user') || '{}')
      if (me?.data) saveUser({ ...cur, ...me.data })
    }).catch(() => {})
  }, [status, user?.id, user?.plan, user?.isOnTrial])

  return null
}
