import { useState, useEffect } from 'react'
import { useUser } from '../../../hooks/useUser.js'
import { authAPI } from '../../../services/api.js'
import { analytics } from '../../../services/analytics.js'

export default function ReferralCard() {
  const user      = useUser()
  const [stats,   setStats]   = useState(null)
  const [copied,  setCopied]  = useState(false)
  const [loading, setLoading] = useState(true)

  const referralCode = user.referralCode
  const referralLink = referralCode
    ? `${window.location.origin}/register?ref=${referralCode}`
    : null

  useEffect(() => {
    authAPI.referralStats()
      .then(res => setStats(res.data))
      .catch(() => setStats({ referredCount: 0, rewardedCount: 0, maxReferrals: 5, limitReached: false, bonusDays: 10 }))
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

  const rewardedCount  = stats?.rewardedCount  ?? 0
  const referredCount  = stats?.referredCount  ?? 0
  const maxReferrals   = stats?.maxReferrals   ?? 5
  const limitReached   = stats?.limitReached   ?? false
  const bonusDays      = stats?.bonusDays      ?? 10
  const pendingCount   = referredCount - rewardedCount  // cadastrados mas email não verificado
  const pct            = Math.min(100, Math.round((rewardedCount / maxReferrals) * 100))

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

        {/* Benefícios */}
        <div className="ref-benefits">
          <div className="ref-benefit">
            <div className="ref-benefit-ico-svg">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/>
              </svg>
            </div>
            <div>
              <div className="ref-benefit-title">Você ganha</div>
              <div className="ref-benefit-desc">+{bonusDays} dias de Pro por cada amigo verificado · máx. {maxReferrals}</div>
            </div>
          </div>
          <div className="ref-benefit">
            <div className="ref-benefit-ico-svg">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
              </svg>
            </div>
            <div>
              <div className="ref-benefit-title">Seu amigo ganha</div>
              <div className="ref-benefit-desc">14 dias de trial (o dobro do normal)</div>
            </div>
          </div>
        </div>

        {/* Barra de progresso */}
        {!loading && (
          <div className="ref-progress-wrap">
            <div className="ref-progress-header">
              <span className="ref-progress-label">Recompensas recebidas</span>
              <span className={`ref-progress-count${limitReached ? ' limit' : ''}`}>
                {rewardedCount}/{maxReferrals}
              </span>
            </div>
            <div className="ref-progress-bar">
              <div
                className={`ref-progress-fill${limitReached ? ' full' : ''}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            {limitReached ? (
              <p className="ref-progress-msg limit">
                Você atingiu o limite de {maxReferrals} indicações. Obrigado por divulgar o app!
              </p>
            ) : pendingCount > 0 ? (
              <p className="ref-progress-msg pending">
                {pendingCount} {pendingCount === 1 ? 'amigo cadastrado aguarda' : 'amigos cadastrados aguardam'} verificação de e-mail para liberar seu bônus.
              </p>
            ) : null}
          </div>
        )}

        {/* Link de indicação */}
        {!limitReached && (
          <>
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

            <div style={{ display: 'flex', gap: 8, marginTop: 10, marginBottom: 4 }}>
              <button
                className="cfg-btn-secondary"
                style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}
                onClick={() => {
                  if (navigator.share && referralLink) {
                    navigator.share({ title: 'FinançasPro', text: 'Controle suas finanças com IA! Use meu link e ganhe 14 dias de trial:', url: referralLink }).catch(() => {})
                  } else if (referralLink) {
                    window.open(`https://wa.me/?text=${encodeURIComponent(`Controle suas finanças com IA! Use meu link e ganhe 14 dias de trial grátis: ${referralLink}`)}`, '_blank')
                  }
                }}
                disabled={!referralLink}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5 }}>
                  <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                </svg>
                Compartilhar
              </button>
              <button
                className="cfg-btn-secondary"
                style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}
                onClick={() => {
                  if (referralLink) window.open(`mailto:?subject=Experimente o FinançasPro&body=Controle suas finanças com IA! Use meu link e ganhe 14 dias grátis: ${referralLink}`, '_blank')
                }}
                disabled={!referralLink}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5 }}>
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
                E-mail
              </button>
            </div>
          </>
        )}

        {/* Rodapé de status */}
        <div className="ref-stats">
          {loading
            ? <span className="ref-stats-loading">Carregando...</span>
            : referredCount === 0
              ? <span className="ref-stats-zero">Nenhum amigo cadastrado ainda — compartilhe seu link!</span>
              : <span className="ref-stats-count">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  {referredCount} {referredCount === 1 ? 'amigo se cadastrou' : 'amigos se cadastraram'} com seu link
                </span>}
        </div>
      </div>
    </div>
  )
}
