import { renderHook, act } from '@testing-library/react'
import { useUser, saveUser } from '../hooks/useUser.js'

beforeEach(() => {
  sessionStorage.clear()
})

describe('useUser', () => {
  it('retorna objeto vazio quando sessionStorage está limpo', () => {
    const { result } = renderHook(() => useUser())
    expect(result.current).toEqual({})
  })

  it('lê dados existentes do sessionStorage na montagem', () => {
    sessionStorage.setItem('user', JSON.stringify({ id: '1', name: 'André', plan: 'free' }))
    const { result } = renderHook(() => useUser())
    expect(result.current).toEqual({ id: '1', name: 'André', plan: 'free' })
  })

  it('atualiza state quando saveUser é chamado', () => {
    const { result } = renderHook(() => useUser())
    act(() => {
      saveUser({ id: '2', name: 'João', plan: 'pro' })
    })
    expect(result.current).toEqual({ id: '2', name: 'João', plan: 'pro' })
  })

  it('saveUser persiste no sessionStorage', () => {
    act(() => {
      saveUser({ id: '3', plan: 'elite' })
    })
    expect(JSON.parse(sessionStorage.getItem('user'))).toEqual({ id: '3', plan: 'elite' })
  })

  it('múltiplos hooks sincronizam via evento user-updated', () => {
    const { result: r1 } = renderHook(() => useUser())
    const { result: r2 } = renderHook(() => useUser())
    act(() => {
      saveUser({ id: '5', plan: 'pro' })
    })
    expect(r1.current).toEqual({ id: '5', plan: 'pro' })
    expect(r2.current).toEqual({ id: '5', plan: 'pro' })
  })
})
