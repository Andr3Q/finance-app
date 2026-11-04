import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import SettingsProfile from '../pages/SettingsProfile.jsx'

vi.mock('../services/api.js', () => ({
  authAPI: { updateProfile: vi.fn(), changeEmail: vi.fn(), resendVerification: vi.fn(), updateAvatar: vi.fn(), removeAvatar: vi.fn() },
}))
vi.mock('../utils/avatarImage.js', async (orig) => ({ ...(await orig()), resizeToAvatar: vi.fn() }))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))
import { authAPI } from '../services/api.js'
import { resizeToAvatar } from '../utils/avatarImage.js'

const setDesktop = (is) => { window.matchMedia = vi.fn(() => ({ matches: is, addEventListener() {}, removeEventListener() {} })) }
function setup(user = {}) {
  const u = { id: 'u-prof', name: 'André Pereira', email: 'andre@nancy.app', plan: 'elite', emailVerified: true, ...user }
  sessionStorage.setItem('user', JSON.stringify(u))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: u }))
  return render(<MemoryRouter initialEntries={['/settings/perfil']}><Routes><Route path="/settings/perfil" element={<SettingsProfile />} /></Routes></MemoryRouter>)
}
const stored = () => JSON.parse(sessionStorage.getItem('user'))

beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); setDesktop(true) })
afterEach(() => { delete window.matchMedia })

describe('Dados pessoais no desktop (design "Nancy Desktop", tela 26)', () => {
  it('menu da conta (Dados pessoais aceso), foto com as iniciais, nome e e-mail lado a lado, selo e "Salvar alterações"', () => {
    setup()
    expect(within(screen.getByRole('navigation', { name: 'Conta' })).getByRole('button', { name: 'Dados pessoais' })).toHaveAttribute('aria-current', 'page')
    expect(document.querySelector('.nsp-av')).toHaveTextContent('AP')
    expect(screen.getByLabelText('Nome')).toHaveValue('André Pereira')
    expect(screen.getByLabelText('E-mail')).toHaveValue('andre@nancy.app')
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('readonly')
    expect(screen.getByText('E-mail verificado')).toHaveClass('ok')
    expect(screen.getByRole('button', { name: 'Alterar foto' })).toBeInTheDocument()
    expect(document.querySelector('.fin-hero')).toBeNull()
  })

  it('salvar o nome chama a API, atualiza a sessão e avisa; nome curto não salva', async () => {
    authAPI.updateProfile.mockResolvedValue({})
    setup()
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'A' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Nome deve ter entre 2 e 100 caracteres.')
    expect(authAPI.updateProfile).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'André P.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(authAPI.updateProfile).toHaveBeenCalledWith({ name: 'André P.' }))
    expect(await screen.findByText('Perfil atualizado!')).toBeInTheDocument()
    expect(stored().name).toBe('André P.')
  })

  it('trocar a foto redimensiona, envia e guarda a versão; com foto aparece "Remover"', async () => {
    resizeToAvatar.mockResolvedValue('data:image/jpeg;base64,/9j/4AAQ')
    authAPI.updateAvatar.mockResolvedValue({ data: { avatarUpdatedAt: '2026-10-22T15:00:00.000Z' } })
    setup()
    fireEvent.change(screen.getByLabelText('Escolher foto de perfil'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } })
    await waitFor(() => expect(authAPI.updateAvatar).toHaveBeenCalledWith('data:image/jpeg;base64,/9j/4AAQ'))
    expect(await screen.findByText('Foto atualizada!')).toBeInTheDocument()
    expect(stored().avatarUpdatedAt).toBe('2026-10-22T15:00:00.000Z')
    expect(screen.getByRole('button', { name: 'Remover' })).toBeInTheDocument()
  })

  it('e-mail não verificado: aviso e "Reenviar e-mail"', async () => {
    authAPI.resendVerification.mockResolvedValue({})
    setup({ emailVerified: false })
    expect(screen.getByText('E-mail não verificado')).toHaveClass('warn')
    fireEvent.click(screen.getByRole('button', { name: 'Reenviar e-mail' }))
    expect(await screen.findByText(/E-mail de verificação enviado/)).toBeInTheDocument()
  })

  it('trocar e-mail: o formulário abre com senha e manda o pedido (o link vai ao endereço novo)', async () => {
    authAPI.changeEmail.mockResolvedValue({})
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Trocar e-mail' }))
    fireEvent.change(screen.getByPlaceholderText('novo@email.com'), { target: { value: 'novo@email.com' } })
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'Senha123!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar link de confirmação' }))
    await waitFor(() => expect(authAPI.changeEmail).toHaveBeenCalledWith('novo@email.com', 'Senha123!'))
    expect(await screen.findByText(/Enviamos um link de confirmação para novo@email.com/)).toBeInTheDocument()
    expect(stored().pendingEmail).toBe('novo@email.com')
  })

  it('troca pendente aparece como nota', () => {
    setup({ pendingEmail: 'novo@email.com' })
    expect(screen.getByText(/Troca pendente para/)).toHaveTextContent('novo@email.com')
  })
})

describe('Dados pessoais — celular continua o mesmo', () => {
  it('abaixo de 901px: cabeçalho azul e formulário do celular', () => {
    setDesktop(false)
    setup()
    expect(screen.getByRole('heading', { name: 'Perfil' })).toBeInTheDocument()
    expect(document.querySelector('.dp-card')).not.toBeNull()
    expect(document.querySelector('.nsp-card')).toBeNull()
  })
})
