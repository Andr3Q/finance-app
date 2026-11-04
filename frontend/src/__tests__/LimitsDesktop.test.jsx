import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import Limits from '../pages/Limits.jsx'

vi.mock('../services/api.js', () => ({ transactionsAPI: { dashboard: vi.fn() }, budgetAPI: { setLimit: vi.fn(), removeLimit: vi.fn() } }))
vi.mock('../services/cache.js', () => ({ getCache: vi.fn(() => null), setCache: vi.fn(), invalidateCache: vi.fn() }))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))
import { transactionsAPI, budgetAPI } from '../services/api.js'

const expense = (category, amount) => ({ type: 'expense', category, amount })
const DASH = {
  limits: [{ category: 'shopping', amount: 500 }, { category: 'food', amount: 1500 }, { category: 'transport', amount: 600 }],
  transactions: [expense('food', 1165), expense('transport', 575), expense('shopping', 350)],
}
const setDesktop = (is) => { window.matchMedia = vi.fn(() => ({ matches: is, addEventListener() {}, removeEventListener() {} })) }
function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}</div> }
function setup({ plan = 'pro', data = DASH } = {}) {
  const user = { id: 'u-lim', plan }
  sessionStorage.setItem('user', JSON.stringify(user))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: user }))
  if (data instanceof Error) transactionsAPI.dashboard.mockRejectedValue(data)
  else transactionsAPI.dashboard.mockResolvedValue({ data })
  return render(<MemoryRouter initialEntries={['/limites']}><Where /><Routes><Route path="/limites" element={<Limits />} /><Route path="*" element={<div>outra tela</div>} /></Routes></MemoryRouter>)
}
const cards = () => [...document.querySelectorAll('.nlm-item')]

beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); setDesktop(true) })
afterEach(() => { delete window.matchMedia })

describe('Limites no desktop (design "Nancy Desktop", tela 24)', () => {
  it('abas de Metas e um cartão por categoria com teto: nome, gasto/teto e a nota (disponível, atenção, passou)', async () => {
    setup()
    await screen.findByRole('list', { name: 'Limites por categoria' })
    const tabs = within(screen.getByRole('navigation', { name: 'Seções de metas' })).getAllByRole('button')
    expect(tabs[4]).toHaveTextContent('Limites')
    expect(cards().map(c => c.querySelector('.nlm-name').textContent)).toEqual(['Alimentação', 'Transporte', 'Shopping'])
    expect(cards()[0].querySelector('.nlm-amounts')).toHaveTextContent('R$ 1.165,00de R$ 1.500,00')
    expect(cards()[0].querySelector('.nlm-note')).toHaveTextContent('R$ 335,00 disponível')
    expect(cards()[1].querySelector('.nlm-note')).toHaveTextContent('Atenção: 96% usado')
    expect(cards()[1].querySelector('.nlm-note')).toHaveClass('warn')
    expect(cards()[1].querySelector('.nlm-fill')).toHaveClass('warn')
    expect(document.querySelector('.fin-hero')).toBeNull()
  })

  it('limite estourado fica vermelho e diz quanto passou', async () => {
    setup({ data: { ...DASH, transactions: [expense('food', 1800)] } })
    await screen.findByRole('list', { name: 'Limites por categoria' })
    expect(cards()[0].querySelector('.nlm-note')).toHaveTextContent('Passou R$ 300,00 do limite')
    expect(cards()[0].querySelector('.nlm-fill')).toHaveClass('over')
  })

  it('"Novo limite": escolhe a categoria, informa o teto e salva (a linha aparece na hora)', async () => {
    budgetAPI.setLimit.mockImplementation(async () => { transactionsAPI.dashboard.mockResolvedValue({ data: { ...DASH, limits: [...DASH.limits, { category: 'health', amount: 300 }] } }) }) // o servidor passa a devolver o limite novo
    setup()
    await screen.findByRole('list', { name: 'Limites por categoria' })
    const form = screen.getByRole('region', { name: 'Novo limite' })
    expect(within(form).getByRole('radio', { name: 'Saúde' })).toHaveAttribute('aria-checked', 'true') // a primeira categoria sem teto já vem escolhida
    const campo = within(form).getByPlaceholderText('Teto (R$)')
    fireEvent.change(campo, { target: { value: '300' } }); fireEvent.blur(campo)
    await userEvent.click(within(form).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(budgetAPI.setLimit).toHaveBeenCalledWith({ category: 'health', amount: 300 }))
    expect(await screen.findByText('Limite salvo!')).toBeInTheDocument()
    await waitFor(() => expect(cards().map(c => c.querySelector('.nlm-name').textContent)).toContain('Saúde'))
  })

  it('teto vazio avisa e não salva', async () => {
    setup()
    await screen.findByRole('list', { name: 'Limites por categoria' })
    await userEvent.click(within(screen.getByRole('region', { name: 'Novo limite' })).getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Informe o teto de gasto.')).toBeInTheDocument()
    expect(budgetAPI.setLimit).not.toHaveBeenCalled()
  })

  it('× remove com confirmação; a linha some na hora', async () => {
    budgetAPI.removeLimit.mockImplementation(async () => { transactionsAPI.dashboard.mockResolvedValue({ data: { ...DASH, limits: DASH.limits.filter(l => l.category !== 'food') } }) }) // depois de remover, o servidor devolve sem ele
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Remover limite de Alimentação' }))
    expect(screen.getByRole('dialog', { name: /Remover limite/ })).toBeInTheDocument()
    expect(budgetAPI.removeLimit).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Sim, remover' }))
    await waitFor(() => expect(budgetAPI.removeLimit).toHaveBeenCalledWith('food'))
    expect(cards().map(c => c.querySelector('.nlm-name').textContent)).not.toContain('Alimentação')
  })

  it('"ocultar valores" esconde os reais; fora do Pro: convite; falha: tentar de novo', async () => {
    localStorage.setItem('hide-balance', '1')
    const a = setup()
    await screen.findByRole('list', { name: 'Limites por categoria' })
    expect(document.body.textContent).not.toMatch(/1\.165|1\.500/)
    localStorage.removeItem('hide-balance')
    a.unmount()
    const b = setup({ plan: 'free' })
    expect(await screen.findByRole('heading', { name: 'Recurso Pro' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ver planos' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/planos')
    b.unmount()
    setup({ data: new Error('rede') })
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })
})

describe('Limites — celular continua o mesmo', () => {
  it('abaixo de 901px: cabeçalho azul e lista do celular', async () => {
    setDesktop(false)
    setup()
    expect(await screen.findByRole('heading', { name: 'Limites' })).toBeInTheDocument()
    expect(document.querySelector('.lm-list')).not.toBeNull()
    expect(document.querySelector('.nlm-grid')).toBeNull()
  })
})
