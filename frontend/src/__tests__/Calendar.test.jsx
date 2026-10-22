import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import Calendar from '../pages/Calendar.jsx'

vi.mock('../services/api.js', () => ({
  transactionsAPI:  { list: vi.fn() },
  budgetAPI:        { list: vi.fn() },
  goalsAPI:         { list: vi.fn() },
  installmentsAPI:  { list: vi.fn() },
}))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))

import { transactionsAPI, budgetAPI, goalsAPI, installmentsAPI } from '../services/api.js'

// 20/out/2026 (terça), meio-dia local
const NOW = new Date(2026, 9, 20, 12)
const tx = (id, day, type, category, description, amount) => ({ id, type, category, description, amount, date: new Date(2026, 9, day, 12).toISOString() })

function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}</div> }

function setup({ txs = [], budgets = [], goals = [], installments = [], entries = ['/calendar'], index } = {}) {
  transactionsAPI.list.mockResolvedValue({ data: { data: txs } })
  budgetAPI.list.mockResolvedValue({ data: budgets })
  goalsAPI.list.mockResolvedValue({ data: goals })
  installmentsAPI.list.mockResolvedValue({ data: installments })
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <Where />
      <Routes>
        <Route path="/calendar" element={<Calendar />} />
        <Route path="*" element={<div>outra tela</div>} />
      </Routes>
    </MemoryRouter>
  )
}

const day = (n) => screen.getByRole('button', { name: new RegExp(`^${n} de outubro`) })

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); vi.useFakeTimers({ toFake: ['Date'], now: NOW }) })
afterEach(() => { vi.useRealTimers() })

