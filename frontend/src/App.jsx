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
import Login           from './pages/Login.jsx'
import Landing         from './pages/Landing.jsx'
import Dashboard       from './pages/Dashboard.jsx'
import Transactions    from './pages/Transactions.jsx'
import Settings        from './pages/Settings.jsx'
import ForgotPassword  from './pages/ForgotPassword.jsx'
import ResetPassword   from './pages/ResetPassword.jsx'
import WaveBackground  from './components/WaveBackground.jsx'

function PrivateRoute({ children }) {
  const token = localStorage.getItem('token')
  return token ? children : <Navigate to="/login" replace />
}

function HomeRoute() {
  const token = localStorage.getItem('token')
  return token ? <Navigate to="/dashboard" replace /> : <Landing />
}

export default function App() {
  return (
    <BrowserRouter>
      <WaveBackground />
      <Routes>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/login"            element={<Login />} />
        <Route path="/register"        element={<Login isRegister />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password"  element={<ResetPassword />} />
        <Route path="/dashboard"    element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/transactions" element={<PrivateRoute><Transactions /></PrivateRoute>} />
        <Route path="/settings"     element={<PrivateRoute><Settings /></PrivateRoute>} />
      </Routes>
    </BrowserRouter>
  )
}
