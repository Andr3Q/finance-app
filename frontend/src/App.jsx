import { lazy, Suspense, useEffect, useState, createContext, useContext } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import InstallBanner from './components/features/InstallBanner.jsx'
import AgentChat from './components/features/AgentChat.jsx'
import OnboardingModal from './components/features/OnboardingModal.jsx'
import PlanExpiryBanner from './components/features/PlanExpiryBanner.jsx'
import CookieBanner from './components/features/CookieBanner.jsx'
import { setInstallPrompt, markInstalled, clearInstalled } from './services/installPrompt.js'
import { authAPI } from './services/api.js'
import { saveUser } from './hooks/useUser.js'
import { analytics } from './services/analytics.js'
import { SPLASH_MIN_MS } from './splashConfig.js'

// Páginas carregadas sob demanda — só baixam quando o usuário acessar
const Landing        = lazy(() => import('./pages/Landing.jsx'))
const Login          = lazy(() => import('./pages/Login.jsx'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword.jsx'))
const ResetPassword  = lazy(() => import('./pages/ResetPassword.jsx'))
const VerifyEmail    = lazy(() => import('./pages/VerifyEmail.jsx'))
const UnlockAccount  = lazy(() => import('./pages/UnlockAccount.jsx'))
const Dashboard      = lazy(() => import('./pages/Dashboard.jsx'))
const Transactions   = lazy(() => import('./pages/Transactions.jsx'))
const Goals          = lazy(() => import('./pages/Goals.jsx'))
const Settings       = lazy(() => import('./pages/Settings.jsx'))
const Planos         = lazy(() => import('./pages/Planos.jsx'))
const Calendar       = lazy(() => import('./pages/Calendar.jsx'))
const Finance        = lazy(() => import('./pages/Finance.jsx'))
const PrivacyPolicy  = lazy(() => import('./pages/PrivacyPolicy.jsx'))
const TermsOfUse     = lazy(() => import('./pages/TermsOfUse.jsx'))
const NotFound       = lazy(() => import('./pages/NotFound.jsx'))

function isLoggedIn() {
  try { return !!JSON.parse(sessionStorage.getItem('user') || 'null') } catch { return false }
}

// Setado por saveUser() (hooks/useUser.js) na primeira sessão válida e nunca
// removido no logout — permite pular a landing pra quem já usou o app neste
// navegador, mesmo sem sessão ativa agora.
function hasAccountOnThisDevice() {
  try { return localStorage.getItem('nancy_has_account') === '1' } catch { return false }
}

// Contexto compartilhado entre App (que faz /auth/me) e PrivateRoute (que bloqueia
// a renderização de conteúdo protegido até a validação server-side terminar).
const AuthValidContext = createContext(false)

function PrivateRoute({ children }) {
  const isValidating = useContext(AuthValidContext)
  if (!isLoggedIn()) return <Navigate to="/login" replace />
  if (isValidating)  return <PageLoader />
  return <>{children}<AgentChat /><OnboardingModal /><PlanExpiryBanner /></>
}

function HomeRoute() {
  const [skipLandingReady, setSkipLandingReady] = useState(false)

  useEffect(() => {
    if (isLoggedIn() || !hasAccountOnThisDevice()) return
    // Só navega pro /login (que monta o campo de senha) depois que a splash
    // de abertura sai de cena — senão o campo entra no DOM ainda com a splash
    // em cima, e o navegador dispara o preenchimento automático de senha por
    // cima da animação.
    const t = setTimeout(() => setSkipLandingReady(true), SPLASH_MIN_MS)
    return () => clearTimeout(t)
  }, [])

  if (isLoggedIn()) return <Navigate to="/dashboard" replace />
  if (hasAccountOnThisDevice()) return skipLandingReady ? <Navigate to="/login" replace /> : null
  return <Landing />
}

function PageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <span className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
    </div>
  )
}

export default function App() {
  // isValidating: true enquanto /auth/me não respondeu — PrivateRoute bloqueia
  // renderização de conteúdo protegido nesse período para evitar flash de dados
  // antes de o servidor confirmar que o cookie JWT ainda é válido.
  const [isValidating, setIsValidating] = useState(isLoggedIn)

  useEffect(() => {
    // Valida sessão contra o servidor uma vez na inicialização
    // Se o cookie JWT expirou mas sessionStorage ainda tem dados, limpa e redireciona
    if (!isLoggedIn()) return
    authAPI.me()
      .then(res => {
        if (res.data) {
          saveUser(res.data)
          analytics.identify(res.data.id, { plan: res.data.plan })
          if (res.data.trialJustExpired) {
            analytics.track('trial_expired')
            sessionStorage.setItem('trial_just_expired', '1')
          }
        }
        setIsValidating(false)
      })
      .catch((err) => {
        const status = err.response?.status
        if (status === 401 || status === 403) {
          sessionStorage.removeItem('user')
          sessionStorage.removeItem('token')
          window.location.href = '/login'
          return
        }
        // 429: rate limited — retry silently after 20s sem derrubar o app
        if (status === 429) {
          setTimeout(() => {
            authAPI.me().then(res => { if (res.data) saveUser(res.data) }).catch(() => {})
          }, 20000)
        }
        setIsValidating(false)
      })
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
    <AuthValidContext.Provider value={isValidating}>
      <BrowserRouter>
        <CookieBanner />
        <InstallBanner />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/"                element={<HomeRoute />} />
            <Route path="/login"           element={<Login />} />
            <Route path="/register"        element={<Login isRegister />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password"  element={<ResetPassword />} />
            <Route path="/verify-email"    element={<VerifyEmail />} />
            <Route path="/unlock-account"  element={<UnlockAccount />} />
            <Route path="/dashboard"    element={<PrivateRoute><Dashboard /></PrivateRoute>} />
            <Route path="/transactions" element={<PrivateRoute><Transactions /></PrivateRoute>} />
            <Route path="/analytics"    element={<Navigate to="/goals" replace />} />
            <Route path="/goals"        element={<PrivateRoute><Goals /></PrivateRoute>} />
            <Route path="/settings"     element={<PrivateRoute><Settings /></PrivateRoute>} />
            <Route path="/financas"     element={<PrivateRoute><Finance /></PrivateRoute>} />
            <Route path="/calendar"     element={<PrivateRoute><Calendar /></PrivateRoute>} />
            <Route path="/planos"       element={<Planos />} />
            <Route path="/privacidade"  element={<PrivacyPolicy />} />
            <Route path="/termos"       element={<TermsOfUse />} />
            <Route path="*"             element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthValidContext.Provider>
  )
}