describe('Calendário — mês e dias', () => {
  it('cabeçalho, mês, dias da semana começando na segunda e outubro/2026 começando na quinta', async () => {
    setup()
    expect(await screen.findByRole('heading', { name: 'Calendário' })).toBeInTheDocument()
    expect(screen.getByText('Vencimentos e lançamentos')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Outubro 2026' })).toBeInTheDocument()
    expect(screen.getAllByText(/^(SEG|TER|QUA|QUI|SEX|SÁB|DOM)$/).map(e => e.textContent)).toEqual(['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'])
    await screen.findByRole('button', { name: /^1 de outubro/ })
    const cells = document.querySelectorAll('.cl-cells > *')
    expect(cells).toHaveLength(35)                 // 5 semanas
    expect([...cells].slice(0, 3).every(c => c.classList.contains('empty'))).toBe(true) // seg, ter, qua vazios
    expect(cells[3]).toHaveTextContent('1')        // quinta
  })

  it('hoje começa selecionado e a lista do dia diz "20 de outubro · hoje"', async () => {
    setup({ txs: [tx('a', 20, 'expense', 'shopping', 'Roupa', 350), tx('b', 20, 'expense', 'fixed', 'Academia', 200)] })
    expect(await screen.findByText('20 de outubro · hoje')).toBeInTheDocument()
    expect(day(20)).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Roupa')).toBeInTheDocument()
    expect(screen.getByText('-R$ 350,00')).toBeInTheDocument()
    expect(screen.getByText('Academia')).toBeInTheDocument()
    expect(screen.getByText('Shopping')).toBeInTheDocument()
  })

  it('bolinhas: entrada verde, saída azul (gasto, conta fixa e parcela contam como saída), meta só se existir', async () => {
    setup({
      txs: [tx('a', 5, 'income', 'income', 'Salário', 5000), tx('b', 5, 'expense', 'food', 'Mercado', 100)],
      budgets: [{ id: 'bg', name: 'Internet', amount: 150, dueDay: 15 }],
      installments: [{ id: 'i', name: 'TV', amount: 300, totalInstallments: 10, paidInstallments: 0, startMonth: 10, startYear: 2026 }],
    })
    await screen.findByRole('button', { name: /^5 de outubro/ })
    const dots = (n) => [...day(n).querySelectorAll('.cl-dot')].map(d => d.className.replace('cl-dot ', ''))
    expect(dots(5).sort()).toEqual(['cl-dot-in', 'cl-dot-out'])
    expect(dots(15)).toEqual(['cl-dot-out'])
    expect(dots(1)).toEqual(['cl-dot-out'])         // parcela cai no dia 1
    expect(dots(7)).toEqual([])
    expect(screen.queryByText('Meta')).not.toBeInTheDocument()
  })

  it('prazo de meta aparece com bolinha própria e a legenda "Meta"', async () => {
    setup({ goals: [{ id: 'g', title: 'Viagem', targetAmount: 8000, deadline: new Date(2026, 9, 28, 12).toISOString() }] })
    expect(await screen.findByText('Meta')).toBeInTheDocument()
    fireEvent.click(day(28))
    expect(screen.getByText('Viagem')).toBeInTheDocument()
    expect(screen.getByText('Prazo da meta')).toBeInTheDocument()
  })

  it('tocar noutro dia mostra os eventos dele; tocar de novo desmarca; dia sem nada avisa', async () => {
    setup({ txs: [tx('a', 5, 'income', 'income', 'Salário', 5000)] })
    await screen.findByRole('button', { name: /^5 de outubro/ })
    fireEvent.click(day(5))
    expect(screen.getByText('5 de outubro')).toBeInTheDocument()
    expect(screen.getByText('Salário')).toBeInTheDocument()
    expect(screen.getByText('+R$ 5.000,00')).toBeInTheDocument()
    fireEvent.click(day(6))
    expect(screen.getByText('Nenhum evento neste dia.')).toBeInTheDocument()
    fireEvent.click(day(6))
    expect(screen.getByText('Toque em um dia para ver os eventos.')).toBeInTheDocument()
  })

  it('conta fixa que vence mostra "Vencimento" e parcela mostra "Parcela N/M"', async () => {
    setup({
      budgets: [{ id: 'bg', name: 'Internet', amount: 150, dueDay: 15 }],
      installments: [{ id: 'i', name: 'TV', amount: 300, totalInstallments: 10, paidInstallments: 0, startMonth: 10, startYear: 2026 }],
    })
    await screen.findByRole('button', { name: /^15 de outubro/ })
    fireEvent.click(day(15))
    expect(screen.getByText('Internet')).toBeInTheDocument()
    expect(screen.getByText('Vencimento')).toBeInTheDocument()
    fireEvent.click(day(1))
    expect(screen.getByText('Parcela 1/10')).toBeInTheDocument()
  })

  it('parcela já paga não aparece no calendário', async () => {
    setup({ installments: [{ id: 'i', name: 'TV', amount: 300, totalInstallments: 10, paidInstallments: 1, startMonth: 10, startYear: 2026 }] })
    await screen.findByRole('button', { name: /^1 de outubro/ })
    expect(day(1).querySelectorAll('.cl-dot')).toHaveLength(0)
  })

  it('ocultar valores (preferência do Início) esconde os R$ da lista', async () => {
    localStorage.setItem('hide-balance', '1')
    setup({ txs: [tx('a', 20, 'expense', 'shopping', 'Roupa', 350)] })
    expect(await screen.findByText('-R$ ••••')).toBeInTheDocument()
    expect(screen.queryByText(/350/)).not.toBeInTheDocument()
  })
})

describe('Calendário — navegação entre meses', () => {
  it('mês seguinte/anterior troca o título, busca o mês certo e mostra "Hoje" pra voltar', async () => {
    setup()
    await screen.findByRole('heading', { name: 'Outubro 2026' })
    expect(screen.queryByRole('button', { name: 'Hoje' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Próximo mês' }))
    expect(await screen.findByRole('heading', { name: 'Novembro 2026' })).toBeInTheDocument()
    await waitFor(() => expect(transactionsAPI.list).toHaveBeenLastCalledWith({ month: 11, year: 2026, limit: 200 }))
    expect(screen.getByText('Toque em um dia para ver os eventos.')).toBeInTheDocument() // dia selecionado some

    fireEvent.click(screen.getByRole('button', { name: 'Hoje' }))
    expect(await screen.findByRole('heading', { name: 'Outubro 2026' })).toBeInTheDocument()
    expect(screen.getByText('20 de outubro · hoje')).toBeInTheDocument()
  })

  it('de janeiro volta pra dezembro do ano anterior', async () => {
    vi.setSystemTime(new Date(2026, 0, 10, 12))
    setup()
    await screen.findByRole('heading', { name: 'Janeiro 2026' })
    fireEvent.click(screen.getByRole('button', { name: 'Mês anterior' }))
    expect(await screen.findByRole('heading', { name: 'Dezembro 2025' })).toBeInTheDocument()
  })

  it('falha ao carregar mostra o aviso de erro', async () => {
    transactionsAPI.list.mockRejectedValue(new Error('offline'))
    budgetAPI.list.mockResolvedValue({ data: [] }); goalsAPI.list.mockResolvedValue({ data: [] }); installmentsAPI.list.mockResolvedValue({ data: [] })
    render(<MemoryRouter><Calendar /></MemoryRouter>)
    expect(await screen.findByText(/erro ao carregar dados do calendário/i)).toBeInTheDocument()
  })

  it('voltar retorna à tela anterior; aberto direto pela URL vai pro Extrato', async () => {
    const first = setup({ entries: ['/dashboard', '/calendar'], index: 1 })
    fireEvent.click(await screen.findByRole('button', { name: 'Voltar' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard')
    first.unmount()
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Voltar' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/transactions')
  })
})
