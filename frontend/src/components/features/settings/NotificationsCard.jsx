import { useState } from 'react'
import { notificationsAPI } from '../../../services/api.js'
import CfgToggle from './CfgToggle.jsx'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export default function NotificationsCard({ isPro, onMessage, onUpgrade }) {
  const [notifStatus,  setNotifStatus]  = useState(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      return 'unsupported'
    }
    return Notification.permission
  })
  const [notifLoading, setNotifLoading] = useState(false)

  const handleToggle = async () => {
    if (notifStatus === 'unsupported' || notifLoading) return
    if (notifStatus === 'denied') {
      onMessage('Bloqueado — Ajustes > Finance > Notificações', 'error')
      return
    }
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || !!navigator.standalone
    if (isIOS && !isStandalone) {
      onMessage('Adicione o app à tela inicial e abra de lá para ativar notificações.', 'error')
      return
    }
    if (notifStatus === 'granted') {
      setNotifStatus('default')
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
    setNotifLoading(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setNotifStatus(permission)
        if (permission === 'denied') onMessage('Permissão negada. Ajustes > Finance > Notificações.', 'error')
        return
      }
      setNotifStatus('granted')
      setNotifLoading(false)
      onMessage('Notificações ativadas!')
      const [{ data }, reg] = await Promise.all([
        notificationsAPI.getVapidKey(),
        navigator.serviceWorker.ready,
      ])
      if (!data.key) return
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.key),
      })
      await notificationsAPI.subscribe(sub.toJSON())
    } catch (err) {
      if (import.meta.env.DEV) console.error('Push error:', err)
      setNotifStatus('default')
      onMessage(err.message || 'Erro ao ativar notificações.', 'error')
    } finally {
      setNotifLoading(false)
    }
  }

  return (
    <div className="cfg-card r8">
      <div className="cfg-card-head">
        <div className="cfg-ch-ico">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ac46e" strokeWidth="2" strokeLinecap="round">
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 01-3.46 0"/>
          </svg>
        </div>
        <div>
          <div className="cfg-ch-title">Notificações</div>
          <div className="cfg-ch-sub">Gerencie seus alertas</div>
        </div>
      </div>
      <div className="cfg-notif-list">

        <div className="cfg-notif-row">
          <div className="cfg-notif-info">
            <div className="cfg-notif-label">Avisos de transações</div>
            <div className={`cfg-notif-desc${notifStatus === 'granted' ? ' on' : notifStatus === 'denied' ? ' err' : ''}`}>
              {notifStatus === 'unsupported' && 'Instale o app na tela inicial para usar notificações.'}
              {notifStatus === 'denied'      && 'Bloqueado — habilite em Configurações > Finance.'}
              {notifStatus === 'granted'     && 'Ativo — você recebe avisos de gastos e saldo.'}
              {notifStatus === 'default'     && 'Receba avisos a cada transação registrada.'}
              {notifStatus === 'loading'     && 'Verificando...'}
            </div>
          </div>
          {notifStatus !== 'unsupported' && notifStatus !== 'loading' && (
            <CfgToggle
              on={notifStatus === 'granted'}
              disabled={notifStatus === 'denied' || notifLoading}
              onChange={handleToggle}
            />
          )}
        </div>

        <div className="cfg-notif-row">
          <div className="cfg-notif-info">
            <div className="cfg-notif-label">Lembrete de contas fixas</div>
            <div className="cfg-notif-desc">Receba lembretes das suas despesas fixas.</div>
          </div>
          <CfgToggle on={false} onChange={() => {}} />
        </div>

        <div className="cfg-notif-row">
          <div className="cfg-notif-info">
            <div className="cfg-notif-label">Alerta de orçamento</div>
            <div className="cfg-notif-desc">Notificação ao atingir 80% do limite.</div>
          </div>
          <CfgToggle on={false} onChange={() => {}} />
        </div>

        <div className="cfg-notif-row" style={{ borderBottom: 'none' }}>
          <div className="cfg-notif-info">
            <div className="cfg-notif-label">Relatório PDF por e-mail</div>
            <div className="cfg-notif-desc">Receba o resumo mensal no seu e-mail.</div>
          </div>
          <CfgToggle
            on={isPro}
            onChange={() => { if (!isPro) onUpgrade('Receba relatórios PDF mensais. Recurso exclusivo do plano Pro.') }}
          />
        </div>

      </div>
    </div>
  )
}
