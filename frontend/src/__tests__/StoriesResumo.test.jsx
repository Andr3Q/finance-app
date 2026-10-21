import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import StoriesResumo from '../pages/StoriesResumo.jsx'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importActual) => {
  const actual = await importActual()
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockRecap  = vi.fn()
const mockCreate = vi.fn()
vi.mock('../services/api.js', () => ({
  transactionsAPI: { monthlyRecap: (...a) => mockRecap(...a) },
  goalsAPI:        { create: (...a) => mockCreate(...a) },
}))

const baseRecap = (over = {}) => ({
  month: 10, year: 2026, hasData: true,
  saved: 9500, savedDeltaPct: 32, prevMonth: 9, isBestOfYear: true, belowAverage: null,
  topExpenses: [
    { category: 'fixed', label: 'Conta Fixa', amount: 5080 },
    { category: 'food', label: 'Alimentação', amount: 1165 },
  ],
  totalExpenses: 7255, fixedSharePct: 70, fixedPaid: 9, fixedTotal: 9, expensesDeltaPct: null,
  score: 82, scorePrev: 76, scoreNext: null,
  nextStep: { goalTitle: 'Reserva', currentPct: 61, targetPct: 70 },
  suggestedGoal: 10000,
  ...over,
})

function setup(offset = 0) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/resumo-stories', state: { monthOffset: offset } }]}>
      <StoriesResumo />
    </MemoryRouter>
  )
}

