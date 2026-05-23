// Analytics wrapper — no-op when PostHog key não estiver configurado
// A chave é injetada em runtime pelo backend via /app-config.js (env var POSTHOG_KEY)
// para evitar rebuilds da imagem Docker ao trocar de projeto PostHog.
import posthog from 'posthog-js'

let ready = false

export function initAnalytics() {
  if (ready) return
  const cfg  = (typeof window !== 'undefined' && window.__APP_CONFIG__) || {}
  const key  = cfg.posthogKey  || import.meta.env?.VITE_POSTHOG_KEY  || ''
  const host = cfg.posthogHost || import.meta.env?.VITE_POSTHOG_HOST || 'https://us.i.posthog.com'
  if (!key) return
  posthog.init(key, {
    api_host:         host,
    capture_pageview: 'history_change', // captura page views em SPAs automaticamente
    autocapture:      false,            // sem captura automática de cliques (privacidade)
    persistence:      'localStorage',
  })
  ready = true
}

export const analytics = {
  identify: (id, props = {}) => { if (ready) posthog.identify(id, props) },
  track:    (ev, props = {}) => { if (ready) posthog.capture(ev, props) },
  reset:    ()               => { if (ready) posthog.reset() },
}
