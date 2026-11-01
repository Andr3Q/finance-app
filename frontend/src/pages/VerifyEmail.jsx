import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { authAPI } from '../services/api.js'
import { saveUser, useUser } from '../hooks/useUser.js'
import { useIsDesktop } from '../hooks/useIsDesktop.js'
import VerifyEmailDesktop from './VerifyEmailDesktop.jsx'

const IconChevronLeft = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
)
const ErrIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
)
const CheckIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)
const XIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)

// /verify-email é pública (o link pode ser aberto em qualquer navegador,
// sem sessão ativa) — os botões abaixo não podem assumir que o usuário
// está logado NESTE navegador só porque acabou de confirmar o e-mail.
//
// Dois fluxos no mesmo componente: com ?token= na URL (clicou o link do
// e-mail) auto-verifica via useEffect, igual sempre funcionou. Sem token
// (chegou aqui direto, ex. logo após se cadastrar) mostra a tela nova de
// digitar o código de 6 dígitos — esse caminho exige sessão ativa, porque
// o código sozinho não identifica de qual conta é.
export default function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const navigate        = useNavigate()
  const user            = useUser()
  const isLoggedIn      = !!user.id
  const token           = searchParams.get('token')
  const isDesktop       = useIsDesktop() // no desktop a tela tem layout próprio (design "Nancy Desktop"); a lógica é a mesma

  const [status,     setStatus]     = useState(token ? 'loading' : 'code') // 'loading' | 'code' | 'ok' | 'error'
  const [err,        setErr]        = useState('')
  const [code,       setCode]       = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resendMsg,  setResendMsg]  = useState('')

  const goDashboard = () => isLoggedIn
    ? navigate('/dashboard')
    : navigate('/login', { state: { from: { pathname: '/dashboard' } } })
  const goSettings = () => isLoggedIn
    ? navigate('/settings')
    : navigate('/login', { state: { from: { pathname: '/settings' } } })

  const markVerifiedLocally = () => {
    try {
      const cur = JSON.parse(sessionStorage.getItem('user') || '{}')
      if (cur.id) saveUser({ ...cur, emailVerified: true })
    } catch {}
  }

  useEffect(() => {
    if (!token) return
    authAPI.verifyEmail(token)
      .then(() => { markVerifiedLocally(); setStatus('ok') })
      .catch(e => {
        setStatus('error')
        setErr(e.response?.data?.error || 'Link inválido ou expirado.')
      })
  }, [token])

  useEffect(() => {
    if (!token && !isLoggedIn) navigate('/login')
  }, [token, isLoggedIn, navigate])

  const handleCodeSubmit = async e => {
    e.preventDefault()
    if (!/^\d{6}$/.test(code)) { setErr('Digite os 6 dígitos do código.'); return }
    setSubmitting(true); setErr('')
    try {
      await authAPI.verifyEmailCode(code)
      markVerifiedLocally()
      setStatus('ok')
    } catch (e) {
      setErr(e.response?.data?.error || 'Código inválido.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleResend = async () => {
    setErr(''); setResendMsg('')
    try {
      await authAPI.resendVerification()
      setResendMsg('Novo código enviado.')
    } catch (e) {
      setErr(e.response?.data?.error || 'Erro ao reenviar.')
    }
  }

  if (isDesktop) {
    const onCode = e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); if (err) setErr('') }
    return <VerifyEmailDesktop ctx={{ status, err, code, onCode, submitting, resendMsg, email: user.email, isLoggedIn, handleCodeSubmit, handleResend, goDashboard, goSettings }} />
  }

  return (
    <div className="lw-page">
      <div className="auth-card">
        <div className="auth-hero">
          <Link to="/" className="auth-back" aria-label="Voltar">
            <IconChevronLeft />
          </Link>
          <h1 className="auth-title">Confirme seu e-mail</h1>
          {status === 'code' && (
            <p className="auth-subtitle">Digite o código de 6 dígitos enviado para seu e-mail.</p>
          )}
        </div>

        <div className="auth-sheet">
          {status === 'loading' && (
            <div className="auth-loading">
              <div className="auth-loading-spin" />
              <p className="auth-loading-text">Confirmando seu e-mail...</p>
            </div>
          )}

          {status === 'code' && (
            <form onSubmit={handleCodeSubmit} noValidate>
              <div className="auth-field">
                <input
                  id="f-code" name="code" type="text"
                  inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code"
                  placeholder="000000"
                  value={code}
                  onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); if (err) setErr('') }}
                  className="auth-input auth-code-input"
                  autoFocus
                />
              </div>

              {err && <div className="auth-server-err"><ErrIcon />{err}</div>}
              {resendMsg && <div className="auth-resend-msg">{resendMsg}</div>}

              <button type="submit" className="auth-btn-primary" disabled={submitting}>
                {submitting ? <div className="auth-spinner" /> : <span>Confirmar e-mail</span>}
              </button>

              <button type="button" className="auth-link-sm auth-resend-btn" onClick={handleResend}>
                Reenviar código
              </button>
            </form>
          )}

          {status === 'ok' && (
            <div className="auth-sent">
              <div className="auth-sent-ico"><CheckIcon /></div>
              <h3 className="auth-sent-title">E-mail confirmado!</h3>
              <p className="auth-sent-text">Sua conta está totalmente ativada. Aproveite o Nancy!</p>
              <button type="button" className="auth-btn-primary" onClick={goDashboard}>
                {isLoggedIn ? 'Ir para o Dashboard' : 'Fazer login'}
              </button>
            </div>
          )}

          {status === 'error' && (
            <div className="auth-sent">
              <div className="auth-sent-ico err"><XIcon /></div>
              <h3 className="auth-sent-title">Link inválido</h3>
              <p className="auth-sent-text">{err}</p>
              <button type="button" className="auth-btn-primary" onClick={goSettings}>
                {isLoggedIn ? 'Reenviar verificação em Configurações' : 'Fazer login'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
