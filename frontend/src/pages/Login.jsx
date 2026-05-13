import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authAPI } from '../services/api.js'

export default function Login({ isRegister = false }) {
  const navigate = useNavigate()
  const [mode,    setMode]    = useState(isRegister ? 'register' : 'login')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [form,    setForm]    = useState({ name: '', email: '', password: '', salary: '' })

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const fn   = mode === 'login' ? authAPI.login : authAPI.register
      const data = mode === 'login'
        ? { email: form.email, password: form.password }
        : { name: form.name, email: form.email, password: form.password, salary: parseFloat(form.salary) || 0 }

      const res = await fn(data)
      localStorage.setItem('token', res.data.token)
      localStorage.setItem('user', JSON.stringify(res.data.user))
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.error || 'Ocorreu um erro. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      {/* Orbs de fundo */}
      <div className="lorba" />
      <div className="lorbb" />

      <div className="lwrap">
        {/* Marca */}
        <div className="lbrand">
          <div className="lmark">
            <svg viewBox="0 0 36 36" fill="none" width="36" height="36">
              <circle cx="18" cy="18" r="15" stroke="#4ac46e" strokeWidth="1" opacity="0.3"/>
              <circle cx="18" cy="18" r="10" stroke="#00b4d8" strokeWidth="0.75" opacity="0.3"/>
              <polyline points="7,26 12,18 17,21 23,13 29,9" stroke="#4ac46e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="29" cy="9" r="2.5" fill="#4ac46e"/>
              <line x1="7" y1="28" x2="29" y2="28" stroke="#4ac46e" strokeWidth="0.75" opacity="0.3"/>
            </svg>
          </div>
          <div className="ltitle"><span>Finanças</span>Pro</div>
          <div className="lsub">Controle suas finanças em tempo real</div>
        </div>

        {/* Card */}
        <div className="lcard">
          {/* Tabs Entrar / Cadastrar */}
          <div className="tabs">
            <div
              className={`tab${mode === 'login' ? ' on' : ''}`}
              onClick={() => { setMode('login'); setError('') }}
            >
              Entrar
            </div>
            <div
              className={`tab${mode === 'register' ? ' on' : ''}`}
              onClick={() => { setMode('register'); setError('') }}
            >
              Cadastrar
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            {mode === 'register' && (
              <div className="fg">
                <label className="lbl">Nome completo</label>
                <input className="inp" name="name" type="text" placeholder="André Pereira"
                  value={form.name} onChange={handleChange} required />
              </div>
            )}

            <div className="fg">
              <label className="lbl">E-mail</label>
              <input className="inp" name="email" type="email" placeholder="seu@email.com"
                value={form.email} onChange={handleChange} required />
            </div>

            <div className="fg">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <label className="lbl" style={{ marginBottom: 0 }}>Senha</label>
                {mode === 'login' && (
                  <Link to="/forgot-password" style={{ fontSize: 12, color: 'var(--c)', textDecoration: 'none', opacity: 0.8 }}>
                    Esqueci minha senha
                  </Link>
                )}
              </div>
              <input className="inp" name="password" type="password" placeholder="••••••••"
                value={form.password} onChange={handleChange} required minLength={6} />
            </div>

            {mode === 'register' && (
              <div className="fg">
                <label className="lbl">Salário Mensal (R$)</label>
                <input className="inp" name="salary" type="number" placeholder="0,00"
                  value={form.salary} onChange={handleChange} min="0" step="0.01" />
                <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
                  Pode ser alterado depois
                </div>
              </div>
            )}

            {error && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: 'rgba(255,71,87,.07)', border: '1px solid rgba(255,71,87,.2)',
                borderRadius: 'var(--rmd)', padding: '11px 14px',
                color: 'var(--red)', fontSize: 13, marginBottom: 14
              }}>
                <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15" style={{ flexShrink: 0 }}>
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn bp"
              disabled={loading}
              style={{ width: '100%', justifyContent: 'center', padding: '13px', marginTop: 4 }}
            >
              {loading ? (
                <>
                  <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                  Aguarde...
                </>
              ) : mode === 'login' ? 'Entrar na conta' : 'Criar conta'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
