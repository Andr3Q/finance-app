import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../../hooks/useUser.js'

const DISMISS_KEY = 'expiry-banner-dismissed'

export default function PlanExpiryBanner() {
  const user     = useUser()
  const navigate = useNavigate()
  const [dismissed, setDismissed] = useState(() => !!sessionStorage.getItem(DISMISS_KEY))

  if (dismissed || !user.id || user.plan === 'free' || !user.planExpiresAt) return null

  const daysLeft = Math.ceil((new Date(user.planExpiresAt) - Date.now()) / (1000 * 60 * 60 * 24))
  if (daysLeft > 7) return null

  const expired   = daysLeft <= 0
  const planLabel = user.plan === 'elite' ? 'Elite' : 'Pro'
  const msg = expired
    ? `Seu plano ${planLabel} expirou. Renove para manter o acesso aos recursos premium.`
    : daysLeft === 1
      ? `Seu plano ${planLabel} expira hoje!`
      : `Seu plano ${planLabel} expira em ${daysLeft} dias.`

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  return (
    <div className={`expiry-banner${expired ? ' expired' : ''}`}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="expiry-banner-ico">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span className="expiry-banner-msg">{msg}</span>
      <button className="expiry-banner-cta" onClick={() => navigate('/planos')}>
        Renovar
      </button>
      <button className="expiry-banner-close" onClick={dismiss} aria-label="Fechar">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  )
}
