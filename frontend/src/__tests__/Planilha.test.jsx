import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Planilha from '../pages/Planilha.jsx'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importActual) => ({ ...(await importActual()), useNavigate: () => mockNavigate }))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))
vi.mock('../services/api.js', () => ({
  sheetAPI: { get: vi.fn(), export: vi.fn() },
  budgetAPI: { updateSalary: vi.fn(), update: vi.fn(), create: vi.fn() },
}))
vi.mock('../services/cache.js', () => ({ getCache: vi.fn(() => null), setCache: vi.fn(), invalidateCache: vi.fn() }))
vi.mock('../services/storiesData.js', () => ({ invalidateStories: vi.fn(), peekStory: vi.fn(), loadStory: vi.fn() }))

import { sheetAPI, budgetAPI } from '../services/api.js'
import { invalidateCache } from '../services/cache.js'

const m = (label, kind, month) => ({ label, key: `2026-${month}`, kind, month, year: 2026 })
const row = (id, label, values, edit) => ({ id, label, values, ...(edit ? { edit } : {}) })
const sum = (rows) => [0, 1, 2, 3, 4].map(c => rows.reduce((s, r) => s + (r.values[c] || 0), 0))

function sheetData(over = {}) {
  const income = [row('salary', 'Salário', [15000, 15000, 15000, 15000, 15000], { kind: 'salary' }), row('income:freela', 'Freelance', [1200, 0, 1800, 1000, 1000])]
  const fixed = [row('budget:b1', 'Aluguel', [null, null, 3500, 3500, 3500], { kind: 'budget', id: 'b1' }), row('budget:b2', 'Conta de luz', [342, 365, 380.5, 380.5, 380.5], { kind: 'budget', id: 'b2' })]
  const inst = [row('installment:i1', 'Notebook (3/10)', [null, 600, 600, 600, 600])]
  const vari = [row('category:food', 'Alimentação', [1320, 1410, 1165, 1298.33, 1298.33])]
  const sections = [
    { id: 'income', label: 'Receitas', rows: income, total: sum(income) },
    { id: 'fixed', label: 'Contas fixas', rows: fixed, total: sum(fixed) },
    { id: 'installments', label: 'Parcelas', rows: inst, total: sum(inst) },
    { id: 'variable', label: 'Variáveis', rows: vari, total: sum(vari) },
  ]
  const net = [0, 1, 2, 3, 4].map(c => sections[0].total[c] - sections[1].total[c] - sections[2].total[c] - sections[3].total[c])
  return {
    months: [m('AGO', 'past', 8), m('SET', 'past', 9), m('OUT', 'current', 10), m('NOV', 'forecast', 11), m('DEZ', 'forecast', 12)],
    sections, net,
    feed: [{ kind: 'income', text: 'Freelance de R$ 1.800 → coluna de outubro atualizada', at: '2026-10-20T21:59:00Z' }, { kind: 'installment', text: 'Parcela 6/8 da Geladeira registrada', at: '2026-10-20T20:30:00Z' }],
    generatedAt: '2026-10-20T21:59:40Z',
    ...over,
  }
}

const setup = () => render(<MemoryRouter><Planilha /></MemoryRouter>)
const ready = () => screen.findByRole('table', { name: 'Planilha de contas por mês' })
const cells = (rowEl) => [...rowEl.children].map(c => c.querySelector('input')?.value ?? c.textContent)
const itemRow = (label) => [...document.querySelectorAll('.ndp-item')].find(r => r.querySelector('.ndp-name').textContent.startsWith(label))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-20T22:00:00Z'))
  vi.clearAllMocks()
  localStorage.clear()
  sheetAPI.get.mockResolvedValue({ data: sheetData() })
})
afterEach(() => { vi.useRealTimers() })

