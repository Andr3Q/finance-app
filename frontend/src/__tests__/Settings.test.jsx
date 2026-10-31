import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import Settings from '../pages/Settings.jsx'

vi.mock('../services/api.js', () => ({ authAPI: { logout: vi.fn() } }))
vi.mock('../services/installPrompt.js', () => ({ isInstalled: vi.fn(() => false) }))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))

import { authAPI } from '../services/api.js'
import { isInstalled } from '../services/installPrompt.js'

function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}{l.state ? JSON.stringify(l.state) : ''}</div> }
function renderPage(user = { id: 'u1', name: 'André Pereira', email: 'a@x.com', plan: 'elite' }) {
  sessionStorage.setItem('user', JSON.stringify(user))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: user }))
  return render(
    <MemoryRouter initialEntries={['/settings']}>
      <Where />
      <Routes>
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<div>outra tela</div>} />
      </Routes>
    </MemoryRouter>
  )
}
const go = (name) => fireEvent.click(screen.getByRole('button', { name }))
const where = () => screen.getByTestId('where').textContent

beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); localStorage.clear(); isInstalled.mockReturnValue(false); authAPI.logout.mockResolvedValue({}) })

describe('Perfil', () => {
  it('mostra iniciais, nome e o selo do plano', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'André Pereira' })).toBeInTheDocument()
    expect(document.querySelector('.pf-av').textContent).toBe('AP')
    expect(screen.getByRole('button', { name: /Plano Elite/ })).toBeInTheDocument()
  })

  it('com foto de perfil, ela ocupa o círculo do avatar no lugar das iniciais', () => {
    renderPage({ id: 'u1', name: 'André Pereira', plan: 'elite', avatarUpdatedAt: '2026-10-22T15:00:00.000Z' })
    const av = document.querySelector('.pf-av')
    expect(av.querySelector('img')).toHaveAttribute('src', '/api/auth/avatar?v=2026-10-22T15%3A00%3A00.000Z')
    expect(av.textContent).toBe('')
  })

  it('selo do plano: Pro, Grátis (também sem plano) e leva aos planos', () => {
    renderPage({ id: 'u1', name: 'Ana', plan: 'pro' })
    expect(screen.getByRole('button', { name: /Plano Pro/ })).toBeInTheDocument()
    expect(document.querySelector('.pf-av').textContent).toBe('A')
    fireEvent.click(screen.getByRole('button', { name: /Plano Pro/ }))
    expect(where()).toBe('/planos')
  })

  it('plano grátis ou sem plano mostra "Plano Grátis" com o selo discreto; sem nome vira "Usuário" e "?"', () => {
    renderPage({ id: 'u1', plan: null })
    expect(screen.getByRole('button', { name: /Plano Grátis/ })).toHaveClass('free')
    expect(screen.getByRole('heading', { name: 'Usuário' })).toBeInTheDocument()
    expect(document.querySelector('.pf-av').textContent).toBe('?')
  })

  it('lista as telas da conta na ordem do design, com as extras depois, e "Sair da conta" por último', () => {
    renderPage()
    const labels = Array.from(document.querySelectorAll('.pf-row-label')).map(n => n.textContent)
    expect(labels).toEqual([
      'Dados pessoais', 'Finanças', 'Calendário', 'Balanço mensal', 'Segurança', 'Notificações', 'Planos', 'Pagamentos',
      'Indique e ganhe', 'Meus dados', 'Instalar app', 'Termos de uso', 'Política de privacidade', 'Sair da conta',
    ])
  })

  it.each([
    ['Dados pessoais', '/settings/perfil'], ['Finanças', '/financas'], ['Calendário', '/calendar'], ['Balanço mensal', '/settings/fechamento'],
    ['Segurança', '/settings/seguranca'], ['Notificações', '/settings/notificacoes'], ['Planos', '/planos'], ['Pagamentos', '/settings/pagamentos'],
    ['Indique e ganhe', '/settings/indique'], ['Meus dados', '/settings/dados'], ['Instalar app', '/settings/instalar'],
    ['Termos de uso', '/termos'], ['Política de privacidade', '/privacidade'],
  ])('"%s" abre %s', (label, to) => {
    renderPage()
    go(label)
    expect(where()).toBe(to)
  })

  it('"Resumos mensais" abre os stories do mês atual', () => {
    renderPage()
    expect(screen.getByText('Reveja seus meses em stories')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Resumos mensais/ }))
    expect(where()).toBe('/resumo-stories{"monthOffset":0}')
  })

  it('app já instalado: some "Instalar app"', () => {
    isInstalled.mockReturnValue(true)
    renderPage()
    expect(screen.queryByRole('button', { name: 'Instalar app' })).not.toBeInTheDocument()
  })

  it('"Sair da conta" encerra a sessão, limpa os dados locais e vai ao login — mesmo se a rede falhar', async () => {
    authAPI.logout.mockRejectedValue(new Error('offline'))
    sessionStorage.setItem('token', 't')
    renderPage()
    go('Sair da conta')
    await waitFor(() => expect(where()).toBe('/login'))
    expect(authAPI.logout).toHaveBeenCalled()
    expect(sessionStorage.getItem('user')).toBeNull()
    expect(sessionStorage.getItem('token')).toBeNull()
  })
})
