import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import OnboardingModal from '../components/features/OnboardingModal.jsx'

vi.mock('../services/analytics.js', () => ({
  analytics: { track: vi.fn(), identify: vi.fn() },
}))

vi.mock('../services/api.js', () => ({
  authAPI:  { completeOnboarding: vi.fn().mockResolvedValue({}) },
  budgetAPI: { updateSalary: vi.fn().mockResolvedValue({}), create: vi.fn().mockResolvedValue({}) },
  goalsAPI:  { create: vi.fn().mockResolvedValue({}) },
}))

function setUser(overrides = {}) {
  const user = { id: 'user-123', name: 'Ana', onboardingComplete: false, ...overrides }
  sessionStorage.setItem('user', JSON.stringify(user))
  return user
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
})

describe('OnboardingModal — quando mostrar', () => {
  it('não renderiza sem usuário logado', () => {
    const { container } = render(<OnboardingModal />)
    expect(container.firstChild).toBeNull()
  })

  it('não renderiza quando onboardingComplete é true', () => {
    setUser({ onboardingComplete: true })
    const { container } = render(<OnboardingModal />)
    expect(container.firstChild).toBeNull()
  })

  // Regressão: antes disso, o modal só aparecia se sessionStorage tivesse a
  // flag "just_registered" — que some ao fechar o app/aba. Um usuário que
  // fechou o app no meio do onboarding (sem terminar) nunca mais via o modal
  // de novo, mesmo com onboardingComplete ainda false no servidor. Agora a
  // única fonte de verdade é onboardingComplete, sem depender de nenhuma
  // flag de sessionStorage.
  it('renderiza sempre que onboardingComplete é false, mesmo sem nenhuma flag de sessionStorage (fechou o app antes de terminar)', () => {
    setUser({ onboardingComplete: false })
    expect(sessionStorage.getItem('just_registered')).toBeNull()
    render(<OnboardingModal />)
    expect(screen.getByText('Vamos começar')).toBeInTheDocument()
  })

  it('renderiza quando onboardingComplete é undefined (usuário antigo, campo nunca setado)', () => {
    setUser({ onboardingComplete: undefined })
    render(<OnboardingModal />)
    expect(screen.getByText('Vamos começar')).toBeInTheDocument()
  })

  // Regressão: testador relatou "escolhi o salário no cadastro e perguntou de
  // novo" — o passo 1 sempre perguntava salário, mesmo já tendo vindo
  // preenchido do cadastro. Quem já informou o salário pula direto pro passo 2.
  it('pula a pergunta de salário (passo 1) quando o usuário já informou salário no cadastro', () => {
    setUser({ salary: 5000 })
    render(<OnboardingModal />)
    expect(screen.queryByText('Quanto você ganha por mês?')).not.toBeInTheDocument()
    expect(screen.getByText('Contas fixas')).toBeInTheDocument()
  })

  it('mostra a pergunta de salário no passo 1 quando o usuário ainda não tem salário cadastrado', () => {
    setUser({ salary: 0 })
    render(<OnboardingModal />)
    expect(screen.getByText('Quanto você ganha por mês?')).toBeInTheDocument()
  })
})

describe('OnboardingModal — fluxo de conclusão', () => {
  it('pular os 3 passos chama completeOnboarding e marca onboardingComplete', async () => {
    setUser()
    render(<OnboardingModal />)

    await userEvent.click(screen.getByRole('button', { name: 'Pular por agora' })) // passo 1 → 2
    await userEvent.click(screen.getByRole('button', { name: 'Pular por agora' })) // passo 2 → 3
    await userEvent.click(screen.getByRole('button', { name: 'Pular por agora' })) // passo 3 → finish()

    const { authAPI } = await import('../services/api.js')
    expect(authAPI.completeOnboarding).toHaveBeenCalledTimes(1)
  })

  // Tela "Vamos começar" (Nancy 2): o botão de voltar não tem passo anterior
  // pra onde ir no passo 1 — age como pular (mesmo guard de confirmação se
  // tiver salário digitado sem salvar).
  it('botão de voltar no passo 1 funciona como pular', async () => {
    setUser()
    render(<OnboardingModal />)

    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(screen.getByText('Contas fixas')).toBeInTheDocument()
  })

  it('botão de voltar no passo 2 retorna pro passo 1, sem pular', async () => {
    setUser()
    render(<OnboardingModal />)

    await userEvent.click(screen.getByRole('button', { name: 'Pular por agora' })) // vai pro passo 2
    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(screen.getByText('Quanto você ganha por mês?')).toBeInTheDocument()
  })
})

