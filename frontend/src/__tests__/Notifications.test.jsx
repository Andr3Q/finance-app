import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import Notifications from '../pages/Notifications.jsx'

import { resetStoriesCache } from '../services/storiesData.js'
vi.mock('../services/api.js', () => ({
  transactionsAPI: { dashboard: vi.fn(), monthlyRecap: vi.fn(), weeklyTipAvailable: vi.fn() },
}))
vi.mock('../services/cache.js', () => ({ getCache: vi.fn(() => null), setCache: vi.fn(), invalidateCache: vi.fn() }))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))
vi.mock('../utils/notifications.js', () => ({
  getSalaryNotif: vi.fn(() => null), getTrialNotif: vi.fn(() => null), playSoftChime: vi.fn(),
}))
// A contagem de histórias vem do mesmo montador das stories — aqui só interessa o número usado na frase.
vi.mock('../utils/storySlides.js', async (importOriginal) => ({
  ...(await importOriginal()),
  buildRecapSlides: vi.fn(() => new Array(6).fill({})),
}))

import { transactionsAPI } from '../services/api.js'
import { getCache, setCache } from '../services/cache.js'
import { getSalaryNotif, getTrialNotif } from '../utils/notifications.js'
import { resetTipAvailableCache } from '../hooks/useTipAvailable.js'

// 28/out/2026 (quarta), meio-dia local: mês quase fechado → o resumo já aparece.
const NOW = new Date(2026, 9, 28, 12)

const payload = (over = {}) => ({
  summary: { unpaidBudgetIds: ['b1'], totalExpenses: 3000, totalIncome: 500 },
  transactions: [{ id: 't1', type: 'expense', category: 'food', amount: 1230 }],
  limits: [{ category: 'food', amount: 1500 }],
  budgets: [{ id: 'b1', name: 'Academia', amount: 200, dueDay: 28, endDate: null }],
  ...over,
})

function Where() {
  const loc = useLocation()
  return <div data-testid="where">{loc.pathname}{loc.state ? ` ${JSON.stringify(loc.state)}` : ''}</div>
}

function setup({ data = payload(), entries = ['/notificacoes'], index } = {}) {
  if (data instanceof Error) transactionsAPI.dashboard.mockRejectedValue(data)
  else transactionsAPI.dashboard.mockResolvedValue({ data })
  transactionsAPI.monthlyRecap.mockResolvedValue({ data: { hasData: true } })
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <Where />
      <Routes>
        <Route path="/notificacoes" element={<Notifications />} />
        <Route path="*" element={<div>outra tela</div>} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  resetStoriesCache() // os dados dos stories ficam guardados em memória: cada teste começa do zero
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
  sessionStorage.setItem('user', JSON.stringify({ id: 'u1' })) // logado: a consulta da dica precisa do usuário
  resetTipAvailableCache()
  transactionsAPI.weeklyTipAvailable.mockResolvedValue({ data: { available: true } }) // há base pra dica (padrão dos testes)
  localStorage.setItem('nancy:stories-seen', JSON.stringify({ 'dicas:2026-W44': Date.now() }))   // dica da semana já aberta
  getCache.mockReturnValue(null)
  getSalaryNotif.mockReturnValue(null)
  getTrialNotif.mockReturnValue(null)
  vi.useFakeTimers({ toFake: ['Date'], now: NOW })
})
afterEach(() => { vi.useRealTimers() })

