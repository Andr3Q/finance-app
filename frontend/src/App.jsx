import { Suspense, useEffect, useState, createContext, useContext } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import ScrollToTop from './components/layout/ScrollToTop.jsx'
import InstallBanner from './components/features/InstallBanner.jsx'
import AgentChat from './components/features/AgentChat.jsx'
import NewTransactionSheet from './components/features/NewTransactionSheet.jsx'
import OnboardingModal from './components/features/OnboardingModal.jsx'
import PlanExpiryBanner from './components/features/PlanExpiryBanner.jsx'
import CookieBanner from './components/features/CookieBanner.jsx'
import { setInstallPrompt, markInstalled, clearInstalled } from './services/installPrompt.js'
import { authAPI } from './services/api.js'
import { saveUser } from './hooks/useUser.js'
import { analytics } from './services/analytics.js'
import { SPLASH_MIN_MS } from './splashConfig.js'
import { lazyWithReload } from './utils/lazyWithReload.js'

// Páginas carregadas sob demanda — só baixam quando o usuário acessar
const Landing        = lazyWithReload(() => import('./pages/Landing.jsx'))
const Login          = lazyWithReload(() => import('./pages/Login.jsx'))
const ForgotPassword = lazyWithReload(() => import('./pages/ForgotPassword.jsx'))
const ResetPassword  = lazyWithReload(() => import('./pages/ResetPassword.jsx'))
const VerifyEmail    = lazyWithReload(() => import('./pages/VerifyEmail.jsx'))
const ConfirmEmailChange = lazyWithReload(() => import('./pages/ConfirmEmailChange.jsx'))
const UnlockAccount  = lazyWithReload(() => import('./pages/UnlockAccount.jsx'))
const Dashboard      = lazyWithReload(() => import('./pages/Dashboard.jsx'))
const StoriesResumo  = lazyWithReload(() => import('./pages/StoriesResumo.jsx'))
const Notifications  = lazyWithReload(() => import('./pages/Notifications.jsx'))
const Installments   = lazyWithReload(() => import('./pages/Installments.jsx'))
const BillsMonth     = lazyWithReload(() => import('./pages/BillsMonth.jsx'))
const Analysis       = lazyWithReload(() => import('./pages/Analysis.jsx'))
const History        = lazyWithReload(() => import('./pages/History.jsx'))
const Subscriptions  = lazyWithReload(() => import('./pages/Subscriptions.jsx'))
const Reminders      = lazyWithReload(() => import('./pages/Reminders.jsx'))
const Limits         = lazyWithReload(() => import('./pages/Limits.jsx'))
const Transactions   = lazyWithReload(() => import('./pages/Transactions.jsx'))
const Goals          = lazyWithReload(() => import('./pages/Goals.jsx'))
const Settings       = lazyWithReload(() => import('./pages/Settings.jsx'))
const SettingsProfile       = lazyWithReload(() => import('./pages/SettingsProfile.jsx'))
const SettingsSecurity      = lazyWithReload(() => import('./pages/SettingsSecurity.jsx'))
const SettingsNotifications = lazyWithReload(() => import('./pages/SettingsNotifications.jsx'))
const SettingsMonthlyClose  = lazyWithReload(() => import('./pages/SettingsMonthlyClose.jsx'))
const SettingsReferral      = lazyWithReload(() => import('./pages/SettingsReferral.jsx'))
const SettingsPayments      = lazyWithReload(() => import('./pages/SettingsPayments.jsx'))
const SettingsData          = lazyWithReload(() => import('./pages/SettingsData.jsx'))
const SettingsInstall       = lazyWithReload(() => import('./pages/SettingsInstall.jsx'))
const Planos         = lazyWithReload(() => import('./pages/Planos.jsx'))
const Calendar       = lazyWithReload(() => import('./pages/Calendar.jsx'))
const Finance        = lazyWithReload(() => import('./pages/Finance.jsx'))
const PrivacyPolicy  = lazyWithReload(() => import('./pages/PrivacyPolicy.jsx'))
const TermsOfUse     = lazyWithReload(() => import('./pages/TermsOfUse.jsx'))
const NotFound       = lazyWithReload(() => import('./pages/NotFound.jsx'))

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
  const location = useLocation()
  // Enquanto valida contra o servidor, espera — sessionStorage vazio não
  // significa "deslogado" (pode só ter fechado o app; o cookie httpOnly não
  // dá pra ler daqui, só o /auth/me sabe se ainda é válido). Só decide
  // redirecionar depois que a validação terminar de um jeito ou de outro.
  if (isValidating)  return <PageLoader />
  // Preserva a URL de destino (ex: link de cobrança apontando pra
  // /settings/pagamentos) — sem isso, Login.jsx sempre mandava pro
  // /dashboard genérico depois de autenticar, perdendo a intenção original.
  if (!isLoggedIn()) return <Navigate to="/login" state={{ from: location }} replace />
  return <>{children}<AgentChat /><NewTransactionSheet /><OnboardingModal /><PlanExpiryBanner /></>
}