describe('Planilha IA (design "Nancy Desktop", tela 12) — tabela', () => {
  it('cabeçalho com os três meses reais e os dois de previsão; seções na ordem do design', async () => {
    setup()
    await ready()
    expect([...document.querySelectorAll('.ndp-head [role=columnheader]')].map(c => c.textContent)).toEqual(['CONTA', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'])
    expect(document.querySelector('.ndp-th.current')).toHaveTextContent('OUT')
    expect([...document.querySelectorAll('.ndp-th.forecast')].map(c => c.textContent)).toEqual(['NOV', 'DEZ'])
    expect([...document.querySelectorAll('.ndp-sec [role=rowheader]')].map(c => c.textContent)).toEqual(['Receitas', 'Contas fixas', 'Parcelas', 'Variáveis'])
    expect(screen.getByText('Saldo do mês')).toBeInTheDocument()
  })

  it('valores em reais inteiros com ponto de milhar; vazio vira "–"; mês atual em número cru; totais por seção', async () => {
    setup()
    await ready()
    expect(cells(itemRow('Salário'))).toEqual(['Salário', '15.000', '15.000', '15000', '15.000', '15.000'])
    expect(cells(itemRow('Freelance'))).toEqual(['Freelance', '1.200', '0', '1800', '1.000', '1.000'])
    expect(cells(itemRow('Aluguel'))).toEqual(['Aluguel', '–', '–', '3500', '3.500', '3.500'])
    expect(cells(itemRow('Conta de luz'))).toEqual(['Conta de luz', '342', '365', '380,50', '381', '381']) // centavos de verdade no campo; inteiro na previsão
    expect(cells(document.querySelector('.ndp-sec'))).toEqual(['Receitas', '16.200', '15.000', '16.800', '16.000', '16.000'])
    expect(cells(document.querySelector('.ndp-net'))[0]).toBe('Saldo do mês')
  })

  it('saldo negativo usa o sinal de menos', async () => {
    sheetAPI.get.mockResolvedValue({ data: sheetData({ net: [-1500, 200, 300, 400, 500] }) })
    setup()
    await ready()
    expect(cells(document.querySelector('.ndp-net')).slice(1, 3)).toEqual(['−1.500', '200'])
  })

  it('selo de sincronia, "Como a Nancy monta" com o que mudou e a idade de cada aviso', async () => {
    setup()
    await ready()
    expect(screen.getByText(/Sincronizada com suas contas · atualizada agora/)).toBeInTheDocument()
    const items = [...document.querySelectorAll('.ndp-feed li')]
    expect(items.map(li => li.querySelector('span').textContent)).toEqual(['Freelance de R$ 1.800 → coluna de outubro atualizada', 'Parcela 6/8 da Geladeira registrada'])
    expect(items.map(li => li.querySelector('small').textContent)).toEqual(['há 1 min', 'há 1 h'])
    expect(items[0]).toHaveClass('new')
    expect(items[1]).not.toHaveClass('new')
  })

  it('sem nada que mudou, explica o que vai aparecer', async () => {
    sheetAPI.get.mockResolvedValue({ data: sheetData({ feed: [] }) })
    setup()
    await ready()
    expect(screen.getByText(/Quando você registrar contas, parcelas ou entradas/)).toBeInTheDocument()
  })

  it('"ocultar valores" esconde os números e trava a edição', async () => {
    localStorage.setItem('hide-balance', '1')
    setup()
    await ready()
    expect(cells(itemRow('Salário'))).toEqual(['Salário', '••••', '••••', '••••', '••••', '••••'])
    expect(document.body.textContent).not.toMatch(/15\.000|3\.500/)
    expect(itemRow('Salário').querySelector('input')).toHaveAttribute('readonly')
  })
})

describe('Planilha IA — previsão', () => {
  it('o interruptor tira as colunas de previsão (grade de 3 colunas) e lembra a escolha', async () => {
    const { unmount } = setup()
    await ready()
    const sw = screen.getByRole('switch', { name: 'Previsão da IA' })
    expect(sw).toHaveAttribute('aria-checked', 'true')
    expect(itemRow('Salário').style.gridTemplateColumns).toContain('repeat(5')
    fireEvent.click(sw)
    expect(sw).toHaveAttribute('aria-checked', 'false')
    expect([...document.querySelectorAll('.ndp-head [role=columnheader]')].map(c => c.textContent)).toEqual(['CONTA', 'AGO', 'SET', 'OUT'])
    expect(itemRow('Salário').style.gridTemplateColumns).toContain('repeat(3')
    expect(localStorage.getItem('nancy-sheet-forecast')).toBe('0')
    unmount()
    setup()
    await ready()
    expect(screen.getByRole('switch', { name: 'Previsão da IA' })).toHaveAttribute('aria-checked', 'false') // voltou como estava
  })
})

describe('Planilha IA — editar o mês atual', () => {
  it('só salário e contas fixas são editáveis; o resto vem dos lançamentos e só se lê', async () => {
    setup()
    await ready()
    const ro = (label) => itemRow(label).querySelector('input').hasAttribute('readonly')
    expect([ro('Salário'), ro('Aluguel'), ro('Conta de luz')]).toEqual([false, false, false])
    expect([ro('Freelance'), ro('Notebook'), ro('Alimentação')]).toEqual([true, true, true])
  })

  it('salário editado vai para a API do salário, recarrega a planilha e avisa os outros (caches)', async () => {
    budgetAPI.updateSalary.mockResolvedValue({})
    setup()
    await ready()
    const input = itemRow('Salário').querySelector('input')
    fireEvent.change(input, { target: { value: '16000' } })
    fireEvent.blur(input)
    await waitFor(() => expect(budgetAPI.updateSalary).toHaveBeenCalledWith(16000))
    await waitFor(() => expect(sheetAPI.get).toHaveBeenCalledTimes(2))
    expect(invalidateCache).toHaveBeenCalledWith('dashboard')
  })

  it('conta fixa editada atualiza o valor da conta (aceita vírgula e ponto de milhar)', async () => {
    budgetAPI.update.mockResolvedValue({})
    setup()
    await ready()
    const input = itemRow('Aluguel').querySelector('input')
    fireEvent.change(input, { target: { value: '3.650,50' } })
    fireEvent.blur(input)
    await waitFor(() => expect(budgetAPI.update).toHaveBeenCalledWith('b1', { amount: 3650.5 }))
  })

  it('ponto com uma ou duas casas é decimal ("15.5"); sem mudança de valor não chama a API', async () => {
    budgetAPI.update.mockResolvedValue({})
    setup()
    await ready()
    const input = itemRow('Aluguel').querySelector('input')
    fireEvent.change(input, { target: { value: '3500' } })
    fireEvent.blur(input)
    expect(budgetAPI.update).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: '15.5' } })
    fireEvent.blur(input)
    await waitFor(() => expect(budgetAPI.update).toHaveBeenCalledWith('b1', { amount: 15.5 }))
  })

  it('valor inválido (zero numa conta, texto, negativo) avisa e não chama a API; o campo volta ao valor anterior', async () => {
    setup()
    await ready()
    for (const bad of ['0', 'abc', '-5', '']) {
      const input = itemRow('Aluguel').querySelector('input')
      fireEvent.change(input, { target: { value: bad } })
      fireEvent.blur(input)
      expect(await screen.findByText('Informe um valor maior que zero.')).toBeInTheDocument()
    }
    expect(budgetAPI.update).not.toHaveBeenCalled()
    await waitFor(() => expect(itemRow('Aluguel').querySelector('input').value).toBe('3500'))
  })

  it('erro do servidor aparece e nada muda na tela', async () => {
    budgetAPI.update.mockRejectedValue({ response: { data: { error: 'Valor excede o limite permitido.' } } })
    setup()
    await ready()
    const input = itemRow('Aluguel').querySelector('input')
    fireEvent.change(input, { target: { value: '99999' } })
    fireEvent.blur(input)
    expect(await screen.findByText('Valor excede o limite permitido.')).toBeInTheDocument()
    expect(sheetAPI.get).toHaveBeenCalledTimes(1)
  })

  it('Enter confirma (tira o foco) e Esc desfaz o que foi digitado', async () => {
    budgetAPI.update.mockResolvedValue({})
    setup()
    await ready()
    const input = itemRow('Aluguel').querySelector('input')
    input.focus()
    fireEvent.change(input, { target: { value: '4000' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input.value).toBe('3500')
    expect(budgetAPI.update).not.toHaveBeenCalled()
  })
})

describe('Planilha IA — adicionar conta fixa', () => {
  const fill = (name, val) => {
    fireEvent.change(screen.getByLabelText('Nome da conta fixa'), { target: { value: name } })
    fireEvent.change(screen.getByLabelText('Valor mensal'), { target: { value: val } })
  }

  it('cria a conta, a nova linha aparece com o selo NOVA e o aviso vai para o topo do "Como a Nancy monta"', async () => {
    budgetAPI.create.mockResolvedValue({ data: { id: 'bnew' } })
    setup()
    await ready()
    const next = sheetData()
    next.sections[1].rows.push(row('budget:bnew', 'Streaming', [null, null, 45, 45, 45], { kind: 'budget', id: 'bnew' }))
    sheetAPI.get.mockResolvedValue({ data: next })
    fill('Streaming', '45')
    await userEvent.click(screen.getByRole('button', { name: /Adicionar e ver na planilha/ }))
    await waitFor(() => expect(budgetAPI.create).toHaveBeenCalledWith({ name: 'Streaming', amount: 45 }))
    await waitFor(() => expect(itemRow('Streaming')).toBeTruthy())
    expect(within(itemRow('Streaming')).getByText('NOVA')).toBeInTheDocument()
    expect(document.querySelector('.ndp-feed li span').textContent).toBe('Streaming adicionada como conta fixa → nova linha em Contas fixas')
    expect(screen.getByLabelText('Nome da conta fixa')).toHaveValue('') // formulário limpo
  })

  it('pede o nome e um valor maior que zero; não chama a API', async () => {
    setup()
    await ready()
    fill('', '45')
    await userEvent.click(screen.getByRole('button', { name: /Adicionar e ver na planilha/ }))
    expect(screen.getByText('Informe o nome da conta.')).toBeInTheDocument()
    fill('TV', 'zero')
    await userEvent.click(screen.getByRole('button', { name: /Adicionar e ver na planilha/ }))
    expect(screen.getByText('Informe um valor maior que zero.')).toBeInTheDocument()
    expect(budgetAPI.create).not.toHaveBeenCalled()
  })

  it('erro do servidor (ex.: limite do plano) aparece sob o botão', async () => {
    budgetAPI.create.mockRejectedValue({ response: { data: { error: 'Limite de contas fixas atingido.' } } })
    setup()
    await ready()
    fill('TV', '90')
    await userEvent.click(screen.getByRole('button', { name: /Adicionar e ver na planilha/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Limite de contas fixas atingido.')
  })
})

describe('Planilha IA — exportar .xlsx', () => {
  it('baixa o arquivo respeitando o interruptor de previsão', async () => {
    const createUrl = vi.fn(() => 'blob:x'), revoke = vi.fn()
    URL.createObjectURL = createUrl; URL.revokeObjectURL = revoke
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    sheetAPI.export.mockResolvedValue({ data: new Blob(['x']) })
    setup()
    await ready()
    await userEvent.click(screen.getByRole('button', { name: /Exportar \.xlsx/ }))
    await waitFor(() => expect(sheetAPI.export).toHaveBeenCalledWith(true))
    expect(click).toHaveBeenCalled()
    expect(revoke).toHaveBeenCalledWith('blob:x')
    fireEvent.click(screen.getByRole('switch', { name: 'Previsão da IA' }))
    await userEvent.click(screen.getByRole('button', { name: /Exportar \.xlsx/ }))
    await waitFor(() => expect(sheetAPI.export).toHaveBeenLastCalledWith(false))
    click.mockRestore()
  })

  it('falha ao exportar avisa', async () => {
    sheetAPI.export.mockRejectedValue(new Error('x'))
    setup()
    await ready()
    await userEvent.click(screen.getByRole('button', { name: /Exportar \.xlsx/ }))
    expect(await screen.findByText('Não foi possível exportar a planilha.')).toBeInTheDocument()
  })
})

describe('Planilha IA — plano e erros', () => {
  it('fora do Elite mostra o convite e leva aos planos', async () => {
    sheetAPI.get.mockRejectedValue({ response: { status: 403, data: { code: 'plan_required', limitReached: true } } })
    setup()
    expect(await screen.findByRole('heading', { name: 'A Planilha IA faz parte do plano Elite' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ver planos' }))
    expect(mockNavigate).toHaveBeenCalledWith('/planos')
  })

  it('falha de rede oferece tentar de novo (e um 403 sem o código do plano não vira convite)', async () => {
    sheetAPI.get.mockRejectedValueOnce({ response: { status: 403, data: { error: 'proibido' } } })
    setup()
    const retry = await screen.findByRole('button', { name: 'Tentar de novo' })
    expect(screen.getByRole('heading', { name: 'Não foi possível montar a planilha' })).toBeInTheDocument()
    await userEvent.click(retry)
    await ready()
    expect(sheetAPI.get).toHaveBeenCalledTimes(2)
  })

  it('a planilha se refaz quando outra tela avisa que os dados mudaram', async () => {
    setup()
    await ready()
    act(() => { window.dispatchEvent(new CustomEvent('budget-updated')) })
    await waitFor(() => expect(sheetAPI.get).toHaveBeenCalledTimes(2))
  })
})
