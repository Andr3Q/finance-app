import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Login from '../pages/Login.jsx'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importActual) => {
  const actual = await importActual()
  return { ...actual, useNavigate: () => mockNavigate }
})
vi.mock('../services/api.js', () => ({
  authAPI: { login: vi.fn(), register: vi.fn(), twoFAVerifyLogin: vi.fn(), twoFAUseBackupCode: vi.fn() },
}))
vi.mock('../services/analytics.js', () => ({ analytics: { identify: vi.fn(), track: vi.fn() } }))
import { authAPI } from '../services/api.js'
import { analytics } from '../services/analytics.js'

const setDesktop = (is) => { window.matchMedia = vi.fn(() => ({ matches: is, addEventListener() {}, removeEventListener() {} })) }
const setup = () => render(<MemoryRouter initialEntries={['/register']}><Login isRegister /></MemoryRouter>)
const user = { id: 'u1', name: 'Ana', plan: 'pro' }
const fill = async (name, email, pass) => {
  if (name) await userEvent.type(screen.getByLabelText('Nome'), name)
  if (email) await userEvent.type(screen.getByLabelText('E-mail'), email)
  if (pass) await userEvent.type(screen.getByLabelText('Senha'), pass)
}

beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); setDesktop(true) })
afterEach(() => { delete window.matchMedia; document.getElementById('app-splash')?.remove() })

