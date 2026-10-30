import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AutoLaunchPrompt from '../components/features/AutoLaunchPrompt.jsx'
import { getCache, setCache } from '../services/cache.js'
import { loadStory, peekStory, resetStoriesCache } from '../services/storiesData.js'

vi.mock('../services/api.js', () => ({
  transactionsAPI: { autoLaunch: vi.fn(), monthlyRecap: vi.fn() },
  goalsAPI: { list: vi.fn() },
}))
// A tela dos stories é baixada em segundo plano pelo pré-carregamento; aqui não interessa carregá-la de verdade.
vi.mock('../pages/StoriesResumo.jsx', () => ({ default: () => null }))

import { transactionsAPI } from '../services/api.js'

// Achado N2-1: o aviso dizia "ainda não foram lançadas" mesmo com 3 das 4 contas fixas pagas.
describe('AutoLaunchPrompt — o texto diz quantas contas fixas faltam', () => {
  it('nenhuma foi lançada: o texto de sempre', () => {
    render(<AutoLaunchPrompt autoLaunched={false} pending={4} total={4} />)
    expect(screen.getByText('Suas contas fixas ainda não foram lançadas este mês.')).toBeInTheDocument()
  })

  it('falta 1 de 4: diz "Falta 1 conta fixa" (singular)', () => {
    render(<AutoLaunchPrompt autoLaunched={false} pending={1} total={4} />)
    expect(screen.getByText('Falta 1 conta fixa para lançar este mês.')).toBeInTheDocument()
    expect(screen.queryByText(/ainda não foram lançadas/)).not.toBeInTheDocument()
  })

  it('faltam 3 de 4: plural', () => {
    render(<AutoLaunchPrompt autoLaunched={false} pending={3} total={4} />)
    expect(screen.getByText('Faltam 3 contas fixas para lançar este mês.')).toBeInTheDocument()
  })

  it('sem os números (uso antigo do componente) mantém o texto de sempre', () => {
    render(<AutoLaunchPrompt autoLaunched={false} />)
    expect(screen.getByText('Suas contas fixas ainda não foram lançadas este mês.')).toBeInTheDocument()
  })

  it('tudo lançado: o aviso nem aparece', () => {
    const { container } = render(<AutoLaunchPrompt autoLaunched pending={0} total={4} />)
    expect(container.firstChild).toBeNull()
  })
})

// Achado N2-2: "Lançar agora" (aviso do Início) criava as transações mas não avisava o app — o story do mês seguia com as
// contas fixas de antes (R$ 5.680 e 5 histórias, com o Início já em R$ 5.730) até recarregar a página.
describe('AutoLaunchPrompt — lançar avisa o app inteiro que o dado mudou', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStoriesCache()
    transactionsAPI.monthlyRecap.mockResolvedValue({ data: { hasData: true, fixedTotal: 5680 } })
  })

  it('"Lançar agora" dispara budget-updated e descarta o cache do Início', async () => {
    transactionsAPI.autoLaunch.mockResolvedValue({ data: { count: 1 } })
    setCache('dashboard', { summary: {} })
    const heard = vi.fn()
    window.addEventListener('budget-updated', heard)
    try {
      render(<AutoLaunchPrompt autoLaunched={false} pending={1} total={4} />)
      await userEvent.click(screen.getByRole('button', { name: /Lançar agora/ }))
      await waitFor(() => expect(heard).toHaveBeenCalledTimes(1))
      expect(getCache('dashboard')).toBeFalsy()
    } finally {
      window.removeEventListener('budget-updated', heard)
    }
  })

  it('o story do mês guardado antes é descartado: abrir de novo busca o resumo atual', async () => {
    transactionsAPI.autoLaunch.mockResolvedValue({ data: { count: 1 } })
    await loadStory('u1', 'resumo', 0)
    expect(peekStory('u1', 'resumo', 0)).toBeDefined()
    render(<AutoLaunchPrompt autoLaunched={false} pending={1} total={4} />)
    await userEvent.click(screen.getByRole('button', { name: /Lançar agora/ }))
    await waitFor(() => expect(peekStory('u1', 'resumo', 0)).toBeUndefined())
  })

  it('falhou: não avisa ninguém (nada mudou) e mostra o erro', async () => {
    transactionsAPI.autoLaunch.mockRejectedValue({ response: { data: { error: 'Limite atingido.' } } })
    const heard = vi.fn()
    window.addEventListener('budget-updated', heard)
    try {
      render(<AutoLaunchPrompt autoLaunched={false} pending={1} total={4} />)
      await userEvent.click(screen.getByRole('button', { name: /Lançar agora/ }))
      expect(await screen.findByText('Limite atingido.')).toBeInTheDocument()
      expect(heard).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('budget-updated', heard)
    }
  })
})
