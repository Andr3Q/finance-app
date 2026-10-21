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
