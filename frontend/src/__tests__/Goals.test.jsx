import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Goals from '../pages/Goals.jsx'

vi.mock('../services/api.js', () => ({
  goalsAPI:        { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  transactionsAPI: { monthlyHistory: vi.fn(), subscriptions: vi.fn() },
  agentAPI:        { monthlyReport: vi.fn() },
}))
vi.mock('../services/cache.js', () => ({ getCache: vi.fn(() => null), setCache: vi.fn(), invalidateCache: vi.fn() }))
vi.mock('../services/analytics.js', () => ({ analytics: { track: vi.fn() } }))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))

import { goalsAPI, transactionsAPI } from '../services/api.js'

const goal = (over = {}) => ({ id: 'g1', title: 'Reserva de emergência', targetAmount: 30000, currentAmount: 18400, deadline: '2026-12-15T12:00:00Z', color: '#3DE29F', ...over })

function setUser(plan = 'elite') {
  const user = { id: 'u1', plan }
  sessionStorage.setItem('user', JSON.stringify(user))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: user }))
}
function renderGoals(goals = [goal()], plan = 'elite') {
  setUser(plan)
  goalsAPI.list.mockResolvedValue({ data: goals })
  return render(<MemoryRouter><Goals /></MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear()
  goalsAPI.create.mockResolvedValue({ data: {} }); goalsAPI.update.mockResolvedValue({ data: {} }); goalsAPI.remove.mockResolvedValue({ data: {} })
  transactionsAPI.monthlyHistory.mockResolvedValue({ data: [] }); transactionsAPI.subscriptions.mockResolvedValue({ data: [] })
})

describe('Metas — cartões', () => {
  it('mostra nome, prazo (mês/ano), percentual, valores e o depósito rápido de R$ 500', async () => {
    renderGoals([goal(), goal({ id: 'g2', title: 'Viagem para Lisboa', targetAmount: 15000, currentAmount: 6200, deadline: '2027-07-10T12:00:00Z' })])
    expect(await screen.findByText('Reserva de emergência')).toBeInTheDocument()
    expect(screen.getByText('Até dez 2026')).toBeInTheDocument()
    expect(screen.getByText('61%')).toBeInTheDocument()
    expect(screen.getByText('R$ 18.400,00 / R$ 30.000,00')).toBeInTheDocument()
    expect(screen.getByText('Até jul 2027')).toBeInTheDocument()
    expect(screen.getByText('41%')).toBeInTheDocument()
    expect(screen.getAllByText('+ R$ 500')).toHaveLength(2)
    expect(screen.getAllByRole('progressbar').map(p => p.getAttribute('aria-valuenow'))).toEqual(['61', '41'])
  })

  it('meta sem prazo não mostra "Até"; meta concluída troca o depósito por "Meta atingida"', async () => {
    renderGoals([goal({ id: 'a', title: 'Sem prazo', deadline: null }), goal({ id: 'b', title: 'Pronta', currentAmount: 30000 })])
    await screen.findByText('Sem prazo')
    expect(screen.getAllByText(/^Até /)).toHaveLength(1) // só a "Pronta" tem prazo
    expect(screen.getByText('Meta atingida')).toBeInTheDocument()
    expect(screen.getByText('✓')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /depositar na meta pronta/i })).not.toBeInTheDocument()
  })

  it('o depósito rápido é no máximo o que falta pra meta', async () => {
    renderGoals([goal({ currentAmount: 29800 })])
    expect(await screen.findByText('+ R$ 200')).toBeInTheDocument()
  })
})

describe('Metas — depositar', () => {
  it('"+ R$ 500" abre o depósito já com 500, e confirmar soma ao que já foi guardado', async () => {
    renderGoals()
    fireEvent.click(await screen.findByRole('button', { name: /depositar na meta reserva de emergência/i }))
    const input = await screen.findByPlaceholderText('0,00')
    expect(input).toHaveValue('500,00')
    expect(goalsAPI.update).not.toHaveBeenCalled() // nada é depositado sem confirmar
    fireEvent.click(screen.getAllByRole('button', { name: /^depositar$/i }).at(-1))
    await waitFor(() => expect(goalsAPI.update).toHaveBeenCalledWith('g1', { currentAmount: 18900 }))
    expect(await screen.findByText(/depósito registrado/i)).toBeInTheDocument()
  })
})

