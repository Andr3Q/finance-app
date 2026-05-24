import { useState } from 'react'
import { useUser } from '../../hooks/useUser.js'
import { authAPI } from '../../services/api.js'

export default function EmailVerificationBanner() {
  const user = useUser()
  const [sent,    setSent]    = useState(false)
  const [loading, setLoading] = useState(false)
  const [dismissed, setDismissed] = useState(() => !!sessionStorage.getItem('email-verify-dismissed'))

  if (!user.id || user.emailVerified || dismissed) return null

  const handleResend = async () => {
    if (loading || sent) return
    setLoading(true)
    try {
      await authAPI.resendVerification()
      setSent(true)
    } catch {}
    setLoading(false)
  }

  return (
    <div className="expiry-banner" style={{ background: 'rgba(234,179,8,.08)', borderBottom: '1px solid rgba(234,179,8,.2)' }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2" strokeLinecap="round" className="expiry-banner-ico">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
        <polyline points="22,6 12,13 2,6"/>
      </svg>
      <span className="expiry-banner-msg" style={{ color: '#ca8a04' }}>
        {sent ? 'E-mail de verificação enviado! Verifique sua caixa de entrada.' : 'Confirme seu e-mail para ativar sua conta completamente.'}
      </span>
      {!sent && (
        <button
          className="expiry-banner-cta"
          style={{ background: '#eab308', color: '#000' }}
          onClick={handleResend}
          disabled={loading}
        >
          {loading ? '...' : 'Reenviar e-mail'}
        </button>
      )}
      <button
        className="expiry-banner-close"
        onClick={() => { sessionStorage.setItem('email-verify-dismissed', '1'); setDismissed(true) }}
        aria-label="Fechar"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  )
}