describe('Notificações — lista', () => {
  it('mostra os avisos calculados dos dados do Início, do mais importante ao menos', async () => {
    getSalaryNotif.mockReturnValue({ status: 'today', msg: 'Hoje é dia de salário!' })
    setup()
    await screen.findByText('Academia vence hoje')
    const names = screen.getAllByText(/vence hoje|Lembrete de salário|do limite|pronto/).map(el => el.textContent)
    expect(names).toEqual([
      'Academia vence hoje',
      'Lembrete de salário',
      'Alimentação em 82% do limite',
      'Resumo de outubro pronto',
    ])
    expect(screen.getByText('R$ 200,00 · conta fixa')).toBeInTheDocument()
    expect(screen.getByText('Seu salário deve cair hoje. Quer registrar?')).toBeInTheDocument()
    expect(screen.getByText('Faltam R$ 270 até o teto do mês.')).toBeInTheDocument()
  })

  it('cabeçalho: título, "N novas" na primeira abertura e "Nenhuma nova" na seguinte', async () => {
    getSalaryNotif.mockReturnValue({ status: 'today', msg: '' })
    const first = setup()
    expect(await screen.findByText('4 novas')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Notificações' })).toBeInTheDocument()
    first.unmount()

    setup() // mesmo aparelho: já foram vistas
    expect(await screen.findByText('Nenhuma nova')).toBeInTheDocument()
    expect(screen.getByText('Academia vence hoje')).toBeInTheDocument() // continuam listadas
  })

  it('um aviso novo depois da primeira visita conta como "1 nova"', async () => {
    const first = setup({ data: payload({ limits: [] }) })
    await screen.findByText('Academia vence hoje')
    first.unmount()

    setup() // agora o limite de Alimentação também estourou o corte de 70%
    expect(await screen.findByText('1 nova')).toBeInTheDocument()
  })

  it('o "N novas" não zera sozinho enquanto a tela está aberta', async () => {
    setup()
    expect(await screen.findByText('3 novas')).toBeInTheDocument()
    await act(async () => { await Promise.resolve() })
    expect(screen.getByText('3 novas')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('nancy:notifs-read'))).toBeTruthy()
  })

  it('usa o cache do Início na hora e atualiza com os dados novos', async () => {
    getCache.mockReturnValue(payload({ budgets: [] }))
    setup()
    expect(screen.queryByText('Carregando…')).not.toBeInTheDocument() // com cache não há espera
    expect(await screen.findByText('Academia vence hoje')).toBeInTheDocument() // chegou o fresco
    expect(setCache).toHaveBeenCalledWith('dashboard', expect.objectContaining({ budgets: expect.any(Array) }))
  })

  it('frase do resumo usa a quantidade real de histórias', async () => {
    setup()
    expect(await screen.findByText('Veja seu mês em 6 histórias')).toBeInTheDocument()
  })

  it('ocultar valores (preferência do Início) esconde os R$ do texto', async () => {
    localStorage.setItem('hide-balance', '1')
    setup()
    await screen.findByText('Academia vence hoje')
    expect(screen.getByText('R$ •••• · conta fixa')).toBeInTheDocument()
    expect(screen.getByText('Faltam R$ •••• até o teto do mês.')).toBeInTheDocument()
    expect(screen.queryByText(/R\$ 200/)).not.toBeInTheDocument()
  })

  it('trial do Pro vira aviso; se o modal de fim de trial já abriu nesta sessão, não duplica', async () => {
    sessionStorage.setItem('user', JSON.stringify({ id: 'u1', name: 'Ana' }))
    getTrialNotif.mockReturnValue({ msg: 'Último dia do trial Pro! Assine agora.' })
    const first = setup({ data: payload({ budgets: [], limits: [] }) })
    expect(await screen.findByText('Último dia do trial Pro! Assine agora.')).toBeInTheDocument()
    first.unmount()

    sessionStorage.setItem('trial_just_expired', '1')
    setup({ data: payload({ budgets: [], limits: [] }) })
    await screen.findByText('Resumo de outubro pronto')
    expect(screen.queryByText('Último dia do trial Pro! Assine agora.')).not.toBeInTheDocument()
  })
})

