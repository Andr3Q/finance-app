import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import SettingsData from '../pages/SettingsData.jsx'

vi.mock('../services/api.js', () => ({ authAPI: { exportData: vi.fn(), deleteAccount: vi.fn() } }))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))

import { authAPI } from '../services/api.js'

function Where() { const l = useLocation(); return <><div data-testid="where">{l.pathname}</div><div data-testid="notice">{l.state?.notice || ''}</div></> }
function renderPage({ entries = ['/settings', '/settings/dados'], index = 1 } = {}) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <Where />
      <Routes>
        <Route path="/settings/dados" element={<SettingsData />} />
        <Route path="*" element={<div>outra tela</div>} />
      </Routes>
    </MemoryRouter>
  )
}

let clicks
beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear()
  authAPI.exportData.mockResolvedValue({ data: new Blob(['x']) })
  URL.createObjectURL = vi.fn(() => 'blob:fake'); URL.revokeObjectURL = vi.fn()
  clicks = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { clicks.push({ href: this.href, download: this.download }) })
})
afterEach(() => { vi.restoreAllMocks() })

describe('Meus dados — exportar', () => {
  it('mostra os dois formatos e o JSON completo num link à parte', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Meus dados' })).toBeInTheDocument()
    expect(screen.getByText('Exportar ou excluir')).toBeInTheDocument()
    expect(screen.getByText('Todas as suas transações, metas e contas')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'CSV' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'PDF' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /JSON/ })).toBeInTheDocument()
  })

  it.each([['CSV', 'csv'], ['PDF', 'pdf']])('%s pede o formato certo ao servidor e baixa o arquivo com a extensão certa', async (label, format) => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: label }))
    await waitFor(() => expect(clicks).toHaveLength(1))
    expect(authAPI.exportData).toHaveBeenCalledWith(format)
    expect(clicks[0].download).toMatch(new RegExp(`^nancy-dados-\\d{4}-\\d{2}-\\d{2}\\.${format}$`))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake')
  })

  it('o link de JSON baixa a cópia completa em .json', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /JSON/ }))
    await waitFor(() => expect(clicks).toHaveLength(1))
    expect(authAPI.exportData).toHaveBeenCalledWith('json')
    expect(clicks[0].download).toMatch(/\.json$/)
  })

  it('enquanto gera, os botões ficam desligados, mostram "Gerando…" e um segundo toque não pede de novo', async () => {
    let done
    authAPI.exportData.mockReturnValue(new Promise(r => { done = r }))
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }))
    expect(await screen.findByRole('button', { name: 'Gerando…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'CSV' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'CSV' }))
    expect(authAPI.exportData).toHaveBeenCalledTimes(1)
    done({ data: new Blob(['x']) })
    await waitFor(() => expect(screen.getByRole('button', { name: 'CSV' })).toBeEnabled())
  })

  it('erro ao exportar avisa; limite de exportações (429) explica o prazo', async () => {
    authAPI.exportData.mockRejectedValueOnce(new Error('boom'))
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'CSV' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Erro ao exportar dados.')
    expect(clicks).toHaveLength(0)
    authAPI.exportData.mockRejectedValueOnce({ response: { status: 429 } })
    fireEvent.click(screen.getByRole('button', { name: 'CSV' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Limite de exportações atingido'))
  })
})

describe('Meus dados — excluir conta', () => {
  const openModal = () => fireEvent.click(screen.getByRole('button', { name: 'Excluir minha conta' }))

  it('abre a confirmação; o botão só liga com a senha digitada; Cancelar fecha sem excluir', () => {
    renderPage()
    openModal()
    expect(screen.getByText('Excluir conta permanentemente')).toBeInTheDocument()
    const confirm = screen.getByRole('button', { name: 'Excluir conta' })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText('Digite sua senha atual'), { target: { value: 'Senha123' } })
    expect(confirm).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByText('Excluir conta permanentemente')).not.toBeInTheDocument()
    expect(authAPI.deleteAccount).not.toHaveBeenCalled()
  })

  it('Esc fecha a confirmação sem excluir a conta', () => {
    renderPage()
    openModal()
    expect(screen.getByText('Excluir conta permanentemente')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('Excluir conta permanentemente')).not.toBeInTheDocument()
    expect(authAPI.deleteAccount).not.toHaveBeenCalled()
  })

  it('confirmando: manda a senha, limpa a sessão e vai pro login', async () => {
    authAPI.deleteAccount.mockResolvedValue({})
    sessionStorage.setItem('user', '{"id":"u1"}'); sessionStorage.setItem('token', 't')
    renderPage()
    openModal()
    fireEvent.change(screen.getByPlaceholderText('Digite sua senha atual'), { target: { value: 'Senha123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Excluir conta' }))
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/login'))
    expect(authAPI.deleteAccount).toHaveBeenCalledWith('Senha123')
    expect(sessionStorage.getItem('user')).toBeNull()
    expect(sessionStorage.getItem('token')).toBeNull()
  })

  // Achado N2-10: depois de excluir não havia nenhum sinal de que a conta tinha sido apagada (só caía no login).
  it('depois de excluir, leva um aviso de "Conta excluída" para a tela de login', async () => {
    authAPI.deleteAccount.mockResolvedValue({})
    renderPage()
    openModal()
    fireEvent.change(screen.getByPlaceholderText('Digite sua senha atual'), { target: { value: 'Senha123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Excluir conta' }))
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/login'))
    expect(screen.getByTestId('notice')).toHaveTextContent('Conta excluída. Seus dados foram apagados.')
  })

  it('a confirmação é um diálogo (leitor de tela) e o campo de senha é reconhecido pelo gerenciador de senhas', () => {
    renderPage()
    openModal()
    const dialog = screen.getByRole('dialog', { name: 'Excluir conta permanentemente' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByPlaceholderText('Digite sua senha atual')).toHaveAttribute('autocomplete', 'current-password')
  })

  it('senha errada: mostra o erro do servidor, continua na tela e na sessão', async () => {
    authAPI.deleteAccount.mockRejectedValue({ response: { data: { error: 'Senha incorreta.' } } })
    sessionStorage.setItem('user', '{"id":"u1"}')
    renderPage()
    openModal()
    fireEvent.change(screen.getByPlaceholderText('Digite sua senha atual'), { target: { value: 'errada' } })
    fireEvent.click(screen.getByRole('button', { name: 'Excluir conta' }))
    expect(await screen.findByText('Senha incorreta.')).toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent('/settings/dados')
    expect(sessionStorage.getItem('user')).not.toBeNull()
  })
})

describe('Meus dados — navegação', () => {
  it('voltar retorna à tela anterior; aberta direto pela URL vai pro Perfil', async () => {
    const first = renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/settings')
    first.unmount()
    renderPage({ entries: ['/settings/dados'], index: 0 })
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/settings')
  })
})
