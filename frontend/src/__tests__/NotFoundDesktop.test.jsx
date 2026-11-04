import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import NotFound from '../pages/NotFound.jsx'

vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => <div data-testid="navbar" /> }))

const setDesktop = (is) => { window.matchMedia = vi.fn(() => ({ matches: is, addEventListener() {}, removeEventListener() {} })) }
function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}</div> }
function setup({ loggedIn = true } = {}) {
  const user = loggedIn ? { id: 'u-nf', name: 'Ana' } : {}
  sessionStorage.setItem('user', JSON.stringify(user))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: user }))
  return render(
    <MemoryRouter initialEntries={['/dashboard', '/nada-aqui']} initialIndex={1}>
      <Where />
      <Routes>
        <Route path="/nada-aqui" element={<NotFound />} />
        <Route path="*" element={<div>outra tela</div>} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => { sessionStorage.clear(); setDesktop(true) })
afterEach(() => { delete window.matchMedia })

describe('Erro 404 no desktop (design "Nancy Desktop", tela 37)', () => {
  it('dentro da casca: o "404" grande, a frase, o aviso e o botão, sem o cabeçalho do celular', () => {
    setup()
    expect(screen.getByTestId('navbar')).toBeInTheDocument()
    expect(document.querySelector('.ndnf-code')).toHaveTextContent('404')
    expect(screen.getByRole('heading', { level: 2, name: 'Essa página saiu do orçamento.' })).toBeInTheDocument()
    expect(screen.getByText('O link pode estar quebrado ou a página foi removida.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Voltar' })).not.toBeInTheDocument()
    expect(document.querySelector('.fin-hero')).toBeNull()
  })

  it('"Voltar ao início" leva ao Início', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Voltar ao início' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard')
  })

  it('visitante (sem login) no desktop vê a página de sempre, e o botão leva à página inicial', async () => {
    setup({ loggedIn: false })
    expect(screen.queryByTestId('navbar')).not.toBeInTheDocument()
    expect(document.querySelector('.ndnf')).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'Ops!' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Voltar ao início' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/')
  })

  it('celular logado: cabeçalho com Voltar, como sempre', () => {
    setDesktop(false)
    setup()
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument()
    expect(document.querySelector('.ndnf')).toBeNull()
  })
})
