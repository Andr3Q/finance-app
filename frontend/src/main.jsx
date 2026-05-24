import React    from 'react'
import ReactDOM from 'react-dom/client'
import App      from './App.jsx'
import ErrorBoundary from './components/ui/ErrorBoundary.jsx'
import { initAnalytics } from './services/analytics.js'
import { hasConsent } from './components/features/CookieBanner.jsx'
import './index.css'

// Só inicializa analytics se o usuário já deu consentimento (LGPD Art. 5º)
if (hasConsent()) initAnalytics()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
