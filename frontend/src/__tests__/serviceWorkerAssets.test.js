import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// O service worker guarda os arquivos do app (/assets, com hash no nome) e depois só serve do cache. Quando um arquivo faltava no
// servidor (troca de versão), ele devolvia a página inicial (HTML) com status 200; o service worker a guardava no lugar do arquivo e o
// app travava em "Algo deu errado" — o botão Recarregar não resolvia, só apagar o app. Estes testes rodam o sw.js REAL (o Vitest
// roda a partir de frontend/, então public/ fica no cwd) com um cache e uma rede de mentira.
const SRC = readFileSync(resolve(process.cwd(), 'public', 'sw.js'), 'utf8')
const ORIGEM = 'https://nancy.test'
const js   = () => new Response('export default 1', { status: 200, headers: { 'content-type': 'application/javascript; charset=UTF-8' } })
const html = () => new Response('<!doctype html><title>Nancy</title>', { status: 200, headers: { 'content-type': 'text/html; charset=UTF-8' } })

function carregarSW(rede) {
  const listeners = {}
  const store = new Map() // url -> Response guardada
  const cache = { put: async (req, res) => { store.set(req.url, res) }, delete: async (req) => store.delete(req.url), addAll: async () => {} }
  const caches = { open: async () => cache, match: async (req) => store.get(req.url), keys: async () => [], delete: async () => true }
  const fetchFn = vi.fn(async (req) => rede(req))
  const self = { addEventListener: (tipo, fn) => { listeners[tipo] = fn }, location: { origin: ORIGEM }, skipWaiting() {}, clients: { claim() {} } }
  new Function('self', 'caches', 'fetch', 'clients', SRC)(self, caches, fetchFn, self.clients)

  // Faz uma requisição GET passar pelo service worker. undefined = ele não interveio (a requisição segue direto para a rede).
  async function pedir(url) {
    let resposta
    listeners.fetch({ request: { url, method: 'GET' }, respondWith: (p) => { resposta = p } })
    const res = resposta ? await resposta : undefined
    await new Promise((r) => setTimeout(r, 0)) // a gravação no cache é "solta" (sem await) dentro do service worker
    return res
  }
  return { pedir, store, fetchFn }
}

const URL_JS = `${ORIGEM}/assets/Goals-abc123.js`

describe('service worker — arquivos de /assets', () => {
  it('arquivo de verdade (JS): vem da rede uma vez, é guardado e depois sai do cache sem ir à rede', async () => {
    const sw = carregarSW(() => js())
    expect((await sw.pedir(URL_JS)).headers.get('content-type')).toMatch(/javascript/)
    expect(sw.store.has(URL_JS)).toBe(true)
    await sw.pedir(URL_JS)
    expect(sw.fetchFn).toHaveBeenCalledTimes(1)
  })

  it('HTML com status 200 no lugar do arquivo (o que o servidor fazia quando o arquivo faltava): NÃO é guardado', async () => {
    const sw = carregarSW(() => html())
    await sw.pedir(URL_JS)
    expect(sw.store.has(URL_JS)).toBe(false)
    await sw.pedir(URL_JS) // quando o arquivo passar a existir, a próxima tentativa busca de novo (não fica preso)
    expect(sw.fetchFn).toHaveBeenCalledTimes(2)
  })

  it('cópia ruim JÁ guardada (HTML no lugar do JS): é ignorada, o arquivo vem da rede e substitui a cópia ruim', async () => {
    const sw = carregarSW(() => js())
    sw.store.set(URL_JS, html())
    const res = await sw.pedir(URL_JS)
    expect(res.headers.get('content-type')).toMatch(/javascript/)
    expect(sw.fetchFn).toHaveBeenCalledTimes(1)
    expect(sw.store.get(URL_JS).headers.get('content-type')).toMatch(/javascript/)
  })

  it('a API e requisições de outros sites não passam pelo service worker', async () => {
    const sw = carregarSW(() => js())
    expect(await sw.pedir(`${ORIGEM}/api/auth/me`)).toBeUndefined()
    expect(await sw.pedir('https://fonts.googleapis.com/css2?family=Sora')).toBeUndefined()
    expect(sw.fetchFn).not.toHaveBeenCalled()
  })
})
