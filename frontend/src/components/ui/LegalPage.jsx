import { useNavigate, useLocation } from 'react-router-dom'
import Navbar from '../layout/Navbar.jsx'
import { useUser } from '../../hooks/useUser.js'
import { useForcedLightTheme } from '../../hooks/useTheme.js'

const BackIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
)

// Casca das páginas legais (Termos de Uso, Política de Privacidade — Nancy 2): cabeçalho azul, cartão branco com o texto e
// um rodapé. São páginas públicas (o cadastro abre os Termos numa aba nova), então a barra de navegação só aparece pra quem
// está logado; quem chega de fora volta pra página inicial.
export default function LegalPage({ title, subtitle, footer, children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useUser()
  useForcedLightTheme() // tela desenhada só no claro (design Nancy 2)
  const loggedIn = !!user?.id

  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate(loggedIn ? '/settings' : '/'))

  return (
    <>
      {loggedIn && <Navbar />}
      <div className={`pwnav fin-pwnav fade-in${loggedIn ? '' : ' lg-public'}`}>
        <div className="fin-page">
          <header className="fin-hero">
            <button type="button" className="fin-back" onClick={goBack} aria-label="Voltar"><BackIcon /></button>
            <div className="fin-hero-text">
              <h1 className="fin-hero-title">{title}</h1>
              <p className="fin-hero-sub">{subtitle}</p>
            </div>
          </header>
          <div className="fin-body">
            <article className="fin-card lg-card">{children}</article>
            {footer && <div className="lg-foot">{footer}</div>}
          </div>
        </div>
      </div>
    </>
  )
}
