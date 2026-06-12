import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PlanExpiryBanner from '../components/features/PlanExpiryBanner.jsx'

vi.mock('../services/analytics.js', () => ({
  analytics: { track: vi.fn() },
}))

import { analytics } from '../services/analytics.js'

// Dias em ms
const DAY = 24 * 60 * 60 * 1000

function futureDate(days) {
  return new Date(Date.now() + days * DAY).toISOString()
}
function pastDate(days) {
  return new Date(Date.now() - days * DAY).toISOString()
}

// Injeta usuário no sessionStorage para useUser() ler
function setUser(overrides = {}) {
  const user = { id: 'u1', plan: 'free', ...overrides }
  sessionStorage.setItem('user', JSON.stringify(user))
  // Dispara evento para que useUser() atualize
  window.dispatchEvent(new CustomEvent('user-updated', { detail: user }))
  return user
}

function setup(userOverrides = {}) {
  setUser(userOverrides)
  return render(
    <MemoryRouter>
      <PlanExpiryBanner />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
})

// ── Sem usuário ──────────────────────────────────────────────────

describe('PlanExpiryBanner — sem usuário', () => {
  it('não renderiza nada quando não há user.id', () => {
    const { container } = render(
      <MemoryRouter><PlanExpiryBanner /></MemoryRouter>
    )
    expect(container.firstChild).toBeNull()
  })
})

// ── Banner de trial ──────────────────────────────────────────────
// O aviso de trial foi movido para o sino da Navbar (Navbar.jsx → getTrialNotif).
// PlanExpiryBanner não renderiza banner de trial — apenas rastreia analytics.

describe('PlanExpiryBanner — trial ativo', () => {
  it('não renderiza banner de trial (exibido no sino da Navbar)', () => {
    setup({ isOnTrial: true, trialEndsAt: futureDate(5) })
    expect(screen.queryByTestId('trial-banner')).toBeNull()
  })

  it('dispara analytics.track("trial_expiring") para trial urgente', () => {
    setup({ id: 'u1', isOnTrial: true, trialEndsAt: futureDate(2) })
    expect(analytics.track).toHaveBeenCalledWith('trial_expiring', { daysLeft: 2 })
  })
})

// ── Banner de trial expirado ────────────────────────────────────

describe('PlanExpiryBanner — trial expirado', () => {
  it('mostra modal de conversão quando trial_just_expired está no sessionStorage', () => {
    sessionStorage.setItem('trial_just_expired', '1')
    setup({ plan: 'free' })
    expect(screen.getByTestId('trial-expired-modal')).toBeInTheDocument()
  })

  it('botão "Assinar Pro" no banner de trial expirado remove a chave da sessão', () => {
    sessionStorage.setItem('trial_just_expired', '1')
    setup({ plan: 'free' })
    fireEvent.click(screen.getByRole('button', { name: /assinar pro/i }))
    expect(sessionStorage.getItem('trial_just_expired')).toBeNull()
  })
})

// ── Banner de plano pago expirando ───────────────────────────────

describe('PlanExpiryBanner — plano pago expirando', () => {
  it('não mostra banner quando plano expira em > 7 dias', () => {
    setup({ plan: 'pro', planExpiresAt: futureDate(10) })
    expect(screen.queryByTestId('plan-expiry-banner')).toBeNull()
  })

  it('mostra "expira em N dias" quando plano expira em ≤ 7 dias', () => {
    setup({ plan: 'pro', planExpiresAt: futureDate(5) })
    expect(screen.getByText(/expira em 5 dias/i)).toBeInTheDocument()
  })

  it('mostra "expira hoje" quando plano expira em 1 dia', () => {
    setup({ plan: 'pro', planExpiresAt: futureDate(1) })
    expect(screen.getByText(/expira hoje/i)).toBeInTheDocument()
  })

  it('mostra mensagem de expiração no banner quando planExpiresAt é no passado', () => {
    setup({ plan: 'pro', planExpiresAt: pastDate(1) })
    // Usa o elemento específico do banner (não o subtitle do churn survey)
    expect(screen.getByText(/renove para manter o acesso/i)).toBeInTheDocument()
  })

  it('usa label "Elite" para plano elite', () => {
    setup({ plan: 'elite', planExpiresAt: futureDate(3) })
    expect(screen.getByText(/elite.*expira em 3 dias/i)).toBeInTheDocument()
  })

  it('dispensa o banner ao clicar em Fechar', () => {
    setup({ plan: 'pro', planExpiresAt: futureDate(5) })
    fireEvent.click(screen.getByRole('button', { name: /fechar/i }))
    expect(sessionStorage.getItem('expiry-banner-dismissed')).toBe('1')
  })
})

// ── Pesquisa de Churn ────────────────────────────────────────────

describe('PlanExpiryBanner — pesquisa de churn', () => {
  it('abre modal de churn automaticamente quando plano pago expirou', async () => {
    setup({ plan: 'pro', planExpiresAt: pastDate(2) })
    expect(await screen.findByTestId('churn-survey-modal')).toBeInTheDocument()
  })

  it('não abre churn survey se já foi mostrado nesta sessão', () => {
    sessionStorage.setItem('churn-survey-shown', '1')
    setup({ plan: 'pro', planExpiresAt: pastDate(2) })
    expect(screen.queryByTestId('churn-survey-modal')).toBeNull()
  })

  it('botão Enviar fica desabilitado sem motivo selecionado', async () => {
    setup({ plan: 'pro', planExpiresAt: pastDate(2) })
    await screen.findByTestId('churn-survey-modal')
    const btnEnviar = screen.getByRole('button', { name: /enviar feedback/i })
    expect(btnEnviar).toBeDisabled()
  })

  it('chama analytics.track("churn_survey") ao enviar motivo', async () => {
    setup({ plan: 'pro', planExpiresAt: pastDate(2) })
    await screen.findByTestId('churn-survey-modal')

    fireEvent.click(screen.getByLabelText(/preço muito alto/i))
    fireEvent.click(screen.getByRole('button', { name: /enviar feedback/i }))

    expect(analytics.track).toHaveBeenCalledWith(
      'churn_survey',
      expect.objectContaining({ reason: 'price', plan: 'pro' })
    )
  })

  it('mostra mensagem de agradecimento após envio', async () => {
    setup({ plan: 'pro', planExpiresAt: pastDate(2) })
    await screen.findByTestId('churn-survey-modal')

    fireEvent.click(screen.getByLabelText(/preço muito alto/i))
    fireEvent.click(screen.getByRole('button', { name: /enviar feedback/i }))

    expect(await screen.findByTestId('survey-sent')).toBeInTheDocument()
  })

  it('fecha o modal ao clicar em Pular', async () => {
    setup({ plan: 'pro', planExpiresAt: pastDate(2) })
    await screen.findByTestId('churn-survey-modal')

    fireEvent.click(screen.getByRole('button', { name: /pular/i }))

    await waitFor(() => {
      expect(screen.queryByTestId('churn-survey-modal')).not.toBeInTheDocument()
    })
  })
})
