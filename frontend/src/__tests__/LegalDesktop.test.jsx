import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import TermsOfUse from '../pages/TermsOfUse.jsx'
import PrivacyPolicy from '../pages/PrivacyPolicy.jsx'

vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))

const setDesktop = (is) => { window.matchMedia = vi.fn(() => ({ matches: is, addEventListener() {}, removeEventListener() {} })) }
function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}</div> }
function setup(path, { loggedIn = true } = {}) {
  const user = loggedIn ? { id: 'u-lg', name: 'Ana' } : {}
  sessionStorage.setItem('user', JSON.stringify(user))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: user }))
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Where />
      <Routes>
        <Route path="/termos" element={<TermsOfUse />} />
        <Route path="/privacidade" element={<PrivacyPolicy />} />
        <Route path="*" element={<div>outra tela</div>} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => { sessionStorage.clear(); setDesktop(true) })
afterEach(() => { delete window.matchMedia })

describe('Termos de Uso no desktop (design "Nancy Desktop", tela 35)', () => {
  it('menu da conta (Termos de Uso aceso) e o texto completo num cartão, com o rodapé dentro', () => {
    setup('/termos')
    expect(within(screen.getByRole('navigation', { name: 'Conta' })).getByRole('button', { name: 'Termos de Uso' })).toHaveAttribute('aria-current', 'page')
    const card = screen.getByRole('article', { name: 'Termos de Uso' })
    expect(card).toHaveClass('ndl-card')
    expect(within(card).getAllByRole('heading', { level: 2 })).toHaveLength(12)
    expect(within(card).getByText('1. O que é o Nancy')).toBeInTheDocument()
    expect(card.querySelector('.ndl-foot')).toHaveTextContent('Dúvidas: contato@nancy.com.br')
    expect(document.querySelector('.fin-hero')).toBeNull()
  })

  it('o link da Política de Privacidade leva à tela dela', async () => {
    setup('/termos')
    await userEvent.click(within(screen.getByRole('article')).getAllByRole('link', { name: 'Política de Privacidade' })[0])
    expect(screen.getByTestId('where')).toHaveTextContent('/privacidade')
  })
})

describe('Política de Privacidade no desktop (design "Nancy Desktop", tela 36)', () => {
  it('menu da conta (Privacidade aceso) e o texto num cartão', () => {
    setup('/privacidade')
    expect(within(screen.getByRole('navigation', { name: 'Conta' })).getByRole('button', { name: 'Privacidade' })).toHaveAttribute('aria-current', 'page')
    const card = screen.getByRole('article', { name: 'Política de Privacidade' })
    expect(card).toHaveClass('ndl-card')
    expect(within(card).getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(5)
    expect(document.querySelector('.fin-hero')).toBeNull()
  })
})

describe('Páginas legais — quem chega de fora e o celular continuam como sempre', () => {
  it('sem login no desktop: página pública, sem menu da conta', () => {
    setup('/termos', { loggedIn: false })
    expect(screen.queryByRole('navigation', { name: 'Conta' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Termos de Uso' })).toBeInTheDocument()
    expect(document.querySelector('.ndl-card')).toBeNull()
  })

  it('no celular logado: cabeçalho com Voltar, sem menu da conta', () => {
    setDesktop(false)
    setup('/privacidade')
    expect(screen.queryByRole('navigation', { name: 'Conta' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument()
    expect(document.querySelector('.ndl-card')).toBeNull()
  })
})
