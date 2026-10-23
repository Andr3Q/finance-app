import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import SettingsInstall from '../pages/SettingsInstall.jsx'

vi.mock('../services/installPrompt.js', () => ({ isInstalled: vi.fn(), getInstallPrompt: vi.fn(), clearInstallPrompt: vi.fn() }))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))

import { isInstalled, getInstallPrompt, clearInstallPrompt } from '../services/installPrompt.js'

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'
const IPHONE  = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'
const setUA = (ua) => Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })

function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}</div> }
function renderPage({ entries = ['/settings', '/settings/instalar'], index = 1 } = {}) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <Where />
      <Routes>
        <Route path="/settings/instalar" element={<SettingsInstall />} />
        <Route path="*" element={<div>outra tela</div>} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => { vi.clearAllMocks(); isInstalled.mockReturnValue(false); getInstallPrompt.mockReturnValue(null); setUA(ANDROID) })

describe('Instalar app', () => {
  it('mostra a chamada, os 3 passos e o botão "Instalar agora"', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Instalar app' })).toBeInTheDocument()
    expect(screen.getByText('Acesso pela tela inicial')).toBeInTheDocument()
    expect(screen.getByText('Nancy na sua tela inicial')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').map(li => li.textContent)).toEqual([
      '1Toque em Compartilhar ou no menu ⋮ do navegador', '2Escolha "Adicionar à tela inicial"', '3Pronto: a Nancy abre como um app',
    ])
    expect(screen.getByRole('button', { name: 'Instalar agora' })).toBeEnabled()
  })

  it('no iPhone os passos são os do Safari e não há botão (não existe instalação automática lá)', () => {
    setUA(IPHONE)
    renderPage()
    expect(screen.getByText('Toque em Compartilhar, na barra do Safari')).toBeInTheDocument()
    expect(screen.getByText('Escolha "Adicionar à Tela de Início"')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Instalar agora' })).not.toBeInTheDocument()
  })

  it('já instalado (aberto como app): avisa e não oferece instalar de novo', () => {
    isInstalled.mockReturnValue(true)
    renderPage()
    expect(screen.getByText('A Nancy já está instalada')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Instalar agora' })).not.toBeInTheDocument()
  })

  it('com a instalação do navegador disponível: abre, e aceitar marca como instalada', async () => {
    const prompt = { prompt: vi.fn(), userChoice: Promise.resolve({ outcome: 'accepted' }) }
    getInstallPrompt.mockReturnValue(prompt)
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Instalar agora' }))
    expect(await screen.findByText('A Nancy já está instalada')).toBeInTheDocument()
    expect(prompt.prompt).toHaveBeenCalledTimes(1)
    expect(clearInstallPrompt).toHaveBeenCalled()
  })

  it('recusar a instalação do navegador mostra a dica dos passos, sem marcar como instalada', async () => {
    getInstallPrompt.mockReturnValue({ prompt: vi.fn(), userChoice: Promise.resolve({ outcome: 'dismissed' }) })
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Instalar agora' }))
    expect(await screen.findByRole('status')).toHaveTextContent('A instalação automática não abriu')
    expect(screen.queryByText('A Nancy já está instalada')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Instalar agora' })).toBeEnabled()
  })

  it('sem instalação do navegador (ou se ela falhar) mostra a dica dos passos', async () => {
    const first = renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Instalar agora' }))
    expect(await screen.findByRole('status')).toBeInTheDocument()
    first.unmount()
    getInstallPrompt.mockReturnValue({ prompt: () => { throw new Error('boom') }, userChoice: Promise.resolve({}) })
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Instalar agora' }))
    expect(await screen.findByRole('status')).toBeInTheDocument()
  })

  it('enquanto o navegador pergunta, o botão fica desligado e diz "Instalando…"', async () => {
    let choose
    getInstallPrompt.mockReturnValue({ prompt: vi.fn(), userChoice: new Promise(r => { choose = r }) })
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Instalar agora' }))
    expect(await screen.findByRole('button', { name: 'Instalando…' })).toBeDisabled()
    choose({ outcome: 'dismissed' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Instalar agora' })).toBeEnabled())
  })

  it('voltar retorna à tela anterior; aberta direto pela URL vai pro Perfil', () => {
    const first = renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/settings')
    first.unmount()
    renderPage({ entries: ['/settings/instalar'], index: 0 })
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/settings')
  })
})
