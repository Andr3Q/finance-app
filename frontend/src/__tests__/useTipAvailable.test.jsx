import { renderHook, waitFor, act } from '@testing-library/react'
import { useTipAvailable, resetTipAvailableCache, rememberTipAvailable } from '../hooks/useTipAvailable.js'

vi.mock('../services/api.js', () => ({ transactionsAPI: { weeklyTipAvailable: vi.fn() } }))
import { transactionsAPI } from '../services/api.js'

beforeEach(() => { vi.clearAllMocks(); resetTipAvailableCache() })

describe('useTipAvailable (a dica da semana só é anunciada quando existe)', () => {
  it('começa em null (não se sabe) e vira true/false conforme o servidor', async () => {
    transactionsAPI.weeklyTipAvailable.mockResolvedValue({ data: { available: true } })
    const { result } = renderHook(() => useTipAvailable('u1'))
    expect(result.current).toBeNull()
    await waitFor(() => expect(result.current).toBe(true))

    resetTipAvailableCache()
    transactionsAPI.weeklyTipAvailable.mockResolvedValue({ data: { available: false } })
    const second = renderHook(() => useTipAvailable('u1'))
    await waitFor(() => expect(second.result.current).toBe(false))
  })

  it('só "true" estrito vale: resposta estranha ou vazia não promete a dica', async () => {
    for (const data of [{}, { available: 'yes' }, null]) {
      resetTipAvailableCache()
      transactionsAPI.weeklyTipAvailable.mockResolvedValue({ data })
      const { result, unmount } = renderHook(() => useTipAvailable('u1'))
      await waitFor(() => expect(transactionsAPI.weeklyTipAvailable).toHaveBeenCalled())
      await act(async () => {})
      expect(result.current).toBe(false)
      unmount(); vi.clearAllMocks()
    }
  })

  it('falha na consulta: continua null (não anuncia) e não guarda o erro como resposta', async () => {
    transactionsAPI.weeklyTipAvailable.mockRejectedValueOnce(new Error('fora do ar'))
    const first = renderHook(() => useTipAvailable('u1'))
    await waitFor(() => expect(transactionsAPI.weeklyTipAvailable).toHaveBeenCalledTimes(1))
    await act(async () => {})
    expect(first.result.current).toBeNull()
    first.unmount()
    transactionsAPI.weeklyTipAvailable.mockResolvedValue({ data: { available: true } })
    const second = renderHook(() => useTipAvailable('u1')) // tenta de novo na próxima vez
    await waitFor(() => expect(second.result.current).toBe(true))
  })

  it('guarda o resultado por alguns minutos (Início e Notificações não perguntam de novo) e separa por usuário', async () => {
    transactionsAPI.weeklyTipAvailable.mockResolvedValue({ data: { available: true } })
    const a = renderHook(() => useTipAvailable('u1'))
    await waitFor(() => expect(a.result.current).toBe(true))
    const b = renderHook(() => useTipAvailable('u1'))
    expect(b.result.current).toBe(true) // já de cara, sem null
    expect(transactionsAPI.weeklyTipAvailable).toHaveBeenCalledTimes(1)

    transactionsAPI.weeklyTipAvailable.mockResolvedValue({ data: { available: false } })
    const other = renderHook(() => useTipAvailable('u2')) // outro usuário no mesmo aparelho não herda a resposta
    expect(other.result.current).toBeNull()
    await waitFor(() => expect(other.result.current).toBe(false))
    expect(transactionsAPI.weeklyTipAvailable).toHaveBeenCalledTimes(2)
  })

  it('sem usuário logado não consulta nada', async () => {
    const { result } = renderHook(() => useTipAvailable(''))
    await act(async () => {})
    expect(result.current).toBeNull()
    expect(transactionsAPI.weeklyTipAvailable).not.toHaveBeenCalled()
  })
})

describe('rememberTipAvailable (a abertura do app já perguntou)', () => {
  it('o Início usa a resposta guardada e NÃO pergunta de novo', () => {
    rememberTipAvailable('u1', true)
    const { result } = renderHook(() => useTipAvailable('u1'))
    expect(result.current).toBe(true)
    expect(transactionsAPI.weeklyTipAvailable).not.toHaveBeenCalled()
  })

  it('vale só para a pessoa que perguntou; outra pessoa pergunta de novo', async () => {
    rememberTipAvailable('u1', true)
    transactionsAPI.weeklyTipAvailable.mockResolvedValue({ data: { available: false } })
    const { result } = renderHook(() => useTipAvailable('u2'))
    expect(result.current).toBeNull()
    await waitFor(() => expect(result.current).toBe(false))
    expect(transactionsAPI.weeklyTipAvailable).toHaveBeenCalledTimes(1)
  })

  it('só "true" estrito vira true', () => {
    rememberTipAvailable('u1', 'yes')
    expect(renderHook(() => useTipAvailable('u1')).result.current).toBe(false)
  })
})