function HomeRoute() {
  const isValidating = useContext(AuthValidContext)
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

  // Dispositivo já teve conta (localStorage sobrevive fechar o app) e a
  // validação com o servidor ainda não terminou — espera antes de decidir
  // entre dashboard/login, senão manda pro /login mesmo com cookie válido
  // (era exatamente o bug: fechar e reabrir pedia login de novo à toa).
  if (isValidating && hasAccountOnThisDevice()) return null

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
  // isValidating: true enquanto /auth/me não respondeu — PrivateRoute/HomeRoute
  // bloqueiam a decisão de rota nesse período para evitar tanto o flash de
  // dados quanto o bug oposto: mandar pro /login só porque o sessionStorage
  // (apagado ao fechar o app) está vazio, mesmo com o cookie httpOnly ainda
  // válido — que é o que esse app já teve fechado/reaberto perdia sessão.
  const [isValidating, setIsValidating] = useState(() => isLoggedIn() || hasAccountOnThisDevice())

  useEffect(() => {
    // Valida sessão contra o servidor uma vez na inicialização — tenta sempre
    // que há QUALQUER chance de cookie válido (sessionStorage tem cache, OU
    // este dispositivo já teve conta antes, mesmo com sessionStorage vazio
    // por ter fechado o app). Só pula de vez pra quem nunca logou aqui —
    // nesse caso não existe cookie possível, sem requisição à toa.
    if (!isLoggedIn() && !hasAccountOnThisDevice()) return
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
          // Sem isso, o próximo boot (inclusive o reload logo abaixo) ainda
          // vê hasAccountOnThisDevice() === true, chama /auth/me de novo,
          // recebe 401 de novo, recarrega de novo — loop infinito de reload
          // (foi exatamente o bug real por trás da "tela preta que não sai
          // do lugar": confirmado gerando 60+ chamadas a /auth/me em poucos
          // segundos numa reprodução real). Sessão confirmada inválida pelo
          // servidor = não faz mais sentido tratar este dispositivo como
          // "já teve conta" pra fins de pular a validação na próxima vez.
          localStorage.removeItem('nancy_has_account')
          if (window.location.pathname !== '/login') {
            window.location.href = '/login'
            return
          }
          setIsValidating(false)
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
        <ScrollToTop />
        <CookieBanner />
        <InstallBanner />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/"                element={<HomeRoute />} />
            {/* key diferente força remount ao navegar /login <-> /register — sem
                isso o React reaproveita a mesma instância (mesmo componente)
                e o estado "mode", inicializado só no mount a partir de
                isRegister, fica preso no valor antigo. */}
            <Route path="/login"           element={<Login key="login" />} />
            <Route path="/register"        element={<Login key="register" isRegister />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password"  element={<ResetPassword />} />
            <Route path="/verify-email"    element={<VerifyEmail />} />
            <Route path="/confirmar-troca-email" element={<ConfirmEmailChange />} />
            <Route path="/unlock-account"  element={<UnlockAccount />} />
            <Route path="/dashboard"       element={<PrivateRoute><Dashboard /></PrivateRoute>} />
            <Route path="/resumo-stories"  element={<PrivateRoute><StoriesResumo /></PrivateRoute>} />
            <Route path="/notificacoes"    element={<PrivateRoute><Notifications /></PrivateRoute>} />
            <Route path="/parcelados"      element={<PrivateRoute><Installments /></PrivateRoute>} />
            <Route path="/contas-do-mes"   element={<PrivateRoute><BillsMonth /></PrivateRoute>} />
            <Route path="/analise"         element={<PrivateRoute><Analysis /></PrivateRoute>} />
            <Route path="/historico"       element={<PrivateRoute><History /></PrivateRoute>} />
            <Route path="/assinaturas"     element={<PrivateRoute><Subscriptions /></PrivateRoute>} />
            <Route path="/lembretes"       element={<PrivateRoute><Reminders /></PrivateRoute>} />
            <Route path="/limites"         element={<PrivateRoute><Limits /></PrivateRoute>} />
            <Route path="/transactions" element={<PrivateRoute><Transactions /></PrivateRoute>} />
            <Route path="/analytics"    element={<Navigate to="/goals" replace />} />
            <Route path="/goals"        element={<PrivateRoute><Goals /></PrivateRoute>} />
            <Route path="/settings"                 element={<PrivateRoute><Settings /></PrivateRoute>} />
            <Route path="/settings/perfil"           element={<PrivateRoute><SettingsProfile /></PrivateRoute>} />
            <Route path="/settings/seguranca"        element={<PrivateRoute><SettingsSecurity /></PrivateRoute>} />
            <Route path="/settings/notificacoes"     element={<PrivateRoute><SettingsNotifications /></PrivateRoute>} />
            <Route path="/settings/fechamento"       element={<PrivateRoute><SettingsMonthlyClose /></PrivateRoute>} />
            <Route path="/settings/indique"          element={<PrivateRoute><SettingsReferral /></PrivateRoute>} />
            <Route path="/settings/pagamentos"       element={<PrivateRoute><SettingsPayments /></PrivateRoute>} />
            <Route path="/settings/dados"            element={<PrivateRoute><SettingsData /></PrivateRoute>} />
            <Route path="/settings/instalar"         element={<PrivateRoute><SettingsInstall /></PrivateRoute>} />
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
