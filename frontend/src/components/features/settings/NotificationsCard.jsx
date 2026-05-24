import { useState } from 'react'
import { notificationsAPI, authAPI } from '../../../services/api.js'
import { useUser, saveUser } from '../../../hooks/useUser.js'
import CfgToggle from './CfgToggle.jsx'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export default function NotificationsCard({ isPro, onMessage, onUpgrade }) {
  const user = useUser()

  const [notifStatus,  setNotifStatus]  = useState(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      return 'unsupported'
    }
    return Notification.permission
  })
  const [notifLoading, setNotifLoading] = useState(false)

  const [budgetAlert,    setBudgetAlert]    = useState(user.notifBudgetAlert    ?? true)
  const [budgetReminder, setBudgetReminder] = useState(user.notifBudgetReminder ?? true)
  const [prefLoading,    setPrefLoading]    = useState(null) // 'alert' | 'reminder'

  const handleTogglePush = async () => {
    if (notifStatus === 'unsupported' || notifLoading) return
    if (notifStatus === 'denied') {
      onMessage('Bloqueado — Ajustes > Finance > Notificações', 'error')
      return
    }
    const isIOS        = /iPhone|iPad|iPod/.test(navigator.userAgent)
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

  const handlePref = async (key, newValue, setter) => {
    if (notifStatus !== 'granted') {
      onMessage('Ative as notificações primeiro.', 'error')
      return
    }
    setPrefLoading(key)
    setter(newValue)
    try {
      await authAPI.updateNotifPrefs({ [key]: newValue })
      const cur = JSON.parse(sessionStorage.getItem('user') || '{}')
      saveUser({ ...cur, [key]: newValue })
    } catch {
      setter(!newValue) // reverte em caso de erro
      onMessage('Erro ao salvar preferência.', 'error')
    } finally {
      setPrefLoading(null)
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

        {/* Push geral */}
        <div className="cfg-notif-row">
          <div className="cfg-notif-info">
            <div className="cfg-notif-label">Avisos de transações</div>
            <div className={`cfg-notif-desc${notifStatus === 'granted' ? ' on' : notifStatus === 'denied' ? ' err' : ''}`}>
              {notifStatus === 'unsupported' && 'Instale o app na tela inicial para usar notificações.'}
              {notifStatus === 'denied'      && 'Bloqueado — habilite em Configurações > Finance.'}
              {notifStatus === 'granted'     && 'Ativo — você recebe avisos de gastos e saldo.'}
              {notifStatus === 'default'     && 'Receba avisos a cada transação registrada.'}
            </div>
          </div>
          {notifStatus !== 'unsupported' && (
            <CfgToggle
              on={notifStatus === 'granted'}
              disabled={notifStatus === 'denied' || notifLoading}
              onChange={handleTogglePush}
            />
          )}
        </div>

        {/* Lembrete de contas fixas */}
        <div className="cfg-notif-row">
          <div className="cfg-notif-info">
            <div className="cfg-notif-label">Lembrete de contas fixas</div>
            <div className="cfg-notif-desc">
              {budgetReminder
                ? 'Aviso até 3 dias antes do vencimento de cada conta.'
                : 'Lembretes de vencimento desativados.'}
            </div>
          </div>
          <CfgToggle
            on={budgetReminder}
            disabled={prefLoading === 'notifBudgetReminder' || notifStatus !== 'granted'}
            onChange={() => handlePref('notifBudgetReminder', !budgetReminder, setBudgetReminder)}
          />
        </div>

        {/* Alerta de orçamento */}
        <div className="cfg-notif-row">
          <div className="cfg-notif-info">
            <div className="cfg-notif-label">Alerta de orçamento</div>
            <div className="cfg-notif-desc">
              {budgetAlert
                ? 'Aviso quando você atingir 80% do orçamento mensal.'
                : 'Alerta de orçamento desativado.'}
            </div>
          </div>
          <CfgToggle
            on={budgetAlert}
            disabled={prefLoading === 'notifBudgetAlert' || notifStatus !== 'granted'}
            onChange={() => handlePref('notifBudgetAlert', !budgetAlert, setBudgetAlert)}
          />
        </div>

        {/* Relatório PDF */}
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
