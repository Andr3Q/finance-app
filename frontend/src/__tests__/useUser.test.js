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

  describe('campos sensíveis (salário) só em memória', () => {
    it('quem monta DEPOIS do saveUser já recebe o salário (campo "Salário mensal" não nasce vazio)', () => {
      act(() => { saveUser({ id: 'mem-1', name: 'Ana', salary: 5000, reportEmail: 'r@x.com' }) })
      const { result } = renderHook(() => useUser())
      expect(result.current.salary).toBe(5000)
      expect(result.current.reportEmail).toBe('r@x.com')
    })

    it('o salário nunca vai para o sessionStorage', () => {
      act(() => { saveUser({ id: 'mem-2', salary: 7000, reportEmail: 'a@b.com' }) })
      const stored = JSON.parse(sessionStorage.getItem('user'))
      expect(stored).toEqual({ id: 'mem-2' })
    })

    it('atualização parcial (sem salary) não apaga o salário', () => {
      act(() => { saveUser({ id: 'mem-3', name: 'Bia', salary: 3200 }) })
      const { result } = renderHook(() => useUser())
      act(() => { saveUser({ id: 'mem-3', name: 'Bia Souza' }) })
      expect(result.current.name).toBe('Bia Souza')
      expect(result.current.salary).toBe(3200)
    })

    it('salvar um novo salário substitui o antigo', () => {
      act(() => { saveUser({ id: 'mem-4', salary: 1000 }) })
      const { result } = renderHook(() => useUser())
      act(() => { saveUser({ id: 'mem-4', salary: 1500 }) })
      expect(result.current.salary).toBe(1500)
    })

    it('outro usuário não herda o salário do anterior', () => {
      act(() => { saveUser({ id: 'mem-5', salary: 9000 }) })
      act(() => { saveUser({ id: 'mem-6', name: 'Outra pessoa' }) })
      const { result } = renderHook(() => useUser())
      expect(result.current.id).toBe('mem-6')
      expect(result.current.salary).toBeUndefined()
    })

    it('sem usuário logado (storage vazio) não devolve salário de ninguém', () => {
      act(() => { saveUser({ id: 'mem-7', salary: 4000 }) })
      sessionStorage.clear()
      const { result } = renderHook(() => useUser())
      expect(result.current).toEqual({})
    })
  })
})
