import { useState } from 'react'
import { useUser, saveUser } from '../../../hooks/useUser.js'
import { authAPI } from '../../../services/api.js'

export default function TwoFactorCard({ onMessage, onUpgrade }) {
  const user    = useUser()
  const isPro   = user.plan === 'pro' || user.plan === 'elite'
  const enabled = !!user.twoFactorEnabled

  const [modal,    setModal]   = useState(null)  // 'setup' | 'disable'
  const [qrCode,   setQrCode]  = useState('')
  const [manualKey, setManualKey] = useState('')
  const [code,     setCode]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading] = useState(false)
  const [err,      setErr]     = useState('')

  const openSetup = async () => {
    if (!isPro) { onUpgrade('2FA'); return }
    setLoading(true); setErr('')
    try {
      const res = await authAPI.twoFASetup()
      setQrCode(res.data.qrCode)
      setManualKey(res.data.manualKey)
      setCode('')
      setModal('setup')
    } catch (e) {
      onMessage(e.response?.data?.error || 'Erro ao configurar 2FA.', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifySetup = async e => {
    e.preventDefault()
    if (!/^\d{6}$/.test(code)) { setErr('Digite os 6 dígitos.'); return }
    setLoading(true); setErr('')
    try {
      await authAPI.twoFAVerifySetup(code)
      const cur = JSON.parse(sessionStorage.getItem('user') || '{}')
      saveUser({ ...cur, twoFactorEnabled: true })
      setModal(null)
      onMessage('2FA ativado com sucesso!')
    } catch (e) {
      setErr(e.response?.data?.error || 'Código incorreto.')
    } finally {
      setLoading(false)
    }
  }

  const handleDisable = async e => {
    e.preventDefault()
    if (!password) { setErr('Digite sua senha.'); return }
    setLoading(true); setErr('')
    try {
      await authAPI.twoFADisable(password)
      const cur = JSON.parse(sessionStorage.getItem('user') || '{}')
      saveUser({ ...cur, twoFactorEnabled: false })
      setModal(null)
      setPassword('')
      onMessage('2FA desativado.')
    } catch (e) {
      setErr(e.response?.data?.error || 'Senha incorreta.')
    } finally {
      setLoading(false)
    }
  }

  const close = () => { setModal(null); setCode(''); setPassword(''); setErr('') }

  return (
    <>
      <div className="cfg-card r11">
        <div className="cfg-card-head">
          <div className="cfg-ch-ico" style={{ background: enabled ? 'rgba(74,196,110,.1)' : 'rgba(255,255,255,.05)', border: enabled ? '1px solid rgba(74,196,110,.2)' : '1px solid var(--border)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={enabled ? 'var(--green)' : 'var(--t2)'} strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
          </div>
          <div>
            <div className="cfg-ch-title">
              Autenticação em dois fatores
              {enabled && <span className="tfa-badge-on">Ativo</span>}
            </div>
            <div className="cfg-ch-sub">
              {enabled ? 'Sua conta está protegida com 2FA.' : 'Adicione uma camada extra de segurança ao login.'}
            </div>
          </div>
        </div>

        <div className="cfg-card-body">
          {/* Usuário downgraded mas com 2FA ainda ativo — sempre pode desativar */}
          {!isPro && enabled && (
            <div className="tfa-row">
              <span className="tfa-desc" style={{ color: 'var(--orange)', fontSize: 11 }}>
                Seu plano mudou para Grátis. Desative o 2FA ou faça upgrade para continuar usando.
              </span>
              <button className="cfg-btn-danger" onClick={() => { setModal('disable'); setErr('') }} style={{ fontSize: 12, padding: '8px 14px', flexShrink: 0 }}>
                Desativar 2FA
              </button>
            </div>
          )}
          {!isPro && !enabled && (
            <div className="tfa-locked">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
              </svg>
              2FA disponível nos planos Pro e Elite.
              <button className="tfa-upgrade-link" onClick={() => onUpgrade('2FA')}>Fazer upgrade</button>
            </div>
          )}
          {isPro && !enabled && (
            <div className="tfa-row">
              <span className="tfa-desc">Proteja sua conta com Google Authenticator, Authy ou similar.</span>
              <button className="cfg-btn-primary" onClick={openSetup} disabled={loading}>
                {loading ? <span className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} /> : 'Ativar 2FA'}
              </button>
            </div>
          )}
          {isPro && enabled && (
            <div className="tfa-row">
              <span className="tfa-desc">Código solicitado em cada login.</span>
              <button className="cfg-btn-danger" onClick={() => { setModal('disable'); setErr('') }} style={{ fontSize: 12, padding: '8px 14px' }}>
                Desativar 2FA
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal — setup */}
      {modal === 'setup' && (
        <div className="tfa-overlay" onClick={e => { if (e.target === e.currentTarget) close() }}>
          <div className="tfa-modal">
            <div className="tfa-modal-head">
              <span>Ativar 2FA</span>
              <button className="tfa-modal-close" onClick={close}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="tfa-modal-body">
              <p className="tfa-step-label">1. Escaneie o QR code com seu aplicativo autenticador</p>
              {qrCode && <img src={qrCode} alt="QR Code 2FA" className="tfa-qr" />}
              <p className="tfa-manual-label">Ou insira a chave manualmente:</p>
              <div className="tfa-manual-key">{manualKey}</div>
              <p className="tfa-step-label" style={{ marginTop: 20 }}>2. Digite o código de 6 dígitos gerado pelo app</p>
              <form onSubmit={handleVerifySetup}>
                <input
                  className="tfa-code-input"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={e => { setCode(e.target.value.replace(/\D/g,'')); setErr('') }}
                  autoFocus
                />
                {err && <div className="tfa-err">{err}</div>}
                <button type="submit" className="cfg-btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} disabled={loading}>
                  {loading ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : 'Confirmar e ativar'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal — disable */}
      {modal === 'disable' && (
        <div className="tfa-overlay" onClick={e => { if (e.target === e.currentTarget) close() }}>
          <div className="tfa-modal">
            <div className="tfa-modal-head">
              <span>Desativar 2FA</span>
              <button className="tfa-modal-close" onClick={close}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="tfa-modal-body">
              <p className="tfa-step-label">Digite sua senha para confirmar a desativação do 2FA.</p>
              <form onSubmit={handleDisable}>
                <input
                  className="tfa-code-input"
                  type="password"
                  placeholder="Sua senha"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setErr('') }}
                  autoFocus
                />
                {err && <div className="tfa-err">{err}</div>}
                <button type="submit" className="cfg-btn-danger" style={{ width: '100%', marginTop: 12, justifyContent: 'center' }} disabled={loading}>
                  {loading ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : 'Desativar 2FA'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
