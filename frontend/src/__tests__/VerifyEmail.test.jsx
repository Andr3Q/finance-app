import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import VerifyEmail from '../pages/VerifyEmail.jsx'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importActual) => {
  const actual = await importActual()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../services/api.js', () => ({
  authAPI: { verifyEmail: vi.fn(), verifyEmailCode: vi.fn(), resendVerification: vi.fn() },
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

// Tela "Confirme seu e-mail" (Nancy 2): sem token na URL não é mais erro
// automático — é a entrada do fluxo por código de 6 dígitos (chegou aqui
// direto, ex. logo após se cadastrar), que exige sessão ativa pra saber de
// qual conta é o código.
describe('VerifyEmail — sem token na URL', () => {
  it('sem sessão ativa, redireciona pro login sem chamar nenhuma API de verificação', async () => {
    setup('')
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/login'))
    expect(authAPI.verifyEmail).not.toHaveBeenCalled()
    expect(authAPI.verifyEmailCode).not.toHaveBeenCalled()
  })

  it('com sessão ativa, mostra o formulário de código em vez de redirecionar', async () => {
    mockUser = { id: 'u1' }
    setup('')
    expect(await screen.findByText('Confirme seu e-mail')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar e-mail' })).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  // Achado N2-1: sem autocomplete, o celular não sugeria o código que acabou de chegar por e-mail/SMS.
  it('o campo do código aceita o preenchimento automático do celular (one-time-code)', async () => {
    mockUser = { id: 'u1' }
    setup('')
    const campo = await screen.findByPlaceholderText('000000')
    expect(campo).toHaveAttribute('autocomplete', 'one-time-code')
    expect(campo).toHaveAttribute('inputmode', 'numeric')
  })
})

describe('VerifyEmail — verificação por código', () => {
  beforeEach(() => { mockUser = { id: 'u1' } })

  it('código correto: chama a API e mostra "E-mail confirmado!"', async () => {
    authAPI.verifyEmailCode.mockResolvedValue({ data: { ok: true } })
    setup('')

    await userEvent.type(screen.getByPlaceholderText('000000'), '123456')
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar e-mail' }))

    expect(authAPI.verifyEmailCode).toHaveBeenCalledWith('123456')
    expect(await screen.findByText('E-mail confirmado!')).toBeInTheDocument()
  })

  it('código incorreto: mostra o erro do servidor e continua no formulário', async () => {
    authAPI.verifyEmailCode.mockRejectedValue({ response: { data: { error: 'Código incorreto.' } } })
    setup('')

    await userEvent.type(screen.getByPlaceholderText('000000'), '999999')
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar e-mail' }))

    expect(await screen.findByText('Código incorreto.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar e-mail' })).toBeInTheDocument()
  })

  it('reenviar código: chama resendVerification e mostra confirmação', async () => {
    authAPI.resendVerification.mockResolvedValue({ data: { ok: true } })
    setup('')

    await userEvent.click(screen.getByRole('button', { name: 'Reenviar código' }))

    expect(authAPI.resendVerification).toHaveBeenCalled()
    expect(await screen.findByText('Novo código enviado.')).toBeInTheDocument()
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
