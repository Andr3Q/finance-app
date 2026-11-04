import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import SettingsSecurity from '../pages/SettingsSecurity.jsx'

vi.mock('../services/api.js', () => ({ authAPI: { changePassword: vi.fn() }, twoFactorAPI: { status: vi.fn().mockResolvedValue({ data: { enabled: false, backupCodesRemaining: 0 } }), setup: vi.fn(), verifySetup: vi.fn(), disable: vi.fn(), regenerateBackupCodes: vi.fn() } }))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))

const setDesktop = (is) => { window.matchMedia = vi.fn(() => ({ matches: is, addEventListener() {}, removeEventListener() {} })) }
function setup() {
  const u = { id: 'u-sec', name: 'André', email: 'a@x.com', plan: 'elite' }
  sessionStorage.setItem('user', JSON.stringify(u))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: u }))
  return render(<MemoryRouter initialEntries={['/settings/seguranca']}><Routes><Route path="/settings/seguranca" element={<SettingsSecurity />} /></Routes></MemoryRouter>)
}

beforeEach(() => { sessionStorage.clear(); setDesktop(true) })
afterEach(() => { delete window.matchMedia })

describe('Segurança no desktop (design "Nancy Desktop", tela 27)', () => {
  it('menu da conta (Segurança acesa) e os dois cartões lado a lado: Alterar senha e Duas etapas', async () => {
    setup()
    expect(within(screen.getByRole('navigation', { name: 'Conta' })).getByRole('button', { name: 'Segurança' })).toHaveAttribute('aria-current', 'page')
    expect(await screen.findByRole('region', { name: 'Alterar senha' })).toBeInTheDocument()
    expect(document.querySelector('.nst-sec')).not.toBeNull()
    expect(document.querySelectorAll('.nst-sec > .fin-card').length).toBe(2)
    expect(document.querySelector('.fin-hero')).toBeNull()
  })
})

describe('Segurança — celular continua o mesmo', () => {
  it('abaixo de 901px: cabeçalho azul', async () => {
    setDesktop(false)
    setup()
    expect(await screen.findByRole('heading', { name: 'Segurança' })).toBeInTheDocument()
    expect(document.querySelector('.nst-sec')).toBeNull()
  })
})