describe('Metas — nova meta', () => {
  it('"Criar meta" só liga com nome e valor; cria com cor e sem prazo e limpa os campos', async () => {
    renderGoals([])
    const create = await screen.findByRole('button', { name: 'Criar meta' })
    expect(create).toBeDisabled()
    await userEvent.type(screen.getByPlaceholderText('Ex.: Carro novo'), 'Carro novo')
    expect(create).toBeDisabled()
    await userEvent.type(screen.getByPlaceholderText('Valor alvo (R$)'), '50000')
    expect(create).toBeEnabled()
    fireEvent.click(create)
    await waitFor(() => expect(goalsAPI.create).toHaveBeenCalledWith(expect.objectContaining({ title: 'Carro novo', targetAmount: 50000, color: '#3DE29F' })))
    expect(await screen.findByText('Meta criada!')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Ex.: Carro novo')).toHaveValue('')
  })

  it('no limite do plano gratuito (1 meta) o botão fica desligado e explica', async () => {
    renderGoals([goal()], 'free')
    await screen.findByText('Reserva de emergência')
    await userEvent.type(screen.getByPlaceholderText('Ex.: Carro novo'), 'Outra')
    await userEvent.type(screen.getByPlaceholderText('Valor alvo (R$)'), '1000')
    expect(screen.getByRole('button', { name: 'Criar meta' })).toBeDisabled()
    expect(screen.getByText(/atingiu o limite de metas do seu plano/i)).toBeInTheDocument()
  })

  it('erro do servidor aparece e os campos continuam preenchidos', async () => {
    goalsAPI.create.mockRejectedValue({ response: { data: { error: 'Algo deu errado.' } } })
    renderGoals([])
    await userEvent.type(await screen.findByPlaceholderText('Ex.: Carro novo'), 'Casa')
    await userEvent.type(screen.getByPlaceholderText('Valor alvo (R$)'), '9000')
    fireEvent.click(screen.getByRole('button', { name: 'Criar meta' }))
    expect(await screen.findByText('Algo deu errado.')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Ex.: Carro novo')).toHaveValue('Casa')
  })
})

describe('Metas — editar e remover', () => {
  it('tocar no nome abre a edição; salvar chama a API; "Remover meta" pede confirmação', async () => {
    renderGoals()
    fireEvent.click(await screen.findByRole('button', { name: /editar meta reserva de emergência/i }))
    expect(await screen.findByText('Editar meta')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(goalsAPI.update).toHaveBeenCalledWith('g1', expect.objectContaining({ title: 'Reserva de emergência' })))

    fireEvent.click(await screen.findByRole('button', { name: /editar meta reserva de emergência/i }))
    fireEvent.click(await screen.findByRole('button', { name: 'Remover meta' }))
    expect(goalsAPI.remove).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: /sim, excluir/i }))
    await waitFor(() => expect(goalsAPI.remove).toHaveBeenCalledWith('g1'))
  })
})

describe('Metas — atalhos do cabeçalho (antigas abas)', () => {
  it('"Histórico", "Assinaturas" e "Lembretes" abrem as telas próprias (não trocam o conteúdo)', async () => {
    setUser('elite')
    goalsAPI.list.mockResolvedValue({ data: [goal()] })
    render(
      <MemoryRouter initialEntries={['/goals']}>
        <Routes>
          <Route path="/goals" element={<Goals />} />
          <Route path="/historico" element={<div>tela Histórico</div>} />
          <Route path="/assinaturas" element={<div>tela Assinaturas</div>} />
          <Route path="/lembretes" element={<div>tela Lembretes</div>} />
        </Routes>
      </MemoryRouter>
    )
    await screen.findByText('Reserva de emergência')
    fireEvent.click(screen.getByRole('button', { name: /Assinaturas/ }))
    expect(await screen.findByText('tela Assinaturas')).toBeInTheDocument()
  })

  it('"Lembretes" abre a tela própria', async () => {
    setUser('elite')
    goalsAPI.list.mockResolvedValue({ data: [goal()] })
    render(
      <MemoryRouter initialEntries={['/goals']}>
        <Routes>
          <Route path="/goals" element={<Goals />} />
          <Route path="/lembretes" element={<div>tela Lembretes</div>} />
        </Routes>
      </MemoryRouter>
    )
    await screen.findByText('Reserva de emergência')
    fireEvent.click(screen.getByRole('button', { name: /Lembretes/ }))
    expect(await screen.findByText('tela Lembretes')).toBeInTheDocument()
  })

  it('"Limites" abre a tela própria', async () => {
    setUser('pro')
    goalsAPI.list.mockResolvedValue({ data: [goal()] })
    render(
      <MemoryRouter initialEntries={['/goals']}>
        <Routes>
          <Route path="/goals" element={<Goals />} />
          <Route path="/limites" element={<div>tela Limites</div>} />
        </Routes>
      </MemoryRouter>
    )
    await screen.findByText('Reserva de emergência')
    fireEvent.click(screen.getByRole('button', { name: /Limites/ }))
    expect(await screen.findByText('tela Limites')).toBeInTheDocument()
  })
})
