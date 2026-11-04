import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import SettingsReferral from '../pages/SettingsReferral.jsx'

vi.mock('../services/api.js', () => ({ authAPI: { referralStats: vi.fn() } }))
vi.mock('../services/analytics.js', () => ({ analytics: { track: vi.fn() } }))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))
import { authAPI } from '../services/api.js'
import { analytics } from '../services/analytics.js'

const setDesktop = (is) => { window.matchMedia = vi.fn(() => ({ matches: is, addEventListener() {}, removeEventListener() {} })) }
const STATS = { referralCode: 'NANCY-ANDRE', referredCount: 2, rewardedCount: 2, maxReferrals: 5, limitReached: false, bonusDays: 10 }
const LINK = `${window.location.origin}/register?ref=NANCY-ANDRE`
function setup(stats = STATS) {
  const u = { id: 'u-rf', name: 'André', referralCode: 'NANCY-ANDRE' }
  sessionStorage.setItem('user', JSON.stringify(u))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: u }))
  authAPI.referralStats.mockResolvedValue({ data: stats })
  return render(<MemoryRouter initialEntries={['/settings/indique']}><Routes><Route path="/settings/indique" element={<SettingsReferral />} /></Routes></MemoryRouter>)
}

let writeText
beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear(); setDesktop(true)
  writeText = vi.fn().mockResolvedValue()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})
afterEach(() => { delete window.matchMedia })

describe('Indique e ganhe no desktop (design "Nancy Desktop", tela 32)', () => {
  it('menu da conta (Indique e ganhe aceso), faixa com o convite, código e "Copiar"; cartão com o andamento', async () => {
    setup()
    expect(within(screen.getByRole('navigation', { name: 'Conta' })).getByRole('button', { name: 'Indique e ganhe' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { name: 'Ganhe 10 dias de Pro por amigo.' })).toBeInTheDocument()
    expect(screen.getByText('NANCY-ANDRE')).toBeInTheDocument()
    expect(await screen.findByText('2 de 5')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2')
    expect(document.querySelector('.nrf-bar-fill').style.width).toBe('40%')
    expect(screen.getByText('Mais 3 amigos e você completa o limite de bônus.')).toBeInTheDocument()
    expect(document.querySelector('.fin-hero')).toBeNull()
  })

  it('Copiar leva o link do cadastro (não só o código) e confirma "Copiado!"', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Copiar' }))
    expect(writeText).toHaveBeenCalledWith(LINK)
    expect(analytics.track).toHaveBeenCalledWith('referral_link_copied')
    expect(await screen.findByRole('button', { name: 'Copiado!' })).toBeInTheDocument()
  })

  it('limite alcançado: a faixa agradece, sem código nem botão Copiar', async () => {
    setup({ ...STATS, rewardedCount: 5, referredCount: 5, limitReached: true })
    expect(await screen.findByRole('heading', { name: 'Você garantiu todos os bônus!' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copiar' })).not.toBeInTheDocument()
    expect(await screen.findByText('Limite de bônus alcançado.')).toBeInTheDocument()
  })

  it('amigo cadastrado que ainda não confirmou o e-mail é avisado, e erro de carga explica', async () => {
    const { unmount } = setup({ ...STATS, referredCount: 3, rewardedCount: 2 })
    expect(await screen.findByText(/1 amigo cadastrado aguarda confirmar o e-mail/)).toBeInTheDocument()
    unmount()
    authAPI.referralStats.mockRejectedValue(new Error('x'))
    render(<MemoryRouter initialEntries={['/settings/indique']}><Routes><Route path="/settings/indique" element={<SettingsReferral />} /></Routes></MemoryRouter>)
    expect(await screen.findByText(/Não foi possível carregar seus convites/)).toBeInTheDocument()
  })
})

describe('Indique e ganhe — celular continua o mesmo', () => {
  it('no celular segue o cabeçalho com Voltar e o botão "Compartilhar convite"', async () => {
    setDesktop(false)
    setup()
    expect(screen.queryByRole('navigation', { name: 'Conta' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Compartilhar convite/ })).toBeInTheDocument()
  })
})
