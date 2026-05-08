import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import WaveBackground from './components/WaveBackground.jsx'
import InstallBanner from './components/InstallBanner.jsx'
import { setInstallPrompt, markInstalled, clearInstalled } from './services/installPrompt.js'

// Páginas carregadas sob demanda — só baixam quando o usuário acessar
const Landing        = lazy(() => import('./pages/Landing.jsx'))
const Login          = lazy(() => import('./pages/Login.jsx'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword.jsx'))
const ResetPassword  = lazy(() => import('./pages/ResetPassword.jsx'))
const Dashboard      = lazy(() => import('./pages/Dashboard.jsx'))
const Transactions   = lazy(() => import('./pages/Transactions.jsx'))
const Settings       = lazy(() => import('./pages/Settings.jsx'))
const Planos         = lazy(() => import('./pages/Planos.jsx'))

function PrivateRoute({ children }) {
  const token = localStorage.getItem('token')
  return token ? children : <Navigate to="/login" replace />
}

function HomeRoute() {
  const token = localStorage.getItem('token')
  return token ? <Navigate to="/dashboard" replace /> : <Landing />
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
    // beforeinstallprompt = Chrome considera o app NÃO instalado → limpa flag
    const onPrompt = (e) => { e.preventDefault(); setInstallPrompt(e); clearInstalled() }
    // appinstalled = app acabou de ser instalado → persiste no localStorage
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
      <WaveBackground />
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
          <Route path="/settings"     element={<PrivateRoute><Settings /></PrivateRoute>} />
          <Route path="/planos"       element={<PrivateRoute><Planos /></PrivateRoute>} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
