import { useState } from 'react'
import { initAnalytics } from '../../services/analytics.js'

const CONSENT_KEY = 'analytics-consent'

export function hasConsent() {
  try { return localStorage.getItem(CONSENT_KEY) === 'accepted' } catch { return false }
}

export default function CookieBanner() {
  const [visible, setVisible] = useState(() => {
    try { return !localStorage.getItem(CONSENT_KEY) } catch { return false }
  })

  if (!visible) return null

  const accept = () => {
    localStorage.setItem(CONSENT_KEY, 'accepted')
    initAnalytics()
    setVisible(false)
  }

  const decline = () => {
    localStorage.setItem(CONSENT_KEY, 'declined')
    setVisible(false)
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 9999,
      background: 'var(--s1)',
      borderTop: '1px solid var(--bd)',
      boxShadow: '0 -8px 32px rgba(0,0,0,.3)',
      padding: '14px 16px',
      paddingBottom: 'calc(14px + env(safe-area-inset-bottom, 0px))',
    }}>
      {/* Mensagem */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--cp)"
          strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--t2)', lineHeight: 1.5 }}>
          Usamos cookies analíticos para melhorar sua experiência. Seus dados nunca são vendidos.{' '}
          <a href="/privacidade" style={{ color: 'var(--cp)', textDecoration: 'underline' }}>
            Política de Privacidade
          </a>.
        </p>
      </div>

      {/* Botões */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={decline}
          style={{
            flex: 1,
            padding: '10px 0',
            borderRadius: 10,
            border: '1px solid var(--bd)',
            background: 'transparent',
            color: 'var(--t2)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Recusar
        </button>
        <button
          onClick={accept}
          style={{
            flex: 2,
            padding: '10px 0',
            borderRadius: 10,
            border: 'none',
            background: 'var(--cp)',
            color: '#000',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Aceitar
        </button>
      </div>
    </div>
  )
}
