import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import SettingsInstall from '../pages/SettingsInstall.jsx'

vi.mock('../services/installPrompt.js', () => ({ isInstalled: vi.fn(), getInstallPrompt: vi.fn(), clearInstallPrompt: vi.fn() }))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))
import { isInstalled, getInstallPrompt, clearInstallPrompt } from '../services/installPrompt.js'

const setDesktop = (is) => { window.matchMedia = vi.fn(() => ({ matches: is, addEventListener() {}, removeEventListener() {} })) }
const DESK_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'
const setUA = (ua) => Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })
function setup() {
  const u = { id: 'u-in', name: 'Ana' }
  sessionStorage.setItem('user', JSON.stringify(u))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: u }))
  return render(<MemoryRouter initialEntries={['/settings/instalar']}><Routes><Route path="/settings/instalar" element={<SettingsInstall />} /></Routes></MemoryRouter>)
}

beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); setDesktop(true); isInstalled.mockReturnValue(false); getInstallPrompt.mockReturnValue(null); setUA(DESK_UA) })
afterEach(() => { delete window.matchMedia })

describe('Instalar app no desktop (design "Nancy Desktop", tela 34)', () => {
  it('menu da conta (Instalar app aceso), faixa "Nancy como app no computador" com o botão e os 3 passos do computador', () => {
    setup()
    expect(within(screen.getByRole('navigation', { name: 'Conta' })).getByRole('button', { name: 'Instalar app' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { name: 'Nancy como app no computador' })).toBeInTheDocument()
    expect(screen.getByText('Abre em janela própria, sem navegador, e ocupa menos de 1 MB.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Instalar agora' })).toBeEnabled()
    expect(screen.getAllByRole('listitem').map(li => li.textContent)).toEqual([
      '1Clique no ícone de instalar na barra de endereço do navegador', '2Confirme em "Instalar Nancy"', '3Pronto: a Nancy abre em janela própria',
    ])
    expect(document.querySelector('.fin-hero')).toBeNull()
  })

  it('aceitar a instalação do navegador marca como instalada e some com os passos', async () => {
    const prompt = { prompt: vi.fn(), userChoice: Promise.resolve({ outcome: 'accepted' }) }
    getInstallPrompt.mockReturnValue(prompt)
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Instalar agora' }))
    expect(await screen.findByRole('heading', { name: 'A Nancy já está instalada' })).toBeInTheDocument()
    expect(prompt.prompt).toHaveBeenCalledTimes(1)
    expect(clearInstallPrompt).toHaveBeenCalled()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('sem instalação do navegador (ou se ela for recusada) mostra a dica dos passos e o botão volta', async () => {
    getInstallPrompt.mockReturnValue({ prompt: vi.fn(), userChoice: Promise.resolve({ outcome: 'dismissed' }) })
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Instalar agora' }))
    expect(await screen.findByRole('status')).toHaveTextContent('A instalação automática não abriu')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Instalar agora' })).toBeEnabled())
  })

  it('já instalado: avisa, sem passos nem botão', () => {
    isInstalled.mockReturnValue(true)
    setup()
    expect(screen.getByRole('heading', { name: 'A Nancy já está instalada' })).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Instalar agora' })).not.toBeInTheDocument()
  })

  it('iPad em tela larga: passos do Safari e sem botão (não existe instalação automática lá)', () => {
    setUA(IPAD)
    setup()
    expect(screen.getByText('Toque em Compartilhar, na barra do Safari')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Instalar agora' })).not.toBeInTheDocument()
  })
})

describe('Instalar app — celular continua o mesmo', () => {
  it('no celular segue o cabeçalho com Voltar e os passos do celular', () => {
    setDesktop(false)
    setup()
    expect(screen.queryByRole('navigation', { name: 'Conta' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument()
    expect(screen.getByText('Escolha "Adicionar à tela inicial"')).toBeInTheDocument()
  })
})
