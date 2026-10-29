import { render, screen } from '@testing-library/react'
import AutoLaunchPrompt from '../components/features/AutoLaunchPrompt.jsx'

vi.mock('../services/api.js', () => ({ transactionsAPI: { autoLaunch: vi.fn() } }))

// Achado N2-1: o aviso dizia "ainda não foram lançadas" mesmo com 3 das 4 contas fixas pagas.
describe('AutoLaunchPrompt — o texto diz quantas contas fixas faltam', () => {
  it('nenhuma foi lançada: o texto de sempre', () => {
    render(<AutoLaunchPrompt autoLaunched={false} pending={4} total={4} onLaunched={() => {}} />)
    expect(screen.getByText('Suas contas fixas ainda não foram lançadas este mês.')).toBeInTheDocument()
  })

  it('falta 1 de 4: diz "Falta 1 conta fixa" (singular)', () => {
    render(<AutoLaunchPrompt autoLaunched={false} pending={1} total={4} onLaunched={() => {}} />)
    expect(screen.getByText('Falta 1 conta fixa para lançar este mês.')).toBeInTheDocument()
    expect(screen.queryByText(/ainda não foram lançadas/)).not.toBeInTheDocument()
  })

  it('faltam 3 de 4: plural', () => {
    render(<AutoLaunchPrompt autoLaunched={false} pending={3} total={4} onLaunched={() => {}} />)
    expect(screen.getByText('Faltam 3 contas fixas para lançar este mês.')).toBeInTheDocument()
  })

  it('sem os números (uso antigo do componente) mantém o texto de sempre', () => {
    render(<AutoLaunchPrompt autoLaunched={false} onLaunched={() => {}} />)
    expect(screen.getByText('Suas contas fixas ainda não foram lançadas este mês.')).toBeInTheDocument()
  })

  it('tudo lançado: o aviso nem aparece', () => {
    const { container } = render(<AutoLaunchPrompt autoLaunched pending={0} total={4} onLaunched={() => {}} />)
    expect(container.firstChild).toBeNull()
  })
})
