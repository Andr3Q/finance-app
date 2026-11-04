import SettingsDesktopLayout from '../components/layout/SettingsDesktopLayout.jsx'
import ProtoIcon from '../components/layout/ProtoIcon.jsx'

// Dados pessoais no desktop (design "Nancy Desktop", tela 26): cartão de até 764px com a foto (72px) e "Alterar foto", nome e e-mail lado a lado, o selo do e-mail
// verificado e "Salvar alterações". Só a apresentação — salvar o nome, trocar a foto, reenviar a verificação e o fluxo seguro de trocar o e-mail (senha +
// link no endereço novo) são do SettingsProfile, que passa tudo em `ctx`. O e-mail de login fica só para leitura, com "Trocar e-mail" ao lado do selo.
export default function SettingsProfileDesktop({ ctx }) {
  const { user, photo, initials, photoBusy, fileRef, onPickPhoto, onPickClick, onRemovePhoto, name, setName, onSave, saving, verified, resend, resending, emailOpen, toggleEmail, newEmail, setNewEmail, emailPass, setEmailPass, onChangeEmail, emailSaving, status } = ctx
  return (
    <SettingsDesktopLayout>
      <section className="nsp-card">
        <div className="nsp-photo">
          <span className={`nsp-av${photoBusy ? ' busy' : ''}`} aria-busy={photoBusy}>{photo ? <img src={photo} alt="Sua foto de perfil" /> : <span aria-hidden="true">{initials}</span>}</span>
          <button type="button" className="nsp-outline" onClick={onPickClick} disabled={photoBusy}>Alterar foto</button>
          {photo && <button type="button" className="nsp-link" onClick={onRemovePhoto} disabled={photoBusy}>Remover</button>}
          <input ref={fileRef} type="file" accept="image/*" className="nsp-file" aria-label="Escolher foto de perfil" tabIndex={-1} onChange={onPickPhoto} />
        </div>

        <form id="nsp-form" className="nsp-fields" onSubmit={onSave}>
          <label className="nsp-field"><span>Nome</span><input type="text" value={name} maxLength={100} autoComplete="name" onChange={e => setName(e.target.value)} /></label>
          <label className="nsp-field"><span>E-mail</span><input type="email" value={user.email || ''} readOnly /></label>
        </form>

        <div className="nsp-verify">
          {verified === true && <span className="nsp-pill ok"><ProtoIcon name="check" size={13} />E-mail verificado</span>}
          {verified === false && <span className="nsp-pill warn">E-mail não verificado</span>}
          {verified === false && <button type="button" className="nsp-link" onClick={resend} disabled={resending}>{resending ? 'Enviando…' : 'Reenviar e-mail'}</button>}
          <button type="button" className="nsp-link" onClick={toggleEmail} aria-expanded={emailOpen}>{emailOpen ? 'Cancelar' : 'Trocar e-mail'}</button>
        </div>

        {user.pendingEmail && !emailOpen && <p className="nsp-note">Troca pendente para <strong>{user.pendingEmail}</strong>. Confirme pelo link que enviamos para lá.</p>}

        {emailOpen && (
          <form className="nsp-email" onSubmit={onChangeEmail}>
            <label className="nsp-field"><span>Novo e-mail</span><input id="nsp-new-email" type="email" value={newEmail} placeholder="novo@email.com" required autoFocus onChange={e => setNewEmail(e.target.value)} /></label>
            <label className="nsp-field"><span>Senha atual (para confirmar)</span><input type="password" value={emailPass} placeholder="••••••••" required autoComplete="current-password" onChange={e => setEmailPass(e.target.value)} /></label>
            <button type="submit" className="nsp-outline" disabled={emailSaving}>{emailSaving ? 'Enviando…' : 'Enviar link de confirmação'}</button>
          </form>
        )}

        <button type="submit" form="nsp-form" className="nsp-save" disabled={saving}>{saving ? 'Salvando…' : 'Salvar alterações'}</button>
        {status && <p className={`nsp-status ${status.ok ? 'ok' : 'err'}`} role={status.ok ? 'status' : 'alert'}>{status.text}</p>}
      </section>
    </SettingsDesktopLayout>
  )
}
