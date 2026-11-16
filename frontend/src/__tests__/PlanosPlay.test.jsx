import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PlayBillingError } from '../services/playBilling.js'

// Tela de planos DENTRO do app Android (compra pela Google Play). A cobrança é simulada; aqui vale o que a pessoa vê e faz.
const { billingState, purchaseMock } = vi.hoisted(() => ({
  billingState: { status: 'ready', details: {} },
  purchaseMock: vi.fn(),
}))

vi.mock('../hooks/usePlayBilling.js', () => ({ usePlayBilling: () => billingState }))
vi.mock('../services/playBilling.js', async (importOriginal) => ({ ...(await importOriginal()), purchase: purchaseMock }))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))
vi.mock('../services/api.js', () => ({ authAPI: { me: vi.fn() }, paymentsAPI: {}, billingAPI: {} }))
vi.mock('../services/analytics.js', () => ({ analytics: { track: vi.fn(), identify: vi.fn() } }))

import PlanosPlay from '../pages/PlanosPlay.jsx'
import { authAPI } from '../services/api.js'
import { analytics } from '../services/analytics.js'

const DAY = 86_400_000
const PRICES = { nancy_pro_mensal: 9.9, nancy_pro_anual: 99, nancy_elite_mensal: 34.9, nancy_elite_anual: 334.8 }
const readyDetails = () => Object.fromEntries(Object.entries(PRICES).map(([id, value]) => [id, { currency: 'BRL', value }]))

function setUser(over = {}) {
  const u = { id: 'u1', name: 'Ana', plan: 'free', emailVerified: true, ...over }
  sessionStorage.setItem('user', JSON.stringify(u))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: u }))
  return u
}
const renderIt = () => render(<MemoryRouter><PlanosPlay /></MemoryRouter>)
const norm = (t) => t.replace(/\s/g, ' ')

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  billingState.status = 'ready'
  billingState.details = readyDetails()
  delete window.matchMedia
})

describe('PlanosPlay — quem pode comprar', () => {
  it('plano Grátis: mostra Pro e Elite com os PREÇOS DO GOOGLE (mensal) e os botões de assinar', () => {
    setUser()
    renderIt()
    const pro = screen.getByLabelText('Plano Pro'), elite = screen.getByLabelText('Plano Elite')
    expect(norm(pro.textContent)).toContain('R$ 9,90')
    expect(norm(elite.textContent)).toContain('R$ 34,90')
    expect(within(pro).getByText('por mês')).toBeInTheDocument()
    expect(within(pro).getByRole('button', { name: /Assinar Pro/ })).toBeEnabled()
    expect(within(elite).getByRole('button', { name: /Assinar Elite/ })).toBeEnabled()
  })

  it('alternar para Anual troca para os preços anuais, "por ano"', () => {
    setUser()
    renderIt()
    fireEvent.click(screen.getByRole('button', { name: 'Anual' }))
    expect(norm(screen.getByLabelText('Plano Pro').textContent)).toContain('R$ 99,00')
    expect(norm(screen.getByLabelText('Plano Elite').textContent)).toContain('R$ 334,80')
    expect(within(screen.getByLabelText('Plano Pro')).getByText('por ano')).toBeInTheDocument()
  })

  it('diz que renova sozinho e onde cancelar, e NÃO fala de Mercado Pago, PIX nem de pagar pelo site', () => {
    setUser()
    const { container } = renderIt()
    expect(container.textContent).toMatch(/renova sozinha até você cancelar/)
    expect(container.textContent).toMatch(/Play Store/)
    expect(container.textContent).not.toMatch(/Mercado Pago|PIX|pelo site|no site|myfinancepro/i)
  })

  it('quem está no teste grátis pode assinar', () => {
    setUser({ plan: 'pro', isOnTrial: true, trialEndsAt: new Date(Date.now() + 3 * DAY).toISOString() })
    renderIt()
    expect(screen.getByRole('button', { name: /Assinar Elite/ })).toBeInTheDocument()
  })

  it('plano ativo contratado FORA do app: sem botões de compra e um aviso sem apontar para onde pagar', () => {
    setUser({ plan: 'pro', planSource: 'mercadopago', planExpiresAt: new Date(Date.now() + 20 * DAY).toISOString() })
    const { container } = renderIt()
    expect(screen.queryByRole('button', { name: /Assinar/ })).not.toBeInTheDocument()
    expect(container.textContent).toMatch(/Você já tem um plano ativo até \d{2}\/\d{2}\/\d{4}\. Quando ele vencer, você poderá assinar por aqui\./)
    expect(container.textContent).not.toMatch(/Mercado Pago|site/i)
  })

  it('já assina pela Play: sem comprar outro (evita cobrança dupla) e com o caminho para gerenciar na Play Store', () => {
    setUser({ plan: 'elite', planSource: 'google_play', planPeriod: 'annual', planExpiresAt: new Date(Date.now() + 200 * DAY).toISOString() })
    renderIt()
    expect(screen.queryByRole('button', { name: /Assinar/ })).not.toBeInTheDocument()
    const link = screen.getByRole('link', { name: /Gerenciar na Play Store/ })
    expect(link).toHaveAttribute('href', expect.stringContaining('play.google.com/store/account/subscriptions'))
    expect(link).toHaveAttribute('href', expect.stringContaining('sku=nancy_elite_anual'))
  })

  it('plano da Play JÁ vencido volta a poder comprar', () => {
    setUser({ plan: 'pro', planSource: 'google_play', planExpiresAt: new Date(Date.now() - DAY).toISOString() })
    renderIt()
    expect(screen.getByRole('button', { name: /Assinar Pro/ })).toBeInTheDocument()
  })

  it('cobrança do Google não pronta: avisa e não mostra preço nem botão', () => {
    billingState.status = 'unavailable'; billingState.details = {}
    setUser()
    const { container } = renderIt()
    expect(screen.getByText(/Não foi possível carregar os planos agora/)).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/R\$ \d/)
    expect(screen.queryByRole('button', { name: /Assinar/ })).not.toBeInTheDocument()
  })
})

