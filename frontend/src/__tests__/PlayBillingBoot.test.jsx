import { render, waitFor } from '@testing-library/react'
import { ANDROID_APP_KEY } from '../utils/androidApp.js'

// PlayBillingBoot: liga a cobrança do Google no app Android depois do login e refaz compras pendentes uma vez por sessão.
const { billingState, initMock, restoreMock } = vi.hoisted(() => ({
  billingState: { status: 'idle', details: {} },
  initMock: vi.fn(),
  restoreMock: vi.fn(),
}))
vi.mock('../hooks/usePlayBilling.js', () => ({ usePlayBilling: () => billingState }))
vi.mock('../services/playBilling.js', () => ({ initPlayBilling: initMock, restorePurchases: restoreMock }))
vi.mock('../services/api.js', () => ({ authAPI: { me: vi.fn() } }))

import PlayBillingBoot from '../components/features/PlayBillingBoot.jsx'
import { authAPI } from '../services/api.js'

const setApp = (on) => { on ? sessionStorage.setItem(ANDROID_APP_KEY, '1') : sessionStorage.removeItem(ANDROID_APP_KEY) }
function setUser(over = {}) {
  const u = { id: 'u1', plan: 'free', ...over }
  sessionStorage.setItem('user', JSON.stringify(u))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: u }))
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  billingState.status = 'idle'
  initMock.mockResolvedValue({})
  restoreMock.mockResolvedValue([])
})

describe('PlayBillingBoot', () => {
  it('no site comum não faz nada', () => {
    setUser()
    billingState.status = 'ready'
    render(<PlayBillingBoot />)
    expect(initMock).not.toHaveBeenCalled()
    expect(restoreMock).not.toHaveBeenCalled()
  })

  it('no app, sem login: não liga (a configuração do servidor exige login)', () => {
    setApp(true)
    sessionStorage.removeItem('user'); window.dispatchEvent(new CustomEvent('user-updated', { detail: {} }))
    render(<PlayBillingBoot />)
    expect(initMock).not.toHaveBeenCalled()
  })

  it('no app, logado: liga a cobrança', () => {
    setApp(true); setUser()
    render(<PlayBillingBoot />)
    expect(initMock).toHaveBeenCalledTimes(1)
  })

  it('pronta + plano Grátis: refaz as compras pendentes UMA vez por sessão', () => {
    setApp(true); setUser(); billingState.status = 'ready'
    const a = render(<PlayBillingBoot />)
    expect(restoreMock).toHaveBeenCalledTimes(1)
    a.unmount()
    render(<PlayBillingBoot />)
    expect(restoreMock).toHaveBeenCalledTimes(1)
  })

  it('pronta + teste grátis: também refaz (o teste não é plano pago)', () => {
    setApp(true); setUser({ plan: 'pro', isOnTrial: true }); billingState.status = 'ready'
    render(<PlayBillingBoot />)
    expect(restoreMock).toHaveBeenCalledTimes(1)
  })

  it('pronta + plano pago ativo: não mexe (nada a restaurar e evita conflito)', () => {
    setApp(true); setUser({ plan: 'pro', isOnTrial: false }); billingState.status = 'ready'
    render(<PlayBillingBoot />)
    expect(restoreMock).not.toHaveBeenCalled()
  })

  it('ainda não pronta: não tenta restaurar', () => {
    setApp(true); setUser(); billingState.status = 'checking'
    render(<PlayBillingBoot />)
    expect(restoreMock).not.toHaveBeenCalled()
  })

  it('quando uma compra é aplicada, recarrega a conta para o plano aparecer', async () => {
    setApp(true); setUser(); billingState.status = 'ready'
    restoreMock.mockResolvedValue([{ applied: true, plan: 'pro' }])
    authAPI.me.mockResolvedValue({ data: { id: 'u1', plan: 'pro', planSource: 'google_play' } })
    render(<PlayBillingBoot />)
    await waitFor(() => expect(JSON.parse(sessionStorage.getItem('user')).plan).toBe('pro'))
    expect(authAPI.me).toHaveBeenCalledTimes(1)
  })

  it('compra que o servidor não aplicou não recarrega a conta', async () => {
    setApp(true); setUser(); billingState.status = 'ready'
    restoreMock.mockResolvedValue([{ applied: false }])
    render(<PlayBillingBoot />)
    await waitFor(() => expect(restoreMock).toHaveBeenCalled())
    expect(authAPI.me).not.toHaveBeenCalled()
  })
})
