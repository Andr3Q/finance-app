import { useState } from 'react'
import { Link } from 'react-router-dom'
import { authAPI } from '../services/api.js'

export default function ForgotPassword() {
  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [sent,    setSent]    = useState(false)
  const [error,   setError]   = useState('')

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await authAPI.forgotPassword(email)
      setSent(true)
    } catch (err) {
      setError(err.response?.data?.error || 'Ocorreu um erro. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div className="lorba" />
      <div className="lorbb" />

      <div className="lwrap">
        <div className="lbrand">
          <div className="lmark">
            <svg viewBox="0 0 36 36" fill="none" width="36" height="36">
              <circle cx="18" cy="18" r="15" stroke="#00ffcc" strokeWidth="1" opacity="0.3"/>
              <circle cx="18" cy="18" r="10" stroke="#00b4d8" strokeWidth="0.75" opacity="0.3"/>
              <polyline points="7,26 12,18 17,21 23,13 29,9" stroke="#00ffcc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="29" cy="9" r="2.5" fill="#00ffcc"/>
            </svg>
          </div>
          <div className="ltitle"><span>Finanças</span>Pro</div>
          <div className="lsub">Recuperação de senha</div>
        </div>

        <div className="lcard">
          {sent ? (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(0,255,204,.1)', border: '1px solid rgba(0,255,204,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--c)" strokeWidth="2" width="26" height="26">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                </svg>
              </div>
              <h3 style={{ fontFamily: 'var(--fd)', fontSize: 18, color: 'var(--t1)', marginBottom: 10 }}>E-mail enviado!</h3>
              <p style={{ fontSize: 14, color: 'var(--t2)', lineHeight: 1.6, marginBottom: 24 }}>
                Se este e-mail estiver cadastrado, você receberá um link para redefinir sua senha. Verifique sua caixa de entrada.
              </p>
              <Link to="/login" className="btn bg" style={{ width: '100%', justifyContent: 'center' }}>
                Voltar ao login
              </Link>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 14, color: 'var(--t2)', marginBottom: 20, lineHeight: 1.6 }}>
                Digite seu e-mail e enviaremos um link para você criar uma nova senha.
              </p>

              <form onSubmit={handleSubmit}>
                <div className="fg">
                  <label className="lbl">E-mail</label>
                  <input
                    className="inp"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                  />
                </div>

                {error && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,71,87,.07)', border: '1px solid rgba(255,71,87,.2)', borderRadius: 'var(--rmd)', padding: '11px 14px', color: 'var(--red)', fontSize: 13, marginBottom: 14 }}>
                    <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15" style={{ flexShrink: 0 }}>
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                    </svg>
                    {error}
                  </div>
                )}

                <button type="submit" className="btn bp" disabled={loading}
                  style={{ width: '100%', justifyContent: 'center', padding: '13px', marginBottom: 14 }}>
                  {loading ? <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Enviando...</> : 'Enviar link de recuperação'}
                </button>

                <Link to="/login" style={{ display: 'block', textAlign: 'center', fontSize: 13, color: 'var(--t2)', textDecoration: 'none' }}>
                  ← Voltar ao login
                </Link>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
