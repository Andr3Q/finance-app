import {
  peekStory, loadStory, prefetchStories, prefetchStoriesWhenIdle, invalidateStories, resetStoriesCache,
} from '../services/storiesData.js'

vi.mock('../services/api.js', () => ({
  transactionsAPI: { monthlyRecap: vi.fn(), subscriptions: vi.fn() },
  goalsAPI:        { list: vi.fn() },
  agentAPI:        { weeklyTip: vi.fn() },
}))
// A tela dos stories é baixada em segundo plano pelo pré-carregamento; aqui não interessa carregá-la de verdade.
vi.mock('../pages/StoriesResumo.jsx', () => ({ default: () => null }))

import { transactionsAPI, goalsAPI, agentAPI } from '../services/api.js'

const RECAP = (month) => ({ data: { hasData: true, month } })
const deferred = () => { let resolve, reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej }); return { promise, resolve, reject } }
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: new Date(2026, 9, 15, 12) })
  resetStoriesCache()
  transactionsAPI.monthlyRecap.mockImplementation((offset) => Promise.resolve(RECAP(offset)))
  transactionsAPI.subscriptions.mockResolvedValue({ data: [] })
  goalsAPI.list.mockResolvedValue({ data: [{ title: 'Viagem' }] })
  agentAPI.weeklyTip.mockResolvedValue({ data: { tip: 'x' } })
})
afterEach(() => { vi.useRealTimers() })

describe('storiesData — guardar e reaproveitar', () => {
  it('busca uma vez e depois entrega do guardado, na hora, sem nova chamada', async () => {
    expect(peekStory('u1', 'resumo', 0)).toBeUndefined()
    const first = await loadStory('u1', 'resumo', 0)
    expect(first).toEqual({ hasData: true, month: 0 })
    expect(peekStory('u1', 'resumo', 0)).toEqual(first) // síncrono: a tela dos stories abre com isto
    await loadStory('u1', 'resumo', 0)
    expect(transactionsAPI.monthlyRecap).toHaveBeenCalledTimes(1)
  })

  it('duas aberturas ao mesmo tempo se juntam numa busca só', async () => {
    const d = deferred()
    transactionsAPI.monthlyRecap.mockReturnValue(d.promise)
    const a = loadStory('u1', 'resumo', 0)
    const b = loadStory('u1', 'resumo', 0)
    d.resolve(RECAP(0))
    await Promise.all([a, b])
    expect(transactionsAPI.monthlyRecap).toHaveBeenCalledTimes(1)
  })

  it('cada pessoa tem o seu: o resumo de uma nunca aparece para outra', async () => {
    await loadStory('ana', 'resumo', 0)
    expect(peekStory('bia', 'resumo', 0)).toBeUndefined()
    await loadStory('bia', 'resumo', 0)
    expect(transactionsAPI.monthlyRecap).toHaveBeenCalledTimes(2)
  })

  it('mês atual e mês anterior são entradas diferentes', async () => {
    await loadStory('u1', 'resumo', 0)
    expect(peekStory('u1', 'resumo', -1)).toBeUndefined()
    await loadStory('u1', 'resumo', -1)
    expect(transactionsAPI.monthlyRecap).toHaveBeenNthCalledWith(1, 0)
    expect(transactionsAPI.monthlyRecap).toHaveBeenNthCalledWith(2, -1)
  })

  it('erro não é guardado: a próxima abertura tenta de novo', async () => {
    transactionsAPI.monthlyRecap.mockRejectedValueOnce(new Error('rede'))
    await expect(loadStory('u1', 'resumo', 0)).rejects.toThrow('rede')
    expect(peekStory('u1', 'resumo', 0)).toBeUndefined()
    await expect(loadStory('u1', 'resumo', 0)).resolves.toEqual({ hasData: true, month: 0 })
  })

  it('API indisponível (erro síncrono) vira rejeição, não exceção solta', async () => {
    transactionsAPI.monthlyRecap.mockImplementation(() => { throw new TypeError('indisponível') })
    await expect(loadStory('u1', 'resumo', 0)).rejects.toThrow('indisponível')
  })

  it('metas e dicas usam os próprios carregadores (a dica junta as assinaturas; uma fonte falhar não derruba a outra)', async () => {
    expect(await loadStory('u1', 'metas')).toEqual([{ title: 'Viagem' }])
    agentAPI.weeklyTip.mockRejectedValue(new Error('IA fora'))
    expect(await loadStory('u1', 'dicas')).toEqual({ tip: null, subs: [] })
    resetStoriesCache()
    agentAPI.weeklyTip.mockRejectedValue(new Error('IA fora'))
    transactionsAPI.subscriptions.mockRejectedValue(new Error('x'))
    await expect(loadStory('u1', 'dicas')).rejects.toThrow('IA fora')
  })
})

