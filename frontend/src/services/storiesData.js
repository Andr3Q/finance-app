import { transactionsAPI, goalsAPI, agentAPI } from './api.js'
import { dicasKey } from '../utils/storiesSeen.js'

// Dados dos stories (resumo do mês, resumo do mês anterior, dicas da Nancy IA e metas), buscados ANTES de a pessoa tocar
// no círculo. O resumo faz o servidor ler as transações do ano e calcular na hora (segundos) e a dica chama a IA: buscar
// só no toque deixava a pessoa olhando "Montando seu resumo…". Aqui os dados ficam em memória, por usuário:
//  • o Início pede o pré-carregamento quando termina de carregar (prefetchStoriesWhenIdle);
//  • a tela dos stories abre com o que já está guardado (peekStory) ou se junta à busca que já está no ar (loadStory),
//    sem repetir a chamada;
//  • qualquer ponto do app que muda dado dispara 'budget-updated': aí o guardado é descartado e refeito em segundo plano,
//    então o story nunca mostra um número velho.
const FRESH_MS         = { resumo: 10 * 60_000, metas: 10 * 60_000, dicas: 6 * 3_600_000 } // a dica é semanal (e o servidor a guarda)
const REFRESH_AFTER_MS = 60_000 // ao voltar ao Início, refaz só o que tem mais de 1 min
const REFRESH_DELAY_MS = 2_000  // depois de uma mudança de dado, espera juntar (várias seguidas viram uma busca só)

// Carregadores de uma coisa só (rotas antigas): ficam como reserva se o pacote falhar.
const LEGACY = {
  resumo: (offset) => transactionsAPI.monthlyRecap(offset).then(r => r.data),
  metas:  () => goalsAPI.list().then(r => r.data),
}

export const LOADERS = {
  // Resumo do mês, do mês anterior e metas vêm de UMA chamada (o pacote): o banco atende uma consulta por vez (~0,6 s cada) e as
  // 3 rotas antigas somavam ~12 consultas — os stories levavam ~8 s para ficar prontos. Falhou o pacote? As rotas antigas valem.
  resumo: (offset, userId) => (userId && (offset === 0 || offset === -1)
    ? loadBundle(userId).then(b => b.resumo[offset === 0 ? 0 : 1]).catch(() => LEGACY.resumo(offset))
    : LEGACY.resumo(offset)),
  // As duas fontes são independentes: se uma falhar, o outro slide ainda vale.
  dicas: async () => {
    const [tip, subs] = await Promise.allSettled([agentAPI.weeklyTip(), transactionsAPI.subscriptions({ strict: 1 })])
    if (tip.status === 'rejected' && subs.status === 'rejected') throw tip.reason
    return {
      tip:  tip.status  === 'fulfilled' ? tip.value.data  : null,
      subs: subs.status === 'fulfilled' ? subs.value.data : [],
    }
  },
  metas: (_offset, userId) => (userId ? loadBundle(userId).then(b => b.metas).catch(() => LEGACY.metas()) : LEGACY.metas()),
}

const store    = new Map() // chave -> { data, at }
const inflight = new Map() // chave -> Promise (a busca que já está no ar)
let generation   = 0       // sobe a cada invalidação: resposta de uma busca iniciada ANTES dela não é guardada
let lastPrefetch = null    // { userId, tip } do último pré-carregamento, pra refazer depois de uma mudança de dado
let refreshTimer = null
const bundleInflight = new Map() // usuário -> a chamada do pacote que já está no ar
let early = null                 // a chamada do pacote disparada na abertura do app: { promise }

