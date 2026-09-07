import { useState } from 'react'
import { saveUser } from '../../../hooks/useUser.js'
import { authAPI } from '../../../services/api.js'

export default function ProfileCard({ user }) {
  const nameParts = (user.name || '').split(' ')
  const [firstName,     setFirstName]     = useState(nameParts[0] || '')
  const [lastName,      setLastName]      = useState(nameParts.slice(1).join(' ') || '')
  const [profileEmail,  setProfileEmail]  = useState(user.email || '')
  const [saving,        setSaving]        = useState(false)
  const [profileMsg,    setProfileMsg]    = useState('')
  const [profileErr,    setProfileErr]    = useState('')

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setProfileErr('')
    const fullName = [firstName, lastName].filter(Boolean).join(' ')
    try {
      await authAPI.updateProfile({ name: fullName, email: profileEmail })
      // Usa o `user` vivo (prop), não uma cópia do sessionStorage — este nunca
      // guarda campos sensíveis (salary/reportEmail, ver useUser.js), então
      // reconstruir a partir dele apagava esses campos do estado global toda
      // vez que o Perfil era salvo (podia levar a sobrescrever o salário real
      // com 0 se o usuário salvasse de novo em Finanças sem perceber o sumiço).
      saveUser({ ...user, name: fullName, email: profileEmail })
      setProfileMsg('Perfil atualizado!')
      setTimeout(() => setProfileMsg(''), 3000)
    } catch (err) {
      setProfileErr(err.response?.data?.error || 'Erro ao atualizar perfil.')
    } finally {
      setSaving(false)
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
        <div className="cfg-field" style={{ marginBottom: 0 }}>
          <label className="cfg-lbl">E-mail</label>
          <input className="cfg-inp" type="email" value={profileEmail}
            onChange={e => setProfileEmail(e.target.value)} placeholder="seu@email.com" />
        </div>
        <div className="cfg-form-footer">
          {profileMsg && <span className="cfg-inline-ok">{profileMsg}</span>}
          {profileErr && <span className="cfg-inline-err">{profileErr}</span>}
          <button type="submit" className="cfg-btn-primary" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
      </form>
    </div>
  )
}
