import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import SettingsPayments from '../pages/SettingsPayments.jsx'

vi.mock('../services/api.js', () => ({
  paymentsAPI: { history: vi.fn() },
  authAPI: { downgradeFree: vi.fn() },
}))
vi.mock('../services/analytics.js', () => ({ analytics: { track: vi.fn() } }))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))
import { paymentsAPI, authAPI } from '../services/api.js'

const setDesktop = (is) => { window.matchMedia = vi.fn(() => ({ matches: is, addEventListener() {}, removeEventListener() {} })) }
const HISTORY = [
  { paymentId: 'p4', plan: 'elite', period: 'monthly', processedAt: '2026-10-20T15:00:00Z', amount: 34.9, method: 'card', cardLast4: '4021' },
  { paymentId: 'p3', plan: 'elite', period: 'monthly', processedAt: '2026-09-20T15:00:00Z', amount: 34.9, method: 'card', cardLast4: '4021' },
  { paymentId: 'p2', plan: 'elite', period: 'monthly', processedAt: '2026-08-20T15:00:00Z', amount: 34.9, method: 'pix', cardLast4: null },
  { paymentId: 'p1', plan: 'pro',   period: 'monthly', processedAt: '2026-07-20T15:00:00Z', amount: 9.9,  method: null,  cardLast4: null },
]
const FUTURE = '2026-11-20T15:00:00Z'
function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}</div> }
function setup(user = {}) {
  const u = { id: 'u-pg', name: 'Ana', plan: 'elite', isOnTrial: false, planExpiresAt: FUTURE, ...user }
  sessionStorage.setItem('user', JSON.stringify(u))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: u }))
  return render(
    <MemoryRouter initialEntries={['/settings/pagamentos']}>
      <Where />
      <Routes>
        <Route path="/settings/pagamentos" element={<SettingsPayments />} />
        <Route path="*" element={<div>outra tela</div>} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear(); localStorage.clear(); setDesktop(true)
  paymentsAPI.history.mockResolvedValue({ data: HISTORY })
  authAPI.downgradeFree.mockResolvedValue({ data: {} })
})
afterEach(() => { delete window.matchMedia })

describe('Pagamentos no desktop (design "Nancy Desktop", tela 31)', () => {
  it('menu da conta (Pagamentos aceso), plano com o último valor, até quando vale e a forma de pagamento', async () => {
    setup()
    expect(within(screen.getByRole('navigation', { name: 'Conta' })).getByRole('button', { name: 'Pagamentos' })).toHaveAttribute('aria-current', 'page')
    expect(await screen.findByText('Plano Elite · R$ 34,90/mês')).toBeInTheDocument()
    expect(screen.getByText('Válido até 20 nov 2026 · cartão •••• 4021')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar assinatura' })).toBeInTheDocument()
    expect(document.querySelector('.fin-hero')).toBeNull()
  })

  it('histórico em tabela: Data, Descrição, Valor e Status, uma linha por cobrança', async () => {
    setup()
    const hist = await screen.findByLabelText('Histórico de pagamentos')
    expect(hist.querySelector('.pgd-head')).toHaveTextContent('DATADESCRIÇÃOVALORSTATUS')
    const rows = [...hist.querySelectorAll('.pgd-row')].map(r => [...r.children].map(c => c.textContent))
    expect(rows).toEqual([
      ['20 out 2026', 'Elite · cartão', 'R$ 34,90', 'Pago'],
      ['20 set 2026', 'Elite · cartão', 'R$ 34,90', 'Pago'],
      ['20 ago 2026', 'Elite · PIX',    'R$ 34,90', 'Pago'],
      ['20 jul 2026', 'Pro · mensal',   'R$ 9,90',  'Pago'],
    ])
  })

  it('cancelar abre o aviso com senha, e só confirma com a senha preenchida (mesmo fluxo do celular)', async () => {
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar assinatura' }))
    const dlg = document.querySelector('.gls-modal')
    expect(dlg).toHaveTextContent('Não renovar o plano')
    expect(within(dlg).getByRole('button', { name: 'Sim, não renovar' })).toBeDisabled()
    await userEvent.type(within(dlg).getByPlaceholderText('Sua senha atual'), 'minhasenha')
    await userEvent.click(within(dlg).getByRole('button', { name: 'Sim, não renovar' }))
    expect(authAPI.downgradeFree).toHaveBeenCalledWith({ password: 'minhasenha' })
    expect(await screen.findByText(/seu plano não será renovado/)).toBeInTheDocument()
  })

  it('não renovado: a frase diz até quando vai o acesso e o botão de cancelar some', async () => {
    setup({ subscriptionCancelled: true })
    expect(await screen.findByText('Não será renovado · acesso até 20 nov 2026 · cartão •••• 4021')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancelar assinatura' })).not.toBeInTheDocument()
  })

  it('plano Grátis: "Sem cobrança" e "Ver planos" leva aos planos; sem botão de cancelar', async () => {
    paymentsAPI.history.mockResolvedValue({ data: [] })
    setup({ plan: 'free', planExpiresAt: null })
    expect(screen.getByRole('heading', { name: 'Plano Grátis' })).toBeInTheDocument()
    expect(screen.getByText('Sem cobrança')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancelar assinatura' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ver planos' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/planos')
  })

  it('histórico que falha ou vem vazio explica em vez de ficar em branco', async () => {
    paymentsAPI.history.mockRejectedValue(new Error('x'))
    setup()
    expect(await screen.findByText('Não foi possível carregar o histórico agora.')).toBeInTheDocument()
  })
})

describe('Pagamentos — celular continua o mesmo', () => {
  it('no celular segue o cabeçalho "Pagamentos" com Voltar e o botão "Não renovar"', async () => {
    setDesktop(false)
    setup()
    expect(screen.queryByRole('navigation', { name: 'Conta' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Não renovar' })).toBeInTheDocument()
  })
})
