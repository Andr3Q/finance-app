import { render, screen, waitFor, fireEvent } from '@testing-library/react'
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
vi.mock('../hooks/useUser.js', () => ({ saveUser: vi.fn(), useUser: () => mockUser }))
import { authAPI } from '../services/api.js'

const setDesktop = (is) => { window.matchMedia = vi.fn(() => ({ matches: is, addEventListener() {}, removeEventListener() {} })) }
const setup = (query = '') => render(<MemoryRouter initialEntries={[`/verify-email${query}`]}><VerifyEmail /></MemoryRouter>)
const codeInput = () => screen.getByLabelText('Código de 6 dígitos')

beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); mockUser = { id: 'u1', email: 'ana@test.com' }; setDesktop(true) })
afterEach(() => { delete window.matchMedia })

describe('Confirme seu e-mail no desktop (design "Nancy Desktop", tela 06)', () => {
  it('layout do desktop: painel azul sem cartões, título, texto com o e-mail da conta e o campo do código', () => {
    const { container } = setup()
    expect(container.querySelector('.ad-split')).toBeInTheDocument()
    expect(container.querySelector('.ad-hero')).toHaveClass('ad-hero--form')
    expect(container.querySelector('.ad-cards')).not.toBeInTheDocument()
    expect(container.querySelector('.lw-page')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Confirme seu e-mail' })).toBeInTheDocument()
    expect(screen.getByText('Digite o código de 6 dígitos enviado para ana@test.com.')).toBeInTheDocument()
    expect(codeInput()).toHaveAttribute('placeholder', '000000')
    expect(codeInput()).toHaveAttribute('autocomplete', 'one-time-code')
    expect(codeInput()).toHaveAttribute('inputmode', 'numeric')
    expect(screen.getByRole('button', { name: 'Confirmar e-mail' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Reenviar código' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar' })).toHaveAttribute('href', '/')
  })

  it('sem e-mail conhecido o texto diz "seu e-mail" (como no design)', () => {
    mockUser = { id: 'u1' }
    setup()
    expect(screen.getByText('Digite o código de 6 dígitos enviado para seu e-mail.')).toBeInTheDocument()
  })

  it('o campo só aceita dígitos, até 6', async () => {
    setup()
    await userEvent.type(codeInput(), '12ab34-5678')
    expect(codeInput()).toHaveValue('123456')
  })

  it('código incompleto pede os 6 dígitos e NÃO chama o servidor; digitar limpa o aviso', async () => {
    setup()
    await userEvent.type(codeInput(), '123')
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar e-mail' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Digite os 6 dígitos do código.')
    expect(authAPI.verifyEmailCode).not.toHaveBeenCalled()
    await userEvent.type(codeInput(), '4')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('código certo confirma e mostra "E-mail confirmado!" com o botão para o app', async () => {
    authAPI.verifyEmailCode.mockResolvedValue({})
    setup()
    await userEvent.type(codeInput(), '123456')
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar e-mail' }))
    await waitFor(() => expect(authAPI.verifyEmailCode).toHaveBeenCalledWith('123456'))
    expect(await screen.findByRole('status')).toHaveTextContent('E-mail confirmado! Sua conta está totalmente ativada. Aproveite o Nancy!')
    await userEvent.click(screen.getByRole('button', { name: 'Ir para o Dashboard' }))
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
  })

  it('código errado mostra a mensagem do servidor e o campo continua', async () => {
    authAPI.verifyEmailCode.mockRejectedValue({ response: { data: { error: 'Código inválido.' } } })
    setup()
    await userEvent.type(codeInput(), '000000')
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar e-mail' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Código inválido.')
    expect(codeInput()).toHaveValue('000000')
  })

  it('"Reenviar código" pede um novo ao servidor e avisa; se falhar, mostra o erro', async () => {
    authAPI.resendVerification.mockResolvedValueOnce({}).mockRejectedValueOnce({ response: { data: { error: 'Aguarde um minuto.' } } })
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Reenviar código' }))
    expect(await screen.findByText('Novo código enviado.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reenviar código' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Aguarde um minuto.')
  })

  it('enquanto envia, o botão fica desabilitado', async () => {
    authAPI.verifyEmailCode.mockReturnValue(new Promise(() => {}))
    const { container } = setup()
    await userEvent.type(codeInput(), '123456')
    fireEvent.submit(container.querySelector('form'))
    await waitFor(() => expect(container.querySelector('.ad-btn-primary')).toBeDisabled())
  })

  it('pelo link do e-mail (?token=): carregando → confirmado; link inválido mostra o erro e o caminho', async () => {
    authAPI.verifyEmail.mockResolvedValueOnce({})
    const first = setup('?token=abc')
    expect(screen.getByRole('status')).toHaveTextContent('Confirmando seu e-mail...')
    expect(await screen.findByText(/E-mail confirmado!/)).toBeInTheDocument()
    first.unmount()
    authAPI.verifyEmail.mockRejectedValueOnce({ response: { data: { error: 'Link inválido ou expirado.' } } })
    setup('?token=ruim')
    expect(await screen.findByRole('alert')).toHaveTextContent('Link inválido. Link inválido ou expirado.')
    await userEvent.click(screen.getByRole('button', { name: 'Reenviar verificação em Configurações' }))
    expect(mockNavigate).toHaveBeenCalledWith('/settings')
  })

  it('no celular continua a tela do celular', () => {
    setDesktop(false)
    const { container } = setup()
    expect(container.querySelector('.lw-page')).toBeInTheDocument()
    expect(container.querySelector('.ad-split')).not.toBeInTheDocument()
  })
})
