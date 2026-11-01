import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import OnboardingModal from '../components/features/OnboardingModal.jsx'

vi.mock('../services/analytics.js', () => ({ analytics: { track: vi.fn(), identify: vi.fn() } }))
vi.mock('../services/api.js', () => ({
  authAPI:   { completeOnboarding: vi.fn() },
  budgetAPI: { updateSalary: vi.fn(), create: vi.fn() },
  goalsAPI:  { create: vi.fn() },
}))
import { authAPI, budgetAPI, goalsAPI } from '../services/api.js'

const setDesktop = (is) => { window.matchMedia = vi.fn(() => ({ matches: is, addEventListener() {}, removeEventListener() {} })) }
// id próprio por teste: o useUser guarda o salário em memória POR ID, e o teste que salva o salário contaminaria os seguintes
let seq = 0
const setUser = (o = {}) => sessionStorage.setItem('user', JSON.stringify({ id: `u-ob-${++seq}`, name: 'Ana', onboardingComplete: false, ...o }))
const salaryField = () => screen.getByLabelText('Salário mensal')
const next = () => userEvent.click(screen.getByRole('button', { name: /^Continuar$|^Começar a usar a Nancy$/ }))
const skip = () => userEvent.click(screen.getByRole('button', { name: 'Pular por agora' }))
const toStep2 = async () => { await userEvent.type(salaryField(), '5000'); await next(); await screen.findByText('Qual sua principal conta fixa?') }

beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear(); setDesktop(true); setUser()
  authAPI.completeOnboarding.mockResolvedValue({}); budgetAPI.updateSalary.mockResolvedValue({})
  budgetAPI.create.mockResolvedValue({}); goalsAPI.create.mockResolvedValue({})
})
afterEach(() => { delete window.matchMedia })

