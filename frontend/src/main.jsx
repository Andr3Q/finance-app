import React    from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import App      from './App.jsx'
import ErrorBoundary from './components/ui/ErrorBoundary.jsx'
import { initAnalytics } from './services/analytics.js'
import { hasConsent } from './components/features/CookieBanner.jsx'
import { SPLASH_MIN_MS } from './splashConfig.js'
import { reloadOnceForNewVersion } from './utils/lazyWithReload.js'
import './index.css'

// ── Sentry — rastreamento de erros JavaScript no browser ────────────
// Só inicializa se VITE_SENTRY_DSN estiver configurado (condicional =
// app funciona normalmente sem ele).
// Replay desabilitado por padrão: gravação de sessões levanta questões LGPD.
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn:              import.meta.env.VITE_SENTRY_DSN,
    environment:      import.meta.env.MODE,
    tracesSampleRate: 0.05, // 5% para não estourar quota free (10k/mês)
    integrations:     [Sentry.browserTracingIntegration()],
  })
}

// Vite avisa quando o pré-carregamento de um arquivo de tela falha (aba aberta antes de um deploy): recarrega uma vez pra pegar a versão nova.
window.addEventListener('vite:preloadError', (e) => { if (reloadOnceForNewVersion()) e.preventDefault() })

// Só inicializa analytics se o usuário já deu consentimento (LGPD Art. 5º)
if (hasConsent()) initAnalytics()


ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* Sentry.ErrorBoundary (externo) captura e reporta erros ao Sentry.
        ErrorBoundary (interno) é o fallback visual exibido ao usuário.
        Ordem: Sentry detecta → ErrorBoundary renderiza a tela de erro. */}
    <Sentry.ErrorBoundary>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </Sentry.ErrorBoundary>
  </React.StrictMode>
)

// Remove o splash de abertura (vídeo definido em index.html) depois que o app
// monta. SPLASH_MIN_MS = duração do vídeo, pra ele rodar até o fim mesmo em
// conexões muito rápidas.
const splash = document.getElementById('app-splash')
if (splash) {
  setTimeout(() => {
    splash.classList.add('splash-hide')
    setTimeout(() => splash.remove(), 450) // espera a transição de opacidade (.4s) terminar
  }, SPLASH_MIN_MS)
}