describe('PlanosPlay — assinar', () => {
  it('toca em Assinar Pro: compra o produto mensal, atualiza o plano da conta e avisa', async () => {
    setUser()
    purchaseMock.mockResolvedValue({ applied: true, plan: 'pro' })
    authAPI.me.mockResolvedValue({ data: { id: 'u1', name: 'Ana', plan: 'pro', planSource: 'google_play', planExpiresAt: new Date(Date.now() + 30 * DAY).toISOString(), emailVerified: true } })
    renderIt()
    fireEvent.click(screen.getByRole('button', { name: /Assinar Pro/ }))

    await waitFor(() => expect(screen.getByText(/Assinatura ativada! Seu plano Pro já está valendo\./)).toBeInTheDocument())
    expect(purchaseMock).toHaveBeenCalledWith('nancy_pro_mensal')
    expect(JSON.parse(sessionStorage.getItem('user'))).toMatchObject({ plan: 'pro', planSource: 'google_play' })
    expect(analytics.track).toHaveBeenCalledWith('payment_completed', { plan: 'pro', store: 'google_play' })
  })

  it('Elite no período anual compra o produto anual', async () => {
    setUser()
    purchaseMock.mockResolvedValue({ applied: true, plan: 'elite' })
    authAPI.me.mockResolvedValue({ data: { id: 'u1', plan: 'elite', emailVerified: true } })
    renderIt()
    fireEvent.click(screen.getByRole('button', { name: 'Anual' }))
    fireEvent.click(screen.getByRole('button', { name: /Assinar Elite/ }))
    await waitFor(() => expect(purchaseMock).toHaveBeenCalledWith('nancy_elite_anual'))
  })

  it('se não conseguir recarregar a conta, ainda assim usa o que o servidor respondeu da compra', async () => {
    setUser()
    purchaseMock.mockResolvedValue({ applied: true, plan: 'pro', planExpiresAt: '2026-12-20T00:00:00.000Z' })
    authAPI.me.mockRejectedValue(new Error('rede'))
    renderIt()
    fireEvent.click(screen.getByRole('button', { name: /Assinar Pro/ }))
    await waitFor(() => expect(screen.getByText(/Assinatura ativada/)).toBeInTheDocument())
    expect(JSON.parse(sessionStorage.getItem('user'))).toMatchObject({ plan: 'pro', planSource: 'google_play' })
  })

  it('e-mail não verificado: avisa e nem abre a compra', () => {
    setUser({ emailVerified: false })
    renderIt()
    fireEvent.click(screen.getByRole('button', { name: /Assinar Pro/ }))
    expect(screen.getByText(/Verifique seu e-mail antes de assinar/)).toBeInTheDocument()
    expect(purchaseMock).not.toHaveBeenCalled()
  })

  it('a pessoa fecha a tela de compra: nenhum aviso de erro', async () => {
    setUser()
    purchaseMock.mockRejectedValue(new PlayBillingError('cancelled'))
    renderIt()
    fireEvent.click(screen.getByRole('button', { name: /Assinar Pro/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Assinar Pro/ })).toBeEnabled())
    expect(document.querySelector('.toast')).toBeNull()
  })

  it('pagou mas o servidor não confirmou: mensagem tranquilizadora (a compra é refeita ao reabrir o app)', async () => {
    setUser()
    purchaseMock.mockRejectedValue(new PlayBillingError('verify_failed', { status: 502 }))
    renderIt()
    fireEvent.click(screen.getByRole('button', { name: /Assinar Pro/ }))
    await waitFor(() => expect(screen.getByText(/Recebemos o seu pagamento, mas não conseguimos confirmar agora/)).toBeInTheDocument())
  })

  it('compra recusada pelo servidor (outra conta / plano ativo): mostra a mensagem do servidor', async () => {
    setUser()
    purchaseMock.mockRejectedValue(new PlayBillingError('conflict', { status: 409, serverMessage: 'Esta compra já está ligada a outra conta.' }))
    renderIt()
    fireEvent.click(screen.getByRole('button', { name: /Assinar Pro/ }))
    await waitFor(() => expect(screen.getByText('Esta compra já está ligada a outra conta.')).toBeInTheDocument())
  })

  it('erro genérico: "Não foi possível concluir a compra" e o botão volta', async () => {
    setUser()
    purchaseMock.mockRejectedValue(new PlayBillingError('failed'))
    renderIt()
    fireEvent.click(screen.getByRole('button', { name: /Assinar Pro/ }))
    await waitFor(() => expect(screen.getByText('Não foi possível concluir a compra. Tente novamente.')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Assinar Pro/ })).toBeEnabled()
  })

  it('durante a compra os botões ficam travados (sem toque duplo)', async () => {
    setUser()
    let finish
    purchaseMock.mockReturnValue(new Promise((r) => { finish = r }))
    authAPI.me.mockResolvedValue({ data: { id: 'u1', plan: 'pro', emailVerified: true } })
    renderIt()
    fireEvent.click(screen.getByRole('button', { name: /Assinar Pro/ }))
    expect(screen.getByRole('button', { name: /Aguarde/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Assinar Elite/ })).toBeDisabled()
    finish({ applied: true, plan: 'pro' })
    await waitFor(() => expect(screen.getByText(/Assinatura ativada/)).toBeInTheDocument())
  })
})
