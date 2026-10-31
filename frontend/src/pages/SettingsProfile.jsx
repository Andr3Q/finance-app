import { useState, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Navbar from '../components/layout/Navbar.jsx'
import { authAPI } from '../services/api.js'
import { useUser, saveUser } from '../hooks/useUser.js'
import { useForcedLightTheme } from '../hooks/useTheme.js'
import { resizeToAvatar, avatarSrc } from '../utils/avatarImage.js'

const BackIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
)

const initialsOf = (name) => (name ? name.trim().split(/\s+/).slice(0, 2).map(n => n[0]).join('').toUpperCase() : '?')
const apiError = (err, fallback) => err?.response?.data?.error || fallback

// Dados pessoais (Nancy 2, tela 25): foto, nome e e-mail. O nome é um campo só (nome completo); o
// e-mail de login continua sendo trocado pelo fluxo seguro de antes (senha + link no endereço novo),
// por isso aparece só para leitura, com "Trocar e-mail" ao lado do selo de verificação.
export default function SettingsProfile() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useUser()
  useForcedLightTheme() // tela desenhada só no claro (design Nancy 2)

  const fileRef = useRef(null)
  const [name,      setName]      = useState(user.name || '')
  const [saving,    setSaving]    = useState(false)
  const [status,    setStatus]    = useState(null)   // { text, ok } — resultado de salvar/foto/reenvio
  const [photoBusy, setPhotoBusy] = useState(false)

  const [emailOpen,   setEmailOpen]   = useState(false)
  const [newEmail,    setNewEmail]    = useState('')
  const [emailPass,   setEmailPass]   = useState('')
  const [emailSaving, setEmailSaving] = useState(false)
  const [resending,   setResending]   = useState(false)

  const flash = (text, ok = true) => {
    setStatus({ text, ok })
    if (ok) setTimeout(() => setStatus(s => (s && s.text === text ? null : s)), 3500)
  }
  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate('/settings'))

  const save = async (e) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed.length < 2 || trimmed.length > 100) { flash('Nome deve ter entre 2 e 100 caracteres.', false); return }
    setSaving(true); setStatus(null)
    try {
      await authAPI.updateProfile({ name: trimmed })
      // usa o `user` vivo (não uma cópia do sessionStorage, que não guarda salário/e-mail de relatório)
      saveUser({ ...user, name: trimmed })
      setName(trimmed)
      flash('Perfil atualizado!')
    } catch (err) {
      flash(apiError(err, 'Erro ao atualizar perfil.'), false)
    } finally {
      setSaving(false)
    }
  }

  const onPickPhoto = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''                           // permite escolher a mesma foto de novo
    if (!file) return
    setPhotoBusy(true); setStatus(null)
    try {
      const image = await resizeToAvatar(file)
      const { data } = await authAPI.updateAvatar(image)
      saveUser({ ...user, avatarUpdatedAt: data?.avatarUpdatedAt || new Date().toISOString() })
      flash('Foto atualizada!')
    } catch (err) {
      if (err?.response) flash(apiError(err, 'Erro ao salvar a foto.'), false)
      else if (err?.message === 'not-image') flash('Escolha uma imagem (JPG, PNG ou WebP).', false)
      else if (err?.message === 'too-big') flash('Essa imagem é grande demais (máximo 12 MB). Escolha outra.', false)
      else flash('Não foi possível usar essa imagem.', false)
    } finally {
      setPhotoBusy(false)
    }
  }

  const removePhoto = async () => {
    setPhotoBusy(true); setStatus(null)
    try {
      await authAPI.removeAvatar()
      saveUser({ ...user, avatarUpdatedAt: null })
      flash('Foto removida.')
    } catch (err) {
      flash(apiError(err, 'Erro ao remover a foto.'), false)
    } finally {
      setPhotoBusy(false)
    }
  }

  const resend = async () => {
    if (resending) return
    setResending(true); setStatus(null)
    try {
      await authAPI.resendVerification()
      flash('E-mail de verificação enviado! Confira sua caixa de entrada.')
    } catch (err) {
      flash(apiError(err, 'Erro ao enviar e-mail. Tente novamente.'), false)
    } finally {
      setResending(false)
    }
  }

  // Troca de e-mail de login: mais sensível que o nome — exige a senha e só vale depois do link
  // enviado ao endereço novo (o campo de e-mail acima é só leitura de propósito).
  const changeEmail = async (e) => {
    e.preventDefault()
    setEmailSaving(true); setStatus(null)
    try {
      await authAPI.changeEmail(newEmail.trim(), emailPass)
      saveUser({ ...user, pendingEmail: newEmail.trim() })
      flash(`Enviamos um link de confirmação para ${newEmail.trim()}. Clique nele para concluir a troca.`)
      setNewEmail(''); setEmailPass(''); setEmailOpen(false)
    } catch (err) {
      flash(apiError(err, 'Erro ao trocar e-mail.'), false)
    } finally {
      setEmailSaving(false)
    }
  }

  const verified = user.emailVerified
  const photo = avatarSrc(user)

  return (
    <>
      <Navbar />
      <div className="pwnav fin-pwnav fade-in">
        <div className="fin-page">
          <header className="fin-hero">
            <button type="button" className="fin-back" onClick={goBack} aria-label="Voltar"><BackIcon /></button>
            <div className="fin-hero-text">
              <h1 className="fin-hero-title">Perfil</h1>
              <p className="fin-hero-sub">Nome, e-mail e verificação</p>
            </div>
          </header>

          <div className="fin-body dp-body">
            <div className="dp-photo">
              <div className={`dp-av${photoBusy ? ' busy' : ''}`} aria-busy={photoBusy}>
                {photo ? <img src={photo} alt="Sua foto de perfil" /> : <span aria-hidden="true">{initialsOf(user.name)}</span>}
              </div>
              <div className="dp-photo-actions">
                <button type="button" className="dp-link" onClick={() => fileRef.current?.click()} disabled={photoBusy}>Alterar foto</button>
                {photo && <button type="button" className="dp-link dp-link-muted" onClick={removePhoto} disabled={photoBusy}>Remover</button>}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="dp-file" aria-label="Escolher foto de perfil" tabIndex={-1} onChange={onPickPhoto} />
            </div>

            <section className="fin-card dp-card">
              <form id="dp-form" onSubmit={save}>
                <label className="dp-lbl" htmlFor="dp-name">Nome</label>
                <input id="dp-name" className="dp-inp" type="text" value={name} maxLength={100} autoComplete="name"
                  onChange={e => { setName(e.target.value); setStatus(null) }} />
              </form>

              <label className="dp-lbl dp-lbl-2" htmlFor="dp-email">E-mail</label>
              <input id="dp-email" className="dp-inp" type="email" value={user.email || ''} readOnly />

              <div className="dp-verify">
                {verified === true && <span className="dp-pill ok">✓ E-mail verificado</span>}
                {verified === false && <span className="dp-pill warn">E-mail não verificado</span>}
                {verified === false && <button type="button" className="dp-link" onClick={resend} disabled={resending}>{resending ? 'Enviando…' : 'Reenviar e-mail'}</button>}
                <button type="button" className="dp-link dp-change" onClick={() => { setEmailOpen(o => !o); setStatus(null) }} aria-expanded={emailOpen}>
                  {emailOpen ? 'Cancelar' : 'Trocar e-mail'}
                </button>
              </div>

              {user.pendingEmail && !emailOpen && (
                <p className="dp-note">Troca pendente para <strong>{user.pendingEmail}</strong>. Confirme pelo link que enviamos para lá.</p>
              )}

              {emailOpen && (
                <form className="dp-email-form" onSubmit={changeEmail}>
                  <label className="dp-lbl" htmlFor="dp-new-email">Novo e-mail</label>
                  <input id="dp-new-email" className="dp-inp" type="email" value={newEmail} placeholder="novo@email.com" required autoFocus
                    onChange={e => setNewEmail(e.target.value)} />
                  <label className="dp-lbl dp-lbl-2" htmlFor="dp-pass">Senha atual (para confirmar)</label>
                  <input id="dp-pass" className="dp-inp" type="password" value={emailPass} placeholder="••••••••" required autoComplete="current-password"
                    onChange={e => setEmailPass(e.target.value)} />
                  <button type="submit" className="dp-secondary" disabled={emailSaving}>{emailSaving ? 'Enviando…' : 'Enviar link de confirmação'}</button>
                </form>
              )}
            </section>

            <button type="submit" form="dp-form" className="fin-btn dp-save" disabled={saving}>{saving ? 'Salvando…' : 'Salvar alterações'}</button>
            {status && <p className={`dp-status ${status.ok ? 'ok' : 'err'}`} role={status.ok ? 'status' : 'alert'}>{status.text}</p>}
          </div>
        </div>
      </div>
    </>
  )
}
