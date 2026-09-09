import { useState } from 'react'
import { saveUser } from '../../../hooks/useUser.js'
import { authAPI } from '../../../services/api.js'

export default function ProfileCard({ user }) {
  const nameParts = (user.name || '').split(' ')
  const [firstName,     setFirstName]     = useState(nameParts[0] || '')
  const [lastName,      setLastName]      = useState(nameParts.slice(1).join(' ') || '')
  const [saving,        setSaving]        = useState(false)
  const [profileMsg,    setProfileMsg]    = useState('')
  const [profileErr,    setProfileErr]    = useState('')

  // Troca de e-mail de login: fluxo separado do nome (mais sensível — exige
  // senha e confirmação por e-mail antes de aplicar). Antes disso, esse campo
  // vinha junto do form de nome mas nunca era salvo de verdade: PUT /profile
  // só lia name/reportEmail do corpo, então o e-mail digitado desaparecia no
  // próximo reload sem nenhum aviso.
  const [emailOpen,   setEmailOpen]   = useState(false)
  const [newEmail,    setNewEmail]    = useState('')
  const [emailPass,   setEmailPass]   = useState('')
  const [emailSaving, setEmailSaving] = useState(false)
  const [emailMsg,    setEmailMsg]    = useState('')
  const [emailErr,    setEmailErr]    = useState('')

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setProfileErr('')
    const fullName = [firstName, lastName].filter(Boolean).join(' ')
    try {
      await authAPI.updateProfile({ name: fullName })
      // Usa o `user` vivo (prop), não uma cópia do sessionStorage — este nunca
      // guarda campos sensíveis (salary/reportEmail, ver useUser.js), então
      // reconstruir a partir dele apagava esses campos do estado global toda
      // vez que o Perfil era salvo (podia levar a sobrescrever o salário real
      // com 0 se o usuário salvasse de novo em Finanças sem perceber o sumiço).
      saveUser({ ...user, name: fullName })
      setProfileMsg('Perfil atualizado!')
      setTimeout(() => setProfileMsg(''), 3000)
    } catch (err) {
      setProfileErr(err.response?.data?.error || 'Erro ao atualizar perfil.')
    } finally {
      setSaving(false)
    }
  }

  const handleChangeEmail = async (e) => {
    e.preventDefault()
    setEmailSaving(true)
    setEmailErr('')
    try {
      await authAPI.changeEmail(newEmail.trim(), emailPass)
      saveUser({ ...user, pendingEmail: newEmail.trim() })
      setEmailMsg(`Enviamos um link de confirmação para ${newEmail.trim()}. Clique nele para concluir a troca.`)
      setNewEmail('')
      setEmailPass('')
      setEmailOpen(false)
    } catch (err) {
      setEmailErr(err.response?.data?.error || 'Erro ao trocar e-mail.')
    } finally {
      setEmailSaving(false)
    }
  }

  return (
    <div className="cfg-card r3">
      <div className="cfg-card-head">
        <div className="cfg-ch-ico">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ae2ac" strokeWidth="2" strokeLinecap="round">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
        </div>
        <div>
          <div className="cfg-ch-title">Informações pessoais</div>
          <div className="cfg-ch-sub">Atualize seus dados de perfil</div>
        </div>
      </div>
      <form onSubmit={handleSave} className="cfg-card-body">
        <div className="cfg-grid2">
          <div className="cfg-field">
            <label className="cfg-lbl">Nome</label>
            <input className="cfg-inp" type="text" value={firstName}
              onChange={e => setFirstName(e.target.value)} placeholder="André" />
          </div>
          <div className="cfg-field">
            <label className="cfg-lbl">Sobrenome</label>
            <input className="cfg-inp" type="text" value={lastName}
              onChange={e => setLastName(e.target.value)} placeholder="Pereira" />
          </div>
        </div>
        <div className="cfg-form-footer">
          {profileMsg && <span className="cfg-inline-ok">{profileMsg}</span>}
          {profileErr && <span className="cfg-inline-err">{profileErr}</span>}
          <button type="submit" className="cfg-btn-primary" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
      </form>

      <div className="cfg-card-body" style={{ paddingTop: 0 }}>
        <div className="cfg-field" style={{ marginBottom: emailOpen ? 16 : 0 }}>
          <label className="cfg-lbl">E-mail de login</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input className="cfg-inp" type="email" value={user.email || ''} disabled style={{ opacity: .7 }} />
            <button
              type="button"
              className="cfg-btn-secondary"
              onClick={() => { setEmailOpen(o => !o); setEmailErr(''); setEmailMsg('') }}
              style={{ flexShrink: 0, fontSize: 12, padding: '8px 14px' }}
            >
              {emailOpen ? 'Cancelar' : 'Trocar e-mail'}
            </button>
          </div>
          {user.pendingEmail && !emailOpen && (
            <div className="cfg-inline-ok" style={{ marginTop: 8, display: 'block' }}>
              Troca pendente para <strong>{user.pendingEmail}</strong> — verifique sua caixa de entrada para confirmar.
            </div>
          )}
          {emailMsg && <div className="cfg-inline-ok" style={{ marginTop: 8, display: 'block' }}>{emailMsg}</div>}
        </div>

        {emailOpen && (
          <form onSubmit={handleChangeEmail}>
            <div className="cfg-field">
              <label className="cfg-lbl">Novo e-mail</label>
              <input className="cfg-inp" type="email" value={newEmail}
                onChange={e => setNewEmail(e.target.value)} placeholder="novo@email.com" required autoFocus />
            </div>
            <div className="cfg-field" style={{ marginBottom: 0 }}>
              <label className="cfg-lbl">Senha atual (para confirmar)</label>
              <input className="cfg-inp" type="password" value={emailPass}
                onChange={e => setEmailPass(e.target.value)} placeholder="••••••••" required />
            </div>
            <div className="cfg-form-footer">
              {emailErr && <span className="cfg-inline-err">{emailErr}</span>}
              <button type="submit" className="cfg-btn-primary" disabled={emailSaving}>
                {emailSaving ? 'Enviando…' : 'Enviar link de confirmação'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
