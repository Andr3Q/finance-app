import { useState, useEffect } from 'react'
import { useUser, saveUser } from '../../../hooks/useUser.js'
import { authAPI } from '../../../services/api.js'

function BackupCodesModal({ codes, onClose }) {
  const [copied,    setCopied]    = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  const copyAll = () => {
    const text = codes.join('\n')
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
    } else {
      const ta = document.createElement('textarea')
      ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta)
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="tfa-overlay">
      <div className="tfa-modal" style={{ maxWidth: 420 }}>
        <div className="tfa-modal-head">
          <span>Códigos de recuperação</span>
        </div>
        <div className="tfa-modal-body">
          <div className="tfa-backup-notice">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--orange)" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            Salve estes códigos em lugar seguro. Eles só aparecem <strong>uma vez</strong> e servem para acessar sua conta se perder o aplicativo.
          </div>
          <div className="tfa-backup-grid">
            {codes.map((c, i) => (
              <div key={i} className="tfa-backup-code">{c}</div>
            ))}
          </div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '16px 0 12px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={e => setConfirmed(e.target.checked)}
              style={{ accentColor: 'var(--cp)', width: 15, height: 15, flexShrink: 0, marginTop: 2 }}
            />
            <span style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.5 }}>
              Já anotei meus códigos de recuperação em lugar seguro.
            </span>
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="cfg-btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={copyAll}>
              {copied ? '✓ Copiado!' : 'Copiar todos'}
            </button>
            <button
              className="cfg-btn-primary"
              style={{ flex: 1, justifyContent: 'center', opacity: confirmed ? 1 : 0.45, cursor: confirmed ? 'pointer' : 'not-allowed' }}
              onClick={confirmed ? onClose : undefined}
              disabled={!confirmed}
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function TwoFactorCard({ onMessage, onUpgrade }) {
  const user    = useUser()
  const isPro   = user.plan === 'pro' || user.plan === 'elite'
  const enabled = !!user.twoFactorEnabled

  const [modal,       setModal]      = useState(null)  // 'setup' | 'disable' | 'regenerate'
  const [qrCode,      setQrCode]     = useState('')
  const [manualKey,   setManualKey]  = useState('')
  const [code,        setCode]       = useState('')
  const [password,    setPassword]   = useState('')
  const [loading,     setLoading]    = useState(false)
  const [err,         setErr]        = useState('')
  const [backupCodes, setBackupCodes] = useState(null)   // string[] — mostrado uma vez
  const [codesCount,  setCodesCount]  = useState(null)   // number

  useEffect(() => {
    if (enabled) {
      authAPI.twoFABackupCodesCount().then(r => setCodesCount(r.data.count)).catch(() => {})
    }
  }, [enabled])

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
      const res = await authAPI.twoFAVerifySetup(code)
      // Usa o `user` vivo do hook, não uma cópia do sessionStorage — este
      // nunca guarda campos sensíveis (salary/reportEmail), então reconstruir
      // a partir dele apagava esses campos do estado global a cada troca de
      // 2FA (ver mesmo fix em ProfileCard.jsx).
      saveUser({ ...user, twoFactorEnabled: true })
      setModal(null)
      setCodesCount(res.data.backupCodes?.length || 10)
      setBackupCodes(res.data.backupCodes || null)
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
      saveUser({ ...user, twoFactorEnabled: false })
      setModal(null)
      setPassword('')
      setCodesCount(null)
      onMessage('2FA desativado.')
    } catch (e) {
      setErr(e.response?.data?.error || 'Senha incorreta.')
    } finally {
      setLoading(false)
    }
  }

  const handleRegenerate = async e => {
    e.preventDefault()
    if (!password) { setErr('Digite sua senha.'); return }
    setLoading(true); setErr('')
    try {
      const res = await authAPI.twoFARegenerateCodes(password)
      setModal(null)
      setPassword('')
      setCodesCount(res.data.backupCodes?.length || 10)
      setBackupCodes(res.data.backupCodes || null)
      onMessage('Novos códigos de recuperação gerados.')
    } catch (e) {
      setErr(e.response?.data?.error || 'Senha incorreta.')
    } finally {
      setLoading(false)
    }
  }

  const close = () => { setModal(null); setCode(''); setPassword(''); setErr('') }

  return (
    <>
      {backupCodes && <BackupCodesModal codes={backupCodes} onClose={() => setBackupCodes(null)} />}

      <div className="cfg-card r11">
        <div className="cfg-card-head">
          <div className="cfg-ch-ico" style={{ background: enabled ? 'rgba(74,226,172,.1)' : 'rgba(255,255,255,.05)', border: enabled ? '1px solid rgba(74,226,172,.2)' : '1px solid var(--border)' }}>
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
            <>
              <div className="tfa-row">
                <div>
                  <span className="tfa-desc">Código solicitado em cada login.</span>
                  {codesCount !== null && (
                    <div className="tfa-backup-count" style={{ color: codesCount <= 2 ? 'var(--red)' : 'var(--t3)' }}>
                      {codesCount === 0
                        ? '⚠ Sem códigos de recuperação disponíveis'
                        : `${codesCount} código${codesCount === 1 ? '' : 's'} de recuperação disponíve${codesCount === 1 ? 'l' : 'is'}`}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button className="cfg-btn-secondary" onClick={() => { setModal('regenerate'); setErr(''); setPassword('') }} style={{ fontSize: 12, padding: '8px 12px' }}>
                    Regenerar códigos
                  </button>
                  <button className="cfg-btn-danger" onClick={() => { setModal('disable'); setErr('') }} style={{ fontSize: 12, padding: '8px 14px' }}>
                    Desativar 2FA
                  </button>
                </div>
              </div>
            </>
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
                  autoComplete="current-password"
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

      {/* Modal — regenerate backup codes */}
      {modal === 'regenerate' && (
        <div className="tfa-overlay" onClick={e => { if (e.target === e.currentTarget) close() }}>
          <div className="tfa-modal">
            <div className="tfa-modal-head">
              <span>Regenerar códigos de recuperação</span>
              <button className="tfa-modal-close" onClick={close}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="tfa-modal-body">
              <p className="tfa-step-label">Os códigos anteriores serão invalidados. Digite sua senha para confirmar.</p>
              <form onSubmit={handleRegenerate}>
                <input
                  className="tfa-code-input"
                  type="password"
                  placeholder="Sua senha"
                  autoComplete="current-password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setErr('') }}
                  autoFocus
                />
                {err && <div className="tfa-err">{err}</div>}
                <button type="submit" className="cfg-btn-primary" style={{ width: '100%', marginTop: 12, justifyContent: 'center' }} disabled={loading}>
                  {loading ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : 'Gerar novos códigos'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