describe('storiesData — validade', () => {
  it('resumo vale 10 min; depois disso busca de novo', async () => {
    await loadStory('u1', 'resumo', 0)
    vi.setSystemTime(new Date(2026, 9, 15, 12, 9))
    expect(peekStory('u1', 'resumo', 0)).toBeDefined()
    vi.setSystemTime(new Date(2026, 9, 15, 12, 11))
    expect(peekStory('u1', 'resumo', 0)).toBeUndefined()
    await loadStory('u1', 'resumo', 0)
    expect(transactionsAPI.monthlyRecap).toHaveBeenCalledTimes(2)
  })

  it('a dica vale por horas (é semanal): não chama a IA a cada abertura', async () => {
    await loadStory('u1', 'dicas')
    vi.setSystemTime(new Date(2026, 9, 15, 16))
    await loadStory('u1', 'dicas')
    expect(agentAPI.weeklyTip).toHaveBeenCalledTimes(1)
  })

  it('virou o mês: o resumo guardado do mês anterior não serve (outra entrada)', async () => {
    await loadStory('u1', 'resumo', 0)
    vi.setSystemTime(new Date(2026, 10, 1, 9))
    expect(peekStory('u1', 'resumo', 0)).toBeUndefined()
  })
})

describe('storiesData — mudou algum dado', () => {
  it('invalidar descarta o guardado', async () => {
    await loadStory('u1', 'resumo', 0)
    invalidateStories()
    expect(peekStory('u1', 'resumo', 0)).toBeUndefined()
  })

  it('o aviso "budget-updated" do app (toda mudança de dado) descarta o guardado', async () => {
    await loadStory('u1', 'metas')
    window.dispatchEvent(new CustomEvent('budget-updated'))
    expect(peekStory('u1', 'metas')).toBeUndefined()
  })

  it('resposta de uma busca iniciada ANTES da mudança não é guardada (seria número velho)', async () => {
    const d = deferred()
    transactionsAPI.monthlyRecap.mockReturnValueOnce(d.promise)
    const pending = loadStory('u1', 'resumo', 0)
    invalidateStories()
    d.resolve(RECAP(0))
    await pending
    expect(peekStory('u1', 'resumo', 0)).toBeUndefined()
  })

  it('depois de uma mudança, refaz em segundo plano (resumo e metas, sem gastar a IA) — várias mudanças seguidas viram uma busca', async () => {
    await prefetchStories('u1', { tip: true })
    vi.clearAllMocks()
    invalidateStories(); invalidateStories(); invalidateStories()
    await vi.advanceTimersByTimeAsync(2100)
    await flush()
    expect(transactionsAPI.monthlyRecap).toHaveBeenCalledTimes(2) // mês atual + anterior, uma vez cada
    expect(goalsAPI.list).toHaveBeenCalledTimes(1)
    expect(agentAPI.weeklyTip).not.toHaveBeenCalled()
    expect(peekStory('u1', 'resumo', 0)).toBeDefined()
  })
})

describe('storiesData — metas compartilhadas entre o Início e o story', () => {
  it('o Início pede as metas e DEPOIS o pré-carregamento roda: uma busca só', async () => {
    const dashboard = loadStory('u1', 'metas') // o que o Início faz ao montar
    await prefetchStories('u1', { tip: false })
    await dashboard
    expect(goalsAPI.list).toHaveBeenCalledTimes(1)
  })

  it('o pré-carregamento já está buscando e o Início pede em seguida: junta-se à mesma busca', async () => {
    const d = deferred()
    goalsAPI.list.mockReturnValue(d.promise)
    const run = prefetchStories('u1', { tip: false })
    await flush()
    const dashboard = loadStory('u1', 'metas')
    d.resolve({ data: [{ title: 'Viagem' }] })
    await Promise.all([run, dashboard])
    expect(goalsAPI.list).toHaveBeenCalledTimes(1)
    await expect(dashboard).resolves.toEqual([{ title: 'Viagem' }])
  })
})

