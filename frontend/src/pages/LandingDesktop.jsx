import { Link } from 'react-router-dom'
import DesktopAuthHero from '../components/auth/DesktopAuthHero.jsx'

// Boas-vindas no desktop (design "Nancy Desktop", tela 02): painel azul à esquerda, "Comece grátis." à direita.
export default function LandingDesktop() {
  return (
    <main className="ad-split">
      <DesktopAuthHero variant="landing" />
      <section className="ad-panel" aria-labelledby="ad-welcome-title">
        <div className="ad-panel-inner">
          <h2 id="ad-welcome-title" className="ad-title">Comece grátis.</h2>
          <p className="ad-sub">Leva menos de 1 minuto. Sem cartão.</p>
          <Link to="/register" className="ad-btn-primary">Criar conta grátis</Link>
          <Link to="/login" className="ad-btn-secondary">Já tenho conta</Link>
          <p className="ad-legal">
            Ao continuar você aceita os <Link to="/termos">Termos</Link> e a <Link to="/privacidade">Política de Privacidade</Link>.
          </p>
        </div>
      </section>
    </main>
  )
}
