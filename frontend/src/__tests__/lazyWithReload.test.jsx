import { render, screen, waitFor } from '@testing-library/react'
import { Suspense } from 'react'
import { isChunkLoadError, reloadOnceForNewVersion, loadWithReload, lazyWithReload, reloader } from '../utils/lazyWithReload.js'

const KEY = 'nancy:chunk-reload-at'
let reload
beforeEach(() => { sessionStorage.clear(); reload = vi.spyOn(reloader, 'reload').mockImplementation(() => {}) })
afterEach(() => { vi.restoreAllMocks() })

describe('isChunkLoadError', () => {
  it.each([
    'Failed to fetch dynamically imported module: https://app/assets/Goals-abc123.js',
    'error loading dynamically imported module',
    'Importing a module script failed.',
    "Unexpected token '<'",
    'Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of "text/html".',
    'Loading chunk 12 failed.',
  ])('reconhece "%s"', (message) => expect(isChunkLoadError(new Error(message))).toBe(true))

  it('reconhece pelo nome e não confunde erro comum com arquivo novo', () => {
    expect(isChunkLoadError(Object.assign(new Error('x'), { name: 'ChunkLoadError' }))).toBe(true)
    for (const e of [new Error('Network Error'), new TypeError('x is not a function'), null, undefined, 'falhou']) expect(isChunkLoadError(e)).toBe(false)
  })
})

describe('reloadOnceForNewVersion', () => {
  it('recarrega na primeira vez e não de novo dentro de 1 minuto (sem laço); depois do minuto pode de novo', () => {
    expect(reloadOnceForNewVersion(1_000_000)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(reloadOnceForNewVersion(1_000_000 + 30_000)).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(reloadOnceForNewVersion(1_000_000 + 61_000)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('sem armazenamento (não dá pra limitar a frequência) não recarrega — evita laço infinito', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado') })
    expect(reloadOnceForNewVersion()).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })
})

describe('loadWithReload / lazyWithReload', () => {
  const chunkError = () => new Error('Failed to fetch dynamically imported module: /assets/Goals-old.js')

  it('arquivo novo carrega normal: devolve o módulo sem recarregar', async () => {
    const mod = { default: () => null }
    await expect(loadWithReload(() => Promise.resolve(mod))).resolves.toBe(mod)
    expect(reload).not.toHaveBeenCalled()
  })

  it('arquivo antigo sumiu: recarrega a página uma vez e fica pendente (não mostra a tela de erro)', async () => {
    let settled = false
    loadWithReload(() => Promise.reject(chunkError())).then(() => { settled = true }, () => { settled = true })
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    await new Promise(r => setTimeout(r, 20))
    expect(settled).toBe(false)
  })

  it('se já recarregou há pouco e continua falhando, devolve o erro (a tela de erro aparece, sem laço)', async () => {
    sessionStorage.setItem(KEY, String(Date.now()))
    await expect(loadWithReload(() => Promise.reject(chunkError()))).rejects.toThrow(/dynamically imported/)
    expect(reload).not.toHaveBeenCalled()
  })

  it('erro que não é de arquivo (bug da tela, rede) passa direto, sem recarregar', async () => {
    await expect(loadWithReload(() => Promise.reject(new TypeError('x is not a function')))).rejects.toThrow('x is not a function')
    expect(reload).not.toHaveBeenCalled()
  })

  it('lazyWithReload renderiza a tela quando o arquivo carrega', async () => {
    const Tela = lazyWithReload(() => Promise.resolve({ default: () => <p>Tela carregada</p> }))
    render(<Suspense fallback={<p>carregando</p>}><Tela /></Suspense>)
    expect(await screen.findByText('Tela carregada')).toBeInTheDocument()
  })
})