describe('storiesData — pré-carregamento', () => {
  it('busca o que os círculos abrem: mês atual, metas, mês anterior e (com tip) a dica', async () => {
    await prefetchStories('u1', { tip: true })
    expect(peekStory('u1', 'resumo', 0)).toBeDefined()
    expect(peekStory('u1', 'resumo', -1)).toBeDefined()
    expect(peekStory('u1', 'metas')).toBeDefined()
    expect(peekStory('u1', 'dicas')).toBeDefined()
  })

  it('sem base de comparação (tip=false) não chama a IA nem as assinaturas', async () => {
    await prefetchStories('u1', { tip: false })
    expect(agentAPI.weeklyTip).not.toHaveBeenCalled()
    expect(transactionsAPI.subscriptions).not.toHaveBeenCalled()
  })

  it('em duas levas: a segunda só começa quando a primeira terminou (o banco é um só)', async () => {
    const first = deferred()
    transactionsAPI.monthlyRecap.mockImplementation((offset) => (offset === 0 ? first.promise : Promise.resolve(RECAP(offset))))
    const run = prefetchStories('u1', { tip: false })
    await flush()
    expect(transactionsAPI.monthlyRecap).toHaveBeenCalledTimes(1) // só o mês atual (e as metas) saíram
    expect(goalsAPI.list).toHaveBeenCalledTimes(1)
    first.resolve(RECAP(0))
    await run
    expect(transactionsAPI.monthlyRecap).toHaveBeenCalledTimes(2)
  })

  it('o que foi buscado há menos de 1 min não é buscado de novo (voltar ao Início não repete)', async () => {
    await prefetchStories('u1', { tip: true })
    await prefetchStories('u1', { tip: true })
    expect(transactionsAPI.monthlyRecap).toHaveBeenCalledTimes(2)
    expect(agentAPI.weeklyTip).toHaveBeenCalledTimes(1)
    vi.setSystemTime(new Date(2026, 9, 15, 12, 2)) // 2 min depois: refaz o resumo e as metas, mas a dica (semanal) segue guardada
    await prefetchStories('u1', { tip: true })
    expect(transactionsAPI.monthlyRecap).toHaveBeenCalledTimes(4)
    expect(agentAPI.weeklyTip).toHaveBeenCalledTimes(1)
  })

  it('falha numa busca é silenciosa e não impede as outras', async () => {
    transactionsAPI.monthlyRecap.mockImplementation((offset) => (offset === 0 ? Promise.reject(new Error('x')) : Promise.resolve(RECAP(offset))))
    await expect(prefetchStories('u1', { tip: false })).resolves.toBeUndefined()
    expect(peekStory('u1', 'resumo', 0)).toBeUndefined()
    expect(peekStory('u1', 'resumo', -1)).toBeDefined()
    expect(peekStory('u1', 'metas')).toBeDefined()
  })

  it('sem usuário não faz nada', async () => {
    await prefetchStories(undefined, { tip: true })
    expect(transactionsAPI.monthlyRecap).not.toHaveBeenCalled()
  })

  it('com a economia de dados ligada no aparelho, não pré-carrega (o toque busca normalmente)', async () => {
    Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } })
    try {
      await prefetchStories('u1', { tip: true })
      expect(transactionsAPI.monthlyRecap).not.toHaveBeenCalled()
    } finally { delete navigator.connection }
  })

  it('quando o navegador está ocioso: usa requestIdleCallback; sem ele espera 400 ms; dá pra cancelar', async () => {
    delete window.requestIdleCallback
    const cancel = prefetchStoriesWhenIdle('u1', { tip: false })
    await vi.advanceTimersByTimeAsync(300)
    expect(transactionsAPI.monthlyRecap).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(200)
    await flush()
    expect(transactionsAPI.monthlyRecap).toHaveBeenCalled()

    vi.clearAllMocks(); resetStoriesCache()
    const cancel2 = prefetchStoriesWhenIdle('u1', { tip: false })
    cancel2()
    await vi.advanceTimersByTimeAsync(1000)
    expect(transactionsAPI.monthlyRecap).not.toHaveBeenCalled()
    void cancel

    const idle = vi.fn((cb) => { cb(); return 7 })
    window.requestIdleCallback = idle
    window.cancelIdleCallback = vi.fn()
    try {
      prefetchStoriesWhenIdle('u1', { tip: false })
      expect(idle).toHaveBeenCalledWith(expect.any(Function), { timeout: 2000 })
    } finally { delete window.requestIdleCallback; delete window.cancelIdleCallback }
  })
})