// Avança até o slide pedido tocando à direita.
async function advance(times) {
  for (let i = 0; i < times; i++) await userEvent.click(screen.getByRole('button', { name: 'Avançar' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRecap.mockResolvedValue({ data: baseRecap() })
})

describe('StoriesResumo — resumo do mês atual (6 slides)', () => {
  it('busca o resumo do mês pedido e mostra a abertura com o nº real de slides', async () => {
    setup(0)
    expect(await screen.findByText('Resumo do mês')).toBeInTheDocument()
    expect(mockRecap).toHaveBeenCalledWith(0)
    expect(screen.getByText(/em 6 histórias/)).toBeInTheDocument()
    expect(document.querySelectorAll('.stories-progress-track')).toHaveLength(6)
  })

  it('slide 2: melhor mês do ano com valor e variação', async () => {
    setup(0)
    await screen.findByText('Resumo do mês')
    await advance(1)
    expect(screen.getByText('Seu melhor mês do ano.')).toBeInTheDocument()
    expect(screen.getByText('R$ 9.500,00')).toBeInTheDocument()
    expect(screen.getByText(/32% a mais que setembro\. Continue assim!/)).toBeInTheDocument()
  })

  it('slide 2: sem ser o melhor mês, não comemora', async () => {
    mockRecap.mockResolvedValue({ data: baseRecap({ isBestOfYear: false, savedDeltaPct: -10 }) })
    setup(0)
    await screen.findByText('Resumo do mês')
    await advance(1)
    expect(screen.queryByText('Seu melhor mês do ano.')).not.toBeInTheDocument()
    expect(screen.getByText('Seu outubro fechou no azul.')).toBeInTheDocument()
    expect(screen.getByText('10% a menos que setembro.')).toBeInTheDocument()
  })

  it('slide 2: saldo negativo vira texto honesto', async () => {
    mockRecap.mockResolvedValue({ data: baseRecap({ saved: -300, isBestOfYear: false, savedDeltaPct: null }) })
    setup(0)
    await screen.findByText('Resumo do mês')
    await advance(1)
    expect(screen.getByText('Seu outubro fechou no vermelho.')).toBeInTheDocument()
    expect(screen.getByText('−R$ 300,00')).toBeInTheDocument()
  })

  it('slide 3: maiores gastos com fatia das contas fixas', async () => {
    setup(0)
    await screen.findByText('Resumo do mês')
    await advance(2)
    expect(screen.getByText('Seus maiores gastos')).toBeInTheDocument()
    expect(screen.getByText('Alimentação')).toBeInTheDocument()
    expect(screen.getByText(/As contas fixas são 70% do total/)).toBeInTheDocument()
  })

  it('slide 4: "Tudo em dia" só com todas as contas fixas pagas — sem inventar juros', async () => {
    setup(0)
    await screen.findByText('Resumo do mês')
    await advance(3)
    expect(screen.getByText('Tudo em dia')).toBeInTheDocument()
    expect(screen.getByText('9/9')).toBeInTheDocument()
    expect(screen.queryByText(/juros/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/atraso/i)).not.toBeInTheDocument()
  })

  it('slide 4 é omitido quando nem tudo foi pago e os gastos não caíram', async () => {
    mockRecap.mockResolvedValue({ data: baseRecap({ fixedPaid: 7 }) })
    setup(0)
    await screen.findByText('Resumo do mês')
    expect(document.querySelectorAll('.stories-progress-track')).toHaveLength(5)
    await advance(3)
    expect(screen.queryByText('Tudo em dia')).not.toBeInTheDocument()
    expect(screen.getByText('Subiu 6 pontos.')).toBeInTheDocument()
  })

  it('slide 5: saúde financeira sobe/cai conforme o mês anterior', async () => {
    setup(0)
    await screen.findByText('Resumo do mês')
    await advance(4)
    expect(screen.getByText('Subiu 6 pontos.')).toBeInTheDocument()
    expect(screen.getByText('82')).toBeInTheDocument()
    expect(screen.getByText('Próximo passo: levar Reserva a 70%.')).toBeInTheDocument()
  })

  it('slide 5: queda de score é dita como queda', async () => {
    mockRecap.mockResolvedValue({ data: baseRecap({ score: 70, scorePrev: 74, nextStep: null }) })
    setup(0)
    await screen.findByText('Resumo do mês')
    await advance(4)
    expect(screen.getByText('Caiu 4 pontos.')).toBeInTheDocument()
    expect(screen.getByText('Próximo passo: criar uma meta para guardar mais.')).toBeInTheDocument()
  })

  it('slide 6: convite pra meta cria a meta do mês seguinte e vai pra /goals', async () => {
    mockCreate.mockResolvedValue({ data: {} })
    setup(0)
    await screen.findByText('Resumo do mês')
    await advance(5)
    expect(screen.getByText('R$ 10 mil?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Criar meta de novembro' }))
    expect(mockCreate).toHaveBeenCalledWith({
      title: 'Meta de novembro', targetAmount: 10000, deadline: '2026-11-30',
    })
    expect(mockNavigate).toHaveBeenCalledWith('/goals')
  })

  it('slide 6: erro do limite do plano aparece e não navega', async () => {
    mockCreate.mockRejectedValue({ response: { data: { error: 'Crie mais metas com o plano Pro ou Elite.' } } })
    setup(0)
    await screen.findByText('Resumo do mês')
    await advance(5)
    await userEvent.click(screen.getByRole('button', { name: 'Criar meta de novembro' }))
    expect(await screen.findByText('Crie mais metas com o plano Pro ou Elite.')).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('slide 6 é omitido quando a Nancy não tem meta realista pra sugerir', async () => {
    mockRecap.mockResolvedValue({ data: baseRecap({ suggestedGoal: null }) })
    setup(0)
    await screen.findByText('Resumo do mês')
    expect(document.querySelectorAll('.stories-progress-track')).toHaveLength(5)
  })
})

describe('StoriesResumo — resumo do mês anterior (2 slides)', () => {
  beforeEach(() => {
    mockRecap.mockResolvedValue({
      data: baseRecap({
        month: 9, saved: 7160, belowAverage: { category: 'transport', label: 'Transporte', pct: 12 },
        score: 76, scoreNext: 82,
      }),
    })
  })

  it('pede offset -1 e mostra só 2 segmentos, sem slide de abertura', async () => {
    setup(-1)
    expect(await screen.findByText('Você guardou')).toBeInTheDocument()
    expect(mockRecap).toHaveBeenCalledWith(-1)
    expect(document.querySelectorAll('.stories-progress-track')).toHaveLength(2)
    expect(screen.getByText('R$ 7.160')).toBeInTheDocument()
    expect(screen.getByText('Um mês sólido, com Transporte 12% abaixo da média.')).toBeInTheDocument()
  })

  it('slide 2: score do mês seguinte descrito de verdade', async () => {
    setup(-1)
    await screen.findByText('Você guardou')
    await advance(1)
    expect(screen.getByText('Estável.')).toBeInTheDocument()
    expect(screen.getByText('76 pontos. Seu score de outubro subiu a partir daqui.')).toBeInTheDocument()
  })
})

describe('StoriesResumo — estados e navegação', () => {
  it('mês sem movimento mostra aviso e nenhum segmento de progresso', async () => {
    mockRecap.mockResolvedValue({ data: baseRecap({ hasData: false }) })
    setup(0)
    expect(await screen.findByText('Sem movimentações em outubro.')).toBeInTheDocument()
    expect(document.querySelectorAll('.stories-progress-track')).toHaveLength(0)
  })

  it('falha ao carregar mostra mensagem de erro', async () => {
    mockRecap.mockRejectedValue(new Error('boom'))
    setup(0)
    expect(await screen.findByText(/Não foi possível carregar o resumo/)).toBeInTheDocument()
  })

  it('botão fechar navega para /dashboard', async () => {
    setup(0)
    await screen.findByText('Resumo do mês')
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
  })

  it('tocar na esquerda no primeiro slide não navega pra lugar nenhum', async () => {
    setup(0)
    await screen.findByText('Resumo do mês')
    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(screen.getByText('Resumo do mês')).toBeInTheDocument()
  })

  it('tocar à direita depois do último slide fecha', async () => {
    setup(-1)
    await screen.findByText('Você guardou')
    await advance(2)
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
  })

  it('botão de pausar alterna para o ícone de retomar', async () => {
    setup(0)
    await screen.findByText('Resumo do mês')
    await userEvent.click(screen.getByRole('button', { name: 'Pausar' }))
    expect(screen.getByRole('button', { name: 'Retomar' })).toBeInTheDocument()
  })
})
