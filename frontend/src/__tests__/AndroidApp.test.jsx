import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { isAndroidApp, ANDROID_APP_KEY, ANDROID_APP_PACKAGE } from '../utils/androidApp.js'
import PlanosRoute from '../pages/PlanosRoute.jsx'
import UpgradeModal from '../components/ui/UpgradeModal.jsx'
import PlanUsageBanner from '../components/ui/PlanUsageBanner.jsx'
import PlanExpiryBanner from '../components/features/PlanExpiryBanner.jsx'
import { getTrialNotif } from '../utils/notifications.js'

vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))
vi.mock('../services/api.js', () => ({ paymentsAPI: { createPreference: vi.fn() }, authAPI: { me: vi.fn() } }))
vi.mock('../services/analytics.js', () => ({ analytics: { track: vi.fn(), identify: vi.fn() } }))

const DAY = 86_400_000
const setReferrer = (v) => Object.defineProperty(document, 'referrer', { value: v, configurable: true })
const setApp = (on) => { on ? sessionStorage.setItem(ANDROID_APP_KEY, '1') : sessionStorage.removeItem(ANDROID_APP_KEY) }
function setUser(over = {}) {
  const u = { id: 'u-and', name: 'Ana', plan: 'pro', emailVerified: true, planExpiresAt: new Date(Date.now() + 20 * DAY).toISOString(), ...over }
  sessionStorage.setItem('user', JSON.stringify(u))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: u }))
}

beforeEach(() => { sessionStorage.clear(); setReferrer(''); delete window.matchMedia })
afterEach(() => { setReferrer('') })

describe('isAndroidApp — detecção do app da Play Store (TWA)', () => {
  it('site comum (sem referrer do app): não é o app', () => {
    expect(isAndroidApp()).toBe(false)
  })

  it('aberto pelo app: o referrer é android-app://<pacote>; fica guardado para as próximas navegações e recargas', () => {
    setReferrer(`android-app://${ANDROID_APP_PACKAGE}`)
    expect(isAndroidApp()).toBe(true)
    setReferrer('') // depois de navegar o referrer muda; a detecção continua
    expect(isAndroidApp()).toBe(true)
    expect(sessionStorage.getItem(ANDROID_APP_KEY)).toBe('1')
  })

  it('referrer de outro app, do Google ou do próprio site NÃO conta', () => {
    for (const r of ['android-app://com.google.android.googlequicksearchbox', 'https://www.google.com/', 'https://myfinancepro.com.br/']) {
      sessionStorage.clear(); setReferrer(r)
      expect(isAndroidApp()).toBe(false)
    }
  })

  it('armazenamento bloqueado não quebra: segue como site comum', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado') })
    expect(isAndroidApp()).toBe(false)
    spy.mockRestore()
  })
})

