import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ForgotPassword from '../pages/ForgotPassword.jsx'

vi.mock('../services/api.js', () => ({ authAPI: { forgotPassword: vi.fn() } }))
import { authAPI } from '../services/api.js'

const setDesktop = (is) => { window.matchMedia = vi.fn(() => ({ matches: is, addEventListener() {}, removeEventListener() {} })) }
const setup = () => render(<MemoryRouter><ForgotPassword /></MemoryRouter>)

beforeEach(() => { vi.clearAllMocks(); authAPI.forgotPassword.mockResolvedValue({}); setDesktop(true) })
afterEach(() => { delete window.matchMedia })

describe('Esqueci a senha no desktop (design "Nancy Desktop", tela 05)', () => {
  it('layout do desktop: painel azul sem cartões, título, texto e campo do design; Voltar leva ao login', () => {
    const { container } = setup()
    expect(container.querySelector('.ad-split')).toBeInTheDocument()
    expect(container.querySelector('.ad-hero')).toHaveClass('ad-hero--form')
    expect(container.querySelector('.ad-cards')).not.toBeInTheDocument()
    expect(container.querySelector('.lw-page')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Esqueceu a senha?' })).toBeInTheDocument()
    expect(screen.getByText('Enviamos um link para você criar uma nova.')).toBeInTheDocument()
    expect(screen.getByLabelText('E-mail da conta')).toHaveAttribute('placeholder', 'voce@email.com')
    expect(screen.getByLabelText('E-mail da conta')).toHaveAttribute('autocomplete', 'email')
    expect(screen.getByRole('button', { name: 'Enviar link' })).toBeEnabled()
    expect(screen.getByRole('link', { name: 'Voltar' })).toHaveAttribute('href', '/login')
  })

  it('campo vazio, só espaços e e-mail inválido pedem correção e NÃO chamam o servidor (limita 3 por hora)', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Enviar link' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Informe o e-mail da sua conta.')
    await userEvent.type(screen.getByLabelText('E-mail da conta'), 'abc')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument() // digitar limpa o aviso
    await userEvent.click(screen.getByRole('button', { name: 'Enviar link' }))
    expect(screen.getByRole('alert')).toHaveTextContent('E-mail inválido.')
    expect(authAPI.forgotPassword).not.toHaveBeenCalled()
  })

  it('e-mail válido é enviado sem os espaços e mostra o aviso verde e "Voltar para entrar"', async () => {
    setup()
    await userEvent.type(screen.getByLabelText('E-mail da conta'), '  ana@test.com ')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar link' }))
    await waitFor(() => expect(authAPI.forgotPassword).toHaveBeenCalledWith('ana@test.com'))
    expect(await screen.findByRole('status')).toHaveTextContent('E-mail enviado! Confira a caixa de entrada e o spam. O link vale por 1 hora.')
    expect(screen.getByRole('link', { name: 'Voltar para entrar' })).toHaveAttribute('href', '/login')
    expect(screen.queryByLabelText('E-mail da conta')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Esqueceu a senha?' })).toBeInTheDocument() // o título continua
  })

  it('erro do servidor aparece como alerta e o campo continua', async () => {
    authAPI.forgotPassword.mockRejectedValue({ response: { data: { error: 'Muitas tentativas. Tente em 1 hora.' } } })
    setup()
    await userEvent.type(screen.getByLabelText('E-mail da conta'), 'ana@test.com')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar link' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Muitas tentativas. Tente em 1 hora.')
    expect(screen.getByLabelText('E-mail da conta')).toHaveValue('ana@test.com')
  })

  it('enquanto envia, o botão fica desabilitado', async () => {
    authAPI.forgotPassword.mockReturnValue(new Promise(() => {}))
    const { container } = setup()
    await userEvent.type(screen.getByLabelText('E-mail da conta'), 'ana@test.com')
    fireEvent.submit(container.querySelector('form'))
    await waitFor(() => expect(container.querySelector('.ad-btn-primary')).toBeDisabled())
  })

  it('no celular continua a tela do celular', () => {
    setDesktop(false)
    const { container } = setup()
    expect(container.querySelector('.lw-page')).toBeInTheDocument()
    expect(container.querySelector('.ad-split')).not.toBeInTheDocument()
  })
})
