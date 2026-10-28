import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
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
        <Route path="/settings/pagamentos" element={<div>Tela de Pagamentos</div>} />
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
  it('cabeçalho do design, chamada e os três cards de plano (Grátis, Pro, Elite)', () => {
    setUser()
    const { container } = renderPlanos()
    expect(screen.getByRole('heading', { name: 'Planos' })).toBeInTheDocument()
    expect(screen.getByText('Assinatura Pro e Elite')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Controle total do seu dinheiro\./ })).toBeInTheDocument()
    expect(screen.getByText('Comece grátis e faça upgrade quando quiser.')).toBeInTheDocument()
    expect(container.querySelectorAll('.pl-card.pl-free, .pl-card.pl-pro, .pl-card.pl-elite').length).toBe(3)
  })

  it('usuário free: o card Grátis é o atual ("Plano básico", desabilitado) e o Pro vem como "Recomendado"', () => {
    setUser({ plan: 'free' })
    const { container } = renderPlanos()
    const free = container.querySelector('.pl-free')
    expect(free).toHaveAttribute('aria-current', 'true')
    expect(free.querySelector('.pl-cta')).toHaveTextContent('Plano básico')
    expect(free.querySelector('.pl-cta')).toBeDisabled()
    expect(screen.getByText('Para começar a se organizar')).toBeInTheDocument()
    expect(screen.getByText('R$ 0')).toBeInTheDocument()
    expect(container.querySelector('.pl-pro .pl-badge')).toHaveTextContent('Recomendado')
    expect(container.querySelector('.pl-pro')).not.toHaveAttribute('aria-current')
  })

  it('usuário Pro: Pro vira "Plano atual" (sem botão de assinar) e o Elite oferece o upgrade', () => {
    setUser({ plan: 'pro' })
    const { container } = renderPlanos()
    expect(container.querySelector('.pl-pro')).toHaveAttribute('aria-current', 'true')
    expect(container.querySelector('.pl-pro .pl-badge')).toHaveTextContent('Plano atual')
    expect(container.querySelector('.pl-pro .pl-cta')).toBeDisabled()
    expect(screen.queryByRole('button', { name: /^assinar pro/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /fazer upgrade para elite/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancelar assinatura/i })).toBeInTheDocument()   // no card Grátis
  })

  it('"Cancelar assinatura" leva ao cancelamento do app (Pagamentos), não manda ir ao Mercado Pago nem escrever pro suporte', async () => {
    setUser({ plan: 'pro' })
    renderPlanos()
    await userEvent.click(screen.getByRole('button', { name: /cancelar assinatura/i }))
    expect(await screen.findByText('Tela de Pagamentos')).toBeInTheDocument()
    expect(screen.queryByText(/Mercado Pago ou envie um e-mail/)).not.toBeInTheDocument()
  })

  it('pagamento indisponível (503): diz isso, sem pedir "tente novamente"; falha comum continua pedindo para tentar de novo', async () => {
    setUser({ plan: 'pro' })
    window.open = vi.fn(() => ({ close: vi.fn(), location: {} }))
    renderPlanos()
    paymentsAPI.createPreference.mockRejectedValueOnce({ response: { status: 503 } })
    await userEvent.click(screen.getByRole('button', { name: /fazer upgrade para elite/i }))
    expect(await screen.findByText('Pagamentos indisponíveis no momento. Tente mais tarde ou fale com o suporte.')).toBeInTheDocument()

    paymentsAPI.createPreference.mockRejectedValueOnce(new Error('rede'))
    await userEvent.click(screen.getByRole('button', { name: /fazer upgrade para elite/i }))
    expect(await screen.findByText('Erro ao iniciar pagamento. Tente novamente.')).toBeInTheDocument()
  })

  it('usuário Elite: Elite é o atual; "Mudar para Pro" explica o rebaixamento em vez de cobrar', async () => {
    setUser({ plan: 'elite' })
    const { container } = renderPlanos()
    expect(container.querySelector('.pl-elite')).toHaveAttribute('aria-current', 'true')
    await userEvent.click(screen.getByRole('button', { name: /mudar para pro/i }))
    expect(screen.getByRole('dialog', { name: /downgrade de plano/i })).toHaveTextContent('aguarde o fim do seu ciclo de faturamento')
    expect(paymentsAPI.createPreference).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Entendido' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('Esc fecha o aviso de rebaixamento de plano', async () => {
    setUser({ plan: 'elite' })
    renderPlanos()
    await userEvent.click(screen.getByRole('button', { name: /mudar para pro/i }))
    expect(screen.getByRole('dialog', { name: /downgrade de plano/i })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('preços: Pro R$ 9,90 e Elite R$ 34,90 por mês; no Anual, R$ 8,25 e R$ 27,90 com o total cobrado por ano', async () => {
    setUser()
    renderPlanos()
    expect(screen.getByText('R$ 9,90')).toBeInTheDocument()
    expect(screen.getByText('R$ 34,90')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /anual/i }))
    expect(screen.getByText('R$ 8,25')).toBeInTheDocument()
    expect(screen.getByText('R$ 27,90')).toBeInTheDocument()
    expect(screen.getByText('Cobrado anualmente (R$ 99,00/ano)')).toBeInTheDocument()
    expect(screen.getByText('Cobrado anualmente (R$ 334,80/ano)')).toBeInTheDocument()
  })

  it('alternador Mensal/Anual: o anual mostra "2 meses grátis" e marca qual está ativo', async () => {
    setUser()
    renderPlanos()
    const mensal = screen.getByRole('button', { name: 'Mensal' })
    const anual  = screen.getByRole('button', { name: /anual · 2 meses grátis/i })
    expect(mensal).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(anual)
    expect(anual).toHaveAttribute('aria-pressed', 'true')
    expect(mensal).toHaveAttribute('aria-pressed', 'false')
  })

  it('comparativo completo, garantia e perguntas frequentes (a pergunta velha sobre "quando o Pro estará disponível" saiu)', async () => {
    setUser()
    renderPlanos()
    expect(screen.getByText('Comparativo completo')).toBeInTheDocument()
    expect(screen.getByText('Relatório PDF mensal')).toBeInTheDocument()
    expect(screen.getByText('Cancele quando quiser', { selector: 'h3' })).toBeInTheDocument()
    expect(screen.queryByText(/Quando o Pro estará disponível/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /plano Grátis tem limite de tempo/i }))
    expect(screen.getByText(/gratuito para sempre/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /plano Grátis tem limite de tempo/i }))
    expect(screen.queryByText(/gratuito para sempre/)).not.toBeInTheDocument()
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
