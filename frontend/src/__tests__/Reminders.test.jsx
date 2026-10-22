import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import Reminders from '../pages/Reminders.jsx'

vi.mock('../services/api.js', () => ({ budgetAPI: { list: vi.fn() } }))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))

import { budgetAPI } from '../services/api.js'

const BUDGETS = [
  { id: 'b3', name: 'Cartão de crédito', amount: 900, dueDay: 10 },
  { id: 'b1', name: 'Aluguel', amount: 1800, dueDay: 5 },
  { id: 'b0', name: 'Mercado', amount: 600, dueDay: null },
  { id: 'b2', name: 'Plano de saúde', amount: 400, dueDay: 6 },
]

function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}</div> }
function renderPage({ plan = 'elite', data = BUDGETS, entries = ['/lembretes'], index } = {}) {
  const user = { id: 'u1', plan }
  sessionStorage.setItem('user', JSON.stringify(user))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: user }))
  if (data instanceof Error) budgetAPI.list.mockRejectedValue(data)
  else budgetAPI.list.mockResolvedValue({ data })
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <Where />
      <Routes>
        <Route path="/lembretes" element={<Reminders />} />
        <Route path="*" element={<div>outra tela</div>} />
      </Routes>
    </MemoryRouter>
  )
}
const saved = () => JSON.parse(localStorage.getItem('nancy:reminders'))

beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); localStorage.clear() })

describe('Lembretes', () => {
  it('lista só as contas com dia de vencimento, na ordem do mês, com "Dia N · 2 dias antes" e tudo ligado', async () => {
    renderPage()
    expect(await screen.findByText('Lembretes de vencimento')).toBeInTheDocument()
    expect(screen.getByText('Avisos de vencimento')).toBeInTheDocument()
    const names = Array.from(document.querySelectorAll('.rm-name')).map(n => n.textContent)
    expect(names).toEqual(['Aluguel', 'Plano de saúde', 'Cartão de crédito'])
    expect(Array.from(document.querySelectorAll('.rm-sub')).map(n => n.textContent)).toEqual([
      'Dia 5 · 2 dias antes', 'Dia 6 · 2 dias antes', 'Dia 10 · 2 dias antes',
    ])
    expect(screen.getAllByRole('switch', { checked: true })).toHaveLength(3)
  })

  it('desligar o interruptor guarda no aparelho e não mexe nas outras contas', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('switch', { name: /Cartão de crédito/ }))
    expect(screen.getByRole('switch', { name: /Cartão de crédito/ })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('switch', { name: /Aluguel/ })).toHaveAttribute('aria-checked', 'true')
    expect(saved().bills.b3).toEqual({ on: false, lead: 2 })
    expect(saved().bills.b1).toBeUndefined()
  })

  it('tocar na linha escolhe a antecedência (inclusive "no dia") e a linha mostra a escolha', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Antecedência do lembrete de Cartão de crédito/ }))
    const dlg = screen.getByRole('dialog', { name: /Lembrete de Cartão de crédito/ })
    fireEvent.click(within(dlg).getByRole('radio', { name: 'no dia' }))
    expect(within(dlg).getByRole('radio', { name: 'no dia' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(within(dlg).getByRole('button', { name: 'Pronto' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Dia 10 · no dia')).toBeInTheDocument()
    expect(saved().bills.b3).toEqual({ on: true, lead: 0 })
    // conta de bill não tem "Remover"
    fireEvent.click(screen.getByRole('button', { name: /Antecedência do lembrete de Aluguel/ }))
    expect(screen.queryByRole('button', { name: 'Remover lembrete' })).not.toBeInTheDocument()
  })

  it('"+ Novo lembrete": valida nome e dia, cria um avulso anual ("Janeiro · 7 dias antes") e dá pra remover', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: '+ Novo lembrete' }))
    const dlg = screen.getByRole('dialog', { name: 'Novo lembrete' })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Criar lembrete' }))
    expect(within(dlg).getByRole('alert')).toHaveTextContent('Dê um nome ao lembrete.')
    fireEvent.change(within(dlg).getByLabelText('Nome'), { target: { value: 'IPVA 2027' } })
    fireEvent.change(within(dlg).getByLabelText('Dia do vencimento'), { target: { value: '40' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Criar lembrete' }))
    expect(within(dlg).getByRole('alert')).toHaveTextContent('O dia deve ser um número de 1 a 31.')
    fireEvent.change(within(dlg).getByLabelText('Dia do vencimento'), { target: { value: '15' } })
    fireEvent.change(within(dlg).getByLabelText('Repete'), { target: { value: '1' } })
    fireEvent.change(within(dlg).getByLabelText('Avisar'), { target: { value: '7' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Criar lembrete' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('IPVA 2027')).toBeInTheDocument()
    expect(screen.getByText('Janeiro · 7 dias antes')).toBeInTheDocument()
    expect(saved().custom).toEqual([expect.objectContaining({ name: 'IPVA 2027', day: 15, month: 1, lead: 7, on: true })])

    fireEvent.click(screen.getByRole('button', { name: /Antecedência do lembrete de IPVA 2027/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Remover lembrete' }))
    expect(screen.queryByText('IPVA 2027')).not.toBeInTheDocument()
    expect(saved().custom).toEqual([])
  })

  it('lembrete avulso mensal mostra "Dia N"', async () => {
    localStorage.setItem('nancy:reminders', JSON.stringify({ bills: {}, custom: [{ id: 'c1', name: 'Condomínio', day: 8, month: null, lead: 3, on: true }] }))
    renderPage({ data: [] })
    expect(await screen.findByText('Dia 8 · 3 dias antes')).toBeInTheDocument()
  })

  it('sem contas nem avisos: mensagem vazia, mas dá pra criar um lembrete', async () => {
    renderPage({ data: [] })
    expect(await screen.findByText(/Nenhuma conta com dia de vencimento/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Novo lembrete' })).toBeInTheDocument()
  })

  it('quem não é Elite vê o convite e não chama a API; "Ver planos" leva aos planos', async () => {
    renderPage({ plan: 'pro' })
    expect(await screen.findByText('Recurso Elite')).toBeInTheDocument()
    expect(budgetAPI.list).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Ver planos' }))
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/planos'))
  })

  it('falha ao carregar mostra "Tentar de novo", que recarrega', async () => {
    renderPage({ data: new Error('off') })
    expect(await screen.findByText('Não foi possível carregar')).toBeInTheDocument()
    budgetAPI.list.mockResolvedValue({ data: BUDGETS })
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Aluguel')).toBeInTheDocument()
    expect(budgetAPI.list).toHaveBeenCalledTimes(2)
  })

  it('voltar: retorna à tela anterior; aberto direto, vai pras Metas', async () => {
    renderPage({ entries: ['/goals', '/lembretes'], index: 1 })
    fireEvent.click(await screen.findByRole('button', { name: 'Voltar' }))
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/goals'))
  })
})