describe('/planos — site x app Android', () => {
  const setup = (loggedIn = true) => {
    if (loggedIn) setUser(); else { sessionStorage.removeItem('user'); window.dispatchEvent(new CustomEvent('user-updated', { detail: {} })) }
    return render(<MemoryRouter initialEntries={['/planos']}><Routes><Route path="/planos" element={<PlanosRoute />} /><Route path="/" element={<div>Página inicial</div>} /></Routes></MemoryRouter>)
  }

  it('no site: a tela de planos com preços e compra, como sempre', () => {
    setup()
    expect(screen.getByRole('heading', { name: /Controle total do/ })).toBeInTheDocument()
    expect(screen.getAllByText(/R\$ 9,90/).length).toBeGreaterThan(0)
  })

  it('no app Android: só "Seu plano", sem preço, sem comparativo, sem botão de compra nem de upgrade', () => {
    setApp(true)
    const { container } = setup()
    expect(screen.getByRole('heading', { name: 'Seu plano' })).toBeInTheDocument()
    const card = screen.getByLabelText('Seu plano')
    expect(within(card).getByRole('heading', { name: 'Plano Pro' })).toBeInTheDocument()
    expect(card).toHaveTextContent(/Válido até \d{2} \w{3} \d{4}/)
    expect(container.textContent).not.toMatch(/R\$|Assinar|Upgrade|upgrade|Mensal|Anual|Elite|Comparativo|Mercado Pago|PIX/)
    expect(screen.queryByRole('button', { name: /assinar|upgrade|renovar|planos/i })).not.toBeInTheDocument()
  })

  it('no app Android: Grátis diz "Sem cobrança"; teste mostra quando termina; cancelado mostra até quando vai o acesso', () => {
    setApp(true)
    setUser({ plan: 'free', planExpiresAt: null })
    const a = render(<MemoryRouter><PlanosRoute /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Plano Grátis' })).toBeInTheDocument()
    expect(screen.getByText('Sem cobrança')).toBeInTheDocument()
    a.unmount()
    setUser({ plan: 'pro', isOnTrial: true, trialEndsAt: new Date(Date.now() + 5 * DAY).toISOString() })
    const b = render(<MemoryRouter><PlanosRoute /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Teste do Pro' })).toBeInTheDocument()
    expect(screen.getByText(/^Termina em/)).toBeInTheDocument()
    b.unmount()
    setUser({ plan: 'elite', subscriptionCancelled: true })
    render(<MemoryRouter><PlanosRoute /></MemoryRouter>)
    expect(screen.getByText(/Não será renovado · acesso até/)).toBeInTheDocument()
  })

  it('no app Android, sem login volta à página inicial', () => {
    setApp(true)
    setup(false)
    expect(screen.getByText('Página inicial')).toBeInTheDocument()
  })
})

describe('convites de compra somem no app Android', () => {
  it('UpgradeModal no site mostra os planos para assinar', () => {
    setUser({ plan: 'free' })
    render(<MemoryRouter><UpgradeModal onClose={vi.fn()} reason="Limite atingido." /></MemoryRouter>)
    expect(screen.getByText('Testar grátis')).toBeInTheDocument() // Grátis elegível ao teste; os outros casos mostram "Assinar Pro"
  })

  it('UpgradeModal no app vira um aviso sem compra, e o motivo não manda "fazer upgrade"', () => {
    setApp(true); setUser({ plan: 'free' })
    render(<MemoryRouter><UpgradeModal onClose={vi.fn()} reason="Você atingiu o limite de 15 contas fixas. Faça upgrade para adicionar mais." /></MemoryRouter>)
    const dlg = screen.getByRole('dialog', { name: 'Recurso de outro plano' })
    expect(dlg).toHaveTextContent('Você atingiu o limite de 15 contas fixas.')
    expect(dlg.textContent).not.toMatch(/upgrade|Assinar|Testar|R\$/i)
    expect(screen.getByRole('button', { name: 'Entendi' })).toBeInTheDocument()
  })

  it('PlanUsageBanner: no site tem o botão "Upgrade Pro"; no app mostra o uso, sem promoção nem botão', () => {
    const a = render(<MemoryRouter><PlanUsageBanner plan="free" feature="transactions" used={20} label="transações" /></MemoryRouter>)
    expect(screen.getByRole('button', { name: /Upgrade Pro/ })).toBeInTheDocument()
    expect(screen.getByText(/Faça upgrade para continuar/)).toBeInTheDocument()
    a.unmount()
    setApp(true)
    const b = render(<MemoryRouter><PlanUsageBanner plan="free" feature="transactions" used={12} label="transações" /></MemoryRouter>)
    expect(screen.getByText('12 de 20 transações')).toBeInTheDocument()
    expect(b.container.textContent).not.toMatch(/upgrade/i)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    b.unmount()
    render(<MemoryRouter><PlanUsageBanner plan="free" feature="transactions" used={20} label="transações" /></MemoryRouter>)
    expect(screen.getByText(/Você atingiu o limite do plano Gratuito\./)).toBeInTheDocument()
    expect(screen.queryByText(/upgrade/i)).not.toBeInTheDocument()
  })

  it('PlanExpiryBanner: no site tem "Renovar"; no app só a informação', () => {
    setUser({ plan: 'pro', planExpiresAt: new Date(Date.now() + 2 * DAY).toISOString() })
    const a = render(<MemoryRouter><PlanExpiryBanner /></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'Renovar' })).toBeInTheDocument()
    a.unmount()
    setApp(true)
    render(<MemoryRouter><PlanExpiryBanner /></MemoryRouter>)
    expect(screen.getByTestId('plan-expiry-banner-msg')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Renovar' })).not.toBeInTheDocument()
  })

  it('PlanExpiryBanner com o plano já vencido: no site pede para renovar; no app só informa, sem "renove"', () => {
    setUser({ plan: 'pro', planExpiresAt: new Date(Date.now() - 2 * DAY).toISOString() })
    const a = render(<MemoryRouter><PlanExpiryBanner /></MemoryRouter>)
    expect(screen.getByTestId('plan-expiry-banner-msg')).toHaveTextContent('Seu plano Pro expirou. Renove para manter o acesso aos recursos premium.')
    a.unmount()
    setApp(true)
    render(<MemoryRouter><PlanExpiryBanner /></MemoryRouter>)
    const banner = screen.getByTestId('plan-expiry-banner')
    expect(screen.getByTestId('plan-expiry-banner-msg')).toHaveTextContent('Seu plano Pro expirou. Os recursos dele ficam indisponíveis.')
    expect(banner.textContent).not.toMatch(/renov|assin|upgrade|planos|R\$/i)
    expect(screen.queryByRole('button', { name: 'Renovar' })).not.toBeInTheDocument()
  })

  it('aviso de fim do teste não diz "Assine agora" no app', () => {
    const user = { isOnTrial: true, trialEndsAt: new Date(Date.now() + 0.5 * DAY).toISOString() }
    expect(getTrialNotif(user).msg).toMatch(/Assine agora/)
    setApp(true)
    expect(getTrialNotif(user).msg).toBe('Último dia do trial Pro.')
  })
})
