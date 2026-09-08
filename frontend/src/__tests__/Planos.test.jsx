import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Planos from '../pages/Planos.jsx'

vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))

vi.mock('../services/api.js', () => ({
  paymentsAPI: { createPreference: vi.fn() },
  authAPI:     { me: vi.fn() },
}))

vi.mock('../services/analytics.js', () => ({
  analytics: { track: vi.fn(), identify: vi.fn() },
}))

import { paymentsAPI, authAPI } from '../services/api.js'
import { analytics } from '../services/analytics.js'

function setUser(overrides = {}) {
  const user = { id: 'user-123', plan: 'free', emailVerified: true, ...overrides }
  sessionStorage.setItem('user', JSON.stringify(user))
  return user
}

// Inclui rota /register para testar redirect de usuário não logado
function renderPlanos(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/planos${search}`]}>
      <Routes>
        <Route path="/planos"   element={<Planos />} />
        <Route path="/register" element={<div>Tela de Registro</div>} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
})

// ── Renderização básica ──────────────────────────────────────────

describe('Planos — renderização', () => {
  it('exibe os três cards de plano', () => {
    setUser()
    const { container } = renderPlanos()
    expect(container.querySelectorAll('.pp1-card').length).toBe(3)
  })

  it('marca "Plano atual" no card Grátis para usuário free', () => {
    setUser({ plan: 'free' })
    const { container } = renderPlanos()
    // O badge de plano atual fica dentro do card free
    expect(container.querySelector('.pp1-card.pp1-free .pp1-current-badge')).toBeTruthy()
  })

  it('toggle Anual exibe badge de economia', async () => {
    setUser()
    renderPlanos()
    await userEvent.click(screen.getByRole('button', { name: /anual/i }))
    expect(screen.getByText(/economize 20%/i)).toBeInTheDocument()
  })

  it('toggle Anual altera o período passado para createPreference', async () => {
    setUser({ emailVerified: true })
    paymentsAPI.createPreference.mockResolvedValue({
      data: { checkoutUrl: 'https://www.mercadopago.com.br/checkout/1' },
    })
    vi.spyOn(window, 'open').mockReturnValue({ location: {}, close: vi.fn() })

    renderPlanos()
    await userEvent.click(screen.getByRole('button', { name: /anual/i }))
    await userEvent.click(screen.getByRole('button', { name: /assinar pro/i }))

    await waitFor(() =>
      expect(paymentsAPI.createPreference).toHaveBeenCalledWith('pro', 'annual')
    )
  })
})

// ── Checkout ─────────────────────────────────────────────────────

describe('Planos — checkout', () => {
  it('redireciona para /register quando usuário não está logado', async () => {
    // sessionStorage vazio → user.id é undefined
    renderPlanos()
    await userEvent.click(screen.getByRole('button', { name: /assinar pro/i }))
    expect(await screen.findByText('Tela de Registro')).toBeInTheDocument()
    expect(paymentsAPI.createPreference).not.toHaveBeenCalled()
  })

  it('mostra toast de aviso quando e-mail não está verificado', async () => {
    setUser({ emailVerified: false })
    renderPlanos()
    await userEvent.click(screen.getByRole('button', { name: /assinar pro/i }))
    expect(await screen.findByText(/verifique seu e-mail/i)).toBeInTheDocument()
    expect(paymentsAPI.createPreference).not.toHaveBeenCalled()
  })

  it('abre janela blank e redireciona para URL do MP (pro_monthly)', async () => {
    setUser({ emailVerified: true })
    paymentsAPI.createPreference.mockResolvedValue({
      data: { checkoutUrl: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=abc' },
    })
    const mockWin = { location: { href: '' }, close: vi.fn() }
    vi.spyOn(window, 'open').mockReturnValue(mockWin)

    renderPlanos()
    await userEvent.click(screen.getByRole('button', { name: /assinar pro/i }))

    expect(window.open).toHaveBeenCalledWith('about:blank', '_blank')
    await waitFor(() =>
      expect(mockWin.location.href).toBe(
        'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=abc'
      )
    )
    expect(paymentsAPI.createPreference).toHaveBeenCalledWith('pro', 'monthly')
  })

  it('fecha a janela e mostra toast de erro se createPreference falhar', async () => {
    setUser({ emailVerified: true })
    paymentsAPI.createPreference.mockRejectedValue(new Error('network error'))
    const mockWin = { location: { href: '' }, close: vi.fn() }
    vi.spyOn(window, 'open').mockReturnValue(mockWin)

    renderPlanos()
    await userEvent.click(screen.getByRole('button', { name: /assinar pro/i }))

    await waitFor(() => expect(mockWin.close).toHaveBeenCalled())
    expect(await screen.findByText(/erro ao iniciar pagamento/i)).toBeInTheDocument()
  })

  // Regressão: navegador/config de privacidade pode bloquear até o
  // window.open síncrono do clique, retornando null. Sem a checagem, o
  // handler tentava win.location.href (lança), o catch tentava win.close()
  // em cima de null (lança de novo), e o toast de erro nunca aparecia —
  // silencioso pro usuário, só um erro no console.
  it('pop-up bloqueado (window.open retorna null): mostra toast de erro, sem crash, sem chamar a API à toa', async () => {
    setUser({ emailVerified: true })
    vi.spyOn(window, 'open').mockReturnValue(null)

    renderPlanos()
    await userEvent.click(screen.getByRole('button', { name: /assinar pro/i }))

    expect(await screen.findByText(/bloqueou o pop-up/i)).toBeInTheDocument()
    expect(paymentsAPI.createPreference).not.toHaveBeenCalled()
  })

  it('rejeita URL de checkout que não é do mercadopago.com.br', async () => {
    setUser({ emailVerified: true })
    paymentsAPI.createPreference.mockResolvedValue({
      data: { checkoutUrl: 'https://evil.com/phishing' },
    })
    const mockWin = { location: { href: '' }, close: vi.fn() }
    vi.spyOn(window, 'open').mockReturnValue(mockWin)

    renderPlanos()
    await userEvent.click(screen.getByRole('button', { name: /assinar pro/i }))

    await waitFor(() => expect(mockWin.close).toHaveBeenCalled())
    expect(await screen.findByText(/erro ao iniciar pagamento/i)).toBeInTheDocument()
    expect(mockWin.location.href).toBe('')
  })

  it('envia evento de analytics ao clicar em checkout', async () => {
    setUser({ emailVerified: true })
    paymentsAPI.createPreference.mockResolvedValue({
      data: { checkoutUrl: 'https://www.mercadopago.com.br/checkout/1' },
    })
    vi.spyOn(window, 'open').mockReturnValue({ location: {}, close: vi.fn() })

    renderPlanos()
    await userEvent.click(screen.getByRole('button', { name: /assinar pro/i }))

    expect(analytics.track).toHaveBeenCalledWith('upgrade_clicked', { plan: 'pro', period: 'monthly' })
  })
})

// ── Retorno do pagamento ─────────────────────────────────────────

describe('Planos — retorno de pagamento', () => {
  it('mostra toast de sucesso quando ?payment=success', async () => {
    setUser()
    authAPI.me.mockResolvedValue({ data: { plan: 'free' } })
    renderPlanos('?payment=success')
    expect(await screen.findByText(/pagamento aprovado/i)).toBeInTheDocument()
  })

  it('mostra toast de erro quando ?payment=failure', async () => {
    setUser()
    renderPlanos('?payment=failure')
    expect(await screen.findByText(/não aprovado/i)).toBeInTheDocument()
  })

  it('mostra toast de pendente quando ?payment=pending', async () => {
    setUser()
    renderPlanos('?payment=pending')
    expect(await screen.findByText(/pendente/i)).toBeInTheDocument()
  })

  it('inicia polling e atualiza sessionStorage quando plano muda após payment=success', async () => {
    vi.useFakeTimers()
    setUser({ plan: 'free' })
    authAPI.me.mockResolvedValue({ data: { plan: 'pro', planExpiresAt: '2026-12-01' } })

    const { unmount } = renderPlanos('?payment=success')

    // Avança 1 tick do setInterval (3000ms)
    await act(async () => { vi.advanceTimersByTime(3000) })
    // Flush microtasks pendentes da promise authAPI.me
    await act(async () => {})

    const stored = JSON.parse(sessionStorage.getItem('user') || '{}')
    expect(stored.plan).toBe('pro')

    unmount()
    vi.useRealTimers()
  })

  it('para o polling após 10 tentativas sem mudança de plano', async () => {
    vi.useFakeTimers()
    setUser({ plan: 'free' })
    authAPI.me.mockResolvedValue({ data: { plan: 'free' } })

    const { unmount } = renderPlanos('?payment=success')

    // Avança além de 10 × 3000ms e flushes por iteração
    for (let i = 0; i < 11; i++) {
      await act(async () => { vi.advanceTimersByTime(3000) })
      await act(async () => {})
    }

    expect(authAPI.me).toHaveBeenCalledTimes(10)

    unmount()
    vi.useRealTimers()
  })
})