describe('Criar conta no desktop (design "Nancy Desktop", tela 04)', () => {
  it('layout do desktop: painel azul sem cartões e o formulário do design', () => {
    const { container } = setup()
    expect(container.querySelector('.ad-split')).toBeInTheDocument()
    expect(container.querySelector('.ad-hero')).toHaveClass('ad-hero--form')
    expect(container.querySelector('.ad-cards')).not.toBeInTheDocument()
    expect(container.querySelector('.lw-page')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('heading', { level: 2, name: 'Crie sua conta' })).toBeInTheDocument()
    expect(screen.getByText('Grátis para sempre. Leva menos de 1 minuto.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nome')).toHaveAttribute('placeholder', 'Como quer ser chamado?')
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('placeholder', 'voce@email.com')
    expect(screen.getByLabelText('Senha')).toHaveAttribute('placeholder', 'Mínimo 8 caracteres')
    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'password')
    // o navegador oferece gerar uma senha forte (senha NOVA) e preenche nome e e-mail
    expect(screen.getByLabelText('Senha')).toHaveAttribute('autocomplete', 'new-password')
    expect(screen.getByLabelText('Nome')).toHaveAttribute('autocomplete', 'name')
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('autocomplete', 'email')
    expect(screen.getByRole('button', { name: 'Criar conta' })).toBeEnabled()
  })

  it('campos vazios e termos sem aceitar pedem para preencher (junto de cada campo) e não chamam o servidor', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
    expect(screen.getByText('Nome obrigatório')).toBeInTheDocument()
    expect(screen.getByText('Informe seu e-mail')).toBeInTheDocument()
    expect(screen.getByText('Mínimo 8 caracteres com letra maiúscula, minúscula e número')).toBeInTheDocument()
    expect(screen.getByText('Você precisa aceitar os termos para continuar')).toBeInTheDocument()
    expect(screen.getByLabelText('Nome')).toHaveAttribute('aria-invalid', 'true')
    expect(authAPI.register).not.toHaveBeenCalled()
    await userEvent.type(screen.getByLabelText('Nome'), 'A')
    expect(screen.queryByText('Nome obrigatório')).not.toBeInTheDocument() // digitar limpa o aviso do campo
  })

  it('nome curto e senha fraca têm o texto de sempre', async () => {
    setup()
    await fill('A', 'ana@test.com', 'abcdefgh')
    await userEvent.click(screen.getByLabelText(/Li e aceito/))
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
    expect(screen.getByText('O nome deve ter pelo menos 2 caracteres.')).toBeInTheDocument()
    expect(screen.getByText('Mínimo 8 caracteres com letra maiúscula, minúscula e número')).toBeInTheDocument()
    expect(authAPI.register).not.toHaveBeenCalled()
  })

  it('barra de força: vazia no começo; Muito fraca → Forte (a senha que o servidor aceita) com a largura e a cor do design', async () => {
    const { container } = setup()
    const fillEl = () => container.querySelector('.ad-strength-track div')
    const label = () => container.querySelector('.ad-strength-label')
    expect(label()).toHaveTextContent('')
    expect(fillEl().style.width).toBe('0%')
    await userEvent.type(screen.getByLabelText('Senha'), 'abc')
    expect(label()).toHaveTextContent('Muito fraca')
    expect(fillEl().style.width).toBe('25%')
    expect(label()).toHaveStyle({ color: '#D6334A' })
    await userEvent.clear(screen.getByLabelText('Senha'))
    await userEvent.type(screen.getByLabelText('Senha'), 'Abcdefg1')
    expect(label()).toHaveTextContent('Forte')
    expect(fillEl().style.width).toBe('100%')
    expect(label()).toHaveStyle({ color: '#087A52' })
  })

  it('aceite dos termos: caixa de verdade, links para os Termos e a Política em outra aba; marcar tira o aviso', async () => {
    setup()
    const box = screen.getByRole('checkbox', { name: /Li e aceito os Termos de Uso e a Política de Privacidade/ })
    expect(box).not.toBeChecked()
    expect(screen.getByRole('link', { name: 'Termos de Uso' })).toHaveAttribute('href', '/termos')
    expect(screen.getByRole('link', { name: 'Termos de Uso' })).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('link', { name: 'Política de Privacidade' })).toHaveAttribute('href', '/privacidade')
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
    expect(screen.getByText('Você precisa aceitar os termos para continuar')).toBeInTheDocument()
    await userEvent.click(box)
    expect(box).toBeChecked()
    expect(screen.queryByText('Você precisa aceitar os termos para continuar')).not.toBeInTheDocument()
  })

  it('cadastro certo manda nome e e-mail sem espaços, salário 0 e vai para o Início', async () => {
    authAPI.register.mockResolvedValue({ data: { user } })
    setup()
    await fill('  Ana Souza ', ' ana@test.com ', 'Senha@123')
    await userEvent.click(screen.getByLabelText(/Li e aceito/))
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
    await waitFor(() => expect(authAPI.register).toHaveBeenCalledWith({ name: 'Ana Souza', email: 'ana@test.com', password: 'Senha@123', salary: 0, referralCode: undefined }))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/dashboard'))
    expect(analytics.track).toHaveBeenCalledWith('user_signed_up')
  })

  it('erro do servidor aparece como alerta', async () => {
    authAPI.register.mockRejectedValue({ response: { data: { error: 'Este e-mail já está cadastrado.' } } })
    setup()
    await fill('Ana', 'ana@test.com', 'Senha@123')
    await userEvent.click(screen.getByLabelText(/Li e aceito/))
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Este e-mail já está cadastrado.')
  })

  it('enquanto envia, o botão fica desabilitado', async () => {
    authAPI.register.mockReturnValue(new Promise(() => {}))
    const { container } = setup()
    await fill('Ana', 'ana@test.com', 'Senha@123')
    await userEvent.click(screen.getByLabelText(/Li e aceito/))
    fireEvent.submit(container.querySelector('form'))
    await waitFor(() => expect(container.querySelector('.ad-btn-primary')).toBeDisabled())
    expect(container.querySelector('.ad-btn-primary .auth-spinner')).toBeInTheDocument()
  })

  it('com a abertura (splash) na tela não existe campo de senha', () => {
    const splash = document.createElement('div'); splash.id = 'app-splash'; document.body.appendChild(splash)
    const { container } = setup()
    expect(container.querySelector('input[type="password"]')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Crie sua conta' })).toBeInTheDocument()
  })

  it('no celular continua o Criar conta do celular', () => {
    setDesktop(false)
    const { container } = setup()
    expect(container.querySelector('.lw-page')).toBeInTheDocument()
    expect(container.querySelector('.ad-split')).not.toBeInTheDocument()
  })
})
