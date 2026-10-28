import { useState } from 'react'
import { authAPI } from '../../../services/api.js'
import { passwordStrength } from '../../ui/PasswordStrength.jsx'

const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/

const LockGlyph = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
  </svg>
)
const EyeIcon = ({ off }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {off
      ? <><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>
      : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}
  </svg>
)

// Alterar senha (Nancy 2, tela 26): o formulário já vem aberto, com a barra de força entre "Nova senha"
// e a confirmação. As regras são as de sempre (8+ com maiúscula, minúscula e número) e a troca exige a
// senha atual. O olho de mostrar/ocultar só aparece depois que o campo tem texto.
export default function ChangePasswordCard({ onMessage }) {
  const [form,    setForm]    = useState({ current: '', next: '', confirm: '' })
  const [show,    setShow]    = useState({ current: false, next: false, confirm: false })
  const [errs,    setErrs]    = useState({})
  const [loading, setLoading] = useState(false)

  const strength = passwordStrength(form.next)

  const validate = () => {
    const e = {}
    if (!form.current)                         e.current = 'Informe a senha atual.'
    if (!PASSWORD_RE.test(form.next))          e.next    = 'Mínimo 8 caracteres com maiúscula, minúscula e número.'
    if (form.next !== form.confirm)            e.confirm = 'As senhas não coincidem.'
    if (form.current && form.current === form.next) e.next = 'A nova senha não pode ser igual à atual.'
    setErrs(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async e => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    try {
      await authAPI.changePassword(form.current, form.next)
      setForm({ current: '', next: '', confirm: '' })
      setShow({ current: false, next: false, confirm: false })
      onMessage('Senha alterada com sucesso!')
    } catch (err) {
      const msg = err.response?.data?.error || 'Erro ao alterar senha.'
      if (msg.includes('atual')) setErrs({ current: msg })
      else onMessage(msg, 'error')
    } finally {
      setLoading(false)
    }
  }

  const field = (key, placeholder, autoComplete) => (
    <div className="sc-field">
      <div className="sc-inp-wrap">
        <input
          className={`sc-inp${errs[key] ? ' err' : ''}`}
          type={show[key] ? 'text' : 'password'}
          placeholder={placeholder}
          aria-label={placeholder}
          autoComplete={autoComplete}
          value={form[key]}
          onChange={e => { setForm(f => ({ ...f, [key]: e.target.value })); setErrs(v => ({ ...v, [key]: '' })) }}
        />
        {form[key] && (
          <button type="button" className="sc-eye" onClick={() => setShow(s => ({ ...s, [key]: !s[key] }))}
            aria-label={show[key] ? `Ocultar ${placeholder.toLowerCase()}` : `Mostrar ${placeholder.toLowerCase()}`}>
            <EyeIcon off={show[key]} />
          </button>
        )}
      </div>
      {errs[key] && <div className="sc-err" role="alert">{errs[key]}</div>}
    </div>
  )

  return (
    <section className="fin-card sc-card" aria-label="Alterar senha">
      <div className="fin-head">
        <span className="fin-ico"><LockGlyph /></span>
        <div className="fin-head-text">
          <h2 className="sc-title">Alterar senha</h2>
          <p className="sc-sub">Use 8+ caracteres com maiúscula, minúscula e número</p>
        </div>
      </div>

      <form className="sc-form" onSubmit={handleSubmit} noValidate>
        {field('current', 'Senha atual', 'current-password')}
        {field('next', 'Nova senha', 'new-password')}
        <div className="sc-meter" role="progressbar" aria-label="Força da nova senha" aria-valuemin={0} aria-valuemax={4} aria-valuenow={strength.level}
          aria-valuetext={strength.label || 'Digite a nova senha'}>
          <span className="sc-meter-fill" style={{ width: `${strength.level * 25}%`, background: strength.color }} />
        </div>
        {strength.level > 0 && <div className="sc-meter-label" style={{ color: strength.color }}>{strength.label}</div>}
        {field('confirm', 'Confirmar nova senha', 'new-password')}
        <button type="submit" className="fin-btn sc-btn" disabled={loading}>
          {loading ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : 'Atualizar senha'}
        </button>
      </form>
    </section>
  )
}
