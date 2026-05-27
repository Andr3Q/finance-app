import React    from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import App      from './App.jsx'
import ErrorBoundary from './components/ui/ErrorBoundary.jsx'
import { initAnalytics } from './services/analytics.js'
import { hasConsent } from './components/features/CookieBanner.jsx'
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

// Só inicializa analytics se o usuário já deu consentimento (LGPD Art. 5º)
if (hasConsent()) initAnalytics()

// ── Captura de erros do frontend → monitor in-house ─────────────────
// Registra erros JavaScript não tratados no monitor próprio.
// Só ativo em produção — evita poluir logs em desenvolvimento.
if (import.meta.env.PROD) {
  const reportError = (data) => {
    fetch('/api/monitor/client-error', {
      method:    'POST',
      headers:   { 'Content-Type': 'application/json' },
      body:      JSON.stringify(data),
      keepalive: true, // garante envio mesmo durante navegação/fechamento da página
    }).catch(() => {})
  }

  window.addEventListener('error', (e) => {
    reportError({
      message:  e.message,
      stack:    e.error?.stack,
      filename: e.filename,
      line:     e.lineno,
      col:      e.colno,
      url:      location.pathname,
    })
  })

  window.addEventListener('unhandledrejection', (e) => {
    reportError({
      message: `Unhandled Promise: ${String(e.reason ?? 'unknown')}`,
      stack:   e.reason?.stack ?? null,
      url:     location.pathname,
    })
  })
}

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
