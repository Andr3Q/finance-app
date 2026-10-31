import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Navbar from '../components/layout/Navbar.jsx'
import NancyMark from '../components/ui/NancyMark.jsx'
import { isInstalled, getInstallPrompt, clearInstallPrompt } from '../services/installPrompt.js'
import { useForcedLightTheme } from '../hooks/useTheme.js'

const Svg = ({ size = 18, sw = 1.9, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
)
const BackIcon     = () => <Svg size={17} sw={2.4}><polyline points="15 18 9 12 15 6"/></Svg>
const DownloadIcon = () => <Svg size={17} sw={2}><path d="M12 4v11"/><polyline points="7 11 12 16 17 11"/><line x1="5" y1="20" x2="19" y2="20"/></Svg>

const isIOSDevice = () => {
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua))
}

// Instalar app (Nancy 2, tela 33): os passos aparecem sempre (o print os mostra todos); "Instalar agora" abre a instalação
// do navegador quando ela existe. No iPhone não há instalação automática, então os passos são os do Safari e o botão não aparece.
export default function SettingsInstall() {
  const navigate = useNavigate()
  const location = useLocation()
  useForcedLightTheme() // tela desenhada só no claro (design Nancy 2)
  const [installed, setInstalled] = useState(() => isInstalled())
  const [mode, setMode] = useState('idle') // 'idle' | 'installing' | 'fallback'
  const [ios] = useState(isIOSDevice)

  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate('/settings'))

  const handleInstall = async () => {
    const prompt = getInstallPrompt()
    if (!prompt) { setMode('fallback'); return }
    setMode('installing')
    try {
      prompt.prompt()
      const { outcome } = await prompt.userChoice
      clearInstallPrompt()
      if (outcome === 'accepted') { setInstalled(true); setMode('idle') }
      else setMode('fallback')
    } catch { setMode('fallback') }
  }

  const steps = ios
    ? ['Toque em Compartilhar, na barra do Safari', 'Escolha "Adicionar à Tela de Início"', 'Toque em "Adicionar": pronto, a Nancy abre como um app']
    : ['Toque em Compartilhar ou no menu ⋮ do navegador', 'Escolha "Adicionar à tela inicial"', 'Pronto: a Nancy abre como um app']

  return (
    <>
      <Navbar />
      <div className="pwnav fin-pwnav fade-in">
        <div className="fin-page">
          <header className="fin-hero">
            <button type="button" className="fin-back" onClick={goBack} aria-label="Voltar"><BackIcon /></button>
            <div className="fin-hero-text">
              <h1 className="fin-hero-title">Instalar app</h1>
              <p className="fin-hero-sub">Acesso pela tela inicial</p>
            </div>
          </header>

          <div className="fin-body">
            <section className="ia-hero" aria-label="Nancy na tela inicial">
              <span className="ia-mark"><NancyMark size={48} /></span>
              <div className="ia-hero-text">
                {installed ? (
                  <>
                    <h2 className="ia-title">A Nancy já está instalada</h2>
                    <p className="ia-sub">Abra pelo ícone na tela inicial do seu aparelho.</p>
                  </>
                ) : (
                  <>
                    <h2 className="ia-title">Nancy na sua tela inicial</h2>
                    <p className="ia-sub">Abre como app, sem loja, e ocupa menos de 1 MB.</p>
                  </>
                )}
              </div>
            </section>

            {!installed && (
              <>
                <ol className="fin-card ia-steps" aria-label="Como instalar">
                  {steps.map((text, i) => (
                    <li key={i} className="ia-step">
                      <span className="ia-step-n">{i + 1}</span>
                      <span className="ia-step-text">{text}</span>
                    </li>
                  ))}
                </ol>

                {!ios && (
                  <>
                    <button type="button" className="ia-install" onClick={handleInstall} disabled={mode === 'installing'}>
                      <DownloadIcon />
                      {mode === 'installing' ? 'Instalando…' : 'Instalar agora'}
                    </button>
                    {mode === 'fallback' && (
                      <p className="ia-note" role="status">A instalação automática não abriu neste navegador. Use os passos acima, pelo menu do navegador.</p>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
