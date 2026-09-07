import { useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { authAPI } from '../services/api.js'

const EyeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
)
const EyeOffIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
)

// Botão de mostrar/ocultar senha posicionado sobre o input — única tela do
// fluxo de autenticação que ainda não tinha isso, apesar de ser a que mais
// se beneficia (usuário digita a senha 2x às cegas pra conferir se bateu).
function PasswordEyeButton({ show, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
      style={{
        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
        background: 'none', border: 'none', padding: 4, cursor: 'pointer',
        color: 'var(--t3)', display: 'flex', alignItems: 'center',
      }}
    >
      {show ? <EyeOffIcon /> : <EyeIcon />}
    </button>
  )
}

export default function ResetPassword() {
  const [searchParams]          = useSearchParams()
  const navigate                = useNavigate()
  const token                   = searchParams.get('token') || ''
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [showPass,     setShowPass]     = useState(false)
  const [showConfirm,  setShowConfirm]  = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [done,      setDone]      = useState(false)
  const [error,     setError]     = useState('')

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    if (password !== confirm) return setError('As senhas não coincidem.')
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password))
      return setError('Mínimo 8 caracteres com letra maiúscula, minúscula e número.')
    setLoading(true)
    try {
      await authAPI.resetPassword(token, password)
      setDone(true)
      setTimeout(() => navigate('/login'), 3000)
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
              <circle cx="18" cy="18" r="15" stroke="#4ae2ac" strokeWidth="1" opacity="0.3"/>
              <circle cx="18" cy="18" r="10" stroke="#00b4d8" strokeWidth="0.75" opacity="0.3"/>
              <polyline points="7,26 12,18 17,21 23,13 29,9" stroke="#4ae2ac" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="29" cy="9" r="2.5" fill="#4ae2ac"/>
            </svg>
          </div>
          <div className="ltitle">Nancy</div>
          <div className="lsub">Redefinir senha</div>
        </div>

        <div className="lcard">
          {!token ? (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <p style={{ fontSize: 14, color: 'var(--red)', marginBottom: 20 }}>
                Link inválido. Solicite um novo link de recuperação.
              </p>
              <Link to="/forgot-password" className="btn bp" style={{ width: '100%', justifyContent: 'center' }}>
                Solicitar novo link
              </Link>
            </div>
          ) : done ? (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(74,226,172,.1)', border: '1px solid rgba(74,226,172,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--c)" strokeWidth="2.5" width="26" height="26">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                </svg>
              </div>
              <h3 style={{ fontFamily: 'var(--fd)', fontSize: 18, color: 'var(--t1)', marginBottom: 10 }}>Senha redefinida!</h3>
              <p style={{ fontSize: 14, color: 'var(--t2)', lineHeight: 1.6, marginBottom: 24 }}>
                Sua nova senha foi salva. Redirecionando para o login...
              </p>
              <Link to="/login" className="btn bg" style={{ width: '100%', justifyContent: 'center' }}>
                Ir para o login
              </Link>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 14, color: 'var(--t2)', marginBottom: 20, lineHeight: 1.6 }}>
                Digite sua nova senha abaixo.
              </p>

              <form onSubmit={handleSubmit}>
                <div className="fg">
                  <label className="lbl">Nova senha</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="inp"
                      type={showPass ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      minLength={8}
                      style={{ paddingRight: 40 }}
                    />
                    <PasswordEyeButton show={showPass} onToggle={() => setShowPass(v => !v)} />
                  </div>
                </div>

                <div className="fg">
                  <label className="lbl">Confirmar nova senha</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="inp"
                      type={showConfirm ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      required
                      minLength={8}
                      style={{ paddingRight: 40 }}
                    />
                    <PasswordEyeButton show={showConfirm} onToggle={() => setShowConfirm(v => !v)} />
                  </div>
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
                  {loading ? <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Salvando...</> : 'Salvar nova senha'}
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
