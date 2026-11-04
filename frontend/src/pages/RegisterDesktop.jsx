import { Link } from 'react-router-dom'
import DesktopAuthHero from '../components/auth/DesktopAuthHero.jsx'
import AuthFieldDesktop from '../components/auth/AuthFieldDesktop.jsx'
import ProtoIcon from '../components/layout/ProtoIcon.jsx'
import { passwordStrength } from '../components/ui/PasswordStrength.jsx'

// Cores da barra de força do design (pwStrength do protótipo) para os 4 níveis do app. O app avalia pelas regras REAIS do servidor
// (8+ caracteres, minúscula, maiúscula e número; o caractere especial é só bônus), então "Forte" = a senha já seria aceita.
const STRENGTH_COLOR = { 1: '#D6334A', 2: '#E8833A', 3: '#C99A1E', 4: '#087A52' }

// Criar conta no desktop (design "Nancy Desktop", tela 04). Só a apresentação — o estado e as regras (validação, envio, termos,
// redirecionamento) continuam no Login, que passa tudo em `ctx`.
export default function RegisterDesktop({ ctx }) {
  const { form, fieldErrs, serverErr, loading, splashGone, termsOk, handleChange, handleTerms, handleSubmit } = ctx
  const strength = passwordStrength(form.password)
  const color = STRENGTH_COLOR[strength.level]

  return (
    <main className="ad-split">
      <DesktopAuthHero variant="form" />
      <section className="ad-panel" aria-labelledby="ad-register-title">
        <div className="ad-panel-inner">
          <Link to="/" className="ad-back"><ProtoIcon name="back" size={20} />Voltar</Link>
          <h2 id="ad-register-title" className="ad-form-title">Crie sua conta</h2>
          <p className="ad-form-sub">Grátis para sempre. Leva menos de 1 minuto.</p>

          {/* o formulário só entra depois da splash (senão o gerenciador de senhas abre por cima do vídeo) */}
          {splashGone && (
            <form className="ad-form" onSubmit={handleSubmit} noValidate>
              <AuthFieldDesktop
                id="f-name" name="name" type="text" label="Nome" placeholder="Como quer ser chamado?"
                autoComplete="name" value={form.name} onChange={handleChange} error={fieldErrs.name}
              />
              <AuthFieldDesktop
                id="f-email" name="email" type="email" label="E-mail" placeholder="voce@email.com"
                autoComplete="email" inputMode="email" value={form.email} onChange={handleChange} error={fieldErrs.email}
              />
              <AuthFieldDesktop
                id="f-pass" name="password" type="password" label="Senha" placeholder="Mínimo 8 caracteres"
                autoComplete="new-password" value={form.password} onChange={handleChange} error={fieldErrs.password}
              />

              <div className="ad-strength">
                <div className="ad-strength-track" aria-hidden="true">
                  <div style={{ width: `${strength.level * 25}%`, background: color }} />
                </div>
                <span className="ad-strength-label" style={{ color }} aria-live="polite">{strength.label}</span>
              </div>

              <label className="ad-terms">
                <input type="checkbox" className="ad-terms-input" checked={termsOk} onChange={handleTerms} />
                <span className="ad-terms-box" aria-hidden="true"><ProtoIcon name="check" /></span>
                <span>
                  Li e aceito os{' '}
                  <Link to="/termos" target="_blank" rel="noopener noreferrer">Termos de Uso</Link>
                  {' '}e a{' '}
                  <Link to="/privacidade" target="_blank" rel="noopener noreferrer">Política de Privacidade</Link>
                </span>
              </label>
              {fieldErrs.terms && <span className="ad-error">{fieldErrs.terms}</span>}

              {serverErr && <span className="ad-error" role="alert">{serverErr}</span>}

              <button type="submit" className="ad-btn-primary ad-btn--form" disabled={loading}>
                {loading ? <span className="auth-spinner" /> : 'Criar conta'}
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  )
}
