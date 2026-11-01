import { useState } from 'react'
import { Link } from 'react-router-dom'
import { authAPI } from '../services/api.js'
import { useIsDesktop } from '../hooks/useIsDesktop.js'
import ForgotPasswordDesktop from './ForgotPasswordDesktop.jsx'

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
const MailIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
  </svg>
)

export default function ForgotPassword() {
  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [sent,    setSent]    = useState(false)
  const [error,   setError]   = useState('')
  const isDesktop = useIsDesktop() // no desktop a tela tem layout próprio (design "Nancy Desktop"); a lógica é a mesma

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    // Valida aqui, como no login e no cadastro: o servidor limita a 3 pedidos por hora e não vale gastar um com campo vazio.
    if (!email.trim()) { setError('Informe o e-mail da sua conta.'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('E-mail inválido.'); return }
    setLoading(true)
    try {
      await authAPI.forgotPassword(email.trim())
      setSent(true)
    } catch (err) {
      setError(err.response?.data?.error || 'Ocorreu um erro. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  if (isDesktop) {
    const onEmail = e => { setEmail(e.target.value); if (error) setError('') }
    return <ForgotPasswordDesktop ctx={{ email, setEmail: onEmail, error, loading, sent, handleSubmit }} />
  }

  return (
    <div className="lw-page">
      <div className="auth-card">
        <div className="auth-hero">
          <Link to="/login" className="auth-back" aria-label="Voltar">
            <IconChevronLeft />
          </Link>
          <h1 className="auth-title">Esqueceu a senha?</h1>
          <p className="auth-subtitle">Enviaremos um link para você criar uma nova.</p>
        </div>

        <div className="auth-sheet">
          {sent ? (
            <div className="auth-sent">
              <div className="auth-sent-ico"><MailIcon /></div>
              <h3 className="auth-sent-title">E-mail enviado!</h3>
              <p className="auth-sent-text">
                Se este e-mail estiver cadastrado, você vai receber um link para criar uma nova senha. Verifique sua caixa de entrada.
              </p>
              <Link to="/login" className="auth-btn-primary">Voltar ao login</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <div className="auth-field">
                <label className="auth-label" htmlFor="f-email">E-mail da conta</label>
                <input
                  id="f-email" name="email" type="email"
                  placeholder="voce@email.com"
                  autoComplete="email" inputMode="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); if (error) setError('') }}
                  className="auth-input"
                  required
                />
              </div>

              {error && <div className="auth-server-err"><ErrIcon />{error}</div>}

              <button type="submit" className="auth-btn-primary" disabled={loading}>
                {loading ? <div className="auth-spinner" /> : <span>Enviar link</span>}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
