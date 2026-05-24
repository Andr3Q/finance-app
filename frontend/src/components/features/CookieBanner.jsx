import { useState } from 'react'
import { initAnalytics } from '../../services/analytics.js'

const CONSENT_KEY = 'analytics-consent'

export function hasConsent() {
  return localStorage.getItem(CONSENT_KEY) === 'accepted'
}

export default function CookieBanner() {
  const [visible, setVisible] = useState(() => !localStorage.getItem(CONSENT_KEY))

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
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
      background: 'var(--s1)', borderTop: '1px solid var(--bd)',
      padding: '16px 24px', display: 'flex', alignItems: 'center',
      gap: 16, flexWrap: 'wrap', boxShadow: '0 -4px 20px rgba(0,0,0,.15)',
    }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--cp)" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <p style={{ flex: 1, margin: 0, fontSize: 13, color: 'var(--t2)', lineHeight: 1.5, minWidth: 220 }}>
        Usamos cookies analíticos para entender como o app é usado e melhorar sua experiência.
        Seus dados nunca são vendidos. Consulte nossa{' '}
        <a href="/privacidade" style={{ color: 'var(--cp)', textDecoration: 'underline' }}>Política de Privacidade</a>.
      </p>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button
          onClick={decline}
          style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--bd)', background: 'transparent', color: 'var(--t2)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          Recusar
        </button>
        <button
          onClick={accept}
          style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--cp)', color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          Aceitar
        </button>
      </div>
    </div>
  )
}
