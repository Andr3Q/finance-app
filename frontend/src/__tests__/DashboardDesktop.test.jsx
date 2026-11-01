import { render, screen, fireEvent, act, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import DashboardDesktop from '../pages/DashboardDesktop.jsx'

vi.mock('../components/features/AutoLaunchPrompt.jsx', () => ({ default: () => <div data-testid="autolaunch" /> }))
vi.mock('../services/storiesData.js', () => ({ peekStory: vi.fn(), loadStory: vi.fn() }))
import { peekStory, loadStory } from '../services/storiesData.js'

const RECAP = {
  hasData: true, month: 10, year: 2026, prevMonth: 9, saved: 9500, totalIncome: 10800, totalExpenses: 7300,
  topExpenses: [{ category: 'fixed', label: 'Aluguel', amount: 3500 }], fixedTotal: 6, fixedPaid: 6, score: 79, scorePrev: 75,
  suggestedGoal: 2000, savedDeltaPct: 32, expensesDeltaPct: -3, fixedSharePct: 70, isBestOfYear: true, nextStep: null, belowAverage: null,
}
const tx = (id, description, amount, type, category, day) => ({ id, description, amount, type, category, date: `2026-10-${day}T12:00:00`, month: 10, year: 2026 })
const baseCtx = (o = {}) => ({
  user: { id: 'u1', name: 'André Pereira' },
  summary: { salary: 15000, totalIncome: 1800, totalFixedCosts: 5127, unpaidFixedCosts: 247, unpaidBudgetIds: ['b1', 'b2'], totalExpenses: 7300, currentBalance: 23500, autoLaunched: false },
  budgets: [{ id: 'b3', name: 'Aluguel', amount: 3500, dueDay: 5 }, { id: 'b2', name: 'Celular', amount: 47, dueDay: 25 }, { id: 'b1', name: 'Academia', amount: 200, dueDay: 20 }],
  recentTx: [tx('t1', 'Academia', 200, 'expense', 'fixed', 20), tx('t2', 'Dividendos', 1800, 'income', 'income', 25)],
  loadFailed: false, hidden: false, monthGrowth: 8.4, projected: 9500, monthName: 'outubro',
  score: 79, scoreRing: '#19C884', scoreInk: '#117953', onRetry: vi.fn(), ...o,
})
function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}{l.state ? JSON.stringify(l.state) : ''}</div> }
const renderHome = (ctx = baseCtx()) => render(
  <MemoryRouter initialEntries={['/dashboard']}>
    <Routes><Route path="/dashboard" element={<DashboardDesktop ctx={ctx} />} /><Route path="*" element={<Where />} /></Routes>
  </MemoryRouter>
)

beforeEach(() => { vi.clearAllMocks(); peekStory.mockReturnValue(RECAP); loadStory.mockResolvedValue(RECAP) })
afterEach(() => { vi.useRealTimers() })

