import { Link } from 'react-router-dom'
import DesktopAuthHero from '../components/auth/DesktopAuthHero.jsx'
import ProtoIcon from '../components/layout/ProtoIcon.jsx'

// Confirme seu e-mail no desktop (design "Nancy Desktop", tela 06). Só a apresentação — o estado e as regras (link com ?token=, código de
// 6 dígitos, reenvio, redirecionamentos) continuam no VerifyEmail, que passa tudo em `ctx`. O design só desenha o passo do código; os
// outros estados (carregando, confirmado, link inválido) usam o mesmo molde com os textos que o app já tinha.
export default function VerifyEmailDesktop({ ctx }) {
  const { status, err, code, onCode, submitting, resendMsg, email, isLoggedIn, handleCodeSubmit, handleResend, goDashboard, goSettings } = ctx
  return (
    <main className="ad-split">
      <DesktopAuthHero variant="form" />
      <section className="ad-panel" aria-labelledby="ad-verify-title">
        <div className="ad-panel-inner">
          <Link to="/" className="ad-back"><ProtoIcon name="back" size={20} />Voltar</Link>
          <h2 id="ad-verify-title" className="ad-form-title">Confirme seu e-mail</h2>
          {status === 'code' && (
            <p className="ad-form-sub">Digite o código de 6 dígitos enviado para {email || 'seu e-mail'}.</p>
          )}

          {status === 'loading' && (
            <div className="ad-wait" role="status"><span className="ad-spin" aria-hidden="true" />Confirmando seu e-mail...</div>
          )}

          {status === 'code' && (
            <form className="ad-form" onSubmit={handleCodeSubmit} noValidate>
              <input
                id="f-code" name="code" type="text" className="ad-input ad-code" aria-label="Código de 6 dígitos"
                inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" placeholder="000000"
                value={code} onChange={onCode} autoFocus
              />
              {err && <span className="ad-error" role="alert">{err}</span>}
              {resendMsg && <span className="ad-ok-msg" role="status">{resendMsg}</span>}
              <button type="submit" className="ad-btn-primary ad-btn--form" disabled={submitting}>
                {submitting ? <span className="auth-spinner" /> : 'Confirmar e-mail'}
              </button>
              <button type="button" className="ad-link-center" onClick={handleResend}>Reenviar código</button>
            </form>
          )}

          {status === 'ok' && (
            <>
              <div className="ad-sent" role="status">
                <ProtoIcon name="check" />
                <span>E-mail confirmado! Sua conta está totalmente ativada. Aproveite o Nancy!</span>
              </div>
              <button type="button" className="ad-btn-primary ad-btn--form" onClick={goDashboard}>
                {isLoggedIn ? 'Ir para o Dashboard' : 'Fazer login'}
              </button>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="ad-sent ad-sent--err" role="alert">
                <ProtoIcon name="x" />
                <span>Link inválido. {err}</span>
              </div>
              <button type="button" className="ad-btn-primary ad-btn--form" onClick={goSettings}>
                {isLoggedIn ? 'Reenviar verificação em Configurações' : 'Fazer login'}
              </button>
            </>
          )}
        </div>
      </section>
    </main>
  )
}
