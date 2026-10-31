import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function EliteConversionModal({ onClose }) {
  const navigate  = useNavigate()
  const [closing, setClosing] = useState(false)

  const close = () => {
    setClosing(true)
    try {
      sessionStorage.setItem('conversion_modal_shown', '1')
      sessionStorage.removeItem('trial_just_expired')
    } catch {}
    setTimeout(() => onClose?.(), 220)
  }

  const goTo = (plan) => {
    navigate(`/planos?destaque=${plan}`)
    close()
  }

  return (
    <div
      data-testid="trial-expired-modal"
      className={`ecm-backdrop${closing ? ' ecm-out' : ''}`}
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div className="ecm-card">
        {/* Header */}
        <div className="ecm-header">
          <div>
            <div className="ecm-title">Seu período gratuito encerrou</div>
            <div className="ecm-sub">Você explorou o Nancy Elite. O que deseja fazer agora?</div>
          </div>
          <button className="ecm-close" onClick={close} aria-label="Fechar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Opções */}
        <div className="ecm-options">
          {/* Elite — primário */}
          <button className="ecm-btn ecm-btn-elite" onClick={() => goTo('elite')}>
            <div className="ecm-btn-info">
              <span className="ecm-btn-label">Continuar no Elite</span>
              <span className="ecm-btn-price">R$ 34,90 / mês</span>
            </div>
            <span className="ecm-btn-arrow">→</span>
          </button>

          {/* Pro — secundário */}
          <button className="ecm-btn ecm-btn-pro" onClick={() => goTo('pro')}>
            <div className="ecm-btn-info">
              <span className="ecm-btn-label">Assinar Pro</span>
              <span className="ecm-btn-price">R$ 9,90 / mês</span>
            </div>
            <span className="ecm-btn-arrow">→</span>
          </button>
        </div>

        {/* Free link */}
        <button className="ecm-free" onClick={close}>
          Continuar no Free (com limitações)
        </button>

        <p className="ecm-note">✓ Cancele quando quiser · Sem fidelidade</p>
      </div>
    </div>
  )
}
