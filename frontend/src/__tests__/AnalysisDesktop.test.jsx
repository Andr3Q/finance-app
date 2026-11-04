import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Analysis from '../pages/Analysis.jsx'

vi.mock('../services/api.js', () => ({ transactionsAPI: { dashboard: vi.fn() } }))
vi.mock('../services/cache.js', () => ({ getCache: vi.fn(() => null), setCache: vi.fn(), invalidateCache: vi.fn() }))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))
import { transactionsAPI } from '../services/api.js'

const e = (category, amount) => ({ type: 'expense', category, amount })
const PAYLOAD = {
  summary: { salary: 5000, totalIncome: 1500 },
  transactions: [e('fixed', 5080), e('food', 1165), e('transport', 575), e('shopping', 350), e('health', 130)],
}
const setDesktop = (is) => { window.matchMedia = vi.fn(() => ({ matches: is, addEventListener() {}, removeEventListener() {} })) }
function setup(data = PAYLOAD) {
  if (data instanceof Error) transactionsAPI.dashboard.mockRejectedValue(data)
  else transactionsAPI.dashboard.mockResolvedValue({ data })
  return render(<MemoryRouter initialEntries={['/analise']}><Routes><Route path="/analise" element={<Analysis />} /></Routes></MemoryRouter>)
}
const items = () => [...document.querySelectorAll('.nda-item')]

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); setDesktop(true) })
afterEach(() => { delete window.matchMedia })

describe('Análise do mês no desktop (design "Nancy Desktop", tela 18)', () => {
  it('abas do Extrato (Análise acesa), categorias do maior para o menor com valor e % da renda', async () => {
    setup()
    await screen.findByText('Gastos por categoria')
    const tabs = within(screen.getByRole('navigation', { name: 'Seções do extrato' })).getAllByRole('button')
    expect(tabs.map(t => t.textContent)).toEqual(['Extrato', 'Contas do mês', 'Parceladas', 'Análise'])
    expect(tabs[3]).toHaveClass('on')
    expect(items().map(i => i.querySelector('.nda-name').textContent)).toEqual(['Contas fixas', 'Alimentação', 'Transporte', 'Shopping', 'Saúde'])
    expect(items()[0].querySelector('.nda-val')).toHaveTextContent('R$ 5.080,00')
    expect(items().map(i => i.querySelector('.nda-pct').textContent)).toEqual(['78%', '18%', '9%', '5%', '2%'])
    expect(items().every(i => i.querySelector('.nda-ico svg'))).toBe(true)
    expect(document.querySelector('.fin-hero')).toBeNull()
  })

  it('cartão azul com o maior gasto variável (nome, valor e % do total)', async () => {
    setup()
    const top = await screen.findByLabelText('Maior gasto variável')
    expect(top).toHaveTextContent('MAIOR GASTO VARIÁVEL')
    expect(within(top).getByText('Alimentação')).toBeInTheDocument()
    expect(top.querySelector('.nda-top-val')).toHaveTextContent('R$ 1.165,00')
    expect(within(top).getByText('52% do total')).toBeInTheDocument()
  })

  it('o convite leva a pergunta de quanto cortar à Nancy IA', async () => {
    const heard = vi.fn()
    window.addEventListener('nancy:open-agent-chat', heard)
    setup()
    await userEvent.click(await screen.findByRole('button', { name: /Quer que a Nancy sugira onde cortar R\$ 350/ }))
    window.removeEventListener('nancy:open-agent-chat', heard)
    expect(heard).toHaveBeenCalledTimes(1)
    expect(heard.mock.calls[0][0].detail.message).toMatch(/cortar R\$ 350/)
  })

  it('"ocultar valores" esconde os reais (e o texto do convite)', async () => {
    localStorage.setItem('hide-balance', '1')
    setup()
    await screen.findByText('Gastos por categoria')
    expect(document.body.textContent).not.toMatch(/5\.080|1\.165/)
    expect(items()[0].querySelector('.nda-val')).toHaveTextContent('R$ ••••')
    expect(screen.getByText(/onde cortar R\$ •••• este mês/)).toBeInTheDocument()
  })

  it('sem gastos: aviso; falha: "Tentar de novo" busca de novo', async () => {
    const { unmount } = setup({ summary: { salary: 5000 }, transactions: [] })
    expect(await screen.findByText('Nenhum gasto este mês ainda')).toBeInTheDocument()
    unmount()
    setup(new Error('rede'))
    const retry = await screen.findByRole('button', { name: 'Tentar de novo' })
    transactionsAPI.dashboard.mockResolvedValue({ data: PAYLOAD })
    await userEvent.click(retry)
    await waitFor(() => expect(screen.getByText('Gastos por categoria')).toBeInTheDocument())
  })
})

describe('Análise do mês — celular continua o mesmo', () => {
  it('abaixo de 901px: cabeçalho azul e lista do celular', async () => {
    setDesktop(false)
    setup()
    expect(await screen.findByRole('heading', { name: 'Análise do mês' })).toBeInTheDocument()
    expect(document.querySelector('.an-cats')).not.toBeNull()
    expect(document.querySelector('.nda-card')).toBeNull()
  })
})
