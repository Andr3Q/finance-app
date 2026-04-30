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
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '20px'
    }}>
      {/* Orbs decorativos de fundo */}
      <div style={{
        position: 'fixed', top: '10%', left: '15%', width: 400, height: 400,
        background: 'radial-gradient(circle, rgba(0,208,132,0.06) 0%, transparent 70%)',
        borderRadius: '50%', pointerEvents: 'none'
      }} />
      <div style={{
        position: 'fixed', bottom: '10%', right: '10%', width: 500, height: 500,
        background: 'radial-gradient(circle, rgba(79,142,247,0.06) 0%, transparent 70%)',
        borderRadius: '50%', pointerEvents: 'none'
      }} />

      <div style={{ width: '100%', maxWidth: 440 }} className="fade-in">
        {/* Logo */}
        <div className="text-center mb-24">
          <div style={{ fontSize: 48, marginBottom: 12 }}>💸</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#f0f0ff' }}>FinançasPro</h1>
          <p className="text-muted" style={{ marginTop: 6 }}>Controle suas finanças em tempo real</p>
        </div>

        {/* Card do formulário */}
        <div className="card" style={{ padding: 32 }}>
          {/* Tabs Login/Cadastro */}
          <div style={{
            display: 'flex', gap: 4, background: 'rgba(255,255,255,0.04)',
            borderRadius: 12, padding: 4, marginBottom: 28
          }}>
            {['login', 'register'].map(m => (
              <button key={m} onClick={() => { setMode(m); setError('') }} style={{
                flex: 1, padding: '10px', border: 'none', borderRadius: 10,
                cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
                transition: 'all 0.2s',
                background: mode === m ? 'rgba(0,208,132,0.15)' : 'transparent',
                color: mode === m ? 'var(--color-green)' : 'var(--text-secondary)'
              }}>
                {m === 'login' ? '🔑 Entrar' : '✨ Cadastrar'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {mode === 'register' && (
              <div>
                <label className="label">Seu Nome</label>
                <input className="input" name="name" placeholder="André Pereira"
                  value={form.name} onChange={handleChange} required />
              </div>
            )}

            <div>
              <label className="label">E-mail</label>
              <input className="input" name="email" type="email" placeholder="seu@email.com"
                value={form.email} onChange={handleChange} required />
            </div>

            <div>
              <label className="label">Senha</label>
              <input className="input" name="password" type="password" placeholder="••••••••"
                value={form.password} onChange={handleChange} required minLength={6} />
            </div>

            {mode === 'register' && (
              <div>
                <label className="label">Salário Mensal (R$)</label>
                <input className="input" name="salary" type="number" placeholder="3000"
                  value={form.salary} onChange={handleChange} min="0" step="0.01" />
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Pode ser alterado depois nas configurações
                </p>
              </div>
            )}

            {error && (
              <div style={{
                background: 'rgba(255,71,87,0.12)', border: '1px solid rgba(255,71,87,0.3)',
                borderRadius: 10, padding: '12px 16px', color: 'var(--color-red)', fontSize: 14
              }}>
                ⚠️ {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={loading}
              style={{ width: '100%', justifyContent: 'center', marginTop: 8, padding: '14px' }}>
              {loading ? (
                <><span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                Aguarde...</>
              ) : mode === 'login' ? '🚀 Entrar' : '✨ Criar conta'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
