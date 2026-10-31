import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import NotFound from '../pages/NotFound.jsx'

vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => <div data-testid="navbar" /> }))

function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}</div> }
function renderPage({ loggedIn = true, entries = ['/dashboard', '/nada-aqui'], index = 1 } = {}) {
  const user = loggedIn ? { id: 'u1', name: 'Ana' } : {}
  sessionStorage.setItem('user', JSON.stringify(user))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: user }))
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <Where />
      <Routes>
        <Route path="/nada-aqui" element={<NotFound />} />
        <Route path="*" element={<div>outra tela</div>} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => { sessionStorage.clear() })

describe('Erro 404', () => {
  it('mostra o "404", a mensagem do design e o botão de voltar ao início', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Ops!' })).toBeInTheDocument()
    expect(screen.getByText('Erro 404')).toBeInTheDocument()
    expect(screen.getByText('404')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Essa página saiu do orçamento.' })).toBeInTheDocument()
    expect(screen.getByText('O link pode estar quebrado ou a página foi removida.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Voltar ao início' })).toBeInTheDocument()
  })

  it('logado: com a barra de navegação, e "Voltar ao início" leva ao Dashboard', () => {
    renderPage()
    expect(screen.getByTestId('navbar')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao início' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard')
  })

  it('visitante: sem a barra, e "Voltar ao início" leva à página inicial', () => {
    renderPage({ loggedIn: false })
    expect(screen.queryByTestId('navbar')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao início' }))
    expect(screen.getByTestId('where').textContent).toBe('/')
  })

  it('o voltar do cabeçalho desfaz o último passo; sem passo anterior vai ao início', () => {
    const a = renderPage({ entries: ['/historico-x', '/nada-aqui'], index: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/historico-x')
    a.unmount()
    renderPage({ entries: ['/nada-aqui'], index: 0 })
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard')
  })
})