describe('Início no desktop (design "Nancy Desktop", tela 08) — cartões', () => {
  it('saldo, selo do mês e atalhos: Nova transação e Nancy IA (Planilha IA e Analisador aparecem quando as telas existirem)', () => {
    renderHome()
    expect(screen.getByText('Saldo disponível · outubro')).toBeInTheDocument()
    expect(screen.getByTestId('balance')).toHaveTextContent('R$ 23.500,00')
    expect(screen.getByText('+8,4% no mês')).toBeInTheDocument()
    expect(screen.getAllByRole('button').filter(b => b.className.includes('ndh-quick-btn')).map(b => b.textContent)).toEqual(['Nova transação', 'Nancy IA'])
  })

  it('selo negativo e sem base de comparação (sem salário não há selo)', () => {
    const { unmount } = renderHome(baseCtx({ monthGrowth: -3.2 }))
    expect(screen.getByText('−3,2% no mês')).toHaveClass('neg')
    unmount()
    renderHome(baseCtx({ monthGrowth: null }))
    expect(screen.queryByText(/% no mês/)).not.toBeInTheDocument()
  })

  it('os atalhos agem: Nova transação abre a folha; Nancy IA abre o chat', () => {
    const tipos = []
    const on = (e) => tipos.push(e.type + ':' + JSON.stringify(e.detail ?? null))
    window.addEventListener('nancy:new-transaction', on); window.addEventListener('nancy:open-agent-chat', on)
    renderHome()
    fireEvent.click(screen.getByRole('button', { name: 'Nova transação' }))
    fireEvent.click(screen.getByRole('button', { name: 'Nancy IA' }))
    window.removeEventListener('nancy:new-transaction', on); window.removeEventListener('nancy:open-agent-chat', on)
    expect(tipos).toEqual(['nancy:new-transaction:{}', 'nancy:open-agent-chat:null'])
  })

  it('"ocultar valores" esconde saldo, números, transações, contas e a frase da Nancy IA', () => {
    const { container } = renderHome(baseCtx({ hidden: true }))
    expect(screen.getByTestId('balance')).toHaveTextContent('R$ ••••••')
    expect(container.textContent).not.toMatch(/R\$ \d/)
    expect(container.textContent).toContain('R$ ••••')
  })

  it('números: entradas (salário + entradas), saídas e contas fixas com a nota de cada um', () => {
    renderHome()
    const stats = document.querySelectorAll('.ndh-stat')
    expect(stats).toHaveLength(3)
    expect(stats[0]).toHaveTextContent('EntradasR$ 16.800,00+R$ 1.800 em outras entradas')
    expect(stats[1]).toHaveTextContent('SaídasR$ 7.300,00−3% vs setembro')
    expect(stats[2]).toHaveTextContent('Contas fixasR$ 5.127,001 de 3 pagas')
  })

  it('últimas transações: sinal, cor, data e "Ver extrato →" leva ao Extrato', () => {
    renderHome()
    const rows = document.querySelectorAll('.ndh-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Academia')
    expect(rows[0].querySelector('.ndh-row-amt')).toHaveTextContent('− R$ 200,00')
    expect(rows[0].querySelector('.ndh-row-amt')).not.toHaveClass('inc')
    expect(rows[0].querySelector('.ndh-row-date')).toHaveTextContent('20/10')
    expect(rows[1].querySelector('.ndh-row-amt')).toHaveTextContent('+ R$ 1.800,00')
    expect(rows[1].querySelector('.ndh-row-amt')).toHaveClass('inc')
    fireEvent.click(screen.getByRole('button', { name: 'Ver extrato →' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/transactions')
  })

  it('sem transações mostra o aviso de sempre', () => {
    renderHome(baseCtx({ recentTx: [] }))
    expect(screen.getByText('Nenhuma transação encontrada')).toBeInTheDocument()
  })

  it('saúde financeira: pontuação, selo, anel proporcional e a frase com contas e renda poupada', () => {
    renderHome()
    expect(document.querySelector('.ndh-ring-num')).toHaveTextContent('79')
    expect(document.querySelector('.ndh-ring-tag')).toHaveTextContent('Saudável')
    const arco = document.querySelectorAll('.ndh-ring circle')[1]
    const [feito, total] = arco.getAttribute('stroke-dasharray').split(' ').map(Number)
    expect(feito / total).toBeCloseTo(0.79, 2)
    expect(arco).toHaveAttribute('stroke', '#19C884')
    expect(document.querySelector('.ndh-health-note')).toHaveTextContent('+4 pontos vs setembro. 2 contas a pagar e 57% da renda poupada.')
  })

  it('sem pontuação (sem base) o anel mostra "—"', () => {
    renderHome(baseCtx({ score: null, scoreRing: '#99A5BE', scoreInk: '#5B6784' }))
    expect(document.querySelector('.ndh-ring-num')).toHaveTextContent('—')
  })

  it('próximas contas: só as pendentes, na ordem do vencimento; sem pendência avisa', () => {
    const { unmount } = renderHome()
    const bills = [...document.querySelectorAll('.ndh-bill')].map(b => b.textContent)
    expect(bills).toEqual(['AcademiaVence dia 20R$ 200,00', 'CelularVence dia 25R$ 47,00'])
    unmount()
    renderHome(baseCtx({ summary: { ...baseCtx().summary, unpaidBudgetIds: [] } }))
    expect(screen.getByText('Nenhuma conta pendente')).toBeInTheDocument()
    expect(document.querySelector('.ndh-health-note')).toHaveTextContent(/Contas em dia/)
  })

  it('cartão da Nancy IA: projeção positiva e negativa, e o toque já leva a pergunta ligada ao que diz', () => {
    const msgs = []
    const on = (e) => msgs.push(e.detail?.message)
    window.addEventListener('nancy:open-agent-chat', on)
    const { unmount } = renderHome()
    expect(document.querySelector('.ndh-nancy-text')).toHaveTextContent('No ritmo atual, você termina outubro com R$ 9.500 guardados. Quer que eu ajuste sua meta?')
    fireEvent.click(screen.getByRole('button', { name: /No ritmo atual/ }))
    unmount()
    renderHome(baseCtx({ projected: -300 }))
    expect(document.querySelector('.ndh-nancy-text')).toHaveTextContent('com R$ 300 no vermelho. Quer ajuda para fechar no azul?')
    fireEvent.click(screen.getByRole('button', { name: /No ritmo atual/ }))
    window.removeEventListener('nancy:open-agent-chat', on)
    expect(msgs).toEqual(['Como posso sobrar ainda mais este mês?', 'Como posso fechar este mês no azul?'])
  })

  it('sem projeção (poucos dias de mês) o cartão da Nancy IA não aparece', () => {
    renderHome(baseCtx({ projected: null }))
    expect(document.querySelector('.ndh-nancy')).not.toBeInTheDocument()
  })

  it('falha ao carregar: aviso e "Tentar de novo", sem os cartões', () => {
    const ctx = baseCtx({ loadFailed: true })
    renderHome(ctx)
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar suas finanças.')
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(ctx.onRetry).toHaveBeenCalled()
    expect(document.querySelector('.ndh-grid')).not.toBeInTheDocument()
  })

  it('o aviso de lançar as contas fixas do mês continua no topo (é função do app)', () => {
    renderHome()
    expect(screen.getByTestId('autolaunch')).toBeInTheDocument()
  })
})

describe('Início no desktop — carrossel de resumos', () => {
  const card = () => document.querySelector('.ndh-story')
  const pos = () => within(card()).getByText(/^\d \/ \d$/).textContent
  const tick = (ms) => act(() => { vi.advanceTimersByTime(ms) })
  // um slide por vez: o React só agenda o próximo temporizador depois de processar a troca
  const slides = (n) => { for (let i = 0; i < n; i++) tick(4000) }
  const fake = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] })

  it('mostra o primeiro slide (abertura do resumo) com o contador e o "Ver todos os resumos"', () => {
    renderHome()
    expect(within(card()).getByText('RESUMO DE OUTUBRO')).toBeInTheDocument()
    expect(within(card()).getByText('Seu mês em 6 histórias.')).toBeInTheDocument()
    expect(pos()).toBe('1 / 6')
    expect(card().querySelectorAll('.ndh-story-bar')).toHaveLength(6)
    fireEvent.click(within(card()).getByRole('button', { name: 'Ver todos os resumos' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/resumo-stories{"monthOffset":0}')
  })

  it('avança sozinho a cada 4 segundos e volta ao primeiro depois do último', () => {
    fake(); renderHome()
    expect(pos()).toBe('1 / 6')
    tick(3999); expect(pos()).toBe('1 / 6')
    tick(1); expect(pos()).toBe('2 / 6')
    expect(within(card()).getByText('VOCÊ GUARDOU')).toBeInTheDocument()
    tick(3999); expect(pos()).toBe('2 / 6') // o 2º slide também dura os 4s inteiros (não herda tempo do anterior)
    tick(1); expect(pos()).toBe('3 / 6')
    slides(3); expect(pos()).toBe('6 / 6')
    slides(1); expect(pos()).toBe('1 / 6')
  })

  it('com a abertura em vídeo na tela o carrossel NÃO conta o tempo; ao sair a abertura, começa do primeiro slide', () => {
    fake()
    const splash = document.createElement('div'); splash.id = 'app-splash'; document.body.appendChild(splash)
    renderHome()
    tick(30000); expect(pos()).toBe('1 / 6')
    splash.remove()
    act(() => { window.dispatchEvent(new Event('nancy:splash-gone')) })
    tick(3999); expect(pos()).toBe('1 / 6')
    tick(1); expect(pos()).toBe('2 / 6')
  })

  it('passar o mouse pausa e, ao sair, continua de onde parou (não recomeça os 4 segundos)', () => {
    fake(); renderHome()
    tick(1000)
    fireEvent.mouseEnter(card())
    tick(60000); expect(pos()).toBe('1 / 6')
    fireEvent.mouseLeave(card())
    tick(2999); expect(pos()).toBe('1 / 6')
    tick(1); expect(pos()).toBe('2 / 6')
  })

  it('clicar no cartão avança; clicar numa barra vai direto àquele resumo (e o tempo recomeça)', () => {
    fake(); renderHome()
    tick(1000) // já correu 1s do 1º slide
    fireEvent.click(within(card()).getByRole('button', { name: 'Próximo resumo' }))
    expect(pos()).toBe('2 / 6')
    tick(3999); expect(pos()).toBe('2 / 6') // o slide novo começa do zero: 4s inteiros, sem o 1s do anterior
    fireEvent.click(within(card()).getByRole('button', { name: 'Ir para o resumo 5 de 6' }))
    expect(pos()).toBe('5 / 6')
    expect(within(card()).getByText('SAÚDE FINANCEIRA')).toBeInTheDocument()
    tick(3999); expect(pos()).toBe('5 / 6')
    tick(1); expect(pos()).toBe('6 / 6')
  })

  it('a barra do slide atual anda (animação de 4s); as anteriores ficam cheias e as seguintes vazias', () => {
    fake(); renderHome()
    slides(2)
    const fills = [...card().querySelectorAll('.ndh-story-fill')]
    expect(fills.map(f => f.className.replace('ndh-story-fill', '').trim())).toEqual(['done', 'done', 'cur', '', '', ''])
    expect(fills[2].style.animationDuration).toBe('4000ms')
    expect(fills[2].style.animationPlayState).toBe('running')
    fireEvent.mouseEnter(card())
    expect(fills[2].style.animationPlayState).toBe('paused')
  })

  it('sem resumo (mês sem dados) ou ainda carregando não há carrossel, e o resto da tela continua', () => {
    peekStory.mockReturnValue(null); loadStory.mockResolvedValue({ hasData: false })
    renderHome()
    expect(document.querySelector('.ndh-story')).not.toBeInTheDocument()
    expect(screen.getByTestId('balance')).toBeInTheDocument()
  })

  it('resumo incompleto do servidor não derruba o Início: some o carrossel e o resto da tela segue', () => {
    peekStory.mockReturnValue({ hasData: true, saved: 100, totalIncome: 5000, totalExpenses: 120, prevMonth: 99, expensesDeltaPct: -5 })
    loadStory.mockResolvedValue({ hasData: true, saved: 100 })
    renderHome()
    expect(document.querySelector('.ndh-story')).not.toBeInTheDocument()
    expect(screen.getByTestId('balance')).toHaveTextContent('R$ 23.500,00')
    expect(document.querySelectorAll('.ndh-stat')).toHaveLength(3)
    expect(document.querySelector('.ndh-stat-note')).toBeInTheDocument()
  })

  it('com "ocultar valores" os slides não mostram valores em reais', () => {
    const { container } = renderHome(baseCtx({ hidden: true }))
    fireEvent.click(within(card()).getByRole('button', { name: 'Ir para o resumo 2 de 6' }))
    expect(card().textContent).not.toMatch(/R\$ \d/)
    expect(container.querySelector('.ndh-story-value')).toHaveTextContent('R$ ••••')
  })
})
