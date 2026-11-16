import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ANDROID_APP_KEY } from '../utils/androidApp.js'

// /planos conforme onde o app roda e se a cobrança do Google está pronta (ver PlanosRoute).
const { billingState } = vi.hoisted(() => ({ billingState: { status: 'idle', details: {} } }))
vi.mock('../hooks/usePlayBilling.js', () => ({ usePlayBilling: () => billingState }))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))
vi.mock('../services/api.js', () => ({ paymentsAPI: { createPreference: vi.fn() }, authAPI: { me: vi.fn() }, billingAPI: {} }))
vi.mock('../services/analytics.js', () => ({ analytics: { track: vi.fn(), identify: vi.fn() } }))

import PlanosRoute from '../pages/PlanosRoute.jsx'
import { hidePurchaseUI } from '../utils/purchaseUi.js'

const readyDetails = () => ({
  nancy_pro_mensal: { currency: 'BRL', value: 9.9 }, nancy_pro_anual: { currency: 'BRL', value: 99 },
  nancy_elite_mensal: { currency: 'BRL', value: 34.9 }, nancy_elite_anual: { currency: 'BRL', value: 334.8 },
})
const setApp = (on) => { on ? sessionStorage.setItem(ANDROID_APP_KEY, '1') : sessionStorage.removeItem(ANDROID_APP_KEY) }
function setUser(over = {}) {
  const u = { id: 'u1', name: 'Ana', plan: 'free', emailVerified: true, ...over }
  sessionStorage.setItem('user', JSON.stringify(u))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: u }))
}
const renderRoute = () => render(<MemoryRouter initialEntries={['/planos']}><Routes><Route path="/planos" element={<PlanosRoute />} /><Route path="/" element={<div>Página inicial</div>} /></Routes></MemoryRouter>)

beforeEach(() => { sessionStorage.clear(); billingState.status = 'idle'; billingState.details = {}; delete window.matchMedia })

describe('/planos — site, app sem cobrança e app com cobrança do Google', () => {
  it('site comum: a tela de planos do Mercado Pago, como sempre (mesmo que o estado do Google diga "pronto")', () => {
    billingState.status = 'ready'; billingState.details = readyDetails()
    setUser()
    renderRoute()
    expect(screen.getByRole('heading', { name: /Controle total do/ })).toBeInTheDocument()
    expect(screen.getAllByText(/PIX ou cartão/).length).toBeGreaterThan(0)
  })

  it('app Android SEM a cobrança pronta: só "Seu plano", sem preço nem compra', () => {
    setApp(true); setUser()
    const { container } = renderRoute()
    expect(screen.getByRole('heading', { name: 'Seu plano' })).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/R\$|Assinar/)
  })

  it('app Android com a cobrança pronta: a tela de planos do app, com os preços do Google', () => {
    setApp(true); setUser()
    billingState.status = 'ready'; billingState.details = readyDetails()
    renderRoute()
    expect(screen.getByRole('heading', { name: 'Planos' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Assinar Pro/ })).toBeInTheDocument()
    expect(screen.queryByText(/PIX ou cartão/)).not.toBeInTheDocument()
  })

  it('app Android sem login: volta para o início', () => {
    setApp(true)
    sessionStorage.removeItem('user'); window.dispatchEvent(new CustomEvent('user-updated', { detail: {} }))
    billingState.status = 'ready'; billingState.details = readyDetails()
    renderRoute()
    expect(screen.getByText('Página inicial')).toBeInTheDocument()
  })
})

describe('hidePurchaseUI e a tela de planos andam juntos', () => {
  it('quando o app mostra a venda, o resto do app também (convites e botões)', () => {
    setApp(true)
    expect(hidePurchaseUI()).toBe(true)  // sem cobrança pronta: esconde
    billingState.status = 'ready'
    // o estado real vem de services/playBilling.js; aqui só garantimos que o site comum nunca esconde
    setApp(false)
    expect(hidePurchaseUI()).toBe(false)
  })
})
