import { useState } from 'react'
import { useUser } from '../../hooks/useUser.js'
import { authAPI } from '../../services/api.js'

export default function EmailVerificationBanner() {
  const user = useUser()
  const [sent,      setSent]      = useState(false)
  const [loading,   setLoading]   = useState(false)
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

  const dismiss = () => {
    sessionStorage.setItem('email-verify-dismissed', '1')
    setDismissed(true)
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 200,
      background: 'rgba(79,142,247,.1)',
      borderBottom: '1px solid rgba(79,142,247,.25)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      padding: '10px 16px',
      animation: 'obFadeUp .3s ease',
    }}>
      {/* Linha 1: ícone + mensagem + fechar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4f8ef7"
          strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
          <polyline points="22,6 12,13 2,6"/>
        </svg>
        <span style={{ flex: 1, fontSize: 13, color: 'var(--t1)', lineHeight: 1.4 }}>
          {sent
            ? 'E-mail de verificação enviado! Verifique sua caixa de entrada.'
            : 'Confirme seu e-mail para ativar sua conta completamente.'}
        </span>
        <button
          onClick={dismiss}
          aria-label="Fechar"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--t3)',
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Linha 2: botão de ação (some depois de enviado) */}
      {!sent && (
        <button
          onClick={handleResend}
          disabled={loading}
          style={{
            marginTop: 10,
            width: '100%',
            padding: '9px 0',
            borderRadius: 10,
            border: 'none',
            background: '#4f8ef7',
            color: '#fff',
            fontSize: 13,
            fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
            fontFamily: 'inherit',
          }}
        >
          {loading ? 'Enviando…' : 'Reenviar e-mail de verificação'}
        </button>
      )}
    </div>
  )
}
