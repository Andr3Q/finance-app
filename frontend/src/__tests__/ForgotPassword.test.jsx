import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ForgotPassword from '../pages/ForgotPassword.jsx'

vi.mock('../services/api.js', () => ({ authAPI: { forgotPassword: vi.fn() } }))
import { authAPI } from '../services/api.js'

const setup = () => render(<MemoryRouter><ForgotPassword /></MemoryRouter>)
const send = () => userEvent.click(screen.getByRole('button', { name: /enviar/i }))

beforeEach(() => { vi.clearAllMocks(); authAPI.forgotPassword.mockResolvedValue({}) })

// Achado N2-1: o campo vazio ia até o servidor (que limita a 3 pedidos por hora) para só então dizer "E-mail inválido.".
describe('Esqueci a senha — valida no próprio app', () => {
  it('campo vazio pede o e-mail e NÃO chama o servidor', async () => {
    setup()
    await send()
    expect(screen.getByText('Informe o e-mail da sua conta.')).toBeInTheDocument()
    expect(authAPI.forgotPassword).not.toHaveBeenCalled()
  })

  it('só espaços também conta como vazio', async () => {
    setup()
    await userEvent.type(document.getElementById('f-email'), '   ')
    await send()
    expect(screen.getByText('Informe o e-mail da sua conta.')).toBeInTheDocument()
    expect(authAPI.forgotPassword).not.toHaveBeenCalled()
  })

  it.each(['abc', 'a@b', 'a b@c.com', '@c.com'])('e-mail inválido (%s) não chama o servidor', async (value) => {
    setup()
    await userEvent.type(document.getElementById('f-email'), value)
    await send()
    expect(screen.getByText('E-mail inválido.')).toBeInTheDocument()
    expect(authAPI.forgotPassword).not.toHaveBeenCalled()
  })

  it('e-mail válido (com espaços nas pontas) é enviado já sem os espaços e mostra "E-mail enviado!"', async () => {
    setup()
    await userEvent.type(document.getElementById('f-email'), '  ana@teste.com ')
    await send()
    expect(authAPI.forgotPassword).toHaveBeenCalledWith('ana@teste.com')
    expect(await screen.findByText('E-mail enviado!')).toBeInTheDocument()
  })

  it('erro do servidor (ex: limite de 3 por hora) aparece como está', async () => {
    authAPI.forgotPassword.mockRejectedValue({ response: { data: { error: 'Muitas tentativas de recuperação de senha. Tente novamente em 1 hora.' } } })
    setup()
    await userEvent.type(document.getElementById('f-email'), 'ana@teste.com')
    await send()
    expect(await screen.findByText(/Muitas tentativas de recuperação/)).toBeInTheDocument()
  })
})
