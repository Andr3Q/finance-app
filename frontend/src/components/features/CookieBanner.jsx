import { useState, useRef, useLayoutEffect } from 'react'
import { Link } from 'react-router-dom'
import { initAnalytics } from '../../services/analytics.js'
import { useUser } from '../../hooks/useUser.js'

const CONSENT_KEY = 'analytics-consent'

export function hasConsent() {
  try { return localStorage.getItem(CONSENT_KEY) === 'accepted' } catch { return false }
}

// Aviso de cookies (Nancy 2): cartão branco flutuando embaixo, com a mesma linguagem das telas novas. Antes ele usava variáveis
// de cor que não existem (--s1, --bd): ficava TRANSPARENTE e o texto se misturava com o que havia embaixo (landing, formulários).
//
// Pra não atrapalhar: o fundo é opaco; logado no celular ele fica ACIMA da barra de baixo (antes cobria a barra); enquanto
// está aberto, as páginas ganham um respiro embaixo (--ck-pad) pra tudo poder ser rolado até aparecer acima do aviso, e o
// aviso de instalar o app espera (data-ck-open) em vez de ficar por cima dele. Fecha sozinho quando a pessoa decide.
export default function CookieBanner() {
  const user = useUser()
  const ref = useRef(null)
  const [visible, setVisible] = useState(() => {
    try { return !localStorage.getItem(CONSENT_KEY) } catch { return false }
  })

  // Enquanto aberto: avisa o resto da página (altura do cartão + folga + área segura do iPhone) e some tudo ao fechar.
  useLayoutEffect(() => {
    if (!visible) return undefined
    const root = document.documentElement
    const el = ref.current
    const apply = () => root.style.setProperty('--ck-pad', `calc(${Math.ceil(el.getBoundingClientRect().height)}px + 12px + env(safe-area-inset-bottom, 0px))`)
    root.setAttribute('data-ck-open', '')
    apply()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : null
    ro?.observe(el)
    return () => {
      ro?.disconnect()
      root.style.removeProperty('--ck-pad')
      root.removeAttribute('data-ck-open')
    }
  }, [visible])

  if (!visible) return null

  const decide = (value) => {
    try { localStorage.setItem(CONSENT_KEY, value) } catch { /* armazenamento bloqueado: some só nesta visita */ }
    if (value === 'accepted') initAnalytics()
    setVisible(false)
  }

  return (
    <div ref={ref} className={`ck-banner${user?.id ? ' ck-nav' : ''}`} role="region" aria-label="Aviso de cookies">
      <div className="ck-msg">
        <span className="ck-ico" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </span>
        <p className="ck-text">
          Usamos cookies analíticos para melhorar sua experiência. Seus dados nunca são vendidos.{' '}
          <Link to="/privacidade" className="ck-link">Política de Privacidade</Link>.
        </p>
      </div>
      <div className="ck-actions">
        <button type="button" className="ck-btn ghost" onClick={() => decide('declined')}>Recusar</button>
        <button type="button" className="ck-btn solid" onClick={() => decide('accepted')}>Aceitar</button>
      </div>
    </div>
  )
}
