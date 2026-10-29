import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Login from '../pages/Login.jsx'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async (importActual) => {
  const actual = await importActual()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../services/api.js', () => ({
  authAPI: {
    login:              vi.fn(),
    register:           vi.fn(),
    twoFAVerifyLogin:   vi.fn(),
    twoFAUseBackupCode: vi.fn(),
  },
}))

vi.mock('../services/analytics.js', () => ({
  analytics: { identify: vi.fn(), track: vi.fn() },
}))

import { authAPI } from '../services/api.js'

function setup(props = {}, initialEntries = ['/login']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Login {...props} />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
})

// ── Login ────────────────────────────────────────────────────────────────────

describe('Login — modo entrar', () => {
  it('mostra o aviso que veio de outra tela (ex: "Conta excluída") uma vez e limpa o state do histórico', () => {
    setup({}, [{ pathname: '/login', state: { notice: 'Conta excluída. Seus dados foram apagados.' } }])
    expect(screen.getByRole('status')).toHaveTextContent('Conta excluída. Seus dados foram apagados.')
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true, state: null }) // não volta ao recarregar
  })

  it('sem aviso, nada extra aparece nem mexe no histórico', () => {
    setup()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('renderiza os campos e-mail e senha', () => {
    setup()
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument()
    expect(screen.getByLabelText('Senha')).toBeInTheDocument()
  })

  it('mostra erro de e-mail inválido', async () => {
    setup()
    await userEvent.type(screen.getByLabelText('E-mail'), 'invalido')
    await userEvent.type(screen.getByLabelText('Senha'), 'Senha123')
    await userEvent.click(screen.getByRole('button', { name: /^entrar$/i }))
    expect(await screen.findByText('E-mail inválido')).toBeInTheDocument()
  })

  it('mostra erro de senha muito curta', async () => {
    setup()
    await userEvent.type(screen.getByLabelText('E-mail'), 'user@test.com')
    await userEvent.type(screen.getByLabelText('Senha'), '123')
    await userEvent.click(screen.getByRole('button', { name: /^entrar$/i }))
    expect(await screen.findByText('Mínimo 8 caracteres')).toBeInTheDocument()
  })

  it('navega para /dashboard após login bem-sucedido', async () => {
    authAPI.login.mockResolvedValue({
      data: { user: { id: '1', plan: 'free' } },
    })
    setup()
    await userEvent.type(screen.getByLabelText('E-mail'), 'user@test.com')
    await userEvent.type(screen.getByLabelText('Senha'), 'Senha12345')
    await userEvent.click(screen.getByRole('button', { name: /^entrar$/i }))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/dashboard'))
    expect(sessionStorage.getItem('token')).toBeNull()
  })

  it('após login, volta para a rota protegida original (state.from) em vez do /dashboard genérico', async () => {
    authAPI.login.mockResolvedValue({
      data: { user: { id: '1', plan: 'free' } },
    })
    setup({}, [{ pathname: '/login', state: { from: { pathname: '/settings/pagamentos', search: '?plano=pro' } } }])
    await userEvent.type(screen.getByLabelText('E-mail'), 'user@test.com')
    await userEvent.type(screen.getByLabelText('Senha'), 'Senha12345')
    await userEvent.click(screen.getByRole('button', { name: /^entrar$/i }))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/settings/pagamentos?plano=pro'))
  })

  it('exibe erro do servidor quando login falha', async () => {
    authAPI.login.mockRejectedValue({ response: { data: { error: 'Credenciais inválidas' } } })
    setup()
    await userEvent.type(screen.getByLabelText('E-mail'), 'user@test.com')
    await userEvent.type(screen.getByLabelText('Senha'), 'Senha12345')
    await userEvent.click(screen.getByRole('button', { name: /^entrar$/i }))
    expect(await screen.findByText('Credenciais inválidas')).toBeInTheDocument()
  })

  it('ativa modo 2FA quando servidor retorna requires2FA', async () => {
    authAPI.login.mockResolvedValue({
      data: { requires2FA: true, tempToken: 'tmp_tok' },
    })
    setup()
    await userEvent.type(screen.getByLabelText('E-mail'), 'user@test.com')
    await userEvent.type(screen.getByLabelText('Senha'), 'Senha12345')
    await userEvent.click(screen.getByRole('button', { name: /^entrar$/i }))
    expect(await screen.findByText('Verificação em dois fatores')).toBeInTheDocument()
  })
})

