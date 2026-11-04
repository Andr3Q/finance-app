import { renderHook, act } from '@testing-library/react'
import { useIsDesktop } from '../hooks/useIsDesktop.js'

// matchMedia simulado: guarda quem escuta e permite "redimensionar a janela"
function mockMedia(initial) {
  let matches = initial
  const listeners = new Set()
  const mql = {
    get matches() { return matches },
    media: '(min-width: 901px)',
    addEventListener: (_t, cb) => listeners.add(cb),
    removeEventListener: (_t, cb) => listeners.delete(cb),
  }
  window.matchMedia = vi.fn(() => mql)
  return { resize: (next) => { matches = next; listeners.forEach(cb => cb({ matches })) }, listeners }
}

afterEach(() => { delete window.matchMedia })

describe('useIsDesktop — corte do desktop em 901px', () => {
  it('pergunta pelo mesmo corte do CSS (a barra de baixo do celular vale até 900px)', () => {
    mockMedia(true)
    renderHook(() => useIsDesktop())
    expect(window.matchMedia).toHaveBeenCalledWith('(min-width: 901px)')
  })

  it('é verdadeiro na janela larga e falso na estreita', () => {
    mockMedia(true)
    expect(renderHook(() => useIsDesktop()).result.current).toBe(true)
    mockMedia(false)
    expect(renderHook(() => useIsDesktop()).result.current).toBe(false)
  })

  it('acompanha o redimensionamento da janela e para de escutar ao sair', () => {
    const m = mockMedia(false)
    const { result, unmount } = renderHook(() => useIsDesktop())
    expect(result.current).toBe(false)
    act(() => m.resize(true))
    expect(result.current).toBe(true)
    act(() => m.resize(false))
    expect(result.current).toBe(false)
    expect(m.listeners.size).toBe(1)
    unmount()
    expect(m.listeners.size).toBe(0)
  })

  it('sem matchMedia (testes, navegador antigo) vale o celular', () => {
    expect(window.matchMedia).toBeUndefined()
    expect(renderHook(() => useIsDesktop()).result.current).toBe(false)
  })
})
