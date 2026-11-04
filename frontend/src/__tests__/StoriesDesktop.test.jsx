import { render, screen, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import StoriesResumo from '../pages/StoriesResumo.jsx'

const mockNavigate = vi.fn()
import { resetStoriesCache } from '../services/storiesData.js'
vi.mock('react-router-dom', async (importActual) => {
  const actual = await importActual()
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockRecap  = vi.fn()
const mockCreate = vi.fn()
const mockSubs   = vi.fn()
const mockGoals  = vi.fn()
const mockTip    = vi.fn()
const mockTipOk  = vi.fn()
vi.mock('../services/api.js', () => ({
  transactionsAPI: { monthlyRecap: (...a) => mockRecap(...a), subscriptions: (...a) => mockSubs(...a), weeklyTipAvailable: (...a) => mockTipOk(...a) },
  goalsAPI:        { create: (...a) => mockCreate(...a), list: (...a) => mockGoals(...a) },
  agentAPI:        { weeklyTip: (...a) => mockTip(...a) },
}))

const baseRecap = (over = {}) => ({
  month: 10, year: 2026, hasData: true,
  saved: 9500, savedDeltaPct: 32, prevMonth: 9, isBestOfYear: true, belowAverage: null,
  topExpenses: [
    { category: 'fixed', label: 'Aluguel', amount: 3500 },
    { category: 'food', label: 'Alimentação', amount: 1165 },
  ],
  totalExpenses: 7255, fixedSharePct: 70, fixedPaid: 9, fixedTotal: 9, expensesDeltaPct: null,
  score: 82, scorePrev: 76, scoreNext: null,
  nextStep: { goalTitle: 'Reserva', currentPct: 61, targetPct: 70 },
  suggestedGoal: 10000,
  ...over,
})

const setDesktop = (is) => { window.matchMedia = vi.fn(() => ({ matches: is, addEventListener() {}, removeEventListener() {} })) }
const setup = (state = { monthOffset: 0 }) => render(
  <MemoryRouter initialEntries={[{ pathname: '/resumo-stories', state }]}>
    <StoriesResumo />
  </MemoryRouter>
)
const viewer = () => document.querySelector('.ndsv-viewer')
const nextSlide = () => userEvent.click(within(viewer()).getByRole('button', { name: 'Próximo resumo' }))

beforeEach(() => {
  // o nome dos cartões vem do mês de hoje: fixa em outubro de 2026 sem parar os temporizadores
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-20T15:00:00'))
  resetStoriesCache()
  vi.clearAllMocks()
  mockGoals.mockReset()
  mockGoals.mockResolvedValue({ data: [] })
  mockSubs.mockResolvedValue({ data: [] })
  mockTip.mockResolvedValue({ data: { tip: null } })
  mockTipOk.mockResolvedValue({ data: { available: false } })
  sessionStorage.setItem('user', JSON.stringify({ id: 'u-stories', name: 'André Pereira' }))
  localStorage.clear()
  mockRecap.mockResolvedValue({ data: baseRecap() })
  setDesktop(true)
})
afterEach(() => { vi.useRealTimers(); delete window.matchMedia; sessionStorage.clear() })

describe('Resumo em stories no desktop (design "Nancy Desktop", tela 09)', () => {
  it('quatro conjuntos em cartões (resumo do mês selecionado) e o visualizador com a abertura', async () => {
    setup()
    expect(await screen.findByText('Seu mês em 6 histórias.')).toBeInTheDocument()
    const sets = [...document.querySelectorAll('.ndsv-set')]
    expect(sets.map(s => s.querySelector('.ndsv-set-name').textContent)).toEqual(['Resumo de outubro', 'Dicas IA', 'Metas', 'Setembro'])
    expect(sets.map(s => s.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false'])
    expect(sets[0].querySelector('.ndsv-set-ico')).toHaveTextContent('OUT')
    expect(sets[3].querySelector('.ndsv-set-ico')).toHaveTextContent('SET')
    expect(sets[0]).toHaveTextContent('6 histórias')
    expect(within(viewer()).getByText('RESUMO DE OUTUBRO')).toBeInTheDocument()
    expect(within(viewer()).getByText('Passe o mouse para pausar · clique para avançar')).toBeInTheDocument()
    expect(within(viewer()).getByText('Resumo de outubro')).toHaveClass('ndsv-head-name')
    expect(viewer().querySelectorAll('.ndsv-bar')).toHaveLength(6)
  })

  it('o cartão todo avança ao clique, as barras levam ao slide e o valor redondo sai sem centavos', async () => {
    setup()
    await screen.findByText('Seu mês em 6 histórias.')
    await nextSlide()
    expect(screen.getByText('Seu melhor mês do ano.')).toBeInTheDocument()
    expect(viewer().querySelector('.ndsv-value')).toHaveTextContent(/^R\$ 9\.500$/) // o design escreve "R$ 9.500"
    const fills = [...viewer().querySelectorAll('.ndsv-fill')]
    expect(fills.map(f => f.className.replace('ndsv-fill', '').trim())).toEqual(['done', 'cur', '', '', '', ''])
    await userEvent.click(within(viewer()).getByRole('button', { name: 'Ir para o resumo 1 de 6' }))
    expect(screen.getByText('Seu mês em 6 histórias.')).toBeInTheDocument()
  })

  it('valor com centavos de verdade não é arredondado', async () => {
    mockRecap.mockResolvedValue({ data: baseRecap({ saved: 9532.47 }) })
    setup()
    await screen.findByText('Seu mês em 6 histórias.')
    await nextSlide()
    expect(viewer().querySelector('.ndsv-value')).toHaveTextContent('R$ 9.532,47')
  })

  it('o mouse sobre o cartão pausa a barra e o ícone vira "tocar"; ao sair, volta', async () => {
    setup()
    await screen.findByText('Seu mês em 6 histórias.')
    const cur = () => viewer().querySelector('.ndsv-fill.cur')
    expect(cur().style.animationPlayState).toBe('running')
    expect(viewer().querySelector('.ndsv-pause svg rect')).toBeInTheDocument() // ícone de pausar
    fireEvent.mouseEnter(viewer())
    expect(cur().style.animationPlayState).toBe('paused')
    expect(viewer().querySelector('.ndsv-pause svg rect')).not.toBeInTheDocument() // ícone de tocar
    fireEvent.mouseLeave(viewer())
    expect(cur().style.animationPlayState).toBe('running')
  })

  it('o botão de pausa alterna e o rótulo acompanha', async () => {
    setup()
    await screen.findByText('Seu mês em 6 histórias.')
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Pausar' }))
    expect(screen.getByRole('button', { name: 'Retomar' })).toBeInTheDocument()
  })

  it('o último slide traz Criar meta e Compartilhar (funções do app), e Criar meta cria a meta de novembro', async () => {
    mockCreate.mockResolvedValue({ data: {} })
    setup()
    await screen.findByText('Seu mês em 6 histórias.')
    for (let i = 0; i < 5; i++) await nextSlide()
    expect(screen.getByText('R$ 10 mil?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Compartilhar resumo' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Criar meta de novembro' }))
    expect(mockCreate).toHaveBeenCalledWith({ title: 'Meta de novembro', targetAmount: 10000, deadline: '2026-11-30' })
    expect(mockNavigate).toHaveBeenCalledWith('/goals')
  })

  it('trocar de conjunto navega com o estado do conjunto (sem empilhar histórico)', async () => {
    setup()
    await screen.findByText('Seu mês em 6 histórias.')
    const sets = () => within(document.querySelector('.ndsv-sets'))
    await userEvent.click(sets().getByRole('button', { name: /Setembro/ }))
    expect(mockNavigate).toHaveBeenLastCalledWith('/resumo-stories', { replace: true, state: { story: 'resumo', monthOffset: -1 } })
    await userEvent.click(sets().getByRole('button', { name: /Metas/ }))
    expect(mockNavigate).toHaveBeenLastCalledWith('/resumo-stories', { replace: true, state: { story: 'metas' } })
  })

  it('"ocultar valores" esconde os reais (percentuais continuam) também nos cartões e no valor grande', async () => {
    localStorage.setItem('hide-balance', '1')
    setup()
    await screen.findByText('Seu mês em 6 histórias.')
    await nextSlide()
    expect(viewer().querySelector('.ndsv-value')).toHaveTextContent('R$ ••••')
    expect(screen.getByText(/32% a mais que setembro/)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/9\.500/)
  })

  it('sem dados do mês mostra o aviso honesto e nenhum slide', async () => {
    mockRecap.mockResolvedValue({ data: baseRecap({ hasData: false }) })
    setup()
    expect(await screen.findByText('Sem movimentações em outubro.')).toBeInTheDocument()
    expect(viewer().querySelectorAll('.ndsv-bar')).toHaveLength(0)
    expect(within(viewer()).queryByRole('button', { name: 'Próximo resumo' })).not.toBeInTheDocument()
  })

  it('erro ao carregar oferece "Tentar de novo"', async () => {
    mockRecap.mockRejectedValue(new Error('x'))
    setup()
    const retry = await screen.findByRole('button', { name: 'Tentar de novo' })
    const antes = mockRecap.mock.calls.length
    await userEvent.click(retry)
    expect(mockRecap.mock.calls.length).toBeGreaterThan(antes) // buscou de novo
  })
})

describe('Resumo em stories — celular continua o mesmo', () => {
  it('abaixo de 901px a árvore é a do celular (sem cartões nem visualizador do desktop)', async () => {
    setDesktop(false)
    setup()
    expect(await screen.findByText('Resumo do mês')).toBeInTheDocument()
    expect(document.querySelector('.ndsv-viewer')).toBeNull()
    expect(document.querySelectorAll('.stories-progress-track')).toHaveLength(6)
  })
})
