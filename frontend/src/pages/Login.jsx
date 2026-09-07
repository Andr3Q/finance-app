import { useState, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authAPI } from '../services/api.js'
import { analytics } from '../services/analytics.js'
import { saveUser } from '../hooks/useUser.js'
import PasswordStrength from '../components/ui/PasswordStrength.jsx'

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

const EMAIL_RE    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/

function parseSalary(raw) {
  let s = raw.trim().replace(/R\$\s*/g, '').replace(/\s/g, '')
  // Formato BR (2.000,50): ponto é separador de milhar, vírgula é decimal
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  return parseFloat(s)
}

export default function Login({ isRegister = false }) {
  const navigate = useNavigate()
  const refCode  = useRef(new URLSearchParams(window.location.search).get('ref') || '')
  const [mode,       setMode]       = useState(isRegister ? 'register' : 'login')
  const [loading,    setLoading]    = useState(false)
  const [serverErr,  setServerErr]  = useState('')
  const [fieldErrs,  setFieldErrs]  = useState({})
  const [showPass,        setShowPass]        = useState(false)
  const [showConfirmPass, setShowConfirmPass] = useState(false)
  const [form,            setForm]            = useState({ name: '', email: '', password: '', confirmPassword: '', salary: '' })
  const [termsOk,    setTermsOk]    = useState(false)
  const [twoFA,      setTwoFA]      = useState({ active: false, tempToken: '', code: '', useBackup: false, backupCode: '' })

  const handleChange = e => {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
    if (fieldErrs[name]) setFieldErrs(f => ({ ...f, [name]: '' }))
    if (serverErr) setServerErr('')
  }

  const switchMode = (m) => { setMode(m); setFieldErrs({}); setServerErr('') }

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
      if (form.password !== form.confirmPassword)
        errs.confirmPassword = 'As senhas não coincidem.'
      if (!termsOk) errs.terms = 'Você precisa aceitar os termos para continuar'
      if (form.salary.trim()) {
        const parsed = parseSalary(form.salary)
        if (isNaN(parsed) || parsed <= 0)
          errs.salary = 'Por favor, insira um valor numérico válido para o seu salário.'
      }
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
        : { name: form.name.trim(), email: form.email.trim(), password: form.password, salary: form.salary.trim() ? parseSalary(form.salary) : 0, referralCode: refCode.current || undefined }
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
        sessionStorage.setItem('just_registered', '1')
        analytics.identify(res.data.user.id, { plan: res.data.user.plan })
        analytics.track('user_signed_up')
        analytics.track('trial_started', { plan: res.data.user.plan })
      }
      navigate('/dashboard')
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
      navigate('/dashboard')
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
      navigate('/dashboard')
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
            <img src="/logo-icon.png" alt="Nancy" style={{ width: 32, height: 32 }} />
            <span className="lauth-logo-name">Nancy</span>
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
                  placeholder={mode === 'register' ? 'Mínimo 8 caracteres' : '••••••••'}
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
              {mode === 'register' && <PasswordStrength password={form.password} />}
            </div>

            {/* Confirmar senha — só no cadastro */}
            {mode === 'register' && (
              <div className="lauth-field">
                <div className="lauth-field-hdr">
                  <label className="lauth-field-lbl" htmlFor="f-confirm-pass">Confirme sua senha</label>
                </div>
                <div className="lauth-inp-wrap">
                  <span className="lauth-inp-ico"><LockIcon /></span>
                  <input
                    id="f-confirm-pass" name="confirmPassword"
                    type={showConfirmPass ? 'text' : 'password'}
                    placeholder="Repita a senha"
                    autoComplete="new-password"
                    value={form.confirmPassword}
                    onChange={handleChange}
                    className={`has-eye${fieldErrs.confirmPassword ? ' err' : ''}`}
                  />
                  <button
                    type="button"
                    className="lauth-inp-eye"
                    onClick={() => setShowConfirmPass(v => !v)}
                    aria-label="Mostrar confirmação de senha"
                  >
                    {showConfirmPass ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
                {fieldErrs.confirmPassword && (
                  <div className="lauth-field-err"><ErrIcon /> {fieldErrs.confirmPassword}</div>
                )}
              </div>
            )}

            {/* Salário — só no cadastro */}
            {mode === 'register' && (
              <div className="lauth-field">
                <div className="lauth-field-hdr">
                  <label className="lauth-field-lbl" htmlFor="f-salary">Salário mensal (opcional)</label>
                </div>
                <div className="lauth-inp-wrap">
                  <span className="lauth-inp-ico"><MoneyIcon /></span>
                  <input
                    id="f-salary" name="salary" type="text"
                    placeholder="0,00"
                    inputMode="decimal"
                    autoComplete="off"
                    value={form.salary}
                    onChange={handleChange}
                  />
                </div>
                {fieldErrs.salary
                  ? <div className="lauth-field-err"><ErrIcon /> {fieldErrs.salary}</div>
                  : <div className="lauth-field-hint">Pode ser alterado depois nas configurações</div>
                }
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
              <div style={{ marginTop: 14 }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={termsOk}
                    onChange={e => { setTermsOk(e.target.checked); if (fieldErrs.terms) setFieldErrs(f => ({ ...f, terms: '' })) }}
                    style={{ marginTop: 2, accentColor: 'var(--c)', width: 15, height: 15, flexShrink: 0, cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 13, color: 'var(--t3)', lineHeight: 1.5 }}>
                    Li e aceito os{' '}
                    <Link to="/termos" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--c)', textDecoration: 'none' }}>Termos de Uso</Link>
                    {' '}e a{' '}
                    <Link to="/privacidade" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--c)', textDecoration: 'none' }}>Política de Privacidade</Link>
                  </span>
                </label>
                {fieldErrs.terms && (
                  <div className="lauth-field-err" style={{ marginTop: 6 }}><ErrIcon /> {fieldErrs.terms}</div>
                )}
              </div>
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
