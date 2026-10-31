import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Landing from '../pages/Landing.jsx'
import LandingDesktop from '../pages/LandingDesktop.jsx'
import DesktopAuthHero from '../components/auth/DesktopAuthHero.jsx'

const renderIn = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>)
const setDesktop = (is) => { window.matchMedia = vi.fn(() => ({ matches: is, addEventListener() {}, removeEventListener() {} })) }
afterEach(() => { delete window.matchMedia })

describe('Boas-vindas no desktop (design "Nancy Desktop", tela 02)', () => {
  it('painel azul: título, texto de apoio, os dois cartões e os 4 rótulos do design', () => {
    renderIn(<LandingDesktop />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Seu dinheiro, saudável.')
    expect(screen.getByText('Organize contas, crie metas, veja sua planilha se montar sozinha e converse com uma IA que entende suas finanças.')).toBeInTheDocument()
    expect(screen.getByText('Saldo disponível')).toBeInTheDocument()
    expect(screen.getByText('R$ 23.500')).toBeInTheDocument()
    expect(screen.getByText('Saúde 79')).toBeInTheDocument()
    expect(screen.getByText('+8,4%')).toBeInTheDocument()
    expect(screen.getByText('Nancy IA')).toBeInTheDocument()
    expect(screen.getByText('R$ 400')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').map(li => li.textContent)).toEqual(['Resumo em stories', 'Nancy IA com voz', 'Planilha IA', 'LGPD'])
  })

  it('painel branco: "Comece grátis." com os dois botões levando ao cadastro e ao login', () => {
    renderIn(<LandingDesktop />)
    expect(screen.getByRole('heading', { level: 2, name: 'Comece grátis.' })).toBeInTheDocument()
    expect(screen.getByText('Leva menos de 1 minuto. Sem cartão.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Criar conta grátis' })).toHaveAttribute('href', '/register')
    expect(screen.getByRole('link', { name: 'Já tenho conta' })).toHaveAttribute('href', '/login')
  })

  it('o aviso legal leva aos Termos e à Política de Privacidade', () => {
    renderIn(<LandingDesktop />)
    const legal = screen.getByText(/Ao continuar você aceita os/)
    expect(legal).toHaveTextContent('Ao continuar você aceita os Termos e a Política de Privacidade.')
    expect(within(legal).getByRole('link', { name: 'Termos' })).toHaveAttribute('href', '/termos')
    expect(within(legal).getByRole('link', { name: 'Política de Privacidade' })).toHaveAttribute('href', '/privacidade')
  })

  it('o painel azul das telas com formulário não tem os cartões (só a Boas-vindas tem)', () => {
    const { container, rerender } = renderIn(<DesktopAuthHero variant="landing" />)
    expect(container.querySelector('.ad-cards')).toBeInTheDocument()
    expect(container.querySelector('.ad-hero')).toHaveClass('ad-hero--landing')
    rerender(<MemoryRouter><DesktopAuthHero variant="form" /></MemoryRouter>)
    expect(container.querySelector('.ad-cards')).not.toBeInTheDocument()
    expect(container.querySelector('.ad-hero')).toHaveClass('ad-hero--form')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Seu dinheiro, saudável.')
  })
})

describe('Landing escolhe o layout pelo tamanho da tela', () => {
  it('janela larga: layout do desktop (e não o do celular)', () => {
    setDesktop(true)
    const { container } = renderIn(<Landing />)
    expect(container.querySelector('.ad-split')).toBeInTheDocument()
    expect(container.querySelector('.lw-page')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Comece grátis.' })).toBeInTheDocument()
  })

  it('janela estreita (ou sem matchMedia): layout do celular, sem o do desktop', () => {
    setDesktop(false)
    const { container } = renderIn(<Landing />)
    expect(container.querySelector('.lw-page')).toBeInTheDocument()
    expect(container.querySelector('.ad-split')).not.toBeInTheDocument()
    expect(screen.getByText('Grátis para sempre · Sem cartão de crédito')).toBeInTheDocument()
  })
})
