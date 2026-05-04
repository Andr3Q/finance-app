import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const BENEFITS = [
  'Transações ilimitadas por mês',
  'Contas fixas ilimitadas',
  'Limites de gasto por categoria',
  'Relatório PDF mensal por e-mail',
  'Histórico de meses anteriores',
  'Exportação de dados em CSV',
  'Suporte prioritário',
]

export default function UpgradeModal({ onClose, reason }) {
  const navigate = useNavigate()
  const [closing, setClosing] = useState(false)

  const handleClose = () => {
    setClosing(true)
    setTimeout(() => { setClosing(false); onClose() }, 200)
  }

  return (
    <div
      className="modal-overlay"
      onClick={e => { if (e.target === e.currentTarget) handleClose() }}
      style={{ animation: closing ? 'fadeOut .2s forwards' : 'fadeIn .2s forwards' }}
    >
      <div className="modal-box" style={{ maxWidth: 420, padding: '32px 28px', textAlign: 'center' }}>

        {/* Ícone */}
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'linear-gradient(135deg, rgba(0,255,204,.15), rgba(0,255,204,.05))',
          border: '1px solid rgba(0,255,204,.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px'
        }}>
          <svg viewBox="0 0 24 24" fill="none" width="26" height="26">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
              stroke="#00ffcc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="rgba(0,255,204,.1)"/>
          </svg>
        </div>

        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--t1)', marginBottom: 6, fontFamily: 'var(--fd)' }}>
          Upgrade para Pro
        </div>

        {reason && (
          <div style={{ fontSize: 13, color: 'var(--red)', marginBottom: 16, padding: '8px 12px', background: 'rgba(255,71,87,.08)', borderRadius: 8 }}>
            {reason}
          </div>
        )}

        <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 20 }}>
          Desbloqueie todos os recursos e leve seu controle financeiro ao próximo nível.
        </div>

        {/* Lista de benefícios */}
        <div style={{ textAlign: 'left', marginBottom: 24 }}>
          {BENEFITS.map(b => (
            <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" style={{ color: '#00ffcc', flexShrink: 0 }}>
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
              </svg>
              <span style={{ fontSize: 13, color: 'var(--t1)' }}>{b}</span>
            </div>
          ))}
        </div>

        {/* Preço */}
        <div style={{ marginBottom: 20, padding: '12px 16px', background: 'rgba(0,255,204,.05)', borderRadius: 10, border: '1px solid rgba(0,255,204,.15)' }}>
          <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--c)', fontFamily: 'var(--fd)' }}>R$ 14,90</span>
          <span style={{ fontSize: 13, color: 'var(--t2)' }}>/mês</span>
        </div>

        <button
          className="btn bp"
          style={{ width: '100%', justifyContent: 'center', marginBottom: 10, fontSize: 15, padding: '12px 0' }}
          onClick={() => { handleClose(); navigate('/planos') }}
        >
          Ver planos
        </button>
        <button
          className="btn bg"
          style={{ width: '100%', justifyContent: 'center', fontSize: 13 }}
          onClick={handleClose}
        >
          Continuar no Gratuito
        </button>

      </div>
    </div>
  )
}
