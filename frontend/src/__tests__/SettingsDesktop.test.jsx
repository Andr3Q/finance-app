import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import Settings from '../pages/Settings.jsx'

vi.mock('../services/api.js', () => ({ authAPI: { logout: vi.fn() } }))
vi.mock('../services/installPrompt.js', () => ({ isInstalled: vi.fn(() => false) }))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))
import { authAPI } from '../services/api.js'
import { isInstalled } from '../services/installPrompt.js'

const setDesktop = (is) => { window.matchMedia = vi.fn(() => ({ matches: is, addEventListener() {}, removeEventListener() {} })) }
function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}</div> }
function setup(user = { id: 'u-set', name: 'André Pereira', email: 'andre@nancy.app', plan: 'elite' }) {
  sessionStorage.setItem('user', JSON.stringify(user))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: user }))
  return render(<MemoryRouter initialEntries={['/settings']}><Where /><Routes><Route path="/settings" element={<Settings />} /><Route path="*" element={<div>outra tela</div>} /></Routes></MemoryRouter>)
}
const nav = () => within(screen.getByRole('navigation', { name: 'Conta' }))

beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); localStorage.clear(); isInstalled.mockReturnValue(false); authAPI.logout.mockResolvedValue({}); setDesktop(true) })
afterEach(() => { delete window.matchMedia })

describe('Configurações no desktop (design "Nancy Desktop", tela 25)', () => {
  it('menu da conta com as 12 telas (Visão geral acesa) e o cartão azul com nome, e-mail e plano', () => {
    setup()
    expect(nav().getAllByRole('button').map(b => b.textContent)).toEqual([
      'Visão geral', 'Dados pessoais', 'Segurança', 'Preferências', 'Balanço mensal', 'Planos', 'Pagamentos', 'Indique e ganhe', 'Meus dados', 'Instalar app', 'Termos de Uso', 'Privacidade',
    ])
    expect(nav().getByRole('button', { name: 'Visão geral' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { name: 'André Pereira' })).toBeInTheDocument()
    expect(screen.getByText('andre@nancy.app')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Plano Elite: gerenciar plano' })).toHaveTextContent('Elite')
    expect(document.querySelector('.pf-hero')).toBeNull()
  })

  it('nove atalhos em cartões levam às telas; "Instalar app" some quando o app já está instalado', () => {
    setup()
    const cards = [...document.querySelectorAll('.nst-card')]
    expect(cards.map(c => c.querySelector('strong').textContent)).toEqual(['Dados pessoais', 'Segurança', 'Preferências', 'Balanço mensal', 'Planos', 'Pagamentos', 'Indique e ganhe', 'Meus dados', 'Instalar app'])
    fireEvent.click(cards[1])
    expect(screen.getByTestId('where')).toHaveTextContent('/settings/seguranca')
  })

  it('o menu leva a cada tela; a tela aberta não navega de novo', () => {
    setup()
    fireEvent.click(nav().getByRole('button', { name: 'Balanço mensal' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/settings/fechamento')
  })

  it('instalado: o item e o cartão de instalar desaparecem', () => {
    isInstalled.mockReturnValue(true)
    setup()
    expect(nav().queryByRole('button', { name: 'Instalar app' })).not.toBeInTheDocument()
    expect([...document.querySelectorAll('.nst-card strong')].map(s => s.textContent)).not.toContain('Instalar app')
  })

  it('plano gratuito mostra "Grátis" e o toque leva aos planos', () => {
    setup({ id: 'u-set', name: 'Ana', plan: 'free' })
    const pill = screen.getByRole('button', { name: 'Plano Grátis: gerenciar plano' })
    expect(pill).toHaveTextContent('Grátis')
    fireEvent.click(pill)
    expect(screen.getByTestId('where')).toHaveTextContent('/planos')
  })

  it('"Sair da conta" encerra a sessão e leva ao login', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Sair da conta' }))
    await waitFor(() => expect(authAPI.logout).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/login'))
    expect(sessionStorage.getItem('user')).toBeNull()
  })
})

describe('Configurações — celular continua o mesmo', () => {
  it('abaixo de 901px: lista do celular', () => {
    setDesktop(false)
    setup()
    expect(document.querySelector('.pf-list')).not.toBeNull()
    expect(document.querySelector('.nst-nav')).toBeNull()
  })
})
