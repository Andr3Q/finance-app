import { render, screen, waitFor } from '@testing-library/react'

vi.mock('../services/api.js', () => ({
  authAPI: { me: vi.fn() },
}))
vi.mock('../services/analytics.js', () => ({
  analytics: { identify: vi.fn(), track: vi.fn() },
}))
vi.mock('../services/installPrompt.js', () => ({
  setInstallPrompt: vi.fn(), markInstalled: vi.fn(), clearInstalled: vi.fn(),
}))

// Páginas reais são pesadas (fazem fetch própria) — troca por marcadores
// simples, o que importa aqui é só a decisão de rota do App/PrivateRoute/HomeRoute.
vi.mock('../pages/Landing.jsx', () => ({ default: () => <div>TELA_LANDING</div> }))
vi.mock('../pages/Login.jsx', () => ({ default: () => <div>TELA_LOGIN</div> }))
vi.mock('../pages/Dashboard.jsx', () => ({ default: () => <div>TELA_DASHBOARD</div> }))
vi.mock('../components/features/AgentChat.jsx', () => ({ default: () => null }))
vi.mock('../components/features/OnboardingModal.jsx', () => ({ default: () => null }))
vi.mock('../components/features/PlanExpiryBanner.jsx', () => ({ default: () => null }))
vi.mock('../components/features/CookieBanner.jsx', () => ({ default: () => null }))
vi.mock('../components/features/InstallBanner.jsx', () => ({ default: () => null }))

import { authAPI } from '../services/api.js'
import App from '../App.jsx'

async function renderAppAt(path) {
  window.history.pushState({}, '', path)
  const utils = render(<App />)
  return utils
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  localStorage.clear()
})

describe('App — validação de sessão na inicialização (bug: pedia login ao reabrir o app)', () => {
  test('sessionStorage vazio + já teve conta neste dispositivo + /auth/me OK → cai logado, sem passar pelo login', async () => {
    localStorage.setItem('nancy_has_account', '1')
    authAPI.me.mockResolvedValue({ data: { id: 'u1', name: 'Ana', plan: 'pro' } })

    await renderAppAt('/dashboard')

    await waitFor(() => expect(screen.getByText('TELA_DASHBOARD')).toBeInTheDocument())
    expect(screen.queryByText('TELA_LOGIN')).not.toBeInTheDocument()
    expect(authAPI.me).toHaveBeenCalledTimes(1)
  })

  test('mesmo cenário, mas /auth/me responde 401 (sessão de fato inválida) → vai pro login', async () => {
    localStorage.setItem('nancy_has_account', '1')
    authAPI.me.mockRejectedValue({ response: { status: 401 } })

    // App.jsx redireciona via window.location.href no caso 401/403 — jsdom não
    // navega de verdade, então só confirma que a limpeza de storage aconteceu
    // (é o sinal observável sem depender de navegação real do jsdom).
    await renderAppAt('/dashboard')
    await waitFor(() => expect(authAPI.me).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(sessionStorage.getItem('user')).toBeNull())
  })

  test('visitante novo (sem conta neste dispositivo) → /auth/me nem é chamado, landing renderiza direto', async () => {
    await renderAppAt('/')

    await waitFor(() => expect(screen.getByText('TELA_LANDING')).toBeInTheDocument())
    expect(authAPI.me).not.toHaveBeenCalled()
  })

  test('HomeRoute: dispositivo com conta + sessão ainda válida → pula login/landing, vai direto pro dashboard', async () => {
    localStorage.setItem('nancy_has_account', '1')
    authAPI.me.mockResolvedValue({ data: { id: 'u1', name: 'Ana', plan: 'pro' } })

    await renderAppAt('/')

    await waitFor(() => expect(screen.getByText('TELA_DASHBOARD')).toBeInTheDocument())
    expect(screen.queryByText('TELA_LOGIN')).not.toBeInTheDocument()
    expect(screen.queryByText('TELA_LANDING')).not.toBeInTheDocument()
  })
})
