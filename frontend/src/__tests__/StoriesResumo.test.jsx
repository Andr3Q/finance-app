import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import StoriesResumo from '../pages/StoriesResumo.jsx'

const mockNavigate = vi.fn()
import { resetStoriesCache, loadStory, invalidateStories } from '../services/storiesData.js'
vi.mock('react-router-dom', async (importActual) => {
  const actual = await importActual()
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockRecap  = vi.fn()
const mockCreate = vi.fn()
const mockSubs   = vi.fn()
const mockGoals  = vi.fn()
const mockTip    = vi.fn()
vi.mock('../services/api.js', () => ({
  transactionsAPI: { monthlyRecap: (...a) => mockRecap(...a), subscriptions: (...a) => mockSubs(...a) },
  goalsAPI:        { create: (...a) => mockCreate(...a), list: (...a) => mockGoals(...a) },
  agentAPI:        { weeklyTip: (...a) => mockTip(...a) },
}))

const baseRecap = (over = {}) => ({
  month: 10, year: 2026, hasData: true,
  saved: 9500, savedDeltaPct: 32, prevMonth: 9, isBestOfYear: true, belowAverage: null,
  topExpenses: [
    { category: 'fixed', label: 'Conta Fixa', amount: 5080 },
    { category: 'food', label: 'Alimentação', amount: 1165 },
  ],
  totalExpenses: 7255, fixedSharePct: 70, fixedPaid: 9, fixedTotal: 9, expensesDeltaPct: null,
  score: 82, scorePrev: 76, scoreNext: null,
  nextStep: { goalTitle: 'Reserva', currentPct: 61, targetPct: 70 },
  suggestedGoal: 10000,
  ...over,
})

// Número = monthOffset do resumo do mês; objeto = state completo (ex.: { story: 'dicas' }).
function setup(stateOrOffset = 0) {
  const state = typeof stateOrOffset === 'number' ? { monthOffset: stateOrOffset } : stateOrOffset
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/resumo-stories', state }]}>
      <StoriesResumo />
    </MemoryRouter>
  )
}

// Avança até o slide pedido tocando à direita.
async function advance(times) {
  for (let i = 0; i < times; i++) await userEvent.click(screen.getByRole('button', { name: 'Avançar' }))
}

beforeEach(() => {
  resetStoriesCache() // os dados dos stories ficam guardados em memória: cada teste começa do zero
  vi.clearAllMocks()
  localStorage.clear()
  mockRecap.mockResolvedValue({ data: baseRecap() })
})

describe('StoriesResumo — resumo do mês atual (6 slides)', () => {
  it('busca o resumo do mês pedido e mostra a abertura com o nº real de slides', async () => {
    setup(0)
    expect(await screen.findByText('Resumo do mês')).toBeInTheDocument()
    expect(mockRecap).toHaveBeenCalledWith(0)
    expect(screen.getByText(/em 6 histórias/)).toBeInTheDocument()
    expect(document.querySelectorAll('.stories-progress-track')).toHaveLength(6)
  })

  it('slide 2: melhor mês do ano com valor e variação', async () => {
    setup(0)
    await screen.findByText('Resumo do mês')
    await advance(1)
    expect(screen.getByText('Seu melhor mês do ano.')).toBeInTheDocument()
    expect(screen.getByText('R$ 9.500,00')).toBeInTheDocument()
    expect(screen.getByText(/32% a mais que setembro\. Continue assim!/)).toBeInTheDocument()
  })

  it('slide 2: sem ser o melhor mês, não comemora', async () => {
    mockRecap.mockResolvedValue({ data: baseRecap({ isBestOfYear: false, savedDeltaPct: -10 }) })
    setup(0)
    await screen.findByText('Resumo do mês')
    await advance(1)
    expect(screen.queryByText('Seu melhor mês do ano.')).not.toBeInTheDocument()
    expect(screen.getByText('Seu outubro fechou no azul.')).toBeInTheDocument()
    expect(screen.getByText('10% a menos que setembro.')).toBeInTheDocument()
  })

  it('slide 2: saldo negativo vira texto honesto', async () => {
    mockRecap.mockResolvedValue({ data: baseRecap({ saved: -300, isBestOfYear: false, savedDeltaPct: null }) })
    setup(0)
    await screen.findByText('Resumo do mês')
    await advance(1)
    expect(screen.getByText('Seu outubro fechou no vermelho.')).toBeInTheDocument()
    expect(screen.getByText('−R$ 300,00')).toBeInTheDocument()
  })

  it('slide 3: maiores gastos com fatia das contas fixas', async () => {
    setup(0)
    await screen.findByText('Resumo do mês')
    await advance(2)
    expect(screen.getByText('Seus maiores gastos')).toBeInTheDocument()
    expect(screen.getByText('Alimentação')).toBeInTheDocument()
    expect(screen.getByText(/As contas fixas são 70% do total/)).toBeInTheDocument()
  })

  it('slide 4: "Tudo em dia" só com todas as contas fixas pagas — sem inventar juros', async () => {
    setup(0)
    await screen.findByText('Resumo do mês')
    await advance(3)
    expect(screen.getByText('Tudo em dia')).toBeInTheDocument()
    expect(screen.getByText('9/9')).toBeInTheDocument()
    expect(screen.queryByText(/juros/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/atraso/i)).not.toBeInTheDocument()
  })

  it('slide 4 é omitido quando nem tudo foi pago e os gastos não caíram', async () => {
    mockRecap.mockResolvedValue({ data: baseRecap({ fixedPaid: 7 }) })
    setup(0)
    await screen.findByText('Resumo do mês')
    expect(document.querySelectorAll('.stories-progress-track')).toHaveLength(5)
    await advance(3)
    expect(screen.queryByText('Tudo em dia')).not.toBeInTheDocument()
    expect(screen.getByText('Subiu 6 pontos.')).toBeInTheDocument()
  })

  it('slide 5: saúde financeira sobe/cai conforme o mês anterior', async () => {
    setup(0)
    await screen.findByText('Resumo do mês')
    await advance(4)
    expect(screen.getByText('Subiu 6 pontos.')).toBeInTheDocument()
    expect(screen.getByText('82')).toBeInTheDocument()
    expect(screen.getByText('Próximo passo: levar Reserva a 70%.')).toBeInTheDocument()
  })

  it('slide 5: queda de score é dita como queda', async () => {
    mockRecap.mockResolvedValue({ data: baseRecap({ score: 70, scorePrev: 74, nextStep: null }) })
    setup(0)
    await screen.findByText('Resumo do mês')
    await advance(4)
    expect(screen.getByText('Caiu 4 pontos.')).toBeInTheDocument()
    expect(screen.getByText('Próximo passo: criar uma meta para guardar mais.')).toBeInTheDocument()
  })

  it('slide 6: convite pra meta cria a meta do mês seguinte e vai pra /goals', async () => {
    mockCreate.mockResolvedValue({ data: {} })
    setup(0)
    await screen.findByText('Resumo do mês')
    await advance(5)
    expect(screen.getByText('R$ 10 mil?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Criar meta de novembro' }))
    expect(mockCreate).toHaveBeenCalledWith({
      title: 'Meta de novembro', targetAmount: 10000, deadline: '2026-11-30',
    })
    expect(mockNavigate).toHaveBeenCalledWith('/goals')
  })

  it('slide 6: erro do limite do plano aparece e não navega', async () => {
    mockCreate.mockRejectedValue({ response: { data: { error: 'Crie mais metas com o plano Pro ou Elite.' } } })
    setup(0)
    await screen.findByText('Resumo do mês')
    await advance(5)
    await userEvent.click(screen.getByRole('button', { name: 'Criar meta de novembro' }))
    expect(await screen.findByText('Crie mais metas com o plano Pro ou Elite.')).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('slide 6 é omitido quando a Nancy não tem meta realista pra sugerir', async () => {
    mockRecap.mockResolvedValue({ data: baseRecap({ suggestedGoal: null }) })
    setup(0)
    await screen.findByText('Resumo do mês')
    expect(document.querySelectorAll('.stories-progress-track')).toHaveLength(5)
  })
})

describe('StoriesResumo — resumo do mês anterior (2 slides)', () => {
  beforeEach(() => {
    mockRecap.mockResolvedValue({
      data: baseRecap({
        month: 9, saved: 7160, belowAverage: { category: 'transport', label: 'Transporte', pct: 12 },
        score: 76, scoreNext: 82,
      }),
    })
  })

  it('pede offset -1 e mostra só 2 segmentos, sem slide de abertura', async () => {
    setup(-1)
    expect(await screen.findByText('Você guardou')).toBeInTheDocument()
    expect(mockRecap).toHaveBeenCalledWith(-1)
    expect(document.querySelectorAll('.stories-progress-track')).toHaveLength(2)
    expect(screen.getByText('R$ 7.160')).toBeInTheDocument()
    expect(screen.getByText('Um mês sólido, com Transporte 12% abaixo da média.')).toBeInTheDocument()
  })

  it('slide 2: score do mês seguinte descrito de verdade', async () => {
    setup(-1)
    await screen.findByText('Você guardou')
    await advance(1)
    expect(screen.getByText('Estável.')).toBeInTheDocument()
    expect(screen.getByText('76 pontos. Seu score de outubro subiu a partir daqui.')).toBeInTheDocument()
  })
})

describe('StoriesResumo — estados e navegação', () => {
  it('mês sem movimento mostra aviso e nenhum segmento de progresso', async () => {
    mockRecap.mockResolvedValue({ data: baseRecap({ hasData: false }) })
    setup(0)
    expect(await screen.findByText('Sem movimentações em outubro.')).toBeInTheDocument()
    expect(document.querySelectorAll('.stories-progress-track')).toHaveLength(0)
  })

  it('falha ao carregar mostra mensagem de erro', async () => {
    mockRecap.mockRejectedValue(new Error('boom'))
    setup(0)
    expect(await screen.findByText(/Não foi possível carregar o resumo/)).toBeInTheDocument()
  })

  it('botão fechar navega para /dashboard', async () => {
    setup(0)
    await screen.findByText('Resumo do mês')
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
  })

  it('aberto a partir de outra tela (Perfil, Notificações...), fechar VOLTA para ela em vez de ir sempre ao Início', async () => {
    render(
      <MemoryRouter initialEntries={['/settings', { pathname: '/resumo-stories', state: { monthOffset: 0 } }]} initialIndex={1}>
        <StoriesResumo />
      </MemoryRouter>
    )
    await screen.findByText('Resumo do mês')
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(mockNavigate).toHaveBeenCalledWith(-1)
    expect(mockNavigate).not.toHaveBeenCalledWith('/dashboard')
  })

  it('tocar na esquerda no primeiro slide não navega pra lugar nenhum', async () => {
    setup(0)
    await screen.findByText('Resumo do mês')
    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(screen.getByText('Resumo do mês')).toBeInTheDocument()
  })

  it('tocar à direita depois do último slide fecha', async () => {
    setup(-1)
    await screen.findByText('Você guardou')
    await advance(2)
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
  })

  it('botão de pausar alterna para o ícone de retomar', async () => {
    setup(0)
    await screen.findByText('Resumo do mês')
    await userEvent.click(screen.getByRole('button', { name: 'Pausar' }))
    expect(screen.getByRole('button', { name: 'Retomar' })).toBeInTheDocument()
  })
})

describe('StoriesResumo — Dicas IA', () => {
  const tipData = { tip: 'Planeje as refeições. Voltar à média poupa cerca de R$ 90 por mês.', label: 'Alimentação', pct: 18 }
  const subsData = [
    { description: 'Netflix', amount: 55.9 }, { description: 'Spotify', amount: 21.9 }, { description: 'Academia', amount: 41.2 },
  ]

  beforeEach(() => {
    mockTip.mockResolvedValue({ data: tipData })
    mockSubs.mockResolvedValue({ data: subsData })
  })

  it('slide 1 (verde): dica da semana com os números reais; header "Dicas da Nancy"', async () => {
    setup({ story: 'dicas' })
    expect(await screen.findByText('Dica da semana')).toBeInTheDocument()
    expect(screen.getByText('Dicas da Nancy')).toBeInTheDocument()
    expect(screen.getByText('Alimentação está 18% acima da média.')).toBeInTheDocument()
    expect(screen.getByText(tipData.tip)).toBeInTheDocument()
    expect(document.querySelector('.stories-page')).toHaveClass('stories-theme-green')
    expect(document.querySelectorAll('.stories-progress-track')).toHaveLength(2)
    expect(mockRecap).not.toHaveBeenCalled()
    // assinaturas pedidas no modo estrito (sem contas fixas nem compras variáveis)
    expect(mockSubs).toHaveBeenCalledWith({ strict: 1 })
  })

  it('slide 2 (azul): assinaturas somadas + botões, sem afirmar "não usada há N dias"', async () => {
    setup({ story: 'dicas' })
    await screen.findByText('Dica da semana')
    await advance(1)
    expect(screen.getByText('3 assinaturas somam R$ 119/mês.')).toBeInTheDocument()
    expect(screen.getByText('A maior é Netflix (R$ 56/mês). Quer revisar?')).toBeInTheDocument()
    expect(screen.queryByText(/usada/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Revisar com a Nancy' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Compartilhar resumo' })).toBeInTheDocument()
    expect(document.querySelector('.stories-page')).toHaveClass('stories-theme-blue')
  })

  it('"Revisar com a Nancy" volta pro Início pedindo pra abrir o chat (o chat fica sob esta tela)', async () => {
    setup({ story: 'dicas' })
    await screen.findByText('Dica da semana')
    await advance(1)
    await userEvent.click(screen.getByRole('button', { name: 'Revisar com a Nancy' }))
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { state: { openChat: true } })
  })

  it('"Compartilhar resumo" usa o compartilhamento nativo com o texto do slide', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    try {
      setup({ story: 'dicas' })
      await screen.findByText('Dica da semana')
      await advance(1)
      await userEvent.click(screen.getByRole('button', { name: 'Compartilhar resumo' }))
      expect(share).toHaveBeenCalledWith({
        title: 'Uma dica da Nancy',
        text: '3 assinaturas somam R$ 119/mês. — A maior é Netflix (R$ 56/mês). Quer revisar?',
      })
    } finally {
      delete navigator.share
    }
  })

  it('se a dica falhar, as assinaturas ainda aparecem (e vice-versa)', async () => {
    mockTip.mockRejectedValue(new Error('IA fora'))
    setup({ story: 'dicas' })
    expect(await screen.findByText('3 assinaturas somam R$ 119/mês.')).toBeInTheDocument()
    expect(document.querySelectorAll('.stories-progress-track')).toHaveLength(1)
  })

  it('sem base de comparação e sem assinaturas: mensagem vazia, sem segmentos', async () => {
    mockTip.mockResolvedValue({ data: { tip: null } })
    mockSubs.mockResolvedValue({ data: [] })
    setup({ story: 'dicas' })
    expect(await screen.findByText('Ainda sem dicas por aqui.')).toBeInTheDocument()
    expect(document.querySelectorAll('.stories-progress-track')).toHaveLength(0)
  })

  it('as duas fontes falhando mostra erro', async () => {
    mockTip.mockRejectedValue(new Error('x'))
    mockSubs.mockRejectedValue(new Error('y'))
    setup({ story: 'dicas' })
    expect(await screen.findByText(/Não foi possível carregar o resumo/)).toBeInTheDocument()
  })
})

