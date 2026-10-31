import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import DesktopSidebar from '../components/layout/DesktopSidebar.jsx'
import DesktopTopbar from '../components/layout/DesktopTopbar.jsx'
import { usePageSubtitle } from '../hooks/usePageSubtitle.js'
import { publishUnreadCount } from '../hooks/useUnreadCount.js'

function Where() {
  const l = useLocation()
  return <div data-testid="where">{l.pathname}|{l.state?.search ?? ''}</div>
}
function Sub({ text }) { usePageSubtitle(text); return null }

const setUser = (u) => {
  sessionStorage.setItem('user', JSON.stringify(u))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: u }))
}
const renderShell = (path = '/dashboard', extra = null) => render(
  <MemoryRouter initialEntries={[path]}>
    <DesktopSidebar />
    <DesktopTopbar />
    <Where />
    <Routes><Route path="*" element={extra} /></Routes>
  </MemoryRouter>
)
const ELITE = { id: 'u1', name: 'André Pereira', plan: 'elite' }

beforeEach(() => { sessionStorage.clear(); localStorage.clear(); setUser(ELITE) })
afterEach(() => { act(() => publishUnreadCount(NaN)) })

describe('menu lateral', () => {
  it('mostra os itens prontos na ordem do design, sem Planilha IA e Analisador (ainda sem tela)', () => {
    renderShell()
    const nav = screen.getByRole('navigation', { name: 'Menu principal' })
    expect(within(nav).getAllByRole('button').map(b => b.textContent)).toEqual(
      ['Início', 'Extrato', 'Nancy IA', 'Metas', 'Finanças', 'Calendário', 'Planos'])
    expect(screen.queryByText('Planilha IA', { selector: '.nds-item-label' })).not.toBeInTheDocument()
    expect(screen.queryByText('Analisador')).not.toBeInTheDocument()
  })

  it('acende o item da tela atual (aria-current) e o pai nas sub-telas', () => {
    const { unmount } = renderShell('/dashboard')
    expect(screen.getByRole('button', { name: 'Início' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Extrato' })).not.toHaveAttribute('aria-current')
    unmount()
    renderShell('/limites')
    expect(screen.getByRole('button', { name: 'Metas' })).toHaveAttribute('aria-current', 'page')
  })

  it('clicar num item troca de tela', () => {
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: 'Extrato' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/transactions')
    fireEvent.click(screen.getByRole('button', { name: 'Calendário' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/calendar')
  })

  it('Nancy IA abre o painel do chat sem trocar de tela', () => {
    const opened = vi.fn()
    window.addEventListener('nancy:open-agent-chat', opened)
    renderShell('/goals')
    fireEvent.click(screen.getByRole('button', { name: 'Nancy IA' }))
    window.removeEventListener('nancy:open-agent-chat', opened)
    expect(opened).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('where')).toHaveTextContent('/goals')
  })

  it('cartão do plano: Elite como no design; os outros planos levam a Planos', () => {
    const { unmount } = renderShell()
    expect(screen.getByRole('button', { name: /Plano Elite/ })).toHaveTextContent('IA ilimitada e Planilha IA ativas')
    unmount()
    act(() => setUser({ ...ELITE, plan: 'pro' }))
    const pro = renderShell()
    expect(screen.getByRole('button', { name: /Plano Pro/ })).toBeInTheDocument()
    pro.unmount()
    act(() => setUser({ ...ELITE, plan: 'free' }))
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: /Plano Grátis/ }))
    expect(screen.getByTestId('where')).toHaveTextContent('/planos')
  })

  it('cartão do plano em teste do Pro conta os dias', () => {
    act(() => setUser({ ...ELITE, plan: 'pro', isOnTrial: true, trialEndsAt: new Date(Date.now() + 3 * 86400000 - 1000).toISOString() }))
    renderShell()
    expect(screen.getByRole('button', { name: /Teste do Pro/ })).toHaveTextContent('Faltam 3 dias')
  })

  it('cartão do usuário: nome, iniciais (ou a foto), "Configurações" e aceso nas telas da conta', () => {
    const { unmount } = renderShell('/settings/seguranca')
    const card = screen.getByRole('button', { name: 'André Pereira, abrir Configurações' })
    expect(card).toHaveTextContent('AP')
    expect(card).toHaveTextContent('Configurações')
    expect(card).toHaveClass('active')
    fireEvent.click(card)
    expect(screen.getByTestId('where')).toHaveTextContent('/settings')
    unmount()

    act(() => setUser({ ...ELITE, avatarUpdatedAt: '2026-10-01T10:00:00Z' }))
    const { container } = renderShell('/dashboard')
    expect(container.querySelector('.nds-av img')).toHaveAttribute('src', expect.stringContaining('/api/auth/avatar?v='))
    expect(screen.getByRole('button', { name: 'André Pereira, abrir Configurações' })).not.toHaveClass('active')
  })

  it('o logo leva ao Início', () => {
    renderShell('/goals')
    fireEvent.click(screen.getByRole('button', { name: /Nancy, ir para o Início/ }))
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard')
  })
})

describe('barra de cima', () => {
  it('título e subtítulo da tela (Início cumprimenta pelo nome)', () => {
    renderShell('/dashboard')
    expect(screen.getByRole('heading', { level: 1, name: 'Início' })).toBeInTheDocument()
    expect(document.querySelector('.nds-topbar-sub').textContent).toMatch(/^(Bom dia|Boa tarde|Boa noite), André · /)
  })

  it('a tela pode trocar o subtítulo (Notificações: "4 novas") e ao sair volta ao padrão', () => {
    const { unmount } = renderShell('/notificacoes', <Sub text="4 novas" />)
    expect(document.querySelector('.nds-topbar-sub')).toHaveTextContent('4 novas')
    unmount()
    renderShell('/notificacoes')
    expect(document.querySelector('.nds-topbar-sub')).toHaveTextContent('Suas novidades')
  })

  it('a busca leva ao Extrato já filtrado; busca vazia não faz nada', () => {
    renderShell('/dashboard')
    const input = screen.getByRole('searchbox', { name: /Buscar transações, contas, metas/ })
    expect(input).toHaveAttribute('placeholder', 'Buscar transações, contas, metas…')
    fireEvent.submit(input.closest('form'))
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard|')
    fireEvent.change(input, { target: { value: '  luz ' } })
    fireEvent.submit(input.closest('form'))
    expect(screen.getByTestId('where')).toHaveTextContent('/transactions|luz')
  })

  it('o olho oculta e mostra os valores (aria-pressed) e guarda a preferência', () => {
    renderShell()
    const eye = screen.getByRole('button', { name: 'Ocultar valores' })
    expect(eye).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(eye)
    expect(screen.getByRole('button', { name: 'Mostrar valores' })).toHaveAttribute('aria-pressed', 'true')
    expect(localStorage.getItem('hide-balance')).toBe('1')
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar valores' })) // deixa como estava (estado do módulo)
    expect(localStorage.getItem('hide-balance')).toBe('0')
  })

  it('o sino abre as Notificações e só mostra a bolinha quando há notificação nova', () => {
    renderShell()
    expect(screen.queryByTestId('topbar-bell-dot')).not.toBeInTheDocument() // ainda não calculado
    act(() => publishUnreadCount(2))
    expect(screen.getByTestId('topbar-bell-dot')).toBeInTheDocument()
    act(() => publishUnreadCount(0))
    expect(screen.queryByTestId('topbar-bell-dot')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Notificações' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/notificacoes')
  })

  it('"Nova transação" abre a folha de nova saída (sem tipo definido)', () => {
    const seen = []
    const on = (e) => seen.push(e.detail)
    window.addEventListener('nancy:new-transaction', on)
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: 'Nova transação' }))
    window.removeEventListener('nancy:new-transaction', on)
    expect(seen).toEqual([{}])
  })
})
