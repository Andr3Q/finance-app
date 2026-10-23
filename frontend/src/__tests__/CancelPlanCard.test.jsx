import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CancelPlanCard from '../components/features/settings/CancelPlanCard.jsx'
import { useUser } from '../hooks/useUser.js'

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
    expect(screen.getByRole('button', { name: 'Cancelar assinatura' })).toBeInTheDocument()
  })

  it('renderiza para usuário Elite pago', () => {
    setup({ plan: 'elite', isOnTrial: false })
    expect(screen.getByRole('button', { name: 'Cancelar assinatura' })).toBeInTheDocument()
  })
})

// ── Modal de confirmação ─────────────────────────────────────────

describe('CancelPlanCard — modal de confirmação', () => {
  it('abre o modal ao clicar em "Cancelar assinatura"', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar assinatura' }))
    expect(screen.getByText(/confirmar cancelamento/i)).toBeInTheDocument()
  })

  it('fecha o modal ao clicar em "Voltar"', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar assinatura' }))
    fireEvent.click(screen.getByRole('button', { name: /voltar/i }))
    expect(screen.queryByText(/confirmar cancelamento/i)).not.toBeInTheDocument()
  })
})

// ── Cancelamento bem-sucedido ────────────────────────────────────

function fillPassword(pwd = 'minhasenha') {
  fireEvent.change(screen.getByPlaceholderText('Sua senha atual'), { target: { value: pwd } })
}

describe('CancelPlanCard — cancelamento', () => {
  it('chama authAPI.downgradeFree ao confirmar', async () => {
    authAPI.downgradeFree.mockResolvedValue({})
    const { onMessage } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar assinatura' }))
    fillPassword()
    fireEvent.click(screen.getByRole('button', { name: /sim, cancelar plano/i }))
    await waitFor(() => expect(authAPI.downgradeFree).toHaveBeenCalledTimes(1))
  })

  it('botão de confirmar fica desabilitado com senha vazia', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar assinatura' }))
    expect(screen.getByRole('button', { name: /sim, cancelar plano/i })).toBeDisabled()
  })

  it('marca subscriptionCancelled no sessionStorage após cancelamento (mantém plano para acesso)', async () => {
    authAPI.downgradeFree.mockResolvedValue({})
    setup({ plan: 'pro' })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar assinatura' }))
    fillPassword()
    fireEvent.click(screen.getByRole('button', { name: /sim, cancelar plano/i }))
    await waitFor(() => {
      const stored = JSON.parse(sessionStorage.getItem('user') || '{}')
      expect(stored.subscriptionCancelled).toBe(true)
      expect(stored.plan).toBe('pro') // mantém plano para não perder acesso no mesmo dia
    })
  })

  it('dispara analytics.track("plan_cancelled") após cancelamento', async () => {
    authAPI.downgradeFree.mockResolvedValue({})
    setup({ plan: 'pro' })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar assinatura' }))
    fillPassword()
    fireEvent.click(screen.getByRole('button', { name: /sim, cancelar plano/i }))
    await waitFor(() => {
      expect(analytics.track).toHaveBeenCalledWith('plan_cancelled', { plan: 'pro' })
    })
  })

  it('chama onMessage informando que acesso premium continua até o fim do período', async () => {
    authAPI.downgradeFree.mockResolvedValue({})
    const { onMessage } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar assinatura' }))
    fillPassword()
    fireEvent.click(screen.getByRole('button', { name: /sim, cancelar plano/i }))
    await waitFor(() => {
      expect(onMessage).toHaveBeenCalledWith(expect.stringMatching(/assinatura cancelada/i))
    })
  })

  it('regressão: cancelar o plano não apaga o salário do estado global (salary não vive no sessionStorage)', async () => {
    authAPI.downgradeFree.mockResolvedValue({})
    // salary é campo sensível — useUser.js deliberadamente não o persiste em
    // sessionStorage (defesa contra XSS). Reconstruir o usuário a partir do
    // sessionStorage em vez do estado vivo do hook apagava esse campo a cada
    // ação de Configurações salva (2FA, notificações, perfil, cancelar plano).
    function SalaryProbe() {
      const user = useUser()
      return <span data-testid="salary-probe">{String(user.salary)}</span>
    }
    setUser({ plan: 'pro', salary: 5000 })
    render(<CancelPlanCard onMessage={vi.fn()} />)
    render(<SalaryProbe />)

    expect(screen.getByTestId('salary-probe').textContent).toBe('5000')

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar assinatura' }))
    fillPassword()
    fireEvent.click(screen.getByRole('button', { name: /sim, cancelar plano/i }))

    await waitFor(() => expect(authAPI.downgradeFree).toHaveBeenCalled())
    expect(screen.getByTestId('salary-probe').textContent).toBe('5000')
  })

  it('chama onMessage com erro quando downgradeFree falha', async () => {
    authAPI.downgradeFree.mockRejectedValue({
      response: { data: { error: 'Erro interno' } },
    })
    const { onMessage } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar assinatura' }))
    fillPassword()
    fireEvent.click(screen.getByRole('button', { name: /sim, cancelar plano/i }))
    await waitFor(() => {
      expect(onMessage).toHaveBeenCalledWith('Erro interno', 'error')
    })
  })
})

describe('CancelPlanCard — assinatura já cancelada', () => {
  it('com acesso até uma data futura: mostra o aviso e esconde o botão de cancelar', () => {
    setup({ plan: 'pro', isOnTrial: false, subscriptionCancelled: true, planExpiresAt: new Date(Date.now() + 5 * 86400000).toISOString() })
    expect(screen.getByRole('status')).toHaveTextContent(/assinatura cancelada\. acesso premium garantido até/i)
    expect(screen.queryByRole('button', { name: 'Cancelar assinatura' })).not.toBeInTheDocument()
  })
})

