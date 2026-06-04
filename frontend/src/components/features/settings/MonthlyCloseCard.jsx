import { useState } from 'react'
import { reportsAPI } from '../../../services/api.js'

export default function MonthlyCloseCard({ user, isPro, onMessage, onUpgrade }) {
  const [closing, setClosing] = useState(false)

  const handleClose = async () => {
    if (!window.confirm('Isso vai gerar o PDF, enviar para o seu e-mail e zerar os gastos do mês.\n\nDeseja continuar?')) return
    setClosing(true)
    try {
      const res = await reportsAPI.monthlyClose()
      onMessage(res.data.message)
    } catch (err) {
      onMessage(err.response?.data?.error || 'Erro ao fechar o mês.', 'error')
    } finally {
      setClosing(false)
    }
  }

  return (
    <div className="cfg-card r10">
      <div className="cfg-card-head">
        <div className="cfg-ch-ico">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ae2ac" strokeWidth="2" strokeLinecap="round">
            <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/>
            <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/>
          </svg>
        </div>
        <div>
          <div className="cfg-ch-title">
            Fechar o mês
            {!isPro && <span className="cfg-pro-badge">PRO</span>}
          </div>
          <div className="cfg-ch-sub">Gera PDF e envia para seu e-mail</div>
        </div>
      </div>
      <div className="cfg-card-body">
        {!isPro ? (
          <div className="cfg-pro-lock" onClick={() => onUpgrade('O relatório PDF mensal é exclusivo do plano Pro.')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4ae2ac" strokeWidth="1.5" strokeLinecap="round">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
            <div className="cfg-pro-lock-title">Recurso Pro</div>
            <div className="cfg-pro-lock-sub">Gere relatórios PDF mensais e receba por e-mail</div>
          </div>
        ) : (
          <>
            <p className="cfg-close-desc">
              Gera PDF e envia para{' '}
              <strong style={{ color: 'var(--t1)' }}>{user.reportEmail || user.email || 'seu e-mail'}</strong>.
              {' '}Os registros do mês serão zerados.
            </p>
            <button className="cfg-btn-danger" onClick={handleClose} disabled={closing}>
              {closing ? (
                <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Gerando relatório...</>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/>
                    <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/>
                  </svg>
                  Fechar mês e enviar relatório
                </>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
