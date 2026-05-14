import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authAPI } from '../services/api.js'

const EmailIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
    <polyline points="22,6 12,13 2,6"/>
  </svg>
)
const LockIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0110 0v4"/>
  </svg>
)
const UserIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
)
const MoneyIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
  </svg>
)
const ErrIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
)
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function Login({ isRegister = false }) {
  const navigate = useNavigate()
  const [mode,       setMode]       = useState(isRegister ? 'register' : 'login')
  const [loading,    setLoading]    = useState(false)
  const [serverErr,  setServerErr]  = useState('')
  const [fieldErrs,  setFieldErrs]  = useState({})
  const [showPass,   setShowPass]   = useState(false)
  const [form,       setForm]       = useState({ name: '', email: '', password: '', salary: '' })

  const handleChange = e => {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
    if (fieldErrs[name]) setFieldErrs(f => ({ ...f, [name]: '' }))
    if (serverErr) setServerErr('')
  }

  const switchMode = (m) => { setMode(m); setFieldErrs({}); setServerErr('') }

  const validate = () => {
    const errs = {}
    if (mode === 'register' && !form.name.trim()) errs.name = 'Nome obrigatório'
    if (!EMAIL_RE.test(form.email.trim()))         errs.email = 'E-mail inválido'
    if (form.password.length < 6)                  errs.password = 'Mínimo 6 caracteres'
    setFieldErrs(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async e => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    try {
      const fn   = mode === 'login' ? authAPI.login : authAPI.register
      const data = mode === 'login'
        ? { email: form.email.trim(), password: form.password }
        : { name: form.name.trim(), email: form.email.trim(), password: form.password, salary: parseFloat(form.salary) || 0 }
      const res = await fn(data)
      localStorage.setItem('token', res.data.token)
      localStorage.setItem('user', JSON.stringify(res.data.user))
      navigate('/dashboard')
    } catch (err) {
      setServerErr(err.response?.data?.error || 'Ocorreu um erro. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="lauth-split">

      {/* ── Painel esquerdo ── */}
      <div className="lauth-left">
        <div className="lauth-geo" aria-hidden="true">
          <div className="lauth-g-ring lauth-g-r1" />
          <div className="lauth-g-ring lauth-g-r2" />
          <div className="lauth-g-ring lauth-g-r3" />
          <div className="lauth-g-lines" />
        </div>

        <div className="r1">
          <Link to="/" className="lauth-logo">
            <div className="lauth-logo-ico">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <rect x="2"   y="14" width="5" height="8" rx="1.5" fill="#4ac46e" opacity="0.55"/>
                <rect x="9.5" y="9"  width="5" height="13" rx="1.5" fill="#4ac46e" opacity="0.8"/>
                <rect x="17"  y="4"  width="5" height="18" rx="1.5" fill="#4ac46e"/>
              </svg>
            </div>
            <span className="lauth-logo-name">Finanças<em>Pro</em></span>
          </Link>

          <div className="lauth-brand-copy r2">
            <div className="lauth-eyebrow">
              <div className="lauth-eyebrow-line" />
              Bem-vindo de volta
            </div>
            <h1 className="lauth-headline">
              Seu dinheiro<br />
              <em>sob controle.</em>
            </h1>
            <p className="lauth-tagline">
              Registre gastos, acompanhe entradas e receba relatórios mensais em PDF. Simples, rápido e 100% privado.
            </p>
          </div>
        </div>

        <div className="lauth-stats r3">
          <div className="lauth-stat-row">
            <span className="lauth-stat-label">Plano grátis</span>
            <span className="lauth-stat-value">R$ 0</span>
          </div>
          <div className="lauth-stat-row">
            <span className="lauth-stat-label">Privacidade total</span>
            <span className="lauth-stat-value">100%</span>
          </div>
          <div className="lauth-stat-row">
            <span className="lauth-stat-label">Relatório mensal</span>
            <span className="lauth-stat-value">PDF</span>
          </div>
        </div>
      </div>

      {/* ── Painel direito ── */}
      <div className="lauth-right">
        <div className="lauth-form-wrap">

          <div className="lauth-form-head r2">
            <h2 className="lauth-form-title">
              {mode === 'login' ? <>Entre na<br /><span>sua conta</span></> : <>Crie sua<br /><span>conta grátis</span></>}
            </h2>
            <p className="lauth-form-sub">
              {mode === 'login' ? 'Ou crie uma conta gratuitamente' : 'Comece a organizar suas finanças hoje'}
            </p>
          </div>

          {/* Segment tabs */}
          <div className="lauth-segment r3">
            <button
              type="button"
              className={`lauth-seg-btn${mode === 'login' ? ' active' : ''}`}
              onClick={() => switchMode('login')}
            >
              Entrar
            </button>
            <button
              type="button"
              className={`lauth-seg-btn${mode === 'register' ? ' active' : ''}`}
              onClick={() => switchMode('register')}
            >
              Criar conta
            </button>
          </div>

          <form onSubmit={handleSubmit} noValidate>

            {/* Nome — só no cadastro */}
            {mode === 'register' && (
              <div className="lauth-field r4">
                <div className="lauth-field-hdr">
                  <label className="lauth-field-lbl" htmlFor="f-name">Nome completo</label>
                </div>
                <div className="lauth-inp-wrap">
                  <span className="lauth-inp-ico"><UserIcon /></span>
                  <input
                    id="f-name" name="name" type="text"
                    placeholder="André Pereira"
                    autoComplete="name"
                    value={form.name}
                    onChange={handleChange}
                    className={fieldErrs.name ? 'err' : ''}
                  />
                </div>
                {fieldErrs.name && (
                  <div className="lauth-field-err"><ErrIcon /> {fieldErrs.name}</div>
                )}
              </div>
            )}

            {/* E-mail */}
            <div className={`lauth-field${mode === 'register' ? '' : ' r4'}`}>
              <div className="lauth-field-hdr">
                <label className="lauth-field-lbl" htmlFor="f-email">E-mail</label>
              </div>
              <div className="lauth-inp-wrap">
                <span className="lauth-inp-ico"><EmailIcon /></span>
                <input
                  id="f-email" name="email" type="email"
                  placeholder="seu@email.com"
                  autoComplete="email" inputMode="email"
                  value={form.email}
                  onChange={handleChange}
                  className={fieldErrs.email ? 'err' : ''}
                />
              </div>
              {fieldErrs.email && (
                <div className="lauth-field-err"><ErrIcon /> {fieldErrs.email}</div>
              )}
            </div>

            {/* Senha */}
            <div className={`lauth-field${mode === 'register' ? '' : ' r5'}`}>
              <div className="lauth-field-hdr">
                <label className="lauth-field-lbl" htmlFor="f-pass">Senha</label>
                {mode === 'login' && (
                  <Link to="/forgot-password" className="lauth-field-link">Esqueci minha senha</Link>
                )}
              </div>
              <div className="lauth-inp-wrap">
                <span className="lauth-inp-ico"><LockIcon /></span>
                <input
                  id="f-pass" name="password"
                  type={showPass ? 'text' : 'password'}
                  placeholder={mode === 'register' ? 'Mínimo 6 caracteres' : '••••••••'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={form.password}
                  onChange={handleChange}
                  className={`has-eye${fieldErrs.password ? ' err' : ''}`}
                />
                <button
                  type="button"
                  className="lauth-inp-eye"
                  onClick={() => setShowPass(v => !v)}
                  aria-label="Mostrar senha"
                >
                  {showPass ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
              {fieldErrs.password && (
                <div className="lauth-field-err"><ErrIcon /> {fieldErrs.password}</div>
              )}
            </div>

            {/* Salário — só no cadastro */}
            {mode === 'register' && (
              <div className="lauth-field">
                <div className="lauth-field-hdr">
                  <label className="lauth-field-lbl" htmlFor="f-salary">Salário mensal (opcional)</label>
                </div>
                <div className="lauth-inp-wrap">
                  <span className="lauth-inp-ico"><MoneyIcon /></span>
                  <input
                    id="f-salary" name="salary" type="number"
                    placeholder="0,00"
                    min="0" step="0.01"
                    value={form.salary}
                    onChange={handleChange}
                  />
                </div>
                <div className="lauth-field-hint">Pode ser alterado depois nas configurações</div>
              </div>
            )}

            {/* Erro do servidor */}
            {serverErr && (
              <div className="lauth-server-err">
                <ErrIcon />
                {serverErr}
              </div>
            )}

            <button type="submit" className="lauth-btn-sub" disabled={loading}>
              {loading
                ? <div className="lauth-spinner" />
                : <span>{mode === 'login' ? 'Entrar na conta' : 'Criar minha conta grátis'}</span>
              }
            </button>

            {mode === 'register' && (
              <p className="lauth-form-note">
                Ao criar uma conta você concorda com os{' '}
                <a href="/termos">Termos de uso</a> e{' '}
                <a href="/privacidade">Política de privacidade</a>.
              </p>
            )}
          </form>

          <Link to="/" className="lauth-back">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>
            </svg>
            Voltar para a página inicial
          </Link>

        </div>
      </div>
    </div>
  )
}
