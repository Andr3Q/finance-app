import { useState, useEffect } from 'react'
import { useUser } from '../../../hooks/useUser.js'
import { authAPI } from '../../../services/api.js'
import { analytics } from '../../../services/analytics.js'

export default function ReferralCard() {
  const user        = useUser()
  const [count,     setCount]   = useState(null)
  const [copied,    setCopied]  = useState(false)
  const [loading,   setLoading] = useState(true)

  const referralCode = user.referralCode
  const referralLink = referralCode
    ? `${window.location.origin}/register?ref=${referralCode}`
    : null

  useEffect(() => {
    authAPI.referralStats()
      .then(res => setCount(res.data.referredCount))
      .catch(() => setCount(0))
      .finally(() => setLoading(false))
  }, [])

  const handleCopy = async () => {
    if (!referralLink) return
    try {
      await navigator.clipboard.writeText(referralLink)
      setCopied(true)
      analytics.track('referral_link_copied')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback para Safari/iOS sem permissão
      const el = document.createElement('textarea')
      el.value = referralLink
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="cfg-card r11">
      <div className="cfg-card-head">
        <div className="cfg-ch-ico" style={{ background: 'linear-gradient(135deg,#a855f7,#ec4899)', border: 'none' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 00-3-3.87"/>
            <path d="M16 3.13a4 4 0 010 7.75"/>
          </svg>
        </div>
        <div>
          <div className="cfg-ch-title">Indique e Ganhe</div>
          <div className="cfg-ch-sub">Convide amigos e ganhe dias grátis de Pro</div>
        </div>
      </div>

      <div className="cfg-card-body">
        <div className="ref-benefits">
          <div className="ref-benefit">
            <span className="ref-benefit-icon">🎁</span>
            <div>
              <div className="ref-benefit-title">Você ganha</div>
              <div className="ref-benefit-desc">+30 dias de Pro por cada amigo cadastrado</div>
            </div>
          </div>
          <div className="ref-benefit">
            <span className="ref-benefit-icon">✨</span>
            <div>
              <div className="ref-benefit-title">Seu amigo ganha</div>
              <div className="ref-benefit-desc">14 dias de trial (o dobro do normal)</div>
            </div>
          </div>
        </div>

        <div className="ref-link-label">Seu link de indicação</div>
        <div className="ref-link-row">
          <div className="ref-link-box">
            {referralLink
              ? <span className="ref-link-text">{referralLink}</span>
              : <span className="ref-link-loading">Gerando seu link...</span>}
          </div>
          <button
            className={`ref-copy-btn${copied ? ' copied' : ''}`}
            onClick={handleCopy}
            disabled={!referralLink}
          >
            {copied ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
            )}
            {copied ? 'Copiado!' : 'Copiar'}
          </button>
        </div>

        <div className="ref-stats">
          {loading
            ? <span className="ref-stats-loading">Carregando...</span>
            : count === 0
              ? <span className="ref-stats-zero">Nenhum amigo cadastrado ainda — compartilhe seu link!</span>
              : <span className="ref-stats-count">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  {count} {count === 1 ? 'amigo se cadastrou' : 'amigos se cadastraram'} com seu link
                </span>}
        </div>
      </div>
    </div>
  )
}
