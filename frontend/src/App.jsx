// ═══════════════════════════════════════════════════════
// 🗺️  src/App.jsx — Roteador Principal
//
// Define quais páginas existem e protege rotas que
// precisam de login (PrivateRoute).
//
// Rotas públicas:  /login, /register
// Rotas privadas:  /dashboard, /transactions, /settings
// ═══════════════════════════════════════════════════════

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login        from './pages/Login.jsx'
import Dashboard    from './pages/Dashboard.jsx'
import Transactions from './pages/Transactions.jsx'
import Settings     from './pages/Settings.jsx'

// PrivateRoute: se não tiver token, redireciona para /login
function PrivateRoute({ children }) {
  const token = localStorage.getItem('token')
  return token ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Rota raiz → vai para dashboard se logado, senão para login */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        {/* Rotas públicas */}
        <Route path="/login"    element={<Login />} />
        <Route path="/register" element={<Login isRegister />} />

        {/* Rotas privadas — exigem login */}
        <Route path="/dashboard"    element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/transactions" element={<PrivateRoute><Transactions /></PrivateRoute>} />
        <Route path="/settings"     element={<PrivateRoute><Settings /></PrivateRoute>} />
      </Routes>
    </BrowserRouter>
  )
}
