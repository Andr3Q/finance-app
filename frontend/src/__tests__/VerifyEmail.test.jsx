import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import VerifyEmail from '../pages/VerifyEmail.jsx'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importActual) => {
  const actual = await importActual()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../services/api.js', () => ({
  authAPI: { verifyEmail: vi.fn() },
}))

let mockUser = {}
vi.mock('../hooks/useUser.js', () => ({
  saveUser: vi.fn(),
  useUser:  () => mockUser,
}))

import { authAPI } from '../services/api.js'

function setup(query = '?token=abc123') {
  return render(
    <MemoryRouter initialEntries={[`/verify-email${query}`]}>
      <VerifyEmail />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUser = {}
  sessionStorage.clear()
})

describe('VerifyEmail — link inválido', () => {
  it('sem token na URL, mostra erro sem chamar a API', async () => {
    setup('')
    expect(await screen.findByText('Link inválido')).toBeInTheDocument()
    expect(authAPI.verifyEmail).not.toHaveBeenCalled()
  })
})

// Regressão: /verify-email é pública — o link pode ser aberto sem sessão
// ativa neste navegador. Os botões não podem assumir "logado" só porque o
// e-mail acabou de ser confirmado, senão mandavam pra uma rota protegida
// sem aviso nenhum.
describe('VerifyEmail — sucesso, usuário NÃO logado neste navegador', () => {
  it('mostra "Fazer login" (não "Ir para o Dashboard") e preserva o destino', async () => {
    authAPI.verifyEmail.mockResolvedValue({ data: {} })
    setup()

    const btn = await screen.findByRole('button', { name: 'Fazer login' })
    expect(screen.queryByRole('button', { name: 'Ir para o Dashboard' })).not.toBeInTheDocument()

    btn.click()
    expect(mockNavigate).toHaveBeenCalledWith('/login', { state: { from: { pathname: '/dashboard' } } })
  })
})

describe('VerifyEmail — sucesso, usuário logado neste navegador', () => {
  it('mostra "Ir para o Dashboard" e navega direto, sem passar por /login', async () => {
    mockUser = { id: 'u1' }
    authAPI.verifyEmail.mockResolvedValue({ data: {} })
    setup()

    const btn = await screen.findByRole('button', { name: 'Ir para o Dashboard' })
    btn.click()
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
  })
})

describe('VerifyEmail — erro (token inválido/expirado)', () => {
  it('deslogado: botão diz "Fazer login" e preserva o destino (/settings)', async () => {
    authAPI.verifyEmail.mockRejectedValue({ response: { data: { error: 'Token expirado.' } } })
    setup()

    const btn = await screen.findByRole('button', { name: 'Fazer login' })
    btn.click()
    expect(mockNavigate).toHaveBeenCalledWith('/login', { state: { from: { pathname: '/settings' } } })
  })

  it('logado: botão continua mandando pra Configurações', async () => {
    mockUser = { id: 'u1' }
    authAPI.verifyEmail.mockRejectedValue({ response: { data: { error: 'Token expirado.' } } })
    setup()

    const btn = await screen.findByRole('button', { name: 'Reenviar verificação em Configurações' })
    btn.click()
    expect(mockNavigate).toHaveBeenCalledWith('/settings')
  })
})
