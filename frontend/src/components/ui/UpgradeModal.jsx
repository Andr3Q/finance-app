import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../../hooks/useUser.js'

const PRO_HIGHLIGHTS = [
  '35 transações por mês',
  'Limites por categoria',
  'Histórico completo',
  'Suporte prioritário',
]

const ELITE_EXTRAS = [
  'Previsão IA mensal',
  'Metas ilimitadas',
  'Detector de assinaturas',
  'Suporte dedicado',
]

export default function UpgradeModal({ onClose, reason }) {
  const navigate = useNavigate()
  const user     = useUser()
  const [closing,   setClosing]   = useState(false)
  const [emailWarn, setEmailWarn] = useState(false)

  const isTrialEligible = user.plan === 'free' && !user.isOnTrial

  const handleClose = () => {
    setClosing(true)
    setTimeout(() => { setClosing(false); onClose() }, 200)
  }

  const goPlanos = () => {
    if (!user.emailVerified) {
      setEmailWarn(true)
      return
    }
    setClosing(true)
    setTimeout(() => { setClosing(false); onClose(); navigate('/planos') }, 200)
  }

  return (
    <div
      className="modal-overlay"
      onClick={e => { if (e.target === e.currentTarget) handleClose() }}
      style={{ animation: closing ? 'fadeOut .2s forwards' : 'fadeIn .2s forwards' }}
    >
      <div className="modal-box" style={{ maxWidth: 500, padding: '28px 24px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          {isTrialEligible && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'rgba(74,226,172,.12)', border: '1px solid rgba(74,226,172,.25)',
              borderRadius: 20, padding: '4px 12px', fontSize: 12, color: '#4ae2ac',
              fontWeight: 700, marginBottom: 10,
            }}>
              <svg viewBox="0 0 24 24" fill="none" width="11" height="11" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
              7 dias grátis — sem cartão
            </div>
          )}
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--t1)', fontFamily: 'var(--fd)' }}>
            Desbloqueie mais poder
          </div>
          <div style={{ fontSize: 13, color: 'var(--t2)', marginTop: 4 }}>
            {isTrialEligible
              ? 'Experimente sem compromisso. Cancele quando quiser.'
              : 'Escolha o plano ideal para o seu controle financeiro.'}
          </div>
          {reason && (
            <div style={{
              fontSize: 12, color: 'var(--red)', marginTop: 10,
              padding: '6px 12px', background: 'rgba(255,71,87,.08)', borderRadius: 8,
            }}>
              {reason}
            </div>
          )}
          {emailWarn && (
            <div style={{
              fontSize: 12, color: '#f59e0b', marginTop: 10,
              padding: '6px 12px', background: 'rgba(245,158,11,.08)', borderRadius: 8,
            }}>
              Verifique seu e-mail antes de assinar. Acesse Configurações para reenviar o link.
            </div>
          )}
        </div>

        {/* Cards lado a lado */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>

          {/* PRO */}
          <div style={{
            border: '1.5px solid rgba(74,226,172,.35)', borderRadius: 14,
            padding: '16px 14px', background: 'rgba(74,226,172,.04)',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#4ae2ac', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>Pro</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 1, marginBottom: 1 }}>
              <span style={{ fontSize: 11, color: 'var(--t2)', marginRight: 1 }}>R$</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--t1)', fontFamily: 'var(--fd)' }}>9</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>,90</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--t2)', marginBottom: 12 }}>/mês</div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {PRO_HIGHLIGHTS.map(f => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <svg viewBox="0 0 12 12" fill="none" width="10" height="10" stroke="#4ae2ac" strokeWidth="2.2" strokeLinecap="round"><path d="M2 6l3 3 5-5"/></svg>
                  <span style={{ fontSize: 12, color: 'var(--t2)' }}>{f}</span>
                </div>
              ))}
            </div>
            <button className="btn bp" style={{ width: '100%', justifyContent: 'center', fontSize: 13, padding: '9px 0' }} onClick={goPlanos}>
              {isTrialEligible ? 'Testar grátis' : 'Assinar Pro'}
            </button>
          </div>

          {/* ELITE */}
          <div style={{
            border: '1.5px solid rgba(167,139,250,.35)', borderRadius: 14,
            padding: '16px 14px', background: 'rgba(167,139,250,.04)',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>Elite</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 1, marginBottom: 1 }}>
              <span style={{ fontSize: 11, color: 'var(--t2)', marginRight: 1 }}>R$</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--t1)', fontFamily: 'var(--fd)' }}>34</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>,90</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--t2)', marginBottom: 12 }}>/mês</div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {ELITE_EXTRAS.map(f => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <svg viewBox="0 0 12 12" fill="none" width="10" height="10" stroke="#a78bfa" strokeWidth="2.2" strokeLinecap="round"><path d="M2 6l3 3 5-5"/></svg>
                  <span style={{ fontSize: 12, color: 'var(--t2)' }}>{f}</span>
                </div>
              ))}
            </div>
            <button
              onClick={goPlanos}
              style={{
                width: '100%', fontSize: 13, padding: '9px 0', cursor: 'pointer',
                border: '1.5px solid rgba(167,139,250,.5)', borderRadius: 8,
                background: 'transparent', color: '#a78bfa', fontWeight: 700,
              }}
            >
              {isTrialEligible ? 'Testar Elite' : 'Assinar Elite'}
            </button>
          </div>
        </div>

        <button className="btn bg" style={{ width: '100%', justifyContent: 'center', fontSize: 12 }} onClick={handleClose}>
          Continuar no Grátis
        </button>

      </div>
    </div>
  )
}
