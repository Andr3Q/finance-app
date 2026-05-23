import { useState } from 'react'
import { authAPI } from '../../../services/api.js'

const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/

export default function ChangePasswordCard({ onMessage }) {
  const [open,    setOpen]    = useState(false)
  const [form,    setForm]    = useState({ current: '', next: '', confirm: '' })
  const [show,    setShow]    = useState({ current: false, next: false })
  const [errs,    setErrs]    = useState({})
  const [loading, setLoading] = useState(false)

  const EyeIcon = ({ on }) => on
    ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
    : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>

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
      setOpen(false)
      onMessage('Senha alterada com sucesso!')
    } catch (err) {
      const msg = err.response?.data?.error || 'Erro ao alterar senha.'
      if (msg.includes('atual')) setErrs({ current: msg })
      else onMessage(msg, 'error')
    } finally {
      setLoading(false)
    }
  }

  const field = (key, label, showKey, placeholder) => (
    <div className="cfg-field">
      <label className="cfg-label">{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          className={`cfg-inp${errs[key] ? ' inp-err' : ''}`}
          type={show[showKey] ? 'text' : 'password'}
          placeholder={placeholder}
          value={form[key]}
          onChange={e => { setForm(f => ({ ...f, [key]: e.target.value })); setErrs(v => ({ ...v, [key]: '' })) }}
          style={{ paddingRight: 40 }}
        />
        <button
          type="button"
          onClick={() => setShow(s => ({ ...s, [showKey]: !s[showKey] }))}
          style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'var(--t3)', padding:4, display:'flex' }}
          tabIndex={-1}
        >
          <EyeIcon on={show[showKey]} />
        </button>
      </div>
      {errs[key] && <div className="cfg-field-err">{errs[key]}</div>}
    </div>
  )

  return (
    <div className="cfg-card">
      <div className="cfg-card-head">
        <div className="cfg-ch-ico">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--t2)" strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <div className="cfg-ch-title">Alterar senha</div>
          <div className="cfg-ch-sub">Recomendamos usar uma senha forte e única.</div>
        </div>
        <button
          className="cfg-btn-secondary"
          onClick={() => { setOpen(o => !o); setErrs({}); setForm({ current: '', next: '', confirm: '' }) }}
          style={{ flexShrink: 0, fontSize: 12, padding: '8px 14px' }}
        >
          {open ? 'Cancelar' : 'Alterar senha'}
        </button>
      </div>

      {open && (
        <div className="cfg-card-body" style={{ marginTop: 16 }}>
          <form onSubmit={handleSubmit} noValidate>
            {field('current', 'Senha atual', 'current', '••••••••')}
            {field('next',    'Nova senha',  'next',    'Mínimo 8 caracteres')}

            <div className="cfg-field">
              <label className="cfg-label">Confirmar nova senha</label>
              <input
                className={`cfg-inp${errs.confirm ? ' inp-err' : ''}`}
                type="password"
                placeholder="Repita a nova senha"
                value={form.confirm}
                onChange={e => { setForm(f => ({ ...f, confirm: e.target.value })); setErrs(v => ({ ...v, confirm: '' })) }}
              />
              {errs.confirm && <div className="cfg-field-err">{errs.confirm}</div>}
            </div>

            <button type="submit" className="cfg-btn-primary" disabled={loading} style={{ marginTop: 4 }}>
              {loading
                ? <span className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} />
                : 'Salvar nova senha'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
