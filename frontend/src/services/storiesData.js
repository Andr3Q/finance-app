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

export const LOADERS = {
  resumo: (offset) => transactionsAPI.monthlyRecap(offset).then(r => r.data),
  // As duas fontes são independentes: se uma falhar, o outro slide ainda vale.
  dicas: async () => {
    const [tip, subs] = await Promise.allSettled([agentAPI.weeklyTip(), transactionsAPI.subscriptions({ strict: 1 })])
    if (tip.status === 'rejected' && subs.status === 'rejected') throw tip.reason
    return {
      tip:  tip.status  === 'fulfilled' ? tip.value.data  : null,
      subs: subs.status === 'fulfilled' ? subs.value.data : [],
    }
  },
  metas: () => goalsAPI.list().then(r => r.data),
}

const store    = new Map() // chave -> { data, at }
const inflight = new Map() // chave -> Promise (a busca que já está no ar)
let generation   = 0       // sobe a cada invalidação: resposta de uma busca iniciada ANTES dela não é guardada
let lastPrefetch = null    // { userId, tip } do último pré-carregamento, pra refazer depois de uma mudança de dado
let refreshTimer = null

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
    .then(() => LOADERS[kind](offset))
    .then(data => { if (gen === generation) store.set(key, { data, at: Date.now() }); return data })
    .finally(() => { if (inflight.get(key) === p) inflight.delete(key) })
  inflight.set(key, p)
  return p
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
  generation++
  if (!lastPrefetch) return
  clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    if (lastPrefetch) prefetchStories(lastPrefetch.userId, { tip: false })
  }, REFRESH_DELAY_MS)
}

/** Só para testes: volta tudo ao estado inicial. */
export function resetStoriesCache() {
  store.clear(); inflight.clear(); generation++; lastPrefetch = null
  clearTimeout(refreshTimer); refreshTimer = null
}

// Todo ponto do app que muda dado avisa com 'budget-updated' (junto de invalidateCache('dashboard')).
if (typeof window !== 'undefined') window.addEventListener('budget-updated', invalidateStories)