describe('Notificações — ações', () => {
  it('conta que vence leva às Finanças', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    setup()
    await user.click(await screen.findByRole('button', { name: /Academia vence hoje/ }))
    expect(screen.getByTestId('where')).toHaveTextContent('/contas-do-mes')
  })

  it('limite leva às Metas', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    setup()
    await user.click(await screen.findByRole('button', { name: /Alimentação em 82% do limite/ }))
    expect(screen.getByTestId('where')).toHaveTextContent('/goals')
  })

  it('trial leva aos Planos', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    sessionStorage.setItem('user', JSON.stringify({ id: 'u1' }))
    getTrialNotif.mockReturnValue({ msg: 'Trial Pro — 3 dias restantes.' })
    setup()
    await user.click(await screen.findByRole('button', { name: /Trial Pro/ }))
    expect(screen.getByTestId('where')).toHaveTextContent('/planos')
  })

  it('resumo pronto abre a story do mês atual', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    setup()
    await user.click(await screen.findByRole('button', { name: /Resumo de outubro pronto/ }))
    expect(screen.getByTestId('where')).toHaveTextContent('/resumo-stories {"monthOffset":0}')
  })

  it('lembrete de salário abre a folha "Nova transação" já como entrada', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    getSalaryNotif.mockReturnValue({ status: 'today', msg: '' })
    const heard = vi.fn()
    window.addEventListener('nancy:new-transaction', heard)
    setup()
    await user.click(await screen.findByRole('button', { name: /Lembrete de salário/ }))
    window.removeEventListener('nancy:new-transaction', heard)
    expect(heard).toHaveBeenCalledTimes(1)
    expect(heard.mock.calls[0][0].detail).toEqual({ type: 'income' })
  })

  it('"Preferências de notificação" leva às configurações', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    setup()
    await user.click(await screen.findByRole('button', { name: 'Preferências de notificação' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/settings/notificacoes')
  })

  it('voltar: retorna à tela anterior; sem histórico, vai pro Início', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    const withHistory = setup({ entries: ['/transactions', '/notificacoes'], index: 1 })
    await user.click(await screen.findByRole('button', { name: 'Voltar' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/transactions')
    withHistory.unmount()

    setup() // abriu direto pela URL
    await user.click(await screen.findByRole('button', { name: 'Voltar' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard')
  })
})

describe('Notificações — estados vazios', () => {
  it('sem nada pra avisar: "Tudo em dia" e "Nenhuma nova"', async () => {
    vi.setSystemTime(new Date(2026, 9, 10, 12)) // meio do mês: sem resumo, nada vencendo
    setup({ data: payload({ budgets: [], limits: [], transactions: [] }) })
    expect(await screen.findByText('Tudo em dia')).toBeInTheDocument()
    expect(screen.getByText('Nenhuma nova')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Preferências de notificação' })).toBeInTheDocument()
  })

  it('falha ao carregar (sem cache): mensagem e "Tentar de novo" que refaz a busca', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    setup({ data: new Error('offline') })
    expect(await screen.findByText('Não foi possível carregar')).toBeInTheDocument()

    transactionsAPI.dashboard.mockResolvedValue({ data: payload() })
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Academia vence hoje')).toBeInTheDocument()
    await waitFor(() => expect(transactionsAPI.dashboard).toHaveBeenCalledTimes(2))
  })
})

// Preferências de notificação (tela "Preferências") mandam no que a lista mostra
describe('Notificações — preferências', () => {
  beforeEach(() => localStorage.removeItem('nancy:stories-seen'))   // aqui a dica da semana é nova
  const setUserPrefs = (prefs) => { sessionStorage.setItem('user', JSON.stringify({ id: 'u1', ...prefs })); window.dispatchEvent(new CustomEvent('user-updated', { detail: { id: 'u1', ...prefs } })) }
  const titles = () => Array.from(document.querySelectorAll('.ntf-name')).map(n => n.textContent)

  it('tudo ligado: conta, salário, limite, dica da semana e resumo aparecem', async () => {
    getSalaryNotif.mockReturnValue({ status: 'today', msg: 'x' })
    setup()
    await screen.findByText('Academia vence hoje')
    await screen.findByText('Dica da Nancy IA') // chega depois da consulta ao servidor
    expect(titles()).toEqual(['Academia vence hoje', 'Lembrete de salário', 'Alimentação em 82% do limite', 'Resumo de outubro pronto', 'Dica da Nancy IA'])
  })

  it('SEM base pra dica (o servidor diz que não há), o aviso "sua dica está pronta" NÃO aparece — antes prometia e o story abria vazio', async () => {
    transactionsAPI.weeklyTipAvailable.mockResolvedValue({ data: { available: false } })
    setup()
    await screen.findByText('Academia vence hoje')
    await waitFor(() => expect(transactionsAPI.weeklyTipAvailable).toHaveBeenCalled())
    await act(async () => {})
    expect(titles()).not.toContain('Dica da Nancy IA')
    expect(titles()).toEqual(['Academia vence hoje', 'Alimentação em 82% do limite', 'Resumo de outubro pronto']) // os demais avisos seguem
  })

  it('se a consulta da dica falhar, também não promete a dica', async () => {
    transactionsAPI.weeklyTipAvailable.mockRejectedValue(new Error('fora do ar'))
    setup()
    await screen.findByText('Academia vence hoje')
    await waitFor(() => expect(transactionsAPI.weeklyTipAvailable).toHaveBeenCalled())
    await act(async () => {})
    expect(titles()).not.toContain('Dica da Nancy IA')
  })

  it.each([
    ['notifBudgetReminder', 'Academia vence hoje'],
    ['notifSalary', 'Lembrete de salário'],
    ['notifBudgetAlert', 'Alimentação em 82% do limite'],
    ['notifStories', 'Resumo de outubro pronto'],
    ['notifTips', 'Dica da Nancy IA'],
  ])('com %s desligado, "%s" some da lista', async (field, title) => {
    getSalaryNotif.mockReturnValue({ status: 'today', msg: 'x' })
    setUserPrefs({ [field]: false })
    setup()
    await waitFor(() => expect(transactionsAPI.dashboard).toHaveBeenCalled())
    await waitFor(() => expect(titles().length).toBeGreaterThan(0))
    if (title !== 'Dica da Nancy IA') await screen.findByText('Dica da Nancy IA') // a dica chega depois da consulta ao servidor
    expect(titles()).not.toContain(title)
    expect(titles().length).toBe(4)
  })

  it('a dica da semana leva ao story de dicas e some depois de aberta (na semana)', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    setup()
    await user.click(await screen.findByRole('button', { name: /Dica da Nancy IA/ }))
    expect(screen.getByTestId('where')).toHaveTextContent('/resumo-stories {"story":"dicas"}')
  })

  it('dica da semana já aberta neste aparelho não aparece', async () => {
    localStorage.setItem('nancy:stories-seen', JSON.stringify({ 'dicas:2026-W44': Date.now() }))
    setup()
    await screen.findByText('Academia vence hoje')
    expect(titles()).not.toContain('Dica da Nancy IA')
  })

  it('no dia 1º aparece o resumo do mês anterior (busca o mês -1) e leva à story dele', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    vi.setSystemTime(new Date(2026, 10, 1, 12))   // 1º de novembro
    setup({ data: payload({ budgets: [], limits: [], transactions: [] }) })
    await user.click(await screen.findByRole('button', { name: /Resumo de outubro pronto/ }))
    expect(transactionsAPI.monthlyRecap).toHaveBeenCalledWith(-1)
    expect(screen.getByTestId('where')).toHaveTextContent('/resumo-stories {"monthOffset":-1}')
  })

  it('com "Resumo mensal em stories" desligado nem busca o resumo do mês anterior', async () => {
    vi.setSystemTime(new Date(2026, 10, 1, 12))
    setUserPrefs({ notifStories: false })
    setup({ data: payload({ budgets: [], limits: [], transactions: [] }) })
    await screen.findByText('Tudo em dia')
    expect(transactionsAPI.monthlyRecap).not.toHaveBeenCalled()
  })
})