const monthStamp = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}` }
// O mês faz parte da chave do resumo e a semana, da dica: virou o mês/a semana, é outra entrada.
const keyOf = (userId, kind, offset = 0) => `${userId}|${kind}|${kind === 'dicas' ? dicasKey() : `${monthStamp()}|${offset}`}`

/** O que já está guardado (e ainda vale) ou undefined. Síncrono: a tela dos stories abre com isto, sem "carregando". */
export function peekStory(userId, kind, offset = 0) {
  const entry = store.get(keyOf(userId, kind, offset))
  return entry && Date.now() - entry.at < FRESH_MS[kind] ? entry.data : undefined
}

/** Guardado e válido → devolve na hora. Busca já no ar → junta-se a ela. Senão busca. Erro nunca é guardado. */
export function loadStory(userId, kind, offset = 0, { force = false } = {}) {
  const key = keyOf(userId, kind, offset)
  if (!force) {
    const hit = peekStory(userId, kind, offset)
    if (hit !== undefined) return Promise.resolve(hit)
  }
  if (inflight.has(key)) return inflight.get(key)

  const gen = generation
  // Promise.resolve().then: um erro síncrono do carregador (ex.: API indisponível) vira rejeição, não exceção solta.
  const p = Promise.resolve()
    .then(() => LOADERS[kind](offset, userId))
    .then(data => { if (gen === generation) store.set(key, { data, at: Date.now() }); return data })
    .finally(() => { if (inflight.get(key) === p) inflight.delete(key) })
  inflight.set(key, p)
  return p
}

const isBundle = (b) => !!b && typeof b.userId === 'string' && Array.isArray(b.resumo) && b.resumo.length === 2 && Array.isArray(b.metas)

// Guarda as três coisas do pacote de uma vez (resumo do mês, do mês anterior e metas), cada uma na sua entrada.
function storeBundle(userId, b) {
  const at = Date.now()
  store.set(keyOf(userId, 'resumo', 0),  { data: b.resumo[0], at })
  store.set(keyOf(userId, 'resumo', -1), { data: b.resumo[1], at })
  store.set(keyOf(userId, 'metas'),      { data: b.metas, at })
}

// Uma chamada de pacote por vez, compartilhada por quem pedir (resumo, metas…). Se o app já disparou a chamada na abertura
// (startStoriesEarly), espera por ela em vez de repetir.
function loadBundle(userId) {
  if (bundleInflight.has(userId)) return bundleInflight.get(userId)
  const gen = generation
  const fetchBundle = () => transactionsAPI.storiesBundle().then(r => r.data)
  const source = early
    ? early.promise.then(b => (isBundle(b) && b.userId === userId ? b : fetchBundle()))
    : Promise.resolve().then(fetchBundle) // Promise.resolve().then: API indisponível vira rejeição, não exceção solta
  const p = source
    .then(b => {
      if (!isBundle(b) || b.userId !== userId) throw new Error('pacote dos stories inválido')
      if (gen === generation) storeBundle(userId, b)
      return b
    })
    .finally(() => { if (bundleInflight.get(userId) === p) bundleInflight.delete(userId) })
  bundleInflight.set(userId, p)
  return p
}

/**
 * Dispara o pacote dos stories ASSIM QUE o app abre — durante a splash e a validação do login, antes mesmo de o Início
 * existir e de saber quem é a pessoa (o cookie diz; a resposta traz o userId). Quando ela toca no círculo, o resumo já
 * está pronto. Só em aparelho que já teve conta; falha é silenciosa (o Início busca normalmente). fetch puro, não axios:
 * um 401 aqui não pode disparar o redirecionamento para o login.
 */
export function startStoriesEarly() {
  try {
    if (early || typeof fetch !== 'function') return
    if (navigator.connection?.saveData) return // economia de dados ligada: não gasta à toa
    if (localStorage.getItem('nancy_has_account') !== '1' && !sessionStorage.getItem('user')) return
  } catch { return }
  const gen = generation
  const promise = fetch('/api/transactions/stories-bundle', { credentials: 'include', headers: { Accept: 'application/json' } })
    .then(r => (r.ok ? r.json() : null))
    .catch(() => null)
  early = { promise }
  promise.then(b => {
    if (early?.promise === promise) early = null // consumida: de agora em diante, chamadas novas vão à rede
    if (isBundle(b) && gen === generation) { storeBundle(b.userId, b); warmStoriesPage() }
  })
}

// A tela dos stories é um pedaço de código separado (carregado só quando abre): baixar antes tira esse atraso da primeira vez.
function warmStoriesPage() {
  try { import('../pages/StoriesResumo.jsx').catch(() => {}) } catch { /* sem rede/sem suporte: abre normal */ }
}

/**
 * Busca em segundo plano o que os círculos do Início abrem. Em duas levas (o Início já carregou, mas o banco é um só):
 * resumo do mês + metas, depois resumo do mês anterior + dica. A dica só entra com tip=true (só existe com base de
 * comparação) e a IA é chamada no máximo uma vez por semana por pessoa. Falha é silenciosa: o toque busca normalmente.
 */
export async function prefetchStories(userId, { tip = false } = {}) {
  if (!userId) return
  if (typeof navigator !== 'undefined' && navigator.connection?.saveData) return // economia de dados ligada: não gasta à toa
  lastPrefetch = { userId, tip }
  warmStoriesPage()

  const run = (kind, offset = 0) => {
    const entry = store.get(keyOf(userId, kind, offset))
    // a dica (IA, semanal) só é refeita quando vence; o resto, quando tem mais de 1 min
    if (entry && Date.now() - entry.at < (kind === 'dicas' ? FRESH_MS.dicas : REFRESH_AFTER_MS)) return Promise.resolve()
    return loadStory(userId, kind, offset, { force: true }).catch(() => {})
  }
  await Promise.all([run('resumo', 0), run('metas')])
  await Promise.all([run('resumo', -1), tip ? run('dicas') : null])
}

/** Como prefetchStories, mas só quando o navegador está ocioso (não disputa com a pintura do Início). Devolve o cancelamento. */
export function prefetchStoriesWhenIdle(userId, opts) {
  const start = () => { prefetchStories(userId, opts) }
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(start, { timeout: 2000 })
    return () => window.cancelIdleCallback?.(id)
  }
  const id = setTimeout(start, 400)
  return () => clearTimeout(id)
}

/** Algo mudou (transação, conta fixa, meta, salário…): descarta o guardado e refaz em segundo plano (sem a dica da IA). */
export function invalidateStories() {
  store.clear()
  inflight.clear()
  bundleInflight.clear()
  early = null
  generation++
  if (!lastPrefetch) return
  clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    if (lastPrefetch) prefetchStories(lastPrefetch.userId, { tip: false })
  }, REFRESH_DELAY_MS)
}

/** Só para testes: volta tudo ao estado inicial. */
export function resetStoriesCache() {
  store.clear(); inflight.clear(); bundleInflight.clear(); early = null; generation++; lastPrefetch = null
  clearTimeout(refreshTimer); refreshTimer = null
}

// Todo ponto do app que muda dado avisa com 'budget-updated' (junto de invalidateCache('dashboard')).
if (typeof window !== 'undefined') window.addEventListener('budget-updated', invalidateStories)

// Voltou para o app depois de um tempo (outro app, tela bloqueada): o que tem mais de 1 min é refeito em segundo plano
// (uma chamada, sem a dica da IA), para o story continuar pronto e sem número velho — o guardado vale 10 min.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && lastPrefetch) prefetchStoriesWhenIdle(lastPrefetch.userId, { tip: false })
  })
}
