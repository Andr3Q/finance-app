import { useState } from 'react'
import { notificationsAPI } from '../../../services/api.js'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

const supportsPush = () => 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window

// Avisos push neste aparelho: pede a permissão do navegador e registra (ou remove) a assinatura no servidor.
// É o que faz os avisos de conta que vence, limite e gasto chegarem com o app fechado — por isso fica na tela
// de Preferências mesmo não estando no desenho (só este aparelho; as escolhas de cada aviso valem em todos).
export default function PushDeviceRow({ onMessage }) {
  const [status,  setStatus]  = useState(() => (supportsPush() ? Notification.permission : 'unsupported'))
  const [loading, setLoading] = useState(false)

  const toggle = async () => {
    if (status === 'unsupported' || loading) return
    if (status === 'denied') {
      onMessage('Bloqueado — habilite as notificações nas configurações do aparelho.', 'error')
      return
    }
    const isIOS        = /iPhone|iPad|iPod/.test(navigator.userAgent)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || !!navigator.standalone
    if (isIOS && !isStandalone) {
      onMessage('Adicione o app à tela inicial e abra de lá para ativar notificações.', 'error')
      return
    }
    if (status === 'granted') {
      setStatus('default')
      onMessage('Notificações desativadas.')
      navigator.serviceWorker.ready
        .then(reg => reg.pushManager.getSubscription())
        .then(sub => {
          if (!sub) return
          notificationsAPI.unsubscribe({ endpoint: sub.endpoint }).catch(() => {})
          sub.unsubscribe().catch(() => {})
        })
      return
    }
    setLoading(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setStatus(permission)
        if (permission === 'denied') onMessage('Permissão negada. Habilite nas configurações do aparelho.', 'error')
        return
      }
      setStatus('granted')
      onMessage('Notificações ativadas!')
      const [{ data }, reg] = await Promise.all([notificationsAPI.getVapidKey(), navigator.serviceWorker.ready])
      if (!data.key) return
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(data.key) })
      await notificationsAPI.subscribe(sub.toJSON())
    } catch (err) {
      if (import.meta.env.DEV) console.error('Push error:', err)
      setStatus('default')
      onMessage(err.message || 'Erro ao ativar notificações.', 'error')
    } finally {
      setLoading(false)
    }
  }

  const desc = {
    unsupported: 'Instale o app na tela inicial para receber avisos.',
    denied:      'Bloqueado — habilite nas configurações do aparelho.',
    granted:     'Ativo — os avisos chegam neste aparelho.',
    default:     'Receba os avisos mesmo com o app fechado.',
  }[status]

  return (
    <div className="pr-row">
      <div className="pr-text">
        <div className="pr-name">Avisos neste aparelho</div>
        <div className={`pr-desc${status === 'denied' ? ' err' : ''}`}>{desc}</div>
      </div>
      {status !== 'unsupported' && (
        <button type="button" role="switch" aria-checked={status === 'granted'} aria-label="Avisos neste aparelho"
          className={`sb-switch${status === 'granted' ? ' on' : ''}`} onClick={toggle} disabled={loading || status === 'denied'}>
          <span className="sb-knob" />
        </button>
      )}
    </div>
  )
}
