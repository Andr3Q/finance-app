// ─── src/main.jsx ───────────────────────────────────────
// Entry point do React. Monta o app na div#root do index.html

import React    from 'react'
import ReactDOM from 'react-dom/client'
import App      from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
