import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import SettingsData from '../pages/SettingsData.jsx'

vi.mock('../services/api.js', () => ({ authAPI: { exportData: vi.fn(), deleteAccount: vi.fn() } }))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))
import { authAPI } from '../services/api.js'

const setDesktop = (is) => { window.matchMedia = vi.fn(() => ({ matches: is, addEventListener() {}, removeEventListener() {} })) }
function Where() { const l = useLocation(); return <><div data-testid="where">{l.pathname}</div><div data-testid="notice">{l.state?.notice || ''}</div></> }
function setup(plan = 'elite') {
  const u = { id: 'u-dd', name: 'Ana', plan }
  sessionStorage.setItem('user', JSON.stringify(u))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: u }))
  return render(
    <MemoryRouter initialEntries={['/settings/dados']}>
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
  vi.clearAllMocks(); sessionStorage.clear(); setDesktop(true)
  authAPI.exportData.mockResolvedValue({ data: new Blob(['x']) })
  authAPI.deleteAccount.mockResolvedValue({ data: {} })
  URL.createObjectURL = vi.fn(() => 'blob:fake'); URL.revokeObjectURL = vi.fn()
  clicks = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { clicks.push({ download: this.download }) })
})
afterEach(() => { vi.restoreAllMocks(); delete window.matchMedia })

describe('Meus dados no desktop (design "Nancy Desktop", tela 33)', () => {
  it('menu da conta (Meus dados aceso) e os dois cartões: Exportar (CSV, PDF) e Excluir conta', () => {
    setup()
    expect(within(screen.getByRole('navigation', { name: 'Conta' })).getByRole('button', { name: 'Meus dados' })).toHaveAttribute('aria-current', 'page')
    const exp = screen.getByLabelText('Exportar meus dados')
    expect(within(exp).getByText('Todas as suas transações, metas e contas')).toBeInTheDocument()
    expect(within(exp).getByRole('button', { name: 'CSV' })).toBeInTheDocument()
    expect(within(exp).getByRole('button', { name: 'PDF' })).toBeInTheDocument()
    const del = screen.getByLabelText('Excluir conta')
    expect(within(del).getByText('Apaga tudo de forma permanente')).toBeInTheDocument()
    expect(within(del).getByRole('button', { name: 'Excluir minha conta' })).toBeInTheDocument()
    expect(document.querySelector('.fin-hero')).toBeNull()
    expect(screen.getAllByRole('button', { name: 'CSV' })).toHaveLength(1)
  })

  it.each([['CSV', 'csv'], ['PDF', 'pdf'], [/JSON/, 'json']])('%s baixa o arquivo no formato certo', async (label, format) => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: label }))
    await waitFor(() => expect(clicks).toHaveLength(1))
    expect(authAPI.exportData).toHaveBeenCalledWith(format)
    expect(clicks[0].download).toMatch(new RegExp(`\\.${format}$`))
  })

  it('excluir pede a senha no aviso e só então apaga a conta e vai ao login com o aviso', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Excluir minha conta' }))
    const dlg = screen.getByRole('dialog')
    expect(within(dlg).getByRole('button', { name: /Excluir conta/ })).toBeDisabled()
    expect(dlg).toHaveTextContent('Plano cancelado — sem reembolso')
    await userEvent.type(within(dlg).getByPlaceholderText('Digite sua senha atual'), 'segredo123')
    await userEvent.click(within(dlg).getByRole('button', { name: /Excluir conta/ }))
    await waitFor(() => expect(authAPI.deleteAccount).toHaveBeenCalledWith('segredo123'))
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/login'))
    expect(screen.getByTestId('notice')).toHaveTextContent('Conta excluída. Seus dados foram apagados.')
  })

  it('Cancelar no aviso fecha sem apagar nada', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Excluir minha conta' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(authAPI.deleteAccount).not.toHaveBeenCalled()
  })
})

describe('Meus dados — celular continua o mesmo', () => {
  it('no celular segue o cabeçalho com Voltar, sem o menu da conta', () => {
    setDesktop(false)
    setup()
    expect(screen.queryByRole('navigation', { name: 'Conta' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument()
    expect(document.querySelector('.ndd-grid')).toBeNull()
  })
})
