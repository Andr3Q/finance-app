import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Goals from '../pages/Goals.jsx'

vi.mock('../services/api.js', () => ({
  goalsAPI: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  transactionsAPI: { monthlyHistory: vi.fn(), subscriptions: vi.fn() },
  agentAPI: { monthlyReport: vi.fn() },
}))
vi.mock('../services/cache.js', () => ({ getCache: vi.fn(() => null), setCache: vi.fn(), invalidateCache: vi.fn() }))
vi.mock('../services/analytics.js', () => ({ analytics: { track: vi.fn() } }))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))
import { goalsAPI } from '../services/api.js'

const setDesktop = (is) => { window.matchMedia = vi.fn(() => ({ matches: is, addEventListener() {}, removeEventListener() {} })) }
const goal = (over = {}) => ({ id: 'g1', title: 'Reserva de emergência', targetAmount: 30000, currentAmount: 18400, deadline: '2026-12-15T12:00:00Z', color: '#3DE29F', ...over })
const GOALS = [goal(), goal({ id: 'g2', title: 'Viagem para Lisboa', targetAmount: 15000, currentAmount: 6200, deadline: '2027-07-10T12:00:00Z', color: '#7b2fff' }), goal({ id: 'g3', title: 'Concluída', targetAmount: 1000, currentAmount: 1000, deadline: null })]
function setup(goals = GOALS, plan = 'elite') {
  const user = { id: 'u-goals', plan }
  sessionStorage.setItem('user', JSON.stringify(user))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: user }))
  goalsAPI.list.mockResolvedValue({ data: goals })
  return render(<MemoryRouter initialEntries={['/goals']}><Goals /></MemoryRouter>)
}
const cards = () => [...document.querySelectorAll('.ndg-card:not(.ndg-new)')]

beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear(); setDesktop(true)
  goalsAPI.create.mockResolvedValue({ data: {} }); goalsAPI.update.mockResolvedValue({ data: {} }); goalsAPI.remove.mockResolvedValue({ data: {} })
})
afterEach(() => { delete window.matchMedia })

describe('Metas no desktop (design "Nancy Desktop", tela 20)', () => {
  it('abas de Metas (Metas acesa) e um cartão por meta: nome, prazo, %, valores e depósito rápido', async () => {
    setup()
    await screen.findByText('Reserva de emergência')
    const tabs = within(screen.getByRole('navigation', { name: 'Seções de metas' })).getAllByRole('button')
    expect(tabs.map(t => t.textContent)).toEqual(['Metas', 'Histórico', 'Assinaturas', 'Lembretes', 'Limites'])
    expect(tabs[0]).toHaveClass('on')
    const c = cards()[0]
    expect(c.querySelector('.ndg-name')).toHaveTextContent('Reserva de emergência')
    expect(c.querySelector('.ndg-due')).toHaveTextContent('Até dez 2026')
    expect(c.querySelector('.ndg-pct')).toHaveTextContent('61%')
    expect(c.querySelector('.ndg-amounts')).toHaveTextContent('R$ 18.400,00R$ 30.000,00')
    expect(within(c).getByRole('button', { name: /Depositar na meta/ })).toHaveTextContent('Depositar R$ 500')
    expect(within(c).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '61')
    expect(document.querySelector('.gl-hero')).toBeNull()
  })

  it('cor: a menta padrão vira o verde do design; cor escolhida pela pessoa continua', async () => {
    setup()
    await screen.findByText('Reserva de emergência')
    expect(cards()[0].style.getPropertyValue('--gc')).toBe('#12C985')
    expect(cards()[1].style.getPropertyValue('--gc')).toBe('#7b2fff')
  })

  it('meta concluída mostra "Concluída" e "Meta atingida" no lugar do depósito', async () => {
    setup()
    await screen.findByText('Concluída', { selector: '.ndg-name' })
    const c = cards()[2]
    expect(c.querySelector('.ndg-pct')).toHaveTextContent('Concluída')
    expect(c.querySelector('.ndg-done')).toHaveTextContent('Meta atingida')
    expect(within(c).queryByRole('button', { name: /Depositar/ })).not.toBeInTheDocument()
    expect(c.querySelector('.ndg-due')).toBeNull() // sem prazo, sem linha de prazo
  })

  it('depósito rápido abre o modal com R$ 500 e soma ao guardado', async () => {
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Depositar na meta Reserva de emergência' }))
    const dlg = await screen.findByRole('dialog', { name: 'Depositar na meta' })
    expect(within(dlg).getByPlaceholderText('0,00')).toHaveValue('500,00')
    await userEvent.click(within(dlg).getByRole('button', { name: 'Depositar' }))
    await waitFor(() => expect(goalsAPI.update).toHaveBeenCalledWith('g1', { currentAmount: 18900 }))
  })

  it('tocar no nome abre a edição; remover pede confirmação', async () => {
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Editar meta Reserva de emergência' }))
    const dlg = await screen.findByRole('dialog', { name: 'Editar meta' })
    await userEvent.click(within(dlg).getByRole('button', { name: 'Remover meta' }))
    expect(screen.getByRole('dialog', { name: /Remover meta/ })).toBeInTheDocument()
    expect(goalsAPI.remove).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Sim, excluir' }))
    await waitFor(() => expect(goalsAPI.remove).toHaveBeenCalledWith('g1'))
  })

  it('"Nova meta": só habilita com nome e valor, cria e limpa o formulário', async () => {
    setup([])
    const form = await screen.findByRole('form', { name: 'Nova meta' })
    const criar = within(form).getByRole('button', { name: 'Criar meta' })
    expect(criar).toBeDisabled()
    fireEvent.change(within(form).getByPlaceholderText('Ex.: Carro novo'), { target: { value: 'Carro' } })
    const valor = within(form).getByPlaceholderText('Valor alvo (R$)')
    fireEvent.change(valor, { target: { value: '60000' } }); fireEvent.blur(valor)
    expect(criar).toBeEnabled()
    await userEvent.click(criar)
    await waitFor(() => expect(goalsAPI.create).toHaveBeenCalledWith(expect.objectContaining({ title: 'Carro', targetAmount: 60000 })))
    await waitFor(() => expect(within(form).getByPlaceholderText('Ex.: Carro novo')).toHaveValue(''))
  })

  it('plano gratuito com uma meta: criar fica desligado e explica o limite', async () => {
    setup([goal()], 'free')
    await screen.findByText('Reserva de emergência')
    expect(screen.getByText('Você atingiu o limite de metas do seu plano.')).toBeInTheDocument()
    expect(within(screen.getByRole('form', { name: 'Nova meta' })).getByRole('button', { name: 'Criar meta' })).toBeDisabled()
  })
})

describe('Metas — celular continua o mesmo', () => {
  it('abaixo de 901px: cabeçalho azul e cartões do celular', async () => {
    setDesktop(false)
    setup()
    expect(await screen.findByRole('heading', { name: 'Metas' })).toBeInTheDocument()
    expect(document.querySelector('.gl-card')).not.toBeNull()
    expect(document.querySelector('.ndg-card')).toBeNull()
  })
})
