import { Link } from 'react-router-dom'
import DesktopAuthHero from '../components/auth/DesktopAuthHero.jsx'
import AuthFieldDesktop from '../components/auth/AuthFieldDesktop.jsx'
import ProtoIcon from '../components/layout/ProtoIcon.jsx'

// Entrar no desktop (design "Nancy Desktop", tela 03): painel azul à esquerda, formulário à direita. É só a apresentação — o estado
// e as regras (validação, envio, 2FA, redirecionamento) continuam no Login, que passa tudo em `ctx`.
export default function LoginDesktop({ ctx }) {
  const { form, fieldErrs, serverErr, notice, loading, splashGone, handleChange, handleSubmit } = ctx
  return (
    <main className="ad-split">
      <DesktopAuthHero variant="form" />
      <section className="ad-panel" aria-labelledby="ad-login-title">
        <div className="ad-panel-inner">
          <Link to="/" className="ad-back"><ProtoIcon name="back" size={20} />Voltar</Link>
          <h2 id="ad-login-title" className="ad-form-title">Bem-vindo de volta</h2>
          <p className="ad-form-sub">Entre para ver como estão suas finanças.</p>
          {notice && <p className="ad-notice" role="status">{notice}</p>}

          {/* o formulário só entra depois da splash (senão o gerenciador de senhas abre por cima do vídeo) */}
          {splashGone && (
            <form className="ad-form" onSubmit={handleSubmit} noValidate>
              <AuthFieldDesktop
                id="f-email" name="email" type="email" label="E-mail" placeholder="voce@email.com"
                autoComplete="email" inputMode="email" value={form.email} onChange={handleChange} error={fieldErrs.email}
              />
              <AuthFieldDesktop
                id="f-pass" name="password" type="password" label="Senha" placeholder="••••••••"
                autoComplete="current-password" value={form.password} onChange={handleChange} error={fieldErrs.password}
              />

              <Link to="/forgot-password" className="ad-forgot">Esqueci a senha</Link>
              {serverErr && <span className="ad-error" role="alert">{serverErr}</span>}

              <button type="submit" className="ad-btn-primary ad-btn--form" disabled={loading}>
                {loading ? <span className="auth-spinner" /> : 'Entrar'}
              </button>
            </form>
          )}

          <div className="ad-or"><span>ou</span></div>
          <button type="button" className="ad-btn-secondary ad-btn--form" disabled title="Login com Google — em breve">Continuar com Google</button>
          <p className="ad-foot">Não tem conta? <Link to="/register">Criar conta</Link></p>
        </div>
      </section>
    </main>
  )
}
