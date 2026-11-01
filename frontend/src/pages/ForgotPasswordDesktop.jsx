import { Link } from 'react-router-dom'
import DesktopAuthHero from '../components/auth/DesktopAuthHero.jsx'
import AuthFieldDesktop from '../components/auth/AuthFieldDesktop.jsx'
import ProtoIcon from '../components/layout/ProtoIcon.jsx'

// Esqueci a senha no desktop (design "Nancy Desktop", tela 05). Só a apresentação — o estado e as regras (validação, envio ao servidor)
// continuam no ForgotPassword, que passa tudo em `ctx`. "Voltar" leva ao login (de onde a pessoa veio), como no celular.
export default function ForgotPasswordDesktop({ ctx }) {
  const { email, setEmail, error, loading, sent, handleSubmit } = ctx
  return (
    <main className="ad-split">
      <DesktopAuthHero variant="form" />
      <section className="ad-panel" aria-labelledby="ad-forgot-title">
        <div className="ad-panel-inner">
          <Link to="/login" className="ad-back"><ProtoIcon name="back" size={20} />Voltar</Link>
          <h2 id="ad-forgot-title" className="ad-form-title">Esqueceu a senha?</h2>
          <p className="ad-form-sub">Enviamos um link para você criar uma nova.</p>

          {sent ? (
            <>
              <div className="ad-sent" role="status">
                <ProtoIcon name="mail" />
                <span>E-mail enviado! Confira a caixa de entrada e o spam. O link vale por 1 hora.</span>
              </div>
              <Link to="/login" className="ad-btn-primary ad-btn--form">Voltar para entrar</Link>
            </>
          ) : (
            <form className="ad-form" onSubmit={handleSubmit} noValidate>
              <AuthFieldDesktop
                id="f-email" name="email" type="email" label="E-mail da conta" placeholder="voce@email.com"
                autoComplete="email" inputMode="email" value={email} onChange={setEmail}
              />
              {error && <span className="ad-error" role="alert">{error}</span>}
              <button type="submit" className="ad-btn-primary ad-btn--form" disabled={loading}>
                {loading ? <span className="auth-spinner" /> : 'Enviar link'}
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  )
}
