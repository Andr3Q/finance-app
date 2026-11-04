import { renderHook, act } from '@testing-library/react'

// Os três hooks guardam estado no módulo: cada teste carrega uma cópia nova.
beforeEach(() => { vi.resetModules(); localStorage.clear() })
afterEach(() => { vi.restoreAllMocks() })

describe('useHideBalance — "ocultar valores" (olho do Início e da barra de cima)', () => {
  const load = async () => (await import('../hooks/useHideBalance.js')).useHideBalance

  it('começa com o que está guardado no aparelho', async () => {
    localStorage.setItem('hide-balance', '1')
    const useHideBalance = await load()
    const { result } = renderHook(() => useHideBalance())
    expect(result.current[0]).toBe(true)
  })

  it('alternar grava no aparelho e muda todos que usam o hook ao mesmo tempo', async () => {
    const useHideBalance = await load()
    const a = renderHook(() => useHideBalance())
    const b = renderHook(() => useHideBalance())
    expect([a.result.current[0], b.result.current[0]]).toEqual([false, false])
    act(() => a.result.current[1]())
    expect([a.result.current[0], b.result.current[0]]).toEqual([true, true])
    expect(localStorage.getItem('hide-balance')).toBe('1')
    act(() => b.result.current[1]())
    expect([a.result.current[0], b.result.current[0]]).toEqual([false, false])
    expect(localStorage.getItem('hide-balance')).toBe('0')
  })

  it('sem armazenamento (aba privada) o olho continua funcionando na sessão', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado') })
    const useHideBalance = await load()
    const a = renderHook(() => useHideBalance())
    const b = renderHook(() => useHideBalance())
    act(() => a.result.current[1]())
    expect([a.result.current[0], b.result.current[0]]).toEqual([true, true])
    // navegar para outra tela monta o hook de novo: o valor em memória continua valendo
    const c = renderHook(() => useHideBalance())
    expect(c.result.current[0]).toBe(true)
  })

  it('quem monta depois lê de novo o aparelho (a preferência pode ter mudado com o módulo já carregado)', async () => {
    const useHideBalance = await load()
    const first = renderHook(() => useHideBalance())
    expect(first.result.current[0]).toBe(false)
    first.unmount()
    localStorage.setItem('hide-balance', '1')
    // já no PRIMEIRO desenho da tela os valores estão ocultos (sem um quadro mostrando o saldo antes de esconder)
    const renders = []
    const second = renderHook(() => { const [h] = useHideBalance(); renders.push(h); return [h] })
    expect(renders[0]).toBe(true)
    expect(second.result.current[0]).toBe(true)
    second.unmount()
    localStorage.clear()
    const third = renderHook(() => useHideBalance())
    expect(third.result.current[0]).toBe(false)
  })

  it('mudança vinda de outra aba (evento storage) atualiza', async () => {
    const useHideBalance = await load()
    const { result } = renderHook(() => useHideBalance())
    expect(result.current[0]).toBe(false)
    act(() => {
      localStorage.setItem('hide-balance', '1')
      window.dispatchEvent(new StorageEvent('storage', { key: 'hide-balance' }))
    })
    expect(result.current[0]).toBe(true)
  })
})

describe('usePageSubtitle — subtítulo da barra de cima que depende dos dados da tela', () => {
  const load = async () => import('../hooks/usePageSubtitle.js')

  it('a tela publica o texto, a barra o lê, e ao sair da tela volta ao padrão', async () => {
    const { usePageSubtitle, usePageSubtitleOverride } = await load()
    const bar = renderHook(() => usePageSubtitleOverride())
    expect(bar.result.current).toBeNull()
    const page = renderHook(({ t }) => usePageSubtitle(t), { initialProps: { t: '4 novas' } })
    expect(bar.result.current).toBe('4 novas')
    page.rerender({ t: '1 nova' })
    expect(bar.result.current).toBe('1 nova')
    page.rerender({ t: null }) // carregando: sem texto, vale o padrão
    expect(bar.result.current).toBeNull()
    page.rerender({ t: 'Nenhuma nova' })
    page.unmount()
    expect(bar.result.current).toBeNull()
  })
})

describe('useUnreadCount — bolinha do sino', () => {
  const load = async () => import('../hooks/useUnreadCount.js')

  it('começa desconhecido (sem bolinha), acompanha o número publicado e ignora lixo', async () => {
    const { publishUnreadCount, useUnreadCount } = await load()
    const { result } = renderHook(() => useUnreadCount())
    expect(result.current).toBeNull()
    act(() => publishUnreadCount(3))
    expect(result.current).toBe(3)
    act(() => publishUnreadCount(0))
    expect(result.current).toBe(0)
    act(() => publishUnreadCount(undefined))
    expect(result.current).toBeNull()
    act(() => publishUnreadCount(NaN))
    expect(result.current).toBeNull()
  })

  it('quem monta depois já recebe o último número', async () => {
    const { publishUnreadCount, useUnreadCount } = await load()
    act(() => publishUnreadCount(2))
    const { result } = renderHook(() => useUnreadCount())
    expect(result.current).toBe(2)
  })
})
