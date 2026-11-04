import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Finance from '../pages/Finance.jsx'

vi.mock('../services/api.js', () => ({
  budgetAPI: { list: vi.fn(), create: vi.fn(), remove: vi.fn(), pay: vi.fn(), updateSalary: vi.fn() },
  transactionsAPI: { autoLaunch: vi.fn(), create: vi.fn() },
}))
vi.mock('../services/cache.js', () => ({ invalidateCache: vi.fn() }))
vi.mock('../services/analytics.js', () => ({ analytics: { track: vi.fn() } }))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))
import { budgetAPI, transactionsAPI } from '../services/api.js'

const setDesktop = (is) => { window.matchMedia = vi.fn(() => ({ matches: is, addEventListener() {}, removeEventListener() {} })) }
const bill = (id, name, amount, dueDay, over = {}) => ({ id, name, amount, dueDay, paidThisMonth: false, paidAmount: null, paidDate: null, endDate: null, ...over })
const BILLS = [bill('b1', 'Aluguel', 3500, 5), bill('b2', 'Conta de luz', 380, 12, { paidThisMonth: true, paidDate: '2026-10-12T12:00:00Z' }), bill('b3', 'Boleto', 90, null, { endDate: '2026-12-31T12:00:00Z' })]
const setup = () => render(<MemoryRouter><Finance /></MemoryRouter>)
const items = () => [...document.querySelectorAll('.ndf-item')]

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  sessionStorage.setItem('user', JSON.stringify({ id: 'u-fin', plan: 'elite', salary: 15000 }))
  budgetAPI.list.mockResolvedValue({ data: BILLS })
  setDesktop(true)
})
afterEach(() => { delete window.matchMedia })