describe('StoriesResumo — Suas metas', () => {
  const day = 24 * 60 * 60 * 1000
  const goal = (over = {}) => ({
    title: 'Reserva de emergência', targetAmount: 29500, currentAmount: 17900,
    createdAt: new Date(Date.now() - 100 * day).toISOString(), deadline: null, ...over,
  })

  it('mostra quanto falta da meta (% e R$) com a projeção do ritmo; 1 segmento, sem botões', async () => {
    mockGoals.mockResolvedValue({ data: [goal()] })
    setup({ story: 'metas' })
    expect(await screen.findByText('Faltam 39%.')).toBeInTheDocument()
    expect(screen.getByText('Suas metas')).toBeInTheDocument()
    expect(screen.getByText('Reserva de emergência')).toBeInTheDocument()
    expect(screen.getByText('R$ 11.600')).toBeInTheDocument()
    expect(screen.getByText(/No ritmo atual, você chega lá/)).toBeInTheDocument()
    expect(document.querySelectorAll('.stories-progress-track')).toHaveLength(1)
    expect(document.querySelector('.stories-page')).toHaveClass('stories-theme-mix')
    expect(screen.queryByRole('button', { name: 'Compartilhar resumo' })).not.toBeInTheDocument()
    expect(mockRecap).not.toHaveBeenCalled()
  })

  it('usa a meta de maior valor entre as não concluídas', async () => {
    mockGoals.mockResolvedValue({ data: [
      goal({ title: 'Viagem', targetAmount: 5000, currentAmount: 100 }),
      goal({ title: 'Carro (pronta)', targetAmount: 90000, currentAmount: 90000 }),
      goal(),
    ] })
    setup({ story: 'metas' })
    expect(await screen.findByText('Reserva de emergência')).toBeInTheDocument()
    expect(screen.queryByText('Viagem')).not.toBeInTheDocument()
  })

  it('sem meta em andamento convida a criar uma', async () => {
    mockGoals.mockResolvedValue({ data: [] })
    setup({ story: 'metas' })
    expect(await screen.findByText('Nenhuma meta em andamento.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Criar uma meta' }))
    expect(mockNavigate).toHaveBeenCalledWith('/goals')
  })

  it('falha ao listar as metas mostra erro', async () => {
    mockGoals.mockRejectedValue(new Error('x'))
    setup({ story: 'metas' })
    expect(await screen.findByText(/Não foi possível carregar o resumo/)).toBeInTheDocument()
  })
})

