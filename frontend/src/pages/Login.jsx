import { useState, useRef } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { authAPI } from '../services/api.js'
import { analytics } from '../services/analytics.js'
import { saveUser } from '../hooks/useUser.js'
import PasswordStrength from '../components/ui/PasswordStrength.jsx'

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

const EMAIL_RE    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/

export default function Login({ isRegister = false }) {
  const navigate = useNavigate()
  const location = useLocation()
  // PrivateRoute (App.jsx) manda pra cá com state.from quando o acesso
  // direto a uma rota protegida exige login — sem isso, o usuário sempre
  // caía no /dashboard genérico, perdendo a intenção original (ex: um link
  // de cobrança apontando pra /settings/pagamentos). Só aceita rotas
  // internas (começando com "/") — nunca uma URL externa vinda de state.
  const fromPath = location.state?.from?.pathname
  const redirectTo = (typeof fromPath === 'string' && fromPath.startsWith('/'))
    ? `${fromPath}${location.state.from.search || ''}`
    : '/dashboard'
  const refCode  = useRef(new URLSearchParams(window.location.search).get('ref') || '')
  // Rotas /login e /register montam <Login key=.../> separadas (App.jsx)
  // justamente pra cada uma remontar do zero — então "mode" é fixo pro
  // tempo de vida do componente, não precisa ser state.
  const mode = isRegister ? 'register' : 'login'
  const [loading,    setLoading]    = useState(false)
  const [serverErr,  setServerErr]  = useState('')
  const [fieldErrs,  setFieldErrs]  = useState({})
  const [showPass,   setShowPass]   = useState(false)
  const [form,       setForm]       = useState({ name: '', email: '', password: '' })
  const [termsOk,    setTermsOk]    = useState(false)
  const [twoFA,      setTwoFA]      = useState({ active: false, tempToken: '', code: '', useBackup: false, backupCode: '' })

  const handleChange = e => {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
    if (fieldErrs[name]) setFieldErrs(f => ({ ...f, [name]: '' }))
    if (serverErr) setServerErr('')
  }

  const validate = () => {
    const errs = {}
    if (mode === 'register') {
      const trimmedName = form.name.trim()
      if (!trimmedName)            errs.name = 'Nome obrigatório'
      else if (trimmedName.length < 2) errs.name = 'O nome deve ter pelo menos 2 caracteres.'
    }
    if (!EMAIL_RE.test(form.email.trim())) errs.email = 'E-mail inválido'
    if (mode === 'register') {
      if (!PASSWORD_RE.test(form.password))
        errs.password = 'Mínimo 8 caracteres com letra maiúscula, minúscula e número'
      if (!termsOk) errs.terms = 'Você precisa aceitar os termos para continuar'
    } else {
      if (form.password.length < 8) errs.password = 'Mínimo 8 caracteres'
    }
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
        : { name: form.name.trim(), email: form.email.trim(), password: form.password, salary: 0, referralCode: refCode.current || undefined }
      const res = await fn(data)
      if (res.data.requires2FA) {
        // Merge, não substitui — preserva useBackup/backupCode do estado
        // inicial. Substituir o objeto inteiro deixava esses dois campos
        // undefined, e o input de código de backup virava de "não controlado"
        // pra "controlado" no primeiro keystroke (warning do React).
        setTwoFA(t => ({ ...t, active: true, tempToken: res.data.tempToken, code: '' }))
        return
      }
      saveUser(res.data.user)
      if (mode === 'login') {
        analytics.identify(res.data.user.id, { plan: res.data.user.plan })
        analytics.track('user_logged_in', { plan: res.data.user.plan })
      } else {
        analytics.identify(res.data.user.id, { plan: res.data.user.plan })
        analytics.track('user_signed_up')
        analytics.track('trial_started', { plan: res.data.user.plan })
      }
      navigate(redirectTo)
    } catch (err) {
      setServerErr(err.response?.data?.error || 'Ocorreu um erro. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const handleTwoFA = async e => {
    e.preventDefault()
    if (!/^\d{6}$/.test(twoFA.code)) { setServerErr('Digite os 6 dígitos do seu aplicativo.'); return }
    setLoading(true); setServerErr('')
    try {
      const res = await authAPI.twoFAVerifyLogin(twoFA.tempToken, twoFA.code)
      saveUser(res.data.user)
      analytics.identify(res.data.user.id, { plan: res.data.user.plan })
      analytics.track('user_logged_in', { plan: res.data.user.plan, twoFA: true })
      navigate(redirectTo)
    } catch (err) {
      setServerErr(err.response?.data?.error || 'Código inválido.')
    } finally {
      setLoading(false)
    }
  }

  const handleBackupCode = async e => {
    e.preventDefault()
    const code = twoFA.backupCode.toUpperCase().replace(/[^A-F0-9-]/g, '')
    if (!/^[A-F0-9]{4}-[A-F0-9]{4}$/.test(code)) { setServerErr('Formato inválido. Use XXXX-XXXX.'); return }
    setLoading(true); setServerErr('')
    try {
      const res = await authAPI.twoFAUseBackupCode(twoFA.tempToken, code)
      saveUser(res.data.user)
      analytics.identify(res.data.user.id, { plan: res.data.user.plan })
      analytics.track('user_logged_in', { plan: res.data.user.plan, twoFA: true, backupCode: true })
      navigate(redirectTo)
    } catch (err) {
      setServerErr(err.response?.data?.error || 'Código de recuperação inválido.')
    } finally {
      setLoading(false)
    }
  }

  if (twoFA.active) {
    return (
      <div className="lauth-2fa-screen">
        <div className="lauth-2fa-box">
          <div className="lauth-2fa-ico">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
          </div>
          {!twoFA.useBackup ? (
            <>
              <div className="lauth-box-title" style={{ marginBottom: 6 }}>Verificação em dois fatores</div>
              <div className="lauth-box-sub" style={{ marginBottom: 24 }}>Digite o código de 6 dígitos do seu aplicativo autenticador.</div>
              <form onSubmit={handleTwoFA} noValidate>
                <div className="lauth-field">
                  <div className="lauth-inp-wrap">
                    <input
                      className="lauth-input"
                      type="text"
                      inputMode="numeric"
                      pattern="\d{6}"
                      maxLength={6}
                      placeholder="000 000"
                      value={twoFA.code}
                      onChange={e => { setTwoFA(s => ({ ...s, code: e.target.value.replace(/\D/g,'') })); setServerErr('') }}
                      style={{ textAlign: 'center', fontSize: 22, letterSpacing: '0.3em', fontFamily: 'monospace' }}
                      autoFocus
                    />
                  </div>
                </div>
                {serverErr && <div className="lauth-server-err"><ErrIcon />{serverErr}</div>}
                <button type="submit" className="lauth-btn-sub" disabled={loading} style={{ marginTop: 8 }}>
                  {loading ? <div className="lauth-spinner" /> : <span>Verificar</span>}
                </button>
              </form>
              <button type="button" className="lauth-link" style={{ marginTop: 16, width: '100%', textAlign: 'center', fontSize: 13 }} onClick={() => { setTwoFA(s => ({ ...s, useBackup: true, code: '' })); setServerErr('') }}>
                Não tenho acesso ao app — usar código de recuperação
              </button>
            </>
          ) : (
            <>
              <div className="lauth-box-title" style={{ marginBottom: 6 }}>Código de recuperação</div>
              <div className="lauth-box-sub" style={{ marginBottom: 24 }}>Digite um dos seus códigos de recuperação no formato <strong>XXXX-XXXX</strong>.</div>
              <form onSubmit={handleBackupCode} noValidate>
                <div className="lauth-field">
                  <div className="lauth-inp-wrap">
                    <input
                      className="lauth-input"
                      type="text"
                      maxLength={9}
                      placeholder="ABCD-1234"
                      value={twoFA.backupCode}
                      onChange={e => {
                        let v = e.target.value.toUpperCase().replace(/[^A-F0-9-]/g, '')
                        if (v.length === 4 && !v.includes('-') && twoFA.backupCode.length === 3) v = v + '-'
                        setTwoFA(s => ({ ...s, backupCode: v }))
                        setServerErr('')
                      }}
                      style={{ textAlign: 'center', fontSize: 20, letterSpacing: '0.15em', fontFamily: 'monospace' }}
                      autoFocus
                    />
                  </div>
                </div>
                {serverErr && <div className="lauth-server-err"><ErrIcon />{serverErr}</div>}
                <button type="submit" className="lauth-btn-sub" disabled={loading} style={{ marginTop: 8 }}>
                  {loading ? <div className="lauth-spinner" /> : <span>Entrar com código de recuperação</span>}
                </button>
              </form>
              <button type="button" className="lauth-link" style={{ marginTop: 16, width: '100%', textAlign: 'center', fontSize: 13 }} onClick={() => { setTwoFA(s => ({ ...s, useBackup: false, backupCode: '' })); setServerErr('') }}>
                Voltar para o código do aplicativo
              </button>
            </>
          )}
          <button type="button" className="lauth-link" style={{ marginTop: 8, width: '100%', textAlign: 'center', fontSize: 12, color: 'var(--t3)' }} onClick={() => setTwoFA({ active: false, tempToken: '', code: '', useBackup: false, backupCode: '' })}>
            Voltar ao login
          </button>
        </div>
      </div>
    )
  }

  // Telas 03 (Entrar) e 04 (Criar conta) do Nancy 2 — mesmo invólucro de
  // página da Landing (lw-page). Navegação entre as duas é por rota
  // (/login <-> /register), não mais abas no mesmo formulário.
  if (mode === 'login') {
    return (
      <div className="lw-page">
        <div className="auth-card">
          <div className="auth-hero">
            <Link to="/" className="auth-back" aria-label="Voltar">
              <IconChevronLeft />
            </Link>
            <h1 className="auth-title">Bem-vindo de volta</h1>
            <p className="auth-subtitle">Entre para ver como estão suas finanças.</p>
          </div>

          <div className="auth-sheet">
            <form onSubmit={handleSubmit} noValidate>
              <div className="auth-field">
                <label className="auth-label" htmlFor="f-email">E-mail</label>
                <input
                  id="f-email" name="email" type="email"
                  placeholder="voce@email.com"
                  autoComplete="email" inputMode="email"
                  value={form.email}
                  onChange={handleChange}
                  className={`auth-input${fieldErrs.email ? ' err' : ''}`}
                />
                {fieldErrs.email && <div className="auth-field-err"><ErrIcon /> {fieldErrs.email}</div>}
              </div>

              <div className="auth-field">
                <label className="auth-label" htmlFor="f-pass">Senha</label>
                <div className="auth-pass-wrap">
                  <input
                    id="f-pass" name="password"
                    type={showPass ? 'text' : 'password'}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    value={form.password}
                    onChange={handleChange}
                    className={`auth-input${fieldErrs.password ? ' err' : ''}`}
                  />
                  <button
                    type="button"
                    className="auth-eye"
                    onClick={() => setShowPass(v => !v)}
                    aria-label="Mostrar senha"
                  >
                    {showPass ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
                {fieldErrs.password && <div className="auth-field-err"><ErrIcon /> {fieldErrs.password}</div>}
              </div>

              <div className="auth-forgot-row">
                <Link to="/forgot-password" className="auth-link-sm">Esqueci a senha</Link>
              </div>

              {serverErr && <div className="auth-server-err"><ErrIcon />{serverErr}</div>}

              <button type="submit" className="auth-btn-primary" disabled={loading}>
                {loading ? <div className="auth-spinner" /> : <span>Entrar</span>}
              </button>
            </form>

            <div className="auth-divider"><span>ou</span></div>

            <button
              type="button"
              className="auth-btn-google"
              disabled
              title="Login com Google — em breve"
            >
              Continuar com Google
            </button>

            <p className="auth-foot">Não tem conta? <Link to="/register">Criar conta</Link></p>
          </div>
        </div>
      </div>
    )
  }

  // Tela 04 (Criar conta)
  return (
    <div className="lw-page">
      <div className="auth-card">
        <div className="auth-hero">
          <Link to="/" className="auth-back" aria-label="Voltar">
            <IconChevronLeft />
          </Link>
          <h1 className="auth-title">Crie sua conta</h1>
          <p className="auth-subtitle">Grátis para sempre. Leva menos de 1 minuto.</p>
        </div>

        <div className="auth-sheet">
          <form onSubmit={handleSubmit} noValidate>
            <div className="auth-field">
              <label className="auth-label" htmlFor="f-name">Nome</label>
              <input
                id="f-name" name="name" type="text"
                placeholder="Como quer ser chamado?"
                autoComplete="name"
                value={form.name}
                onChange={handleChange}
                className={`auth-input${fieldErrs.name ? ' err' : ''}`}
              />
              {fieldErrs.name && <div className="auth-field-err"><ErrIcon /> {fieldErrs.name}</div>}
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="f-email">E-mail</label>
              <input
                id="f-email" name="email" type="email"
                placeholder="voce@email.com"
                autoComplete="email" inputMode="email"
                value={form.email}
                onChange={handleChange}
                className={`auth-input${fieldErrs.email ? ' err' : ''}`}
              />
              {fieldErrs.email && <div className="auth-field-err"><ErrIcon /> {fieldErrs.email}</div>}
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="f-pass">Senha</label>
              <div className="auth-pass-wrap">
                <input
                  id="f-pass" name="password"
                  type={showPass ? 'text' : 'password'}
                  placeholder="Mínimo 8 caracteres"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={handleChange}
                  className={`auth-input${fieldErrs.password ? ' err' : ''}`}
                />
                <button
                  type="button"
                  className="auth-eye"
                  onClick={() => setShowPass(v => !v)}
                  aria-label="Mostrar senha"
                >
                  {showPass ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
              {fieldErrs.password && <div className="auth-field-err"><ErrIcon /> {fieldErrs.password}</div>}
              <PasswordStrength password={form.password} />
            </div>

            <label className="auth-terms">
              <input
                type="checkbox"
                checked={termsOk}
                onChange={e => { setTermsOk(e.target.checked); if (fieldErrs.terms) setFieldErrs(f => ({ ...f, terms: '' })) }}
              />
              <span>
                Li e aceito os{' '}
                <Link to="/termos" target="_blank" rel="noopener noreferrer">Termos de Uso</Link>
                {' '}e a{' '}
                <Link to="/privacidade" target="_blank" rel="noopener noreferrer">Política de Privacidade</Link>
              </span>
            </label>
            {fieldErrs.terms && <div className="auth-field-err"><ErrIcon /> {fieldErrs.terms}</div>}

            {serverErr && <div className="auth-server-err"><ErrIcon />{serverErr}</div>}

            <button type="submit" className="auth-btn-primary" disabled={loading}>
              {loading ? <div className="auth-spinner" /> : <span>Criar conta</span>}
            </button>
          </form>

          <p className="auth-foot">Já tem conta? <Link to="/login">Entrar</Link></p>
        </div>
      </div>
    </div>
  )
}
