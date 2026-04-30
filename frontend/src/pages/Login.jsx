// ═══════════════════════════════════════════════════════
// 🔑 src/pages/Login.jsx — Tela de Login e Cadastro
// ═══════════════════════════════════════════════════════

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
    <div id="s-login" className="screen show">
      <div className="lorba"></div>
      <div className="lorbb"></div>

      <div className="lwrap">
        <div className="lbrand">
          <div className="lmark">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width: 32, height: 32, color: 'var(--c)'}}>
              <rect x="2" y="6" width="20" height="12" rx="2"></rect>
              <circle cx="12" cy="12" r="2"></circle>
              <path d="M6 12h.01M18 12h.01"></path>
            </svg>
          </div>
          <h1 className="ltitle">Finanças<span>Pro</span></h1>
          <p className="lsub">Controle suas finanças em tempo real</p>
        </div>

        <div className="lcard">
          <div className="tabs">
            {['login', 'register'].map(m => (
              <div 
                key={m} 
                className={`tab ${mode === m ? 'on' : ''}`}
                onClick={() => { setMode(m); setError('') }}
              >
                {m === 'login' ? '🔑 Entrar' : '✨ Cadastrar'}
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit}>
            {mode === 'register' && (
              <div className="fg">
                <label className="lbl">Seu Nome</label>
                <input className="inp" name="name" placeholder="André Pereira"
                  value={form.name} onChange={handleChange} required />
              </div>
            )}

            <div className="fg">
              <label className="lbl">E-mail</label>
              <input className="inp" name="email" type="email" placeholder="seu@email.com"
                value={form.email} onChange={handleChange} required />
            </div>

            <div className="fg">
              <label className="lbl">Senha</label>
              <input className="inp" name="password" type="password" placeholder="••••••••"
                value={form.password} onChange={handleChange} required minLength={6} />
            </div>

            {mode === 'register' && (
              <div className="fg">
                <label className="lbl">Salário Mensal (R$)</label>
                <input className="inp" name="salary" type="number" placeholder="3000"
                  value={form.salary} onChange={handleChange} min="0" step="0.01" />
                <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
                  Pode ser alterado depois nas configurações
                </p>
              </div>
            )}

            {error && (
              <div style={{
                background: 'rgba(255,71,87,0.12)', border: '1px solid rgba(255,71,87,0.3)',
                borderRadius: 10, padding: '12px 16px', color: 'var(--red)', fontSize: 14, marginBottom: 16
              }}>
                ⚠️ {error}
              </div>
            )}

            <button type="submit" className="btn bp fxc" disabled={loading} style={{width: '100%'}}>
              {loading ? 'Aguarde...' : mode === 'login' ? '🚀 Entrar' : '✨ Criar conta'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
