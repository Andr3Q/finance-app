import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SalaryCard from '../components/features/settings/SalaryCard.jsx'

vi.mock('../services/api.js', () => ({
  budgetAPI: { updateSalary: vi.fn() },
}))
vi.mock('../services/cache.js', () => ({ invalidateCache: vi.fn() }))

import { budgetAPI } from '../services/api.js'

const setup = (user = { id: 'u1', salary: 5000 }) => {
  const onMessage = vi.fn()
  render(<SalaryCard user={user} onMessage={onMessage} />)
  return { onMessage, input: screen.getByRole('textbox') }
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  sessionStorage.setItem('user', JSON.stringify({ id: 'u1' }))
})

describe('SalaryCard — Salário mensal', () => {
  it('já vem com o salário cadastrado', () => {
    const { input } = setup({ id: 'u1', salary: 5000 })
    expect(input.value).toBe('5.000,00')
  })

  it('salvar o valor mostrado manda o salário e avisa que deu certo', async () => {
    budgetAPI.updateSalary.mockResolvedValue({ data: { salary: 5000 } })
    const { onMessage } = setup({ id: 'u1', salary: 5000 })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(budgetAPI.updateSalary).toHaveBeenCalledWith(5000))
    await waitFor(() => expect(onMessage).toHaveBeenCalledWith('Salário atualizado com sucesso!'))
  })

  it('campo vazio NÃO salva: não chama a API (antes zerava o salário) e explica o motivo', () => {
    const { onMessage } = setup({ id: 'u1' })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(budgetAPI.updateSalary).not.toHaveBeenCalled()
    expect(onMessage).toHaveBeenCalledWith('Informe o valor do salário para salvar.', 'error')
  })

  it('apagar o valor e salvar também não zera o salário', async () => {
    const { onMessage, input } = setup({ id: 'u1', salary: 5000 })
    await userEvent.clear(input)
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(budgetAPI.updateSalary).not.toHaveBeenCalled()
    expect(onMessage).toHaveBeenCalledWith('Informe o valor do salário para salvar.', 'error')
  })

  it('digitar um novo valor e salvar manda o novo valor', async () => {
    budgetAPI.updateSalary.mockResolvedValue({ data: { salary: 6200 } })
    setup({ id: 'u1', salary: 5000 })
    const input = screen.getByRole('textbox')
    await userEvent.clear(input)
    await userEvent.type(input, '6200')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(budgetAPI.updateSalary).toHaveBeenCalledWith(6200))
  })
})
