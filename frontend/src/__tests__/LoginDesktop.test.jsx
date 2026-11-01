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

const setDesktop = (is) => { window.matchMedia = vi.fn(() => ({ matches: is, addEventListener() {}, removeEventListener() {} })) }
function setup(props = {}, entry = '/login') {
  return render(<MemoryRouter initialEntries={[entry]}><Login {...props} /></MemoryRouter>)
}
const user = { id: 'u1', name: 'Ana', plan: 'pro' }

beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); setDesktop(true) })
afterEach(() => { delete window.matchMedia; document.getElementById('app-splash')?.remove() })

describe('Entrar no desktop (design "Nancy Desktop", tela 03)', () => {
  it('usa o layout do desktop: painel azul sem os cartões e o formulário do design', () => {
    const { container } = setup()
    expect(container.querySelector('.ad-split')).toBeInTheDocument()
    expect(container.querySelector('.ad-hero')).toHaveClass('ad-hero--form')
    expect(container.querySelector('.ad-cards')).not.toBeInTheDocument()
    expect(container.querySelector('.lw-page')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Bem-vindo de volta' })).toBeInTheDocument()
    expect(screen.getByText('Entre para ver como estão suas finanças.')).toBeInTheDocument()
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('placeholder', 'voce@email.com')
    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'password')
    // o navegador preenche a senha GUARDADA (não oferece gerar uma nova)
    expect(screen.getByLabelText('Senha')).toHaveAttribute('autocomplete', 'current-password')
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('autocomplete', 'email')
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled()
    expect(screen.getByText('ou')).toBeInTheDocument()
  })

  it('links: Voltar para o início, Esqueci a senha e Criar conta; Google ainda não existe (desabilitado)', () => {
    setup()
    expect(screen.getByRole('link', { name: 'Voltar' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Esqueci a senha' })).toHaveAttribute('href', '/forgot-password')
    expect(screen.getByRole('link', { name: 'Criar conta' })).toHaveAttribute('href', '/register')
    const google = screen.getByRole('button', { name: 'Continuar com Google' })
    expect(google).toBeDisabled()
    expect(google).toHaveAttribute('title', 'Login com Google — em breve')
  })

  it('campos vazios pedem para preencher (mensagem junto do campo) e não chamam o servidor', async () => {
    setup()
    expect(screen.queryByText('Informe seu e-mail')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(screen.getByText('Informe seu e-mail')).toBeInTheDocument()
    expect(screen.getByText('Informe sua senha')).toBeInTheDocument()
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('aria-invalid', 'true')
    expect(authAPI.login).not.toHaveBeenCalled()
    await userEvent.type(screen.getByLabelText('E-mail'), 'a')
    expect(screen.queryByText('Informe seu e-mail')).not.toBeInTheDocument() // digitar limpa o aviso do campo
  })

  it('e-mail inválido e senha curta têm o texto de sempre', async () => {
    setup()
    await userEvent.type(screen.getByLabelText('E-mail'), 'sem-arroba')
    await userEvent.type(screen.getByLabelText('Senha'), '1234')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(screen.getByText('E-mail inválido')).toBeInTheDocument()
    expect(screen.getByText('Mínimo 8 caracteres')).toBeInTheDocument()
    expect(authAPI.login).not.toHaveBeenCalled()
  })

  it('login certo chama o servidor com o e-mail sem espaços e vai para o Início', async () => {
    authAPI.login.mockResolvedValue({ data: { user } })
    setup()
    await userEvent.type(screen.getByLabelText('E-mail'), '  ana@test.com ')
    await userEvent.type(screen.getByLabelText('Senha'), 'Senha@123')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    await waitFor(() => expect(authAPI.login).toHaveBeenCalledWith({ email: 'ana@test.com', password: 'Senha@123' }))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/dashboard'))
  })

  it('erro do servidor aparece como alerta', async () => {
    authAPI.login.mockRejectedValue({ response: { data: { error: 'E-mail ou senha incorretos.' } } })
    setup()
    await userEvent.type(screen.getByLabelText('E-mail'), 'ana@test.com')
    await userEvent.type(screen.getByLabelText('Senha'), 'Senha@123')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha incorretos.')
  })

  it('enquanto envia, o botão fica desabilitado', async () => {
    authAPI.login.mockReturnValue(new Promise(() => {}))
    const { container } = setup()
    await userEvent.type(screen.getByLabelText('E-mail'), 'ana@test.com')
    await userEvent.type(screen.getByLabelText('Senha'), 'Senha@123')
    fireEvent.submit(container.querySelector('form'))
    await waitFor(() => expect(container.querySelector('.ad-btn-primary')).toBeDisabled())
    expect(container.querySelector('.ad-btn-primary .auth-spinner')).toBeInTheDocument()
  })

  it('aviso vindo de outra tela (ex.: conta excluída) aparece e some ao digitar', async () => {
    setup({}, [{ pathname: '/login', state: { notice: 'Sua conta foi excluída.' } }][0])
    expect(await screen.findByRole('status')).toHaveTextContent('Sua conta foi excluída.')
    await userEvent.type(screen.getByLabelText('E-mail'), 'a')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('conta com verificação em duas etapas cai na tela do código (a mesma nos dois tamanhos)', async () => {
    authAPI.login.mockResolvedValue({ data: { requires2FA: true, tempToken: 't1' } })
    const { container } = setup()
    await userEvent.type(screen.getByLabelText('E-mail'), 'ana@test.com')
    await userEvent.type(screen.getByLabelText('Senha'), 'Senha@123')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    await waitFor(() => expect(container.querySelector('.lauth-2fa-screen')).toBeInTheDocument())
    expect(container.querySelector('.ad-split')).not.toBeInTheDocument()
  })

  it('com a abertura (splash) na tela não existe campo de senha — o gerenciador de senhas não abre por cima do vídeo', async () => {
    const splash = document.createElement('div'); splash.id = 'app-splash'; document.body.appendChild(splash)
    const { container } = setup()
    expect(container.querySelector('input[type="password"]')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Bem-vindo de volta' })).toBeInTheDocument()
  })

  it('no celular continua o Entrar do celular', () => {
    setDesktop(false)
    const { container } = setup()
    expect(container.querySelector('.lw-page')).toBeInTheDocument()
    expect(container.querySelector('.ad-split')).not.toBeInTheDocument()
  })

  it('o Entrar não troca de layout para Criar conta: cada rota tem o seu (RegisterDesktop.test.jsx)', () => {
    const { container } = setup({ isRegister: true }, '/register')
    expect(container.querySelector('.ad-split')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Crie sua conta' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Bem-vindo de volta' })).not.toBeInTheDocument()
  })
})