// ── 2FA ──────────────────────────────────────────────────────────────────────

describe('Login — 2FA', () => {
  async function enter2FAMode() {
    authAPI.login.mockResolvedValue({ data: { requires2FA: true, tempToken: 'tmp' } })
    setup()
    await userEvent.type(screen.getByLabelText('E-mail'), 'user@test.com')
    await userEvent.type(screen.getByLabelText('Senha'), 'Senha12345')
    await userEvent.click(screen.getByRole('button', { name: /^entrar$/i }))
    await screen.findByText('Verificação em dois fatores')
  }

  it('mostra erro ao submeter código com menos de 6 dígitos', async () => {
    await enter2FAMode()
    await userEvent.type(screen.getByPlaceholderText('000 000'), '123')
    await userEvent.click(screen.getByRole('button', { name: /verificar/i }))
    expect(await screen.findByText('Digite os 6 dígitos do seu aplicativo.')).toBeInTheDocument()
  })

  it('navega para /dashboard após 2FA bem-sucedido', async () => {
    await enter2FAMode()
    authAPI.twoFAVerifyLogin.mockResolvedValue({
      data: { user: { id: '1', plan: 'free' } },
    })
    await userEvent.type(screen.getByPlaceholderText('000 000'), '123456')
    await userEvent.click(screen.getByRole('button', { name: /verificar/i }))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/dashboard'))
  })

  it('exibe tela de código de recuperação ao clicar no link de backup', async () => {
    await enter2FAMode()
    await userEvent.click(screen.getByText(/não tenho acesso ao app/i))
    expect(screen.getByText('Código de recuperação')).toBeInTheDocument()
  })
})

// ── Cadastro ─────────────────────────────────────────────────────────────────

describe('Login — modo cadastro', () => {
  it('renderiza campos nome, e-mail e senha', () => {
    setup({ isRegister: true })
    expect(screen.getByLabelText('Nome')).toBeInTheDocument()
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument()
    expect(screen.getByLabelText('Senha')).toBeInTheDocument()
  })

  it('mostra erro se nome estiver vazio', async () => {
    setup({ isRegister: true })
    await userEvent.click(screen.getByRole('button', { name: /^criar conta$/i }))
    expect(await screen.findByText('Nome obrigatório')).toBeInTheDocument()
  })

  it('mostra erro se senha não atender ao padrão PASSWORD_RE', async () => {
    setup({ isRegister: true })
    await userEvent.type(screen.getByLabelText('Nome'), 'André')
    await userEvent.type(screen.getByLabelText('E-mail'), 'andre@test.com')
    await userEvent.type(screen.getByLabelText('Senha'), 'senhafraca')
    await userEvent.click(screen.getByRole('button', { name: /^criar conta$/i }))
    expect(await screen.findByText(/mínimo 8 caracteres/i)).toBeInTheDocument()
  })

  it('mostra erro se termos não forem aceitos', async () => {
    setup({ isRegister: true })
    await userEvent.type(screen.getByLabelText('Nome'), 'André')
    await userEvent.type(screen.getByLabelText('E-mail'), 'andre@test.com')
    await userEvent.type(screen.getByLabelText('Senha'), 'Senha12345')
    await userEvent.click(screen.getByRole('button', { name: /^criar conta$/i }))
    expect(await screen.findByText(/aceitar os termos/i)).toBeInTheDocument()
  })

  it('navega para /dashboard após cadastro bem-sucedido', async () => {
    authAPI.register.mockResolvedValue({
      data: { user: { id: '2', plan: 'free' } },
    })
    setup({ isRegister: true })
    await userEvent.type(screen.getByLabelText('Nome'), 'André')
    await userEvent.type(screen.getByLabelText('E-mail'), 'andre@test.com')
    await userEvent.type(screen.getByLabelText('Senha'), 'Senha12345')
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: /^criar conta$/i }))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/dashboard'))
  })
})