// ── Achados do QA N2-1 ───────────────────────────────────────────────────────────────────────────────────────────────
// useUser guarda o salário em memória por id de usuário: cada teste usa um id novo para não herdar o salário do anterior
let seq = 0
const freshUser = (overrides = {}) => setUser({ id: `user-n21-${++seq}`, ...overrides })

describe('OnboardingModal — o Início atualiza ao concluir', () => {
  let updated
  beforeEach(() => { updated = vi.fn(); window.addEventListener('budget-updated', updated) })
  afterEach(() => window.removeEventListener('budget-updated', updated))

  it('concluir (inclusive pulando tudo) avisa o app que os dados mudaram: o Início não fica zerado até o F5', async () => {
    freshUser({ salary: 5000 })
    render(<OnboardingModal />)
    await userEvent.click(screen.getByRole('button', { name: 'Pular por agora' })) // passo 2 -> 3
    expect(updated).not.toHaveBeenCalled()                                         // só avisa ao terminar
    await userEvent.click(screen.getByRole('button', { name: 'Pular por agora' })) // passo 3 -> concluir
    expect(await screen.findByText('Vamos começar').catch(() => null)).toBeNull()
    expect(updated).toHaveBeenCalledTimes(1)
  })

  it('o aviso sai DEPOIS de salvar a meta e de marcar o onboarding como concluído (a tela recarrega com tudo já salvo)', async () => {
    const { goalsAPI, authAPI } = await import('../services/api.js')
    const order = []
    goalsAPI.create.mockImplementation(async () => { order.push('meta') })
    authAPI.completeOnboarding.mockImplementation(async () => { order.push('concluir') })
    window.addEventListener('budget-updated', () => order.push('aviso'), { once: true })
    freshUser({ salary: 5000 })
    render(<OnboardingModal />)
    await userEvent.click(screen.getByRole('button', { name: 'Pular por agora' })) // passo 3
    await userEvent.type(screen.getByPlaceholderText('Ex: Reserva de emergência'), 'Viagem')
    await userEvent.type(screen.getByPlaceholderText('Ex: 10000'), '5000')
    await userEvent.click(screen.getByRole('button', { name: 'Concluir' }))

    await vi.waitFor(() => expect(order).toEqual(['meta', 'concluir', 'aviso']))
  })
})

