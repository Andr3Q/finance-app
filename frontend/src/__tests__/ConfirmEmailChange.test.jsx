import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ConfirmEmailChange from '../pages/ConfirmEmailChange.jsx'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importActual) => {
  const actual = await importActual()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../services/api.js', () => ({
  authAPI: { confirmEmailChange: vi.fn() },
}))

let mockUser = {}
vi.mock('../hooks/useUser.js', () => ({
  useUser: () => mockUser,
}))

import { authAPI } from '../services/api.js'

function setup(query = '?token=abc123') {
  return render(
    <MemoryRouter initialEntries={[`/confirmar-troca-email${query}`]}>
      <ConfirmEmailChange />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUser = {}
  sessionStorage.clear()
})

describe('ConfirmEmailChange — sem token', () => {
  it('mostra erro sem chamar a API', async () => {
    setup('')
    expect(await screen.findByText('Link inválido')).toBeInTheDocument()
    expect(authAPI.confirmEmailChange).not.toHaveBeenCalled()
  })
})

// Regressão: confirmar troca de e-mail sempre invalida a sessão (tokenVersion
// bump no backend) — mesmo que o navegador ainda tenha um usuário salvo, a
// tela precisa limpar esse estado morto e sempre mandar pro login, nunca pro
// dashboard (diferente de VerifyEmail.jsx, onde a sessão continua válida).
describe('ConfirmEmailChange — sucesso', () => {
  it('sempre pede novo login, mesmo se este navegador ainda tinha sessão salva, e limpa o sessionStorage', async () => {
    mockUser = { id: 'u1' }
    sessionStorage.setItem('user', JSON.stringify({ id: 'u1', email: 'antigo@example.com' }))
    authAPI.confirmEmailChange.mockResolvedValue({ data: { ok: true } })
    setup()

    const btn = await screen.findByRole('button', { name: 'Fazer login' })
    expect(sessionStorage.getItem('user')).toBeNull()

    btn.click()
    expect(mockNavigate).toHaveBeenCalledWith('/login')
  })
})

describe('ConfirmEmailChange — erro (token inválido/expirado)', () => {
  it('deslogado: botão diz "Fazer login" e preserva o destino', async () => {
    authAPI.confirmEmailChange.mockRejectedValue({ response: { data: { error: 'Link inválido ou expirado.' } } })
    setup()

    const btn = await screen.findByRole('button', { name: 'Fazer login' })
    btn.click()
    expect(mockNavigate).toHaveBeenCalledWith('/login', { state: { from: { pathname: '/settings/perfil' } } })
  })

  it('logado: nada foi alterado, então a sessão local continua válida — manda direto pra Configurações', async () => {
    mockUser = { id: 'u1' }
    authAPI.confirmEmailChange.mockRejectedValue({ response: { data: { error: 'Link inválido ou expirado.' } } })
    setup()

    const btn = await screen.findByRole('button', { name: 'Pedir nova troca em Configurações' })
    btn.click()
    expect(mockNavigate).toHaveBeenCalledWith('/settings/perfil')
  })
})
