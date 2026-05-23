import React    from 'react'
import ReactDOM from 'react-dom/client'
import App      from './App.jsx'
import ErrorBoundary from './components/ui/ErrorBoundary.jsx'
import { initAnalytics } from './services/analytics.js'
import './index.css'

// window.__APP_CONFIG__ já está disponível: o <script src="/app-config.js">
// no <head> é síncrono e executa antes deste module script.
initAnalytics()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
