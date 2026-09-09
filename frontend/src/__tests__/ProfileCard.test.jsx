import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProfileCard from '../components/features/settings/ProfileCard.jsx'

vi.mock('../services/api.js', () => ({
  authAPI: { updateProfile: vi.fn(), changeEmail: vi.fn() },
}))

vi.mock('../hooks/useUser.js', () => ({
  saveUser: vi.fn(),
}))

import { authAPI } from '../services/api.js'
import { saveUser } from '../hooks/useUser.js'

function mkUser(overrides = {}) {
  return { id: 'u1', name: 'Ana Silva', email: 'ana@example.com', ...overrides }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ProfileCard — nome', () => {
  it('salva só o nome, sem enviar email (regressão do campo que nunca salvava)', async () => {
    authAPI.updateProfile.mockResolvedValue({ data: { user: mkUser() } })
    render(<ProfileCard user={mkUser()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    expect(authAPI.updateProfile).toHaveBeenCalledWith({ name: 'Ana Silva' })
    expect(authAPI.updateProfile).not.toHaveBeenCalledWith(expect.objectContaining({ email: expect.anything() }))
    expect(await screen.findByText('Perfil atualizado!')).toBeInTheDocument()
  })
})

describe('ProfileCard — e-mail de login', () => {
  it('mostra o e-mail atual como campo desabilitado (só leitura)', () => {
    render(<ProfileCard user={mkUser({ email: 'ana@example.com' })} />)
    const input = screen.getByDisplayValue('ana@example.com')
    expect(input).toBeDisabled()
  })

  it('"Trocar e-mail" abre o formulário de novo e-mail + senha', async () => {
    render(<ProfileCard user={mkUser()} />)
    expect(screen.queryByPlaceholderText('novo@email.com')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Trocar e-mail' }))

    expect(screen.getByPlaceholderText('novo@email.com')).toBeInTheDocument()
  })

  it('envia changeEmail com o novo e-mail e a senha, mostra mensagem de sucesso e fecha o form', async () => {
    authAPI.changeEmail.mockResolvedValue({ data: { ok: true } })
    render(<ProfileCard user={mkUser()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Trocar e-mail' }))
    await userEvent.type(screen.getByPlaceholderText('novo@email.com'), 'novo@example.com')
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'MinhaSenh4a')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar link de confirmação' }))

    expect(authAPI.changeEmail).toHaveBeenCalledWith('novo@example.com', 'MinhaSenh4a')
    expect(await screen.findByText(/enviamos um link de confirmação para novo@example.com/i)).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('novo@email.com')).not.toBeInTheDocument() // form fechou
    expect(saveUser).toHaveBeenCalledWith(expect.objectContaining({ pendingEmail: 'novo@example.com' }))
  })

  it('senha incorreta mostra erro inline e mantém o formulário aberto', async () => {
    authAPI.changeEmail.mockRejectedValue({ response: { data: { error: 'Senha incorreta.' } } })
    render(<ProfileCard user={mkUser()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Trocar e-mail' }))
    await userEvent.type(screen.getByPlaceholderText('novo@email.com'), 'novo@example.com')
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'SenhaErrada1')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar link de confirmação' }))

    expect(await screen.findByText('Senha incorreta.')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('novo@email.com')).toBeInTheDocument() // form continua aberto
  })

  it('mostra aviso de troca pendente quando user.pendingEmail está setado', () => {
    render(<ProfileCard user={mkUser({ pendingEmail: 'pendente@example.com' })} />)
    expect(screen.getByText(/troca pendente para/i)).toBeInTheDocument()
    expect(screen.getByText('pendente@example.com')).toBeInTheDocument()
  })
})