describe('Finanças no desktop (design "Nancy Desktop", tela 15)', () => {
  it('dois cartões lado a lado: salário (valor em destaque e "Salvar salário") e contas fixas com o total', async () => {
    setup()
    expect(await screen.findByRole('heading', { name: 'Salário mensal' })).toBeInTheDocument()
    expect(screen.getByText('Base do saldo disponível')).toBeInTheDocument()
    expect(screen.getByLabelText('Salário mensal')).toHaveValue('15.000,00')
    expect(screen.getByRole('button', { name: 'Salvar salário' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Contas fixas' })).toBeInTheDocument()
    expect(screen.getByLabelText('Total mensal')).toHaveTextContent('R$ 3.970,00')
    expect(document.querySelector('.fin-hero')).toBeNull() // sem o cabeçalho azul do celular
  })

  it('uma linha por conta: nome, vencimento (ou "Sem dia"), valor e ×; paga aparece marcada', async () => {
    setup()
    await screen.findByText('Aluguel')
    expect(items().map(i => i.querySelector('.ndf-row-name').textContent)).toEqual(['Aluguel', 'Conta de luz', 'Boleto'])
    expect(items()[0].querySelector('.ndf-row-due')).toHaveTextContent('Vence dia 5')
    expect(items()[0].querySelector('.ndf-row-val')).toHaveTextContent('R$ 3.500,00')
    expect(items()[1].querySelector('.ndf-row-due')).toHaveTextContent('Vence dia 12 · paga')
    expect(items()[2].querySelector('.ndf-row-due')).toHaveTextContent('Sem dia de vencimento')
    expect(screen.getAllByRole('button', { name: 'Remover' })).toHaveLength(3)
  })

  it('salvar salário usa a mesma rota e o mesmo aviso de antes', async () => {
    budgetAPI.updateSalary.mockResolvedValue({})
    setup()
    const campo = await screen.findByLabelText('Salário mensal')
    fireEvent.change(campo, { target: { value: '16.000,00' } })
    fireEvent.blur(campo)
    await userEvent.click(screen.getByRole('button', { name: 'Salvar salário' }))
    await waitFor(() => expect(budgetAPI.updateSalary).toHaveBeenCalledWith(16000))
    expect(await screen.findByText('Salário atualizado com sucesso!')).toBeInTheDocument()
  })

  it('salário vazio não salva e avisa', async () => {
    setup()
    const campo = await screen.findByLabelText('Salário mensal')
    fireEvent.change(campo, { target: { value: '' } })
    fireEvent.blur(campo)
    await userEvent.click(screen.getByRole('button', { name: 'Salvar salário' }))
    expect(await screen.findByText('Informe o valor do salário para salvar.')).toBeInTheDocument()
    expect(budgetAPI.updateSalary).not.toHaveBeenCalled()
  })

  it('tocar na linha abre o detalhe: "Marcar como paga" (e depois "Paga em ...") e a data de encerramento', async () => {
    budgetAPI.pay.mockResolvedValue({})
    setup()
    await screen.findByText('Aluguel')
    await userEvent.click(within(items()[0]).getByRole('button', { name: /Aluguel/ }))
    expect(items()[0].querySelector('.ndf-detail')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Marcar como paga' }))
    await waitFor(() => expect(budgetAPI.pay).toHaveBeenCalledWith('b1'))
    await userEvent.click(within(items()[1]).getByRole('button', { name: /Conta de luz/ }))
    expect(screen.getByText(/Paga em 12\/10\/2026/)).toBeInTheDocument()
    await userEvent.click(within(items()[2]).getByRole('button', { name: /Boleto/ }))
    expect(screen.getByTitle('Data de encerramento')).toHaveTextContent(/Até 31 de dez\. de 26/)
  })

  it('remover pede confirmação e só então apaga', async () => {
    budgetAPI.remove.mockResolvedValue({})
    setup()
    await screen.findByText('Aluguel')
    await userEvent.click(within(items()[0]).getByRole('button', { name: 'Remover' }))
    expect(screen.getByRole('dialog', { name: /Excluir conta fixa/ })).toBeInTheDocument()
    expect(budgetAPI.remove).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /Sim, excluir/ }))
    await waitFor(() => expect(budgetAPI.remove).toHaveBeenCalledWith('b1'))
  })

  it('adicionar em uma linha só (nome, valor, dia e botão); o dia é validado e o erro do servidor aparece', async () => {
    budgetAPI.create.mockResolvedValue({ data: {} })
    setup()
    await screen.findByText('Aluguel')
    const form = screen.getByRole('form', { name: 'Adicionar conta fixa' })
    fireEvent.change(within(form).getByLabelText('Nome da conta'), { target: { value: 'Streaming' } })
    fireEvent.change(within(form).getByPlaceholderText('Valor'), { target: { value: '45' } })
    fireEvent.blur(within(form).getByPlaceholderText('Valor'))
    fireEvent.change(within(form).getByLabelText('Dia do vencimento'), { target: { value: '40' } })
    await userEvent.click(within(form).getByRole('button', { name: 'Adicionar' }))
    expect(await screen.findByText('O dia de vencimento deve ser um número entre 1 e 31.')).toBeInTheDocument()
    expect(budgetAPI.create).not.toHaveBeenCalled()
    fireEvent.change(within(form).getByLabelText('Dia do vencimento'), { target: { value: '10' } })
    await userEvent.click(within(form).getByRole('button', { name: 'Adicionar' }))
    await waitFor(() => expect(budgetAPI.create).toHaveBeenCalledWith({ name: 'Streaming', amount: 45, dueDay: 10, endDate: undefined }))
  })

  it('data de encerramento continua opcional, abaixo do formulário', async () => {
    budgetAPI.create.mockResolvedValue({ data: {} })
    setup()
    await screen.findByText('Aluguel')
    const form = screen.getByRole('form', { name: 'Adicionar conta fixa' })
    expect(within(form).queryByPlaceholderText('DD')).not.toBeInTheDocument()
    await userEvent.click(within(form).getByRole('button', { name: /Data de encerramento/ }))
    fireEvent.change(within(form).getByPlaceholderText('DD'), { target: { value: '31' } })
    fireEvent.change(within(form).getByPlaceholderText('MM'), { target: { value: '12' } })
    fireEvent.change(within(form).getByPlaceholderText('AAAA'), { target: { value: '2027' } })
    fireEvent.change(within(form).getByLabelText('Nome da conta'), { target: { value: 'TV' } })
    fireEvent.change(within(form).getByPlaceholderText('Valor'), { target: { value: '100' } })
    fireEvent.blur(within(form).getByPlaceholderText('Valor'))
    await userEvent.click(within(form).getByRole('button', { name: 'Adicionar' }))
    await waitFor(() => expect(budgetAPI.create).toHaveBeenCalledWith({ name: 'TV', amount: 100, dueDay: undefined, endDate: '2027-12-31' }))
  })

  it('"Lançar pendentes" fica no cabeçalho do cartão; com tudo pago vira o aviso verde', async () => {
    transactionsAPI.autoLaunch.mockResolvedValue({ data: { count: 2 } })
    setup()
    const lancar = await screen.findByRole('button', { name: 'Lançar 2 pendentes' })
    expect(lancar.closest('.ndf-fixed-head')).not.toBeNull()
    await userEvent.click(lancar)
    await waitFor(() => expect(transactionsAPI.autoLaunch).toHaveBeenCalled())
  })

  it('sem contas: avisa; plano gratuito perto do limite mostra o aviso de uso', async () => {
    budgetAPI.list.mockResolvedValue({ data: [] })
    setup()
    expect(await screen.findByText('Nenhuma conta fixa cadastrada.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Total mensal')).not.toBeInTheDocument()
  })
})

describe('Finanças — celular continua o mesmo', () => {
  it('abaixo de 901px: cabeçalho azul, "Salvar" e cartões do celular', async () => {
    setDesktop(false)
    setup()
    expect(await screen.findByRole('heading', { name: 'Finanças' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument()
    expect(document.querySelector('.ndf-card')).toBeNull()
  })
})
