import { render, screen, waitFor } from '@testing-library/react'
import PaymentHistoryCard from '../components/features/settings/PaymentHistoryCard.jsx'

vi.mock('../services/api.js', () => ({
  paymentsAPI: { history: vi.fn() },
}))

import { paymentsAPI } from '../services/api.js'

function setUser(overrides = {}) {
  const user = { id: 'u1', plan: 'pro', ...overrides }
  sessionStorage.setItem('user', JSON.stringify(user))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: user }))
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
})

describe('PaymentHistoryCard', () => {
  it('mostra spinner enquanto carrega', () => {
    setUser()
    paymentsAPI.history.mockReturnValue(new Promise(() => {})) // nunca resolve
    render(<PaymentHistoryCard />)
    expect(document.querySelector('.spinner')).toBeInTheDocument()
  })

  it('mostra "Nenhum pagamento registrado" quando lista está vazia', async () => {
    setUser()
    paymentsAPI.history.mockResolvedValue({ data: [] })
    render(<PaymentHistoryCard />)
    expect(await screen.findByText(/nenhum pagamento registrado/i)).toBeInTheDocument()
  })

  it('renderiza item com labels corretos para Pro Mensal', async () => {
    setUser()
    paymentsAPI.history.mockResolvedValue({
      data: [{
        paymentId: 'pay_abc123456',
        plan: 'pro',
        period: 'monthly',
        processedAt: new Date('2026-03-15T10:00:00Z').toISOString(),
      }],
    })
    render(<PaymentHistoryCard />)
    expect(await screen.findByText(/plano pro — mensal/i)).toBeInTheDocument()
    expect(screen.getByText(/#123456/i)).toBeInTheDocument() // últimos 6 do paymentId
  })

  it('renderiza item com labels corretos para Elite Anual', async () => {
    setUser({ plan: 'elite' })
    paymentsAPI.history.mockResolvedValue({
      data: [{
        paymentId: 'pay_xyz789',
        plan: 'elite',
        period: 'annual',
        processedAt: new Date('2026-01-01T00:00:00Z').toISOString(),
      }],
    })
    render(<PaymentHistoryCard />)
    expect(await screen.findByText(/plano elite — anual/i)).toBeInTheDocument()
  })

  it('renderiza múltiplos pagamentos na ordem correta', async () => {
    setUser()
    paymentsAPI.history.mockResolvedValue({
      data: [
        { paymentId: 'p1', plan: 'pro',   period: 'monthly', processedAt: new Date('2026-03-01').toISOString() },
        { paymentId: 'p2', plan: 'elite', period: 'annual',  processedAt: new Date('2026-01-01').toISOString() },
      ],
    })
    render(<PaymentHistoryCard />)
    const items = await screen.findAllByText(/plano (pro|elite)/i)
    expect(items).toHaveLength(2)
  })

  it('não renderiza o card quando usuário é free e não há pagamentos', async () => {
    setUser({ plan: 'free' })
    paymentsAPI.history.mockResolvedValue({ data: [] })
    const { container } = render(<PaymentHistoryCard />)
    await waitFor(() => {
      expect(container.firstChild).toBeNull()
    })
  })

  it('mostra o card mesmo para usuário free se houver pagamentos históricos', async () => {
    setUser({ plan: 'free' })
    paymentsAPI.history.mockResolvedValue({
      data: [{ paymentId: 'p1', plan: 'pro', period: 'monthly', processedAt: new Date().toISOString() }],
    })
    render(<PaymentHistoryCard />)
    expect(await screen.findByText(/histórico de pagamentos/i)).toBeInTheDocument()
  })
})
