import {
  peekStory, loadStory, prefetchStories, prefetchStoriesWhenIdle, invalidateStories, resetStoriesCache, startStoriesEarly,
} from '../services/storiesData.js'

vi.mock('../services/api.js', () => ({
  transactionsAPI: { monthlyRecap: vi.fn(), subscriptions: vi.fn(), storiesBundle: vi.fn() },
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
  transactionsAPI.storiesBundle.mockRejectedValue(new Error('sem pacote')) // padrão: pacote indisponível -> rotas antigas
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

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

// ── O pacote: resumo do mês + mês anterior + metas numa chamada só (1 ida ao banco no servidor) ───────────────────────
const BUNDLE = (userId = 'u1') => ({ data: { userId, resumo: [{ hasData: true, month: 10 }, { hasData: true, month: 9 }], metas: [{ title: 'Viagem' }] } })

describe('storiesData — pacote', () => {
  it('uma chamada enche o resumo do mês, o do mês anterior e as metas — e nenhuma rota antiga é chamada', async () => {
    transactionsAPI.storiesBundle.mockResolvedValue(BUNDLE())
    expect(await loadStory('u1', 'resumo', 0)).toEqual({ hasData: true, month: 10 })

    expect(peekStory('u1', 'resumo', -1)).toEqual({ hasData: true, month: 9 }) // já guardado: abre na hora
    expect(peekStory('u1', 'metas')).toEqual([{ title: 'Viagem' }])
    expect(transactionsAPI.storiesBundle).toHaveBeenCalledTimes(1)
    expect(transactionsAPI.monthlyRecap).not.toHaveBeenCalled()
    expect(goalsAPI.list).not.toHaveBeenCalled()
  })

  it('os 3 círculos pedidos ao mesmo tempo se juntam em UMA chamada', async () => {
    const d = deferred()
    transactionsAPI.storiesBundle.mockReturnValue(d.promise)
    const all = Promise.all([loadStory('u1', 'resumo', 0), loadStory('u1', 'resumo', -1), loadStory('u1', 'metas')])
    d.resolve(BUNDLE())
    expect(await all).toEqual([{ hasData: true, month: 10 }, { hasData: true, month: 9 }, [{ title: 'Viagem' }]])
    expect(transactionsAPI.storiesBundle).toHaveBeenCalledTimes(1)
  })

  it('o pré-carregamento do Início faz UMA chamada para as duas levas (o mês anterior já veio no pacote)', async () => {
    transactionsAPI.storiesBundle.mockResolvedValue(BUNDLE())
    await prefetchStories('u1', { tip: false })
    expect(transactionsAPI.storiesBundle).toHaveBeenCalledTimes(1)
    expect(transactionsAPI.monthlyRecap).not.toHaveBeenCalled()
    expect(goalsAPI.list).not.toHaveBeenCalled()
    expect(peekStory('u1', 'resumo', -1)).toBeDefined()
  })

  it('pacote falhou: cai nas rotas antigas e o story abre do mesmo jeito', async () => {
    transactionsAPI.storiesBundle.mockRejectedValue(new Error('500'))
    expect(await loadStory('u1', 'resumo', 0)).toEqual({ hasData: true, month: 0 })
    expect(await loadStory('u1', 'metas')).toEqual([{ title: 'Viagem' }])
    expect(transactionsAPI.monthlyRecap).toHaveBeenCalledWith(0)
    expect(goalsAPI.list).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['de outra pessoa', BUNDLE('outra')],
    ['sem o mês anterior', { data: { userId: 'u1', resumo: [{ hasData: true }], metas: [] } }],
    ['vazio', { data: null }],
    ['em formato inesperado', { data: { userId: 'u1', resumo: 'x', metas: 'y' } }],
  ])('pacote %s nunca é guardado nem mostrado: usa as rotas antigas', async (_, answer) => {
    transactionsAPI.storiesBundle.mockResolvedValue(answer)
    expect(await loadStory('u1', 'resumo', 0)).toEqual({ hasData: true, month: 0 })
    expect(peekStory('u1', 'resumo', -1)).toBeUndefined()
    expect(transactionsAPI.monthlyRecap).toHaveBeenCalledTimes(1)
  })

  it('outros meses (que o Início não usa) vão direto pela rota antiga', async () => {
    transactionsAPI.storiesBundle.mockResolvedValue(BUNDLE())
    await loadStory('u1', 'resumo', -3)
    expect(transactionsAPI.monthlyRecap).toHaveBeenCalledWith(-3)
    expect(transactionsAPI.storiesBundle).not.toHaveBeenCalled()
  })

  it('mudou um dado durante a busca do pacote: a resposta velha não é guardada e o pacote é buscado de novo', async () => {
    const d = deferred()
    transactionsAPI.storiesBundle.mockReturnValueOnce(d.promise).mockResolvedValue({ data: { userId: 'u1', resumo: [{ hasData: true, month: 11 }, { hasData: true, month: 10 }], metas: [] } })
    const pending = loadStory('u1', 'resumo', 0)
    await flush()                            // o pedido do pacote já saiu...
    expect(transactionsAPI.storiesBundle).toHaveBeenCalledTimes(1)
    invalidateStories()                      // ...e a pessoa registra uma transação antes de a resposta chegar
    d.resolve(BUNDLE())
    await pending.catch(() => {})
    expect(peekStory('u1', 'resumo', 0)).toBeUndefined() // o número velho não ficou guardado
    expect(await loadStory('u1', 'resumo', 0)).toEqual({ hasData: true, month: 11 })
  })

  it('depois de uma mudança, o refresh em segundo plano usa o pacote (uma chamada)', async () => {
    transactionsAPI.storiesBundle.mockResolvedValue(BUNDLE())
    await prefetchStories('u1', { tip: false })
    transactionsAPI.storiesBundle.mockClear()
    window.dispatchEvent(new Event('budget-updated'))
    await vi.advanceTimersByTimeAsync(2100)
    await flush()
    expect(transactionsAPI.storiesBundle).toHaveBeenCalledTimes(1)
    expect(transactionsAPI.monthlyRecap).not.toHaveBeenCalled()
  })
})

// ── Começar já na abertura do app: o pacote é pedido antes do Início existir ─────────────────────────────────────────
describe('storiesData — começa na abertura do app', () => {
  const answer = (body, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(body) })
  beforeEach(() => { localStorage.setItem('nancy_has_account', '1') })
  afterEach(() => { localStorage.clear(); sessionStorage.clear() })

  it('pede o pacote uma vez (com o cookie) e guarda para a pessoa certa: o toque abre na hora, sem nenhuma chamada nova', async () => {
    const fetchMock = vi.fn().mockReturnValue(answer(BUNDLE('u1').data))
    vi.stubGlobal('fetch', fetchMock)
    startStoriesEarly()
    startStoriesEarly() // chamar de novo não repete
    await flush()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/transactions/stories-bundle')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'include' })
    expect(peekStory('u1', 'resumo', 0)).toEqual({ hasData: true, month: 10 })   // síncrono: o story abre pronto
    expect(peekStory('u1', 'resumo', -1)).toEqual({ hasData: true, month: 9 })
    expect(peekStory('u1', 'metas')).toEqual([{ title: 'Viagem' }])
    expect(peekStory('outra', 'resumo', 0)).toBeUndefined()
    await loadStory('u1', 'resumo', 0)
    expect(transactionsAPI.storiesBundle).not.toHaveBeenCalled()
  })

  it('o Início pede enquanto a chamada da abertura ainda está no ar: junta-se a ela (nada de segunda chamada)', async () => {
    const d = deferred()
    const fetchMock = vi.fn().mockReturnValue(d.promise)
    vi.stubGlobal('fetch', fetchMock)
    startStoriesEarly()
    const pending = loadStory('u1', 'resumo', 0)
    d.resolve({ ok: true, json: () => Promise.resolve(BUNDLE('u1').data) })

    expect(await pending).toEqual({ hasData: true, month: 10 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(transactionsAPI.storiesBundle).not.toHaveBeenCalled()
  })

  it('a chamada da abertura trouxe o pacote de OUTRA pessoa (troca de conta): não vale, busca o certo', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(answer(BUNDLE('antiga').data)))
    transactionsAPI.storiesBundle.mockResolvedValue(BUNDLE('nova'))
    startStoriesEarly()
    expect(await loadStory('nova', 'resumo', 0)).toEqual({ hasData: true, month: 10 })
    expect(transactionsAPI.storiesBundle).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['sem sessão (401)', () => answer({ error: 'x' }, false)],
    ['rede caiu', () => Promise.reject(new Error('rede'))],
    ['resposta fora do formato', () => answer({ foo: 1 })],
  ])('%s: silencioso, nada é guardado e o Início busca normalmente', async (_, reply) => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(reply))
    startStoriesEarly()
    await flush()
    expect(peekStory('u1', 'resumo', 0)).toBeUndefined()
    transactionsAPI.storiesBundle.mockResolvedValue(BUNDLE())
    expect(await loadStory('u1', 'resumo', 0)).toEqual({ hasData: true, month: 10 })
  })

  it('aparelho que nunca teve conta (nem sessão aberta): não faz chamada nenhuma', () => {
    localStorage.clear()
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock)
    startStoriesEarly()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('com sessão aberta (sessionStorage) mesmo sem o aviso do aparelho: começa', async () => {
    localStorage.clear(); sessionStorage.setItem('user', '{"id":"u1"}')
    const fetchMock = vi.fn().mockReturnValue(answer(BUNDLE('u1').data)); vi.stubGlobal('fetch', fetchMock)
    startStoriesEarly()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('economia de dados ligada: não faz chamada na abertura', () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock)
    Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true })
    try { startStoriesEarly(); expect(fetchMock).not.toHaveBeenCalled() }
    finally { Object.defineProperty(navigator, 'connection', { value: undefined, configurable: true }) }
  })

  it('mudou um dado antes de a resposta da abertura chegar: ela é descartada (seria número velho)', async () => {
    const d = deferred()
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(d.promise))
    startStoriesEarly()
    invalidateStories()
    d.resolve({ ok: true, json: () => Promise.resolve(BUNDLE('u1').data) })
    await flush()
    expect(peekStory('u1', 'resumo', 0)).toBeUndefined()
  })
})