describe('Primeiros passos no desktop (design "Nancy Desktop", tela 07)', () => {
  it('passo 1: tela cheia com o painel azul, 3 pontinhos, "Vamos começar", a pergunta e o campo do salário do design', () => {
    const { container } = render(<OnboardingModal />)
    expect(container.querySelector('.ad-ob .ad-split')).toBeInTheDocument()
    expect(container.querySelector('.ad-hero')).toHaveClass('ad-hero--form')
    expect(container.querySelector('.ob-overlay')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Vamos começar' })).toBeInTheDocument()
    expect(screen.getByText('Quanto você ganha por mês?')).toBeInTheDocument()
    expect(salaryField()).toHaveAttribute('placeholder', 'R$ 0,00')
    expect(salaryField()).toHaveAttribute('type', 'number')
    expect(container.querySelectorAll('.ad-dot')).toHaveLength(3)
    expect(container.querySelector('.ad-dot.cur')).toBe(container.querySelectorAll('.ad-dot')[0])
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Pular por agora' })).toBeInTheDocument()
  })

  it('salário vazio ou zero avisa no próprio campo e NÃO chama o servidor', async () => {
    render(<OnboardingModal />)
    await next()
    expect(screen.getByRole('alert')).toHaveTextContent('Informe seu salário ou toque em "Pular por agora".')
    expect(salaryField()).toHaveAttribute('aria-invalid', 'true')
    await userEvent.type(salaryField(), '0')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument() // digitar limpa o aviso
    await next()
    expect(screen.getByRole('alert')).toHaveTextContent('Informe um valor maior que zero.')
    expect(budgetAPI.updateSalary).not.toHaveBeenCalled()
  })

  it('salário válido é salvo e leva ao passo 2 (a pergunta troca, o título não)', async () => {
    render(<OnboardingModal />)
    await toStep2()
    expect(budgetAPI.updateSalary).toHaveBeenCalledWith(5000)
    expect(screen.getByRole('heading', { level: 2, name: 'Vamos começar' })).toBeInTheDocument()
    expect(document.querySelectorAll('.ad-dot.on')).toHaveLength(2)
  })

  it('falha ao salvar o salário mostra o erro e fica no passo 1', async () => {
    budgetAPI.updateSalary.mockRejectedValue({ response: { data: { error: 'Salário inválido.' } } })
    render(<OnboardingModal />)
    await userEvent.type(salaryField(), '5000')
    await next()
    expect(await screen.findByRole('alert')).toHaveTextContent('Salário inválido.')
    expect(screen.getByText('Quanto você ganha por mês?')).toBeInTheDocument()
  })

  it('"Pular" com salário digitado pergunta antes; "Continuar editando" volta e "Pular mesmo assim" segue', async () => {
    render(<OnboardingModal />)
    await userEvent.type(salaryField(), '5000')
    await skip()
    const dialog = screen.getByRole('dialog', { name: 'Pular sem salvar o salário?' })
    await userEvent.click(screen.getByRole('button', { name: 'Continuar editando' }))
    expect(dialog).not.toBeInTheDocument()
    await skip()
    await userEvent.click(screen.getByRole('button', { name: 'Pular mesmo assim' }))
    expect(await screen.findByText('Qual sua principal conta fixa?')).toBeInTheDocument()
    expect(budgetAPI.updateSalary).not.toHaveBeenCalled()
  })

  it('quem já informou o salário no cadastro começa no passo 2', () => {
    setUser({ salary: 4000 })
    render(<OnboardingModal />)
    expect(screen.getByText('Qual sua principal conta fixa?')).toBeInTheDocument()
  })

  it('passo 2: os atalhos preenchem o nome; "+ Adicionar conta" só liga com nome e valor e guarda a conta', async () => {
    render(<OnboardingModal />)
    await toStep2()
    const add = screen.getByRole('button', { name: '+ Adicionar conta' })
    expect(add).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Internet' }))
    expect(screen.getByLabelText('Nome da conta fixa')).toHaveValue('Internet')
    expect(add).toBeDisabled() // falta o valor
    await userEvent.type(screen.getByLabelText('Valor da conta fixa'), '120')
    expect(add).toBeEnabled()
    await userEvent.click(add)
    await waitFor(() => expect(budgetAPI.create).toHaveBeenCalledWith({ name: 'Internet', amount: 120 }))
    expect(await screen.findByText('1 conta adicionada')).toBeInTheDocument()
    expect(screen.getByLabelText('Nome da conta fixa')).toHaveValue('')
  })

  it('passo 2: conta digitada e não adicionada não se perde em silêncio ao continuar; limite do plano avisa', async () => {
    render(<OnboardingModal />)
    await toStep2()
    await userEvent.type(screen.getByLabelText('Nome da conta fixa'), 'Aluguel')
    await next()
    expect(screen.getByRole('alert')).toHaveTextContent('Toque em "+ Adicionar conta" para guardar esta conta, ou limpe os campos para continuar.')
    budgetAPI.create.mockRejectedValue({ response: { data: { limitReached: true } } })
    await userEvent.type(screen.getByLabelText('Valor da conta fixa'), '1200')
    await userEvent.click(screen.getByRole('button', { name: '+ Adicionar conta' }))
    expect(await screen.findByText(/Limite de contas do seu plano atingido/)).toBeInTheDocument()
  })

  it('passo 3: meta pela metade avisa; meta completa é criada e "Começar a usar a Nancy" conclui', async () => {
    render(<OnboardingModal />)
    await toStep2()
    await next() // 2 -> 3 (sem conta pendente)
    await screen.findByText('Qual seu primeiro objetivo?')
    expect(screen.getByRole('button', { name: 'Começar a usar a Nancy' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Viagem' }))
    expect(screen.getByLabelText('Nome da meta')).toHaveValue('Viagem')
    await next()
    expect(screen.getByRole('alert')).toHaveTextContent('Informe o nome e um valor-alvo maior que zero, ou toque em "Pular por agora".')
    expect(goalsAPI.create).not.toHaveBeenCalled()
    await userEvent.type(screen.getByLabelText('Valor-alvo da meta'), '3000')
    await next()
    await waitFor(() => expect(goalsAPI.create).toHaveBeenCalledWith({ title: 'Viagem', targetAmount: 3000 }))
    await waitFor(() => expect(authAPI.completeOnboarding).toHaveBeenCalled())
  })

  it('Voltar volta uma etapa; "Pular por agora" no último passo conclui sem criar meta', async () => {
    render(<OnboardingModal />)
    await toStep2()
    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(await screen.findByText('Quanto você ganha por mês?')).toBeInTheDocument()
    await skip(); await userEvent.click(screen.getByRole('button', { name: 'Pular mesmo assim' }))
    await screen.findByText('Qual sua principal conta fixa?')
    await skip() // 2 -> 3
    await screen.findByText('Qual seu primeiro objetivo?')
    await skip() // concluir
    await waitFor(() => expect(authAPI.completeOnboarding).toHaveBeenCalled())
    expect(goalsAPI.create).not.toHaveBeenCalled()
  })

  it('no celular continua o Primeiros passos do celular', () => {
    setDesktop(false)
    const { container } = render(<OnboardingModal />)
    expect(container.querySelector('.ob-overlay')).toBeInTheDocument()
    expect(container.querySelector('.ad-ob')).not.toBeInTheDocument()
  })
})
