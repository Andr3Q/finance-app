import { renderHook, act } from '@testing-library/react'
import { useSplashGone } from '../hooks/useSplashGone.js'

// O campo de senha não pode existir por baixo da splash: o gerenciador de senhas do celular abre por cima do vídeo.
const addSplash = (cls = '') => { const el = document.createElement('div'); el.id = 'app-splash'; if (cls) el.className = cls; document.body.appendChild(el); return el }

beforeEach(() => { delete window.__nancySplashGone; document.getElementById('app-splash')?.remove() })
afterEach(() => { delete window.__nancySplashGone; document.getElementById('app-splash')?.remove() })

describe('useSplashGone', () => {
  it('sem splash na página (já removida, ou testes): liberado de cara', () => {
    expect(renderHook(() => useSplashGone()).result.current).toBe(true)
  })

  it('splash na tela: segura; quando ela avisa que saiu, libera', () => {
    addSplash()
    const { result } = renderHook(() => useSplashGone())
    expect(result.current).toBe(false)
    act(() => { window.dispatchEvent(new Event('nancy:splash-gone')) })
    expect(result.current).toBe(true)
  })

  it('splash já começou a sair (splash-hide): liberado', () => {
    addSplash('splash-hide')
    expect(renderHook(() => useSplashGone()).result.current).toBe(true)
  })

  it('a marca window.__nancySplashGone libera mesmo com o elemento ainda no DOM (a splash leva 450ms para sair)', () => {
    addSplash()
    window.__nancySplashGone = true
    expect(renderHook(() => useSplashGone()).result.current).toBe(true)
  })

  it('tirar o ouvinte ao desmontar (nenhum vazamento)', () => {
    addSplash()
    const spy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useSplashGone())
    unmount()
    expect(spy).toHaveBeenCalledWith('nancy:splash-gone', expect.any(Function))
    spy.mockRestore()
  })
})
