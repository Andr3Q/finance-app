import { useState } from 'react'
import { useUser } from '../../../hooks/useUser.js'
import { authAPI } from '../../../services/api.js'

export default function EmailVerifyCard({ onMessage }) {
  const user = useUser()
  const [sent,    setSent]    = useState(false)
  const [loading, setLoading] = useState(false)

  if (!user.id || user.emailVerified) return null

  const handleResend = async () => {
    if (loading || sent) return
    setLoading(true)
    try {
      await authAPI.resendVerification()
      setSent(true)
      onMessage('E-mail de verificação enviado! Verifique sua caixa de entrada.')
    } catch {
      onMessage('Erro ao enviar e-mail. Tente novamente.', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="cfg-card" style={{ borderColor: 'rgba(79,142,247,.3)', background: 'rgba(79,142,247,.05)' }}>
      <div className="cfg-card-head">
        <div className="cfg-ch-ico" style={{ background: 'rgba(79,142,247,.12)', border: '1px solid rgba(79,142,247,.25)' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4f8ef7" strokeWidth="2" strokeLinecap="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
        </div>
        <div>
          <div className="cfg-ch-title">
            Verificar e-mail
            <span style={{
              fontSize: 10, fontWeight: 700, background: 'rgba(79,142,247,.15)',
              color: '#4f8ef7', border: '1px solid rgba(79,142,247,.3)',
              borderRadius: 6, padding: '2px 7px', letterSpacing: '.04em',
            }}>
              PENDENTE
            </span>
          </div>
          <div className="cfg-ch-sub">Confirme seu e-mail para ativar sua conta completamente.</div>
        </div>
      </div>
      <div className="cfg-card-body" style={{ paddingTop: 0 }}>
        {sent ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 14px', borderRadius: 10,
            background: 'rgba(74,196,110,.08)', border: '1px solid rgba(74,196,110,.2)',
            fontSize: 13, color: '#4ac46e',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            E-mail enviado! Verifique sua caixa de entrada.
          </div>
        ) : (
          <button
            onClick={handleResend}
            disabled={loading}
            style={{
              width: '100%', padding: '10px 0', borderRadius: 10,
              border: 'none', background: '#4f8ef7', color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1, fontFamily: 'inherit',
            }}
          >
            {loading ? 'Enviando…' : 'Reenviar e-mail de verificação'}
          </button>
        )}
      </div>
    </div>
  )
}