describe('OnboardingModal — "pular" com salário digitado confirma no próprio app', () => {
  const typeSalary = async () => {
    await userEvent.type(screen.getByPlaceholderText('0,00'), '8500')
  }

  it('abre um diálogo do app (não o confirm() do navegador) e não pula ainda', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    freshUser({ salary: 0 })
    render(<OnboardingModal />)
    await typeSalary()
    await userEvent.click(screen.getByRole('button', { name: 'Pular por agora' }))

    const dialog = screen.getByRole('dialog', { name: 'Pular sem salvar o salário?' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(confirm).not.toHaveBeenCalled()
    expect(screen.getByText('Quanto você ganha por mês?')).toBeInTheDocument() // continua no passo 1
  })

  it('"Continuar editando" fecha o diálogo e mantém o passo 1 com o valor digitado', async () => {
    freshUser({ salary: 0 })
    render(<OnboardingModal />)
    await typeSalary()
    await userEvent.click(screen.getByRole('button', { name: 'Pular por agora' }))
    await userEvent.click(screen.getByRole('button', { name: 'Continuar editando' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Quanto você ganha por mês?')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('0,00')).toHaveValue(8500)
  })

  it('"Pular mesmo assim" vai para o passo 2', async () => {
    freshUser({ salary: 0 })
    render(<OnboardingModal />)
    await typeSalary()
    await userEvent.click(screen.getByRole('button', { name: 'Pular por agora' }))
    await userEvent.click(screen.getByRole('button', { name: 'Pular mesmo assim' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Contas fixas')).toBeInTheDocument()
  })

  it('o botão de voltar do passo 1 (que age como pular) também pergunta no app; Esc e o fundo cancelam', async () => {
    freshUser({ salary: 0 })
    render(<OnboardingModal />)
    await typeSalary()
    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    await userEvent.click(document.querySelector('.gls-modal-overlay'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Quanto você ganha por mês?')).toBeInTheDocument()
  })

  it('sem salário digitado, pular é direto (sem diálogo)', async () => {
    freshUser({ salary: 0 })
    render(<OnboardingModal />)
    await userEvent.click(screen.getByRole('button', { name: 'Pular por agora' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Contas fixas')).toBeInTheDocument()
  })
})

describe('OnboardingModal — textos', () => {
  it('o passo de contas fixas aponta o caminho real (Perfil → Finanças), não "Configurações"', () => {
    freshUser({ salary: 5000 })
    render(<OnboardingModal />)
    expect(screen.getByText(/Você pode incluir mais depois em Perfil → Finanças\./)).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('Configurações')
  })
})

// ── Achado N2-1: salário vazio/negativo seguia em frente sem nenhuma mensagem, e uma falha ao salvar passava em silêncio ──
describe('OnboardingModal — salário e meta: validação e falhas visíveis', () => {
  const salaryField = () => screen.getByLabelText('Salário mensal')
  const continuar = () => userEvent.click(screen.getByRole('button', { name: 'Continuar' }))

  it('"Continuar" com o salário vazio avisa e fica no passo 1, sem chamar o servidor', async () => {
    const { budgetAPI } = await import('../services/api.js')
    freshUser({ salary: 0 })
    render(<OnboardingModal />)
    await continuar()
    expect(screen.getByRole('alert')).toHaveTextContent('Informe seu salário ou toque em "Pular por agora".')
    expect(screen.getByText('Quanto você ganha por mês?')).toBeInTheDocument()
    expect(salaryField()).toHaveAttribute('aria-invalid', 'true')
    expect(budgetAPI.updateSalary).not.toHaveBeenCalled()
  })

  it.each(['-500', '0'])('salário %s: pede um valor maior que zero e não salva nada', async (valor) => {
    const { budgetAPI } = await import('../services/api.js')
    freshUser({ salary: 0 })
    render(<OnboardingModal />)
    await userEvent.type(salaryField(), valor)
    await continuar()
    expect(screen.getByRole('alert')).toHaveTextContent('Informe um valor maior que zero.')
    expect(screen.getByText('Quanto você ganha por mês?')).toBeInTheDocument()
    expect(budgetAPI.updateSalary).not.toHaveBeenCalled()
  })

  it('o erro some quando a pessoa começa a corrigir o valor', async () => {
    freshUser({ salary: 0 })
    render(<OnboardingModal />)
    await continuar()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    await userEvent.type(salaryField(), '8')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('salário válido: salva e vai para o passo 2', async () => {
    const { budgetAPI } = await import('../services/api.js')
    freshUser({ salary: 0 })
    render(<OnboardingModal />)
    await userEvent.type(salaryField(), '8500')
    await continuar()
    expect(budgetAPI.updateSalary).toHaveBeenCalledWith(8500)
    expect(await screen.findByText('Contas fixas')).toBeInTheDocument()
  })

  it('falha ao salvar o salário: mostra o erro e NÃO avança (antes seguia como se tivesse salvo)', async () => {
    const { budgetAPI } = await import('../services/api.js')
    budgetAPI.updateSalary.mockRejectedValueOnce({ response: { data: { error: 'Salário excede o limite permitido.' } } })
    freshUser({ salary: 0 })
    render(<OnboardingModal />)
    await userEvent.type(salaryField(), '8500')
    await continuar()
    expect(await screen.findByRole('alert')).toHaveTextContent('Salário excede o limite permitido.')
    expect(screen.getByText('Quanto você ganha por mês?')).toBeInTheDocument()
    expect(salaryField()).toHaveValue(8500) // o que foi digitado continua lá para tentar de novo
  })

  it('falha de rede ao salvar o salário: mensagem padrão que também aponta a saída (pular)', async () => {
    const { budgetAPI } = await import('../services/api.js')
    budgetAPI.updateSalary.mockRejectedValueOnce(new Error('Network Error'))
    freshUser({ salary: 0 })
    render(<OnboardingModal />)
    await userEvent.type(salaryField(), '8500')
    await continuar()
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível salvar o salário agora. Tente de novo ou toque em "Pular por agora".')
    // e a pessoa pode tentar de novo
    await continuar()
    expect(await screen.findByText('Contas fixas')).toBeInTheDocument()
  })

  it('"Pular por agora" com o campo vazio continua levando ao passo 2 (o aviso é só do "Continuar")', async () => {
    freshUser({ salary: 0 })
    render(<OnboardingModal />)
    await continuar()
    await userEvent.click(screen.getByRole('button', { name: 'Pular por agora' }))
    expect(screen.getByText('Contas fixas')).toBeInTheDocument()
  })

  describe('passo 3 (meta)', () => {
    const goToGoalStep = async () => {
      freshUser({ salary: 5000 })
      render(<OnboardingModal />)
      await userEvent.click(screen.getByRole('button', { name: 'Pular por agora' })) // passo 2 -> 3
    }

    it('meta preenchida pela metade (só o nome) avisa e não conclui', async () => {
      const { goalsAPI, authAPI } = await import('../services/api.js')
      await goToGoalStep()
      await userEvent.type(screen.getByLabelText('Nome da meta'), 'Viagem')
      await userEvent.click(screen.getByRole('button', { name: 'Concluir' }))
      expect(screen.getByRole('alert')).toHaveTextContent('Informe o nome e um valor-alvo maior que zero, ou toque em "Pular por agora".')
      expect(goalsAPI.create).not.toHaveBeenCalled()
      expect(authAPI.completeOnboarding).not.toHaveBeenCalled()
    })

    it('falha ao criar a meta: avisa e o onboarding continua aberto (antes concluía sem a meta)', async () => {
      const { goalsAPI, authAPI } = await import('../services/api.js')
      goalsAPI.create.mockRejectedValueOnce(new Error('Network Error'))
      await goToGoalStep()
      await userEvent.type(screen.getByLabelText('Nome da meta'), 'Viagem')
      await userEvent.type(screen.getByLabelText('Valor-alvo'), '5000')
      await userEvent.click(screen.getByRole('button', { name: 'Concluir' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível criar a meta agora.')
      expect(authAPI.completeOnboarding).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: 'Concluir' })).toBeEnabled() // dá para tentar de novo
    })

    it('sem nada preenchido, "Concluir" conclui direto (a meta é opcional)', async () => {
      const { authAPI } = await import('../services/api.js')
      await goToGoalStep()
      await userEvent.click(screen.getByRole('button', { name: 'Concluir' }))
      await vi.waitFor(() => expect(authAPI.completeOnboarding).toHaveBeenCalledTimes(1))
    })
  })
})

// ── Achado da revisão independente: a conta digitada e não adicionada se perdia em silêncio ao tocar em "Continuar" (passo 2) ──
describe('OnboardingModal — passo 2: conta digitada e não adicionada', () => {
  const goToStep2 = () => {
    freshUser({ salary: 5000 }) // já informou o salário: abre direto em "Contas fixas"
    render(<OnboardingModal />)
  }
  const continuar = () => userEvent.click(screen.getByRole('button', { name: 'Continuar' }))

  it.each([
    ['só o nome', async () => { await userEvent.type(screen.getByLabelText('Nome'), 'Aluguel') }],
    ['só o valor', async () => { await userEvent.type(screen.getByLabelText('Valor'), '1200') }],
    ['nome e valor', async () => { await userEvent.type(screen.getByLabelText('Nome'), 'Aluguel'); await userEvent.type(screen.getByLabelText('Valor'), '1200') }],
  ])('%s digitados e sem tocar em "+ Adicionar conta": avisa e fica no passo 2', async (_, fill) => {
    goToStep2()
    await fill()
    await continuar()
    expect(screen.getByRole('alert')).toHaveTextContent('Toque em "+ Adicionar conta" para guardar esta conta, ou limpe os campos para continuar.')
    expect(screen.getByRole('heading', { name: 'Contas fixas' })).toBeInTheDocument()
  })

  it('o aviso não trava o botão de adicionar: tocar nele guarda a conta, limpa os campos e o "Continuar" segue', async () => {
    const { budgetAPI } = await import('../services/api.js')
    goToStep2()
    await userEvent.type(screen.getByLabelText('Nome'), 'Aluguel')
    await userEvent.type(screen.getByLabelText('Valor'), '1200')
    await continuar()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '+ Adicionar conta' })) // continua ligado
    expect(budgetAPI.create).toHaveBeenCalledWith({ name: 'Aluguel', amount: 1200 })
    expect(await screen.findByText('1 conta adicionada')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await continuar()
    expect(await screen.findByRole('heading', { name: 'Primeira meta' })).toBeInTheDocument()
  })

  it('limpar os campos (ou corrigir) tira o aviso e libera o "Continuar"', async () => {
    goToStep2()
    await userEvent.type(screen.getByLabelText('Nome'), 'Alu')
    await continuar()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText('Nome'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await continuar()
    expect(await screen.findByRole('heading', { name: 'Primeira meta' })).toBeInTheDocument()
  })

  it('campos vazios: "Continuar" segue direto (adicionar conta é opcional)', async () => {
    goToStep2()
    await continuar()
    expect(await screen.findByRole('heading', { name: 'Primeira meta' })).toBeInTheDocument()
  })
})
