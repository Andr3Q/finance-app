import { useNavigate, useLocation } from 'react-router-dom'
import Navbar from '../components/layout/Navbar.jsx'
import { useUser } from '../hooks/useUser.js'
import { useForcedLightTheme } from '../hooks/useTheme.js'

const BackIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
)

// Erro 404 (Nancy 2, tela 36). Página pública (qualquer endereço que não existe cai aqui): a barra de navegação só aparece
// logado; o botão leva ao Dashboard (logado) ou à página inicial (visitante), e o "voltar" do cabeçalho desfaz o último passo.
export default function NotFound() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useUser()
  useForcedLightTheme() // tela desenhada só no claro (design Nancy 2)
  const loggedIn = !!user?.id
  const home = loggedIn ? '/dashboard' : '/'

  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate(home))

  return (
    <>
      {loggedIn && <Navbar />}
      <div className={`pwnav fin-pwnav fade-in${loggedIn ? '' : ' lg-public'}`}>
        <div className="fin-page">
          <header className="fin-hero">
            <button type="button" className="fin-back" onClick={goBack} aria-label="Voltar"><BackIcon /></button>
            <div className="fin-hero-text">
              <h1 className="fin-hero-title">Ops!</h1>
              <p className="fin-hero-sub">Erro 404</p>
            </div>
          </header>
          <div className="fin-body nf-body">
            <div className="nf-code" aria-hidden="true">404</div>
            <h2 className="nf-title">Essa página saiu do orçamento.</h2>
            <p className="nf-sub">O link pode estar quebrado ou a página foi removida.</p>
            <button type="button" className="nf-home" onClick={() => navigate(home)}>Voltar ao início</button>
          </div>
        </div>
      </div>
    </>
  )
}
