import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CancelPlanCard from '../components/features/settings/CancelPlanCard.jsx'

vi.mock('../services/api.js', () => ({
  authAPI: { downgradeFree: vi.fn() },
}))

vi.mock('../services/analytics.js', () => ({
  analytics: { track: vi.fn() },
}))

import { authAPI } from '../services/api.js'
import { analytics } from '../services/analytics.js'

function setUser(overrides = {}) {
  const user = { id: 'u1', plan: 'pro', isOnTrial: false, ...overrides }
  sessionStorage.setItem('user', JSON.stringify(user))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: user }))
  return user
}

function setup(userOverrides = {}, onMessage = vi.fn()) {
  setUser(userOverrides)
  return { onMessage, ...render(<CancelPlanCard onMessage={onMessage} />) }
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
})

// ── Visibilidade ─────────────────────────────────────────────────

describe('CancelPlanCard — visibilidade', () => {
  it('não renderiza para usuário free', () => {
    const { container } = setup({ plan: 'free' })
    expect(container.firstChild).toBeNull()
  })

  it('não renderiza para usuário em trial', () => {
    const { container } = setup({ plan: 'pro', isOnTrial: true })
    expect(container.firstChild).toBeNull()
  })

  it('renderiza para usuário Pro pago', () => {
    setup({ plan: 'pro', isOnTrial: false })
    expect(screen.getByText(/cancelar plano pro/i)).toBeInTheDocument()
  })

  it('renderiza para usuário Elite pago', () => {
    setup({ plan: 'elite', isOnTrial: false })
    expect(screen.getByText(/cancelar plano elite/i)).toBeInTheDocument()
  })
})

// ── Modal de confirmação ─────────────────────────────────────────

describe('CancelPlanCard — modal de confirmação', () => {
  it('abre o modal ao clicar em "Cancelar plano"', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /cancelar plano/i }))
    expect(screen.getByText(/confirmar cancelamento/i)).toBeInTheDocument()
  })

  it('fecha o modal ao clicar em "Voltar"', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /cancelar plano/i }))
    fireEvent.click(screen.getByRole('button', { name: /voltar/i }))
    expect(screen.queryByText(/confirmar cancelamento/i)).not.toBeInTheDocument()
  })
})

// ── Cancelamento bem-sucedido ────────────────────────────────────

describe('CancelPlanCard — cancelamento', () => {
  it('chama authAPI.downgradeFree ao confirmar', async () => {
    authAPI.downgradeFree.mockResolvedValue({})
    const { onMessage } = setup()
    fireEvent.click(screen.getByRole('button', { name: /cancelar plano/i }))
    fireEvent.click(screen.getByRole('button', { name: /sim, cancelar plano/i }))
    await waitFor(() => expect(authAPI.downgradeFree).toHaveBeenCalledTimes(1))
  })

  it('atualiza sessionStorage para plan: free após cancelamento', async () => {
    authAPI.downgradeFree.mockResolvedValue({})
    setup()
    fireEvent.click(screen.getByRole('button', { name: /cancelar plano/i }))
    fireEvent.click(screen.getByRole('button', { name: /sim, cancelar plano/i }))
    await waitFor(() => {
      const stored = JSON.parse(sessionStorage.getItem('user') || '{}')
      expect(stored.plan).toBe('free')
    })
  })

  it('dispara analytics.track("plan_cancelled") após cancelamento', async () => {
    authAPI.downgradeFree.mockResolvedValue({})
    setup({ plan: 'pro' })
    fireEvent.click(screen.getByRole('button', { name: /cancelar plano/i }))
    fireEvent.click(screen.getByRole('button', { name: /sim, cancelar plano/i }))
    await waitFor(() => {
      expect(analytics.track).toHaveBeenCalledWith('plan_cancelled', { plan: 'pro' })
    })
  })

  it('chama onMessage com mensagem de sucesso', async () => {
    authAPI.downgradeFree.mockResolvedValue({})
    const { onMessage } = setup()
    fireEvent.click(screen.getByRole('button', { name: /cancelar plano/i }))
    fireEvent.click(screen.getByRole('button', { name: /sim, cancelar plano/i }))
    await waitFor(() => {
      expect(onMessage).toHaveBeenCalledWith(expect.stringMatching(/plano cancelado/i))
    })
  })

  it('chama onMessage com erro quando downgradeFree falha', async () => {
    authAPI.downgradeFree.mockRejectedValue({
      response: { data: { error: 'Erro interno' } },
    })
    const { onMessage } = setup()
    fireEvent.click(screen.getByRole('button', { name: /cancelar plano/i }))
    fireEvent.click(screen.getByRole('button', { name: /sim, cancelar plano/i }))
    await waitFor(() => {
      expect(onMessage).toHaveBeenCalledWith('Erro interno', 'error')
    })
  })
})