describe('StoriesResumo — estado de navegação', () => {
  it('story desconhecido cai no resumo do mês', async () => {
    setup({ story: 'qualquer-coisa' })
    expect(await screen.findByText('Resumo do mês')).toBeInTheDocument()
    expect(mockRecap).toHaveBeenCalledWith(0)
  })
})

describe('StoriesResumo — marca a story como vista (anel apagado no Início)', () => {
  const seenKeys = () => Object.keys(JSON.parse(localStorage.getItem('nancy:stories-seen') || '{}'))

  it('resumo do mês atual e do anterior marcam cada um o seu mês', async () => {
    setup(0)
    await screen.findByText('Resumo do mês')
    const now = new Date()
    const key = (off) => { const d = new Date(now.getFullYear(), now.getMonth() + off, 1); return `resumo:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
    expect(seenKeys()).toEqual([key(0)])
  })

  it('mês anterior marca o mês anterior (não o atual)', async () => {
    mockRecap.mockResolvedValue({ data: baseRecap({ month: 9 }) })
    setup(-1)
    await screen.findByText('Você guardou')
    const d = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)
    expect(seenKeys()).toEqual([`resumo:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`])
  })

  it('dicas e metas marcam as próprias chaves', async () => {
    mockTip.mockResolvedValue({ data: { tip: 'x. y.', label: 'Alimentação', pct: 18 } })
    mockSubs.mockResolvedValue({ data: [] })
    const { unmount } = setup({ story: 'dicas' })
    await screen.findByText('Dica da semana')
    expect(seenKeys()).toEqual([expect.stringMatching(/^dicas:\d{4}-W\d{2}$/)])
    unmount()

    localStorage.clear()
    mockGoals.mockResolvedValue({ data: [{ title: 'R', targetAmount: 1000, currentAmount: 100, createdAt: new Date().toISOString(), deadline: null }] })
    setup({ story: 'metas' })
    await screen.findByText(/Faltam/)
    expect(seenKeys()).toEqual([expect.stringMatching(/^metas:\d{4}-\d{2}$/)])
  })

  it('story vazia ou com erro não conta como vista', async () => {
    mockRecap.mockResolvedValue({ data: baseRecap({ hasData: false }) })
    const { unmount } = setup(0)
    await screen.findByText('Sem movimentações em outubro.')
    expect(seenKeys()).toEqual([])
    unmount()

    resetStoriesCache() // reabrir usa o que ficou guardado; aqui queremos uma abertura "a frio" que falha
    mockRecap.mockRejectedValue(new Error('x'))
    setup(0)
    await screen.findByText(/Não foi possível carregar o resumo/)
    expect(seenKeys()).toEqual([])
  })
})

describe('StoriesResumo — ocultar valores (mesma preferência do Início)', () => {
  it('com "ocultar valores" ligado, valores em reais viram R$ •••• e percentuais continuam visíveis', async () => {
    localStorage.setItem('hide-balance', '1')
    setup(0)
    await screen.findByText('Resumo do mês')
    await advance(1)
    expect(screen.getByText('Seu melhor mês do ano.')).toBeInTheDocument()
    expect(screen.getByText('R$ ••••')).toBeInTheDocument()
    expect(screen.queryByText('R$ 9.500,00')).not.toBeInTheDocument()
    expect(screen.getByText(/32% a mais que setembro/)).toBeInTheDocument()
  })

  it('as barras de maiores gastos também ficam ocultas (mas os nomes das categorias não)', async () => {
    localStorage.setItem('hide-balance', '1')
    setup(0)
    await screen.findByText('Resumo do mês')
    await advance(2)
    expect(screen.getByText('Alimentação')).toBeInTheDocument()
    expect(screen.queryByText(/5\.080/)).not.toBeInTheDocument()
    expect(screen.getAllByText('R$ ••••').length).toBeGreaterThanOrEqual(2)
  })

  it('texto compartilhado também sai sem os valores', async () => {
    localStorage.setItem('hide-balance', '1')
    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    try {
      mockSubs.mockResolvedValue({ data: [{ description: 'Netflix', amount: 55.9 }, { description: 'Spotify', amount: 21.9 }] })
      mockTip.mockResolvedValue({ data: { tip: null } })
      setup({ story: 'dicas' })
      await screen.findByText(/assinaturas somam/)
      await userEvent.click(screen.getByRole('button', { name: 'Compartilhar resumo' }))
      expect(share.mock.calls[0][0].text).toBe('2 assinaturas somam R$ ••••/mês. — A maior é Netflix (R$ ••••/mês). Quer revisar?')
    } finally {
      delete navigator.share
    }
  })

  it('com a preferência desligada (padrão) os valores aparecem normalmente', async () => {
    setup(0)
    await screen.findByText('Resumo do mês')
    await advance(1)
    expect(screen.getByText('R$ 9.500,00')).toBeInTheDocument()
  })
})

describe('StoriesResumo — dados já prontos (pré-carregados pelo Início)', () => {
  beforeEach(() => { sessionStorage.setItem('user', JSON.stringify({ id: 'u1' })) })
  afterEach(() => { sessionStorage.clear() })

  it('com o resumo já guardado, abre PRONTO: sem "Montando seu resumo…" e sem nova chamada', async () => {
    await loadStory('u1', 'resumo', 0) // o que o Início faz em segundo plano
    expect(mockRecap).toHaveBeenCalledTimes(1)
    setup(0)
    expect(screen.queryByText('Montando seu resumo…')).not.toBeInTheDocument()
    expect(screen.getByText('Resumo do mês')).toBeInTheDocument() // já na primeira pintura
    expect(mockRecap).toHaveBeenCalledTimes(1)
  })

  it('a busca ainda está no ar: mostra "Montando…" e termina com a MESMA chamada (não repete)', async () => {
    let finish
    mockRecap.mockReturnValue(new Promise(r => { finish = r }))
    const pending = loadStory('u1', 'resumo', 0)
    setup(0)
    expect(screen.getByText('Montando seu resumo…')).toBeInTheDocument()
    finish({ data: baseRecap() })
    await pending
    expect(await screen.findByText('Resumo do mês')).toBeInTheDocument()
    expect(mockRecap).toHaveBeenCalledTimes(1)
  })

  it('o resumo do mês anterior e as metas também abrem prontos', async () => {
    mockGoals.mockResolvedValue({ data: [{ title: 'R', targetAmount: 1000, currentAmount: 100, createdAt: new Date().toISOString(), deadline: null }] })
    await loadStory('u1', 'resumo', -1)
    await loadStory('u1', 'metas')
    const { unmount } = setup(-1)
    expect(screen.queryByText('Montando seu resumo…')).not.toBeInTheDocument()
    expect(screen.getByText('Você guardou')).toBeInTheDocument()
    unmount()
    setup({ story: 'metas' })
    expect(screen.queryByText('Montando seu resumo…')).not.toBeInTheDocument()
    expect(screen.getByText(/Faltam/)).toBeInTheDocument()
    expect(mockRecap).toHaveBeenCalledTimes(1)
    expect(mockGoals).toHaveBeenCalledTimes(1)
  })

  it('mudou algum dado: o guardado é descartado e o story abre buscando o número novo', async () => {
    await loadStory('u1', 'resumo', 0)
    invalidateStories()
    mockRecap.mockResolvedValue({ data: baseRecap({ saved: 1234 }) })
    setup(0)
    expect(screen.getByText('Montando seu resumo…')).toBeInTheDocument()
    expect(await screen.findByText('Resumo do mês')).toBeInTheDocument()
    expect(mockRecap).toHaveBeenCalledTimes(2)
  })

  it('story pré-carregado de OUTRA pessoa nunca aparece (cada conta tem o seu)', async () => {
    await loadStory('outra-pessoa', 'resumo', 0)
    setup(0)
    expect(screen.getByText('Montando seu resumo…')).toBeInTheDocument()
    await screen.findByText('Resumo do mês')
    expect(mockRecap).toHaveBeenCalledTimes(2)
  })
})

