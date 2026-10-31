import { Link } from 'react-router-dom'
import DesktopAuthHero from '../components/auth/DesktopAuthHero.jsx'
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
              <div className="ad-field">
                <label className="ad-label" htmlFor="f-email">E-mail</label>
                <input
                  id="f-email" name="email" type="email" placeholder="voce@email.com"
                  autoComplete="email" inputMode="email"
                  value={form.email} onChange={handleChange}
                  className={`ad-input${fieldErrs.email ? ' err' : ''}`}
                  aria-invalid={fieldErrs.email ? 'true' : undefined}
                />
                {fieldErrs.email && <span className="ad-error">{fieldErrs.email}</span>}
              </div>

              <div className="ad-field">
                <label className="ad-label" htmlFor="f-pass">Senha</label>
                <input
                  id="f-pass" name="password" type="password" placeholder="••••••••"
                  autoComplete="current-password"
                  value={form.password} onChange={handleChange}
                  className={`ad-input${fieldErrs.password ? ' err' : ''}`}
                  aria-invalid={fieldErrs.password ? 'true' : undefined}
                />
                {fieldErrs.password && <span className="ad-error">{fieldErrs.password}</span>}
              </div>

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
