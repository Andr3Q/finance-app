import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import SettingsPayments from '../pages/SettingsPayments.jsx'

vi.mock('../services/api.js', () => ({
  paymentsAPI: { history: vi.fn() },
  authAPI: { downgradeFree: vi.fn() },
}))
vi.mock('../services/analytics.js', () => ({ analytics: { track: vi.fn() } }))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))

import { paymentsAPI, authAPI } from '../services/api.js'

const HISTORY = [
  { paymentId: 'p4', plan: 'elite', period: 'monthly', processedAt: '2026-10-20T15:00:00Z', amount: 34.9, method: 'card', cardLast4: '4021' },
  { paymentId: 'p3', plan: 'elite', period: 'monthly', processedAt: '2026-09-20T15:00:00Z', amount: 34.9, method: 'card', cardLast4: '4021' },
  { paymentId: 'p2', plan: 'elite', period: 'monthly', processedAt: '2026-08-20T15:00:00Z', amount: 34.9, method: 'pix', cardLast4: null },
  { paymentId: 'p1', plan: 'pro',   period: 'monthly', processedAt: '2026-07-20T15:00:00Z', amount: 9.9,  method: null,  cardLast4: null },
]
const FUTURE = '2026-11-20T15:00:00Z'

function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}</div> }
function renderPage(user = {}, entries = ['/settings/pagamentos'], index) {
  const u = { id: 'u1', name: 'Ana', plan: 'elite', isOnTrial: false, planExpiresAt: FUTURE, ...user }
  sessionStorage.setItem('user', JSON.stringify(u))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: u }))
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <Where />
      <Routes>
        <Route path="/settings/pagamentos" element={<SettingsPayments />} />
        <Route path="*" element={<div>outra tela</div>} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear(); localStorage.clear()
  paymentsAPI.history.mockResolvedValue({ data: HISTORY })
  authAPI.downgradeFree.mockResolvedValue({ data: {} })
})

