import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import StoriesResumo from '../pages/StoriesResumo.jsx'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importActual) => {
  const actual = await importActual()
  return { ...actual, useNavigate: () => mockNavigate }
})

function setup() {
  return render(
    <MemoryRouter>
      <StoriesResumo />
    </MemoryRouter>
  )
}

beforeEach(() => { vi.clearAllMocks() })

describe('StoriesResumo', () => {
  it('mostra o slide de abertura com o mês atual', () => {
    setup()
    expect(screen.getByText('Resumo do mês')).toBeInTheDocument()
    expect(screen.getByText('Toque à direita para avançar.')).toBeInTheDocument()
  })

  it('mostra 1 segmento de progresso (só 1 slide implementado até agora)', () => {
    setup()
    expect(document.querySelectorAll('.stories-progress-track')).toHaveLength(1)
  })

  it('botão fechar navega para /dashboard', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
  })

  it('tocar na zona esquerda no primeiro slide não navega pra lugar nenhum', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(screen.getByText('Resumo do mês')).toBeInTheDocument()
  })

  it('tocar na zona direita depois do último slide fecha (navega pro dashboard)', async () => {
    setup()
    // só 1 slide existe agora — avançar já é "depois do último"
    await userEvent.click(screen.getByRole('button', { name: 'Avançar' }))
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
  })

  it('botão de pausar alterna para o ícone de retomar', async () => {
    setup()
    const btn = screen.getByRole('button', { name: 'Pausar' })
    await userEvent.click(btn)
    expect(screen.getByRole('button', { name: 'Retomar' })).toBeInTheDocument()
  })
})
