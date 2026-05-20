import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import InstallBanner from './components/features/InstallBanner.jsx'
import AgentChat from './components/features/AgentChat.jsx'
import { setInstallPrompt, markInstalled, clearInstalled } from './services/installPrompt.js'
import { authAPI } from './services/api.js'
import { saveUser } from './hooks/useUser.js'

// Páginas carregadas sob demanda — só baixam quando o usuário acessar
const Landing        = lazy(() => import('./pages/Landing.jsx'))
const Login          = lazy(() => import('./pages/Login.jsx'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword.jsx'))
const ResetPassword  = lazy(() => import('./pages/ResetPassword.jsx'))
const Dashboard      = lazy(() => import('./pages/Dashboard.jsx'))
const Transactions   = lazy(() => import('./pages/Transactions.jsx'))
const Analytics      = lazy(() => import('./pages/Analytics.jsx'))
const Goals          = lazy(() => import('./pages/Goals.jsx'))
const Settings       = lazy(() => import('./pages/Settings.jsx'))
const Planos         = lazy(() => import('./pages/Planos.jsx'))

function isLoggedIn() {
  try { return !!JSON.parse(localStorage.getItem('user') || 'null') } catch { return false }
}

function PrivateRoute({ children }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />
  return <>{children}<AgentChat /></>
}

function HomeRoute() {
  return isLoggedIn() ? <Navigate to="/dashboard" replace /> : <Landing />
}

function PageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <span className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
    </div>
  )
}

export default function App() {
  useEffect(() => {
    // Valida sessão contra o servidor uma vez na inicialização
    // Se o cookie JWT expirou mas localStorage ainda tem dados, limpa e redireciona
    if (isLoggedIn()) {
      authAPI.me()
        .then(res => { if (res.data) saveUser(res.data) })
        .catch((err) => {
          const status = err.response?.status
          if (status === 401 || status === 403) {
            localStorage.removeItem('user')
            window.location.href = '/login'
          }
        })
    }
  }, [])

  useEffect(() => {
    const onPrompt    = (e) => { e.preventDefault(); setInstallPrompt(e); clearInstalled() }
    const onInstalled = () => markInstalled()
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  return (
    <BrowserRouter>
      <InstallBanner />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/"                element={<HomeRoute />} />
          <Route path="/login"           element={<Login />} />
          <Route path="/register"        element={<Login isRegister />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password"  element={<ResetPassword />} />
          <Route path="/dashboard"    element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/transactions" element={<PrivateRoute><Transactions /></PrivateRoute>} />
          <Route path="/analytics"    element={<PrivateRoute><Analytics /></PrivateRoute>} />
          <Route path="/goals"        element={<PrivateRoute><Goals /></PrivateRoute>} />
          <Route path="/settings"     element={<PrivateRoute><Settings /></PrivateRoute>} />
          <Route path="/planos"       element={<PrivateRoute><Planos /></PrivateRoute>} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