describe('Pagamentos — plano atual', () => {
  it('plano pago: nome, até quando vale, forma de pagamento do último pagamento e o último valor', async () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Pagamentos' })).toBeInTheDocument()
    expect(screen.getByText('Histórico e renovação')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Plano Elite' })).toBeInTheDocument()
    expect(await screen.findByText('Válido até 20 nov 2026 · cartão •••• 4021')).toBeInTheDocument()
    expect(document.querySelector('.pg-plan-amt').textContent).toBe('R$ 34,90')
  })

  it('pago por PIX: mostra "PIX"; sem forma guardada (pagamento antigo): só a validade', async () => {
    paymentsAPI.history.mockResolvedValue({ data: [{ ...HISTORY[2] }] })
    const { unmount } = renderPage()
    expect(await screen.findByText('Válido até 20 nov 2026 · PIX')).toBeInTheDocument()
    unmount()
    paymentsAPI.history.mockResolvedValue({ data: [{ ...HISTORY[3] }] })
    renderPage({ plan: 'pro' })
    expect(await screen.findByText('Válido até 20 nov 2026')).toBeInTheDocument()
  })

  it('assinatura cancelada: aviso de acesso até a data, sem botão de cancelar de novo', async () => {
    renderPage({ subscriptionCancelled: true })
    expect(await screen.findByText('Não será renovado · acesso até 20 nov 2026 · cartão •••• 4021')).toHaveClass('warn')
    expect(screen.getByRole('status')).toHaveTextContent('Plano não será renovado.')
    expect(screen.queryByRole('button', { name: 'Não renovar' })).not.toBeInTheDocument()
  })

  it('em teste (trial): "Teste do Pro" com o fim do teste, sem valor e sem cancelar', async () => {
    paymentsAPI.history.mockResolvedValue({ data: [] })
    renderPage({ plan: 'pro', isOnTrial: true, trialEndsAt: '2026-11-02T12:00:00Z', planExpiresAt: null })
    expect(screen.getByRole('heading', { name: 'Teste do Pro' })).toBeInTheDocument()
    expect(screen.getByText('Termina em 02 nov 2026')).toBeInTheDocument()
    expect(document.querySelector('.pg-plan-amt')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Não renovar' })).not.toBeInTheDocument()
  })

  it('plano grátis: "Sem cobrança", "Ver planos" leva aos planos, sem cancelar e sem histórico vazio', async () => {
    paymentsAPI.history.mockResolvedValue({ data: [] })
    renderPage({ plan: 'free', planExpiresAt: null })
    expect(screen.getByRole('heading', { name: 'Plano Grátis' })).toBeInTheDocument()
    expect(screen.getByText('Sem cobrança')).toBeInTheDocument()
    await waitFor(() => expect(paymentsAPI.history).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Não renovar' })).not.toBeInTheDocument()
    expect(screen.queryByText('Histórico')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ver planos' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/planos')
  })
})

describe('Pagamentos — histórico', () => {
  it('uma linha por cobrança, da mais nova à mais antiga: data, plano · forma, valor e "Pago"', async () => {
    renderPage()
    expect(await screen.findByText('20 out 2026')).toBeInTheDocument()
    expect(Array.from(document.querySelectorAll('.pg-row-date')).map(n => n.textContent)).toEqual(['20 out 2026', '20 set 2026', '20 ago 2026', '20 jul 2026'])
    expect(Array.from(document.querySelectorAll('.pg-row-sub')).map(n => n.textContent)).toEqual(['Elite · cartão', 'Elite · cartão', 'Elite · PIX', 'Pro · mensal'])
    expect(Array.from(document.querySelectorAll('.pg-row-amt')).map(n => n.textContent)).toEqual(['R$ 34,90', 'R$ 34,90', 'R$ 34,90', 'R$ 9,90'])
    expect(screen.getAllByText('Pago')).toHaveLength(4)
  })

  it('pagamento sem valor guardado não mostra valor (mas continua pago)', async () => {
    paymentsAPI.history.mockResolvedValue({ data: [{ ...HISTORY[3], amount: null }] })
    renderPage({ plan: 'pro' })
    expect(await screen.findByText('20 jul 2026')).toBeInTheDocument()
    expect(document.querySelector('.pg-row-amt')).toBeNull()
    expect(screen.getByText('Pago')).toBeInTheDocument()
  })

  it('plano pago sem nenhum pagamento registrado (ex.: liberado pelo suporte): mensagem', async () => {
    paymentsAPI.history.mockResolvedValue({ data: [] })
    renderPage()
    expect(await screen.findByText('Nenhum pagamento registrado ainda.')).toBeInTheDocument()
  })

  it('falha ao carregar o histórico: aviso, e o resto da tela continua', async () => {
    paymentsAPI.history.mockRejectedValue(new Error('off'))
    renderPage()
    expect(await screen.findByText('Não foi possível carregar o histórico agora.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Não renovar' })).toBeInTheDocument()
  })
})

describe('Pagamentos — cancelar assinatura', () => {
  it('pede a senha, chama a API e avisa até quando o acesso continua', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Não renovar' }))
    const dlg = screen.getByText('Não renovar o plano').closest('.gls-modal')
    expect(within(dlg).getByRole('button', { name: /sim, não renovar/i })).toBeDisabled()
    fireEvent.change(within(dlg).getByPlaceholderText('Sua senha atual'), { target: { value: 'minhasenha' } })
    fireEvent.click(within(dlg).getByRole('button', { name: /sim, não renovar/i }))
    await waitFor(() => expect(authAPI.downgradeFree).toHaveBeenCalledWith({ password: 'minhasenha' }))
    expect(await screen.findByText(/Pronto: seu plano não será renovado\. Seu acesso premium continua até 20\/11\/2026/)).toBeInTheDocument()
    expect(screen.queryByText('Não renovar o plano')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Não renovar' })).not.toBeInTheDocument()
  })

  it('senha errada: o erro do servidor aparece e a assinatura continua ativa', async () => {
    authAPI.downgradeFree.mockRejectedValue({ response: { data: { error: 'Senha incorreta.' } } })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Não renovar' }))
    fireEvent.change(screen.getByPlaceholderText('Sua senha atual'), { target: { value: 'errada' } })
    fireEvent.click(screen.getByRole('button', { name: /sim, não renovar/i }))
    expect(await screen.findByText('Senha incorreta.')).toBeInTheDocument()
    expect(JSON.parse(sessionStorage.getItem('user')).subscriptionCancelled).toBeUndefined()
  })

  it('"Voltar" do modal fecha sem cancelar', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Não renovar' }))
    const dlg = screen.getByText('Não renovar o plano').closest('.gls-modal')
    fireEvent.click(within(dlg).getByRole('button', { name: 'Voltar' }))
    expect(screen.queryByText('Não renovar o plano')).not.toBeInTheDocument()
    expect(authAPI.downgradeFree).not.toHaveBeenCalled()
  })
})

describe('Pagamentos — navegação', () => {
  it('voltar retorna à tela anterior', async () => {
    renderPage({}, ['/settings', '/settings/pagamentos'], 1)
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/settings'))
  })
})
