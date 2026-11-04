import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import SettingsNotifications from '../pages/SettingsNotifications.jsx'

vi.mock('../services/api.js', () => ({
  authAPI: { updateNotifPrefs: vi.fn() },
  notificationsAPI: { getVapidKey: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn() },
}))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))
import { authAPI } from '../services/api.js'

const setDesktop = (is) => { window.matchMedia = vi.fn(() => ({ matches: is, addEventListener() {}, removeEventListener() {} })) }
function setup(user = {}) {
  const u = { id: 'u-pref', name: 'André', plan: 'elite', emailVerified: true, ...user }
  sessionStorage.setItem('user', JSON.stringify(u))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: u }))
  return render(<MemoryRouter initialEntries={['/settings/notificacoes']}><Routes><Route path="/settings/notificacoes" element={<SettingsNotifications />} /></Routes></MemoryRouter>)
}
const stored = () => JSON.parse(sessionStorage.getItem('user'))
const sw = (name) => screen.getByRole('switch', { name })

beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); setDesktop(true); authAPI.updateNotifPrefs.mockResolvedValue({}) })
afterEach(() => { delete window.matchMedia })

describe('Preferências no desktop (design "Nancy Desktop", tela 28)', () => {
  it('menu da conta (Preferências acesa) e seis avisos com nome, descrição e interruptor (o e-mail semanal desligado por padrão)', () => {
    setup()
    expect(within(screen.getByRole('navigation', { name: 'Conta' })).getByRole('button', { name: 'Preferências' })).toHaveAttribute('aria-current', 'page')
    expect([...document.querySelectorAll('.nst-row-name')].map(n => n.textContent)).toEqual([
      'Lembrete de salário', 'Vencimento de contas', 'Alerta de limite', 'Resumo mensal em stories', 'Dicas da Nancy IA', 'Relatório por e-mail',
    ])
    expect(screen.getByText('No 5º dia útil do mês')).toBeInTheDocument()
    expect(sw('Lembrete de salário')).toHaveAttribute('aria-checked', 'true')
    expect(sw('Relatório por e-mail')).toHaveAttribute('aria-checked', 'false')
    expect(document.querySelector('.fin-hero')).toBeNull()
  })

  it('o interruptor vale na hora e é gravado na conta', async () => {
    setup()
    fireEvent.click(sw('Dicas da Nancy IA'))
    expect(sw('Dicas da Nancy IA')).toHaveAttribute('aria-checked', 'false')
    expect(stored().notifTips).toBe(false)
    await waitFor(() => expect(authAPI.updateNotifPrefs).toHaveBeenCalledWith({ notifTips: false }))
  })

  it('se o servidor recusar, volta ao que era e avisa', async () => {
    authAPI.updateNotifPrefs.mockRejectedValue(new Error('x'))
    setup()
    fireEvent.click(sw('Alerta de limite'))
    expect(await screen.findByText('Erro ao salvar preferência.')).toBeInTheDocument()
    await waitFor(() => expect(sw('Alerta de limite')).toHaveAttribute('aria-checked', 'true'))
  })

  it('relatório por e-mail ligado com o e-mail não confirmado pede a confirmação', () => {
    setup({ notifWeeklyEmail: true, emailVerified: false })
    expect(screen.getByText('Toda segunda-feira · confirme seu e-mail para receber')).toBeInTheDocument()
  })
})

describe('Preferências — celular continua o mesmo', () => {
  it('abaixo de 901px: cabeçalho azul e lista do celular', () => {
    setDesktop(false)
    setup()
    expect(screen.getByRole('heading', { name: 'Preferências' })).toBeInTheDocument()
    expect(document.querySelector('.pr-list')).not.toBeNull()
    expect(document.querySelector('.nst-list')).toBeNull()
  })
})
