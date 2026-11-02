import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Transactions from '../pages/Transactions.jsx'

vi.mock('../services/api.js', () => ({
  transactionsAPI: { list: vi.fn(), remove: vi.fn(), importCSV: vi.fn(), monthlyRecap: vi.fn() },
  installmentsAPI: { list: vi.fn(), create: vi.fn(), pay: vi.fn(), unpay: vi.fn(), remove: vi.fn() },
}))
vi.mock('../services/cache.js', () => ({ getCache: vi.fn(() => null), setCache: vi.fn(), invalidateCache: vi.fn() }))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))
vi.mock('../components/features/TransactionForm.jsx', () => ({
  default: ({ initialData, editingId }) => (
    <div role="dialog" aria-label="formulário">{editingId ? `editando ${initialData.description}` : 'nova transação'}</div>
  ),
}))

import { transactionsAPI, installmentsAPI } from '../services/api.js'

const now = new Date()
const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const otherDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() === 1 ? 2 : 1, 12)
const dd = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`

const tx = (over = {}) => ({
  id: 'tx-1', description: 'Almoço', amount: 100, type: 'expense', category: 'food',
  date: now.toISOString(), month: now.getMonth() + 1, year: now.getFullYear(), archived: false, ...over,
})
const txs = [
  tx({ id: 'a', description: 'Academia', amount: 200, category: 'fixed' }),
  tx({ id: 'b', description: 'Roupa', amount: 350, category: 'shopping' }),
  tx({ id: 'c', description: 'Dividendos', amount: 1800, type: 'income', category: 'income', date: otherDay.toISOString() }),
]
const recap = { hasData: true, saved: 9500, salary: 6000, totalIncome: 10800, totalExpenses: 7300, unpaidFixedCosts: 0 }

const setDesktop = (is) => { window.matchMedia = vi.fn(() => ({ matches: is, addEventListener() {}, removeEventListener() {} })) }

function setup({ list = txs, recapRes = recap, entry = '/transactions' } = {}) {
  transactionsAPI.list.mockResolvedValue({ data: { data: list } })
  installmentsAPI.list.mockResolvedValue({ data: [] })
  transactionsAPI.monthlyRecap.mockResolvedValue({ data: recapRes })
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/contas-do-mes" element={<div>Página Contas do mês</div>} />
        <Route path="/parcelados" element={<div>Página Parceladas</div>} />
        <Route path="/analise" element={<div>Página Análise</div>} />
        <Route path="/settings/fechamento" element={<div>Página Balanço mensal</div>} />
      </Routes>
    </MemoryRouter>
  )
}
const rows = () => [...document.querySelectorAll('.ndx-row')]
const names = () => rows().map(r => r.querySelector('.ndh-row-desc').textContent)

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
  setDesktop(true)
})
afterEach(() => { delete window.matchMedia })

describe('Extrato no desktop (design "Nancy Desktop", tela 10)', () => {
  it('abas do assunto, pílulas, busca e tabela com as cinco colunas do design', async () => {
    setup()
    await screen.findByText('Academia')
    const tabs = within(screen.getByRole('navigation', { name: 'Seções do extrato' })).getAllByRole('button')
    expect(tabs.map(t => t.textContent)).toEqual(['Extrato', 'Contas do mês', 'Parceladas', 'Análise'])
    expect(tabs[0]).toHaveAttribute('aria-current', 'page')
    expect(tabs[0]).toHaveClass('on')
    expect([...document.querySelectorAll('.ndx-pill')].map(p => p.textContent)).toEqual(['Todos', 'Entradas', 'Saídas'])
    expect(document.querySelector('.ndx-pill.on')).toHaveTextContent('Todos')
    expect(screen.getByPlaceholderText('Filtrar por descrição')).toBeInTheDocument()
    expect([...document.querySelectorAll('.ndx-thead span')].map(s => s.textContent).filter(Boolean)).toEqual(['DESCRIÇÃO', 'CATEGORIA', 'DATA', 'VALOR'])
    expect(document.querySelector('.ndx-thead')).toHaveAttribute('aria-hidden', 'true')
  })

  it('linhas: descrição, categoria, data dd/mm e valor com sinal ("− R$ 200,00" / "+ R$ 1.800,00")', async () => {
    setup()
    await screen.findByText('Academia')
    const academia = rows().find(r => r.textContent.includes('Academia'))
    expect(academia.querySelector('.ndh-row-cat')).toHaveTextContent('Contas fixas')
    expect(academia.querySelector('.ndh-row-date')).toHaveTextContent(dd(now))
    expect(academia.querySelector('.ndh-row-amt')).toHaveTextContent('− R$ 200,00')
    const div = rows().find(r => r.textContent.includes('Dividendos'))
    expect(div.querySelector('.ndh-row-amt')).toHaveTextContent('+ R$ 1.800,00')
    expect(div.querySelector('.ndh-row-amt')).toHaveClass('inc')
    expect(div.querySelector('.ndh-row-ico')).toHaveClass('inc')
    expect(div.querySelector('.ndh-row-date')).toHaveTextContent(dd(otherDay))
  })

  it('as abas levam às outras telas do assunto; a aba da tela aberta não navega', async () => {
    setup()
    await screen.findByText('Academia')
    await userEvent.click(screen.getByRole('button', { name: 'Extrato' })) // já está nela
    expect(screen.queryByText('Página Contas do mês')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Contas do mês' }))
    expect(await screen.findByText('Página Contas do mês')).toBeInTheDocument()
  })

  it('pílulas Entradas e Saídas filtram; Todos volta', async () => {
    setup()
    await screen.findByText('Academia')
    await userEvent.click(screen.getByRole('button', { name: 'Entradas' }))
    expect(names()).toEqual(['Dividendos'])
    await userEvent.click(screen.getByRole('button', { name: 'Saídas' }))
    expect(names().sort()).toEqual(['Academia', 'Roupa'])
    await userEvent.click(screen.getByRole('button', { name: 'Todos' }))
    expect(names()).toHaveLength(3)
  })

  it('"Filtrar por descrição" filtra pelo texto (e pela categoria); sem resultado, a frase do design', async () => {
    setup()
    await screen.findByText('Academia')
    await userEvent.type(screen.getByPlaceholderText('Filtrar por descrição'), 'rou')
    expect(names()).toEqual(['Roupa'])
    await userEvent.clear(screen.getByPlaceholderText('Filtrar por descrição'))
    await userEvent.type(screen.getByPlaceholderText('Filtrar por descrição'), 'contas fixas')
    expect(names()).toEqual(['Academia'])
    await userEvent.clear(screen.getByPlaceholderText('Filtrar por descrição'))
    await userEvent.type(screen.getByPlaceholderText('Filtrar por descrição'), 'zzzz')
    expect(rows()).toHaveLength(0)
    expect(screen.getByText('Nada encontrado com esse filtro.')).toBeInTheDocument()
  })

  it('a busca da barra de cima chega preenchida no filtro', async () => {
    setup({ entry: { pathname: '/transactions', state: { search: 'acad' } } })
    await screen.findByText('Academia')
    expect(screen.getByPlaceholderText('Filtrar por descrição')).toHaveValue('acad')
    expect(names()).toEqual(['Academia'])
  })

  it('clicar na linha abre a edição daquela transação', async () => {
    setup()
    await userEvent.click(await screen.findByText('Roupa'))
    expect(await screen.findByRole('dialog', { name: 'formulário' })).toHaveTextContent('editando Roupa')
  })

  it('remover pede confirmação e só então apaga (a linha some na hora)', async () => {
    setup()
    // depois de apagar, o servidor devolve a lista sem a transação (a tela recarrega ao final)
    transactionsAPI.remove.mockImplementation(async () => { transactionsAPI.list.mockResolvedValue({ data: { data: txs.filter(t => t.id !== 'b') } }) })
    await screen.findByText('Roupa')
    const linha = rows().find(r => r.textContent.includes('Roupa'))
    await userEvent.click(within(linha).getByRole('button', { name: 'Remover transação' }))
    expect(screen.getByRole('dialog', { name: /Remover transação/ })).toBeInTheDocument()
    expect(transactionsAPI.remove).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /Sim, excluir/ }))
    expect(transactionsAPI.remove).toHaveBeenCalledWith('b')
    await waitFor(() => expect(names()).not.toContain('Roupa'))
  })

  it('resultado do mês, entradas e saídas ficam ao lado das abas (função do app que o design não desenha)', async () => {
    setup()
    await screen.findByText('Academia')
    const sum = await screen.findByLabelText('Resultado do mês')
    expect(await within(sum).findByText('+R$ 9.500,00')).toHaveClass('pos')
    expect(within(sum).getByText('R$ 16.800,00')).toBeInTheDocument() // salário 6.000 + entradas 10.800
    expect(within(sum).getByText('R$ 7.300,00')).toBeInTheDocument()
    expect(transactionsAPI.monthlyRecap).toHaveBeenCalledWith(0)
    expect(screen.queryByText(/contas fixas a pagar/)).not.toBeInTheDocument()
  })

  it('o aviso "já desconta" das contas fixas a pagar continua aparecendo', async () => {
    setup({ recapRes: { ...recap, unpaidFixedCosts: 247 } })
    expect(await screen.findByText('Já desconta R$ 247,00 de contas fixas a pagar.')).toBeInTheDocument()
  })

  it('troca de mês: voltar busca o mês anterior, o mês atual não avança e a janela é de 12 meses', async () => {
    setup()
    await screen.findByText('Academia')
    expect(screen.getByText(MONTHS_PT[now.getMonth()])).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Próximo mês' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }))
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    await waitFor(() => expect(transactionsAPI.list).toHaveBeenLastCalledWith({ month: prev.getMonth() + 1, year: prev.getFullYear(), limit: 200 }))
    expect(await screen.findByText(`${MONTHS_PT[prev.getMonth()]}${prev.getFullYear() !== now.getFullYear() ? ` de ${prev.getFullYear()}` : ''}`)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Próximo mês' })).toBeEnabled()
    for (let i = 0; i < 10; i++) await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }))
    expect(screen.getByRole('button', { name: 'Mês anterior' })).toBeDisabled() // 11 meses atrás é o limite
  })

  it('"ocultar valores" esconde os reais da tabela e do resultado', async () => {
    localStorage.setItem('hide-balance', '1')
    setup()
    await screen.findByText('Academia')
    expect(rows().every(r => r.querySelector('.ndh-row-amt').textContent === 'R$ ••••')).toBe(true)
    expect(document.body.textContent).not.toMatch(/9\.500|16\.800|1\.800/)
  })

  it('mês sem lançamentos e mês fechado explicam o que houve (com link para os relatórios)', async () => {
    const { unmount } = setup({ list: [], recapRes: { hasData: false } })
    expect(await screen.findByText('Nenhuma transação encontrada')).toBeInTheDocument() // sem filtro e sem recap, o texto genérico do app
    unmount()
    setup({ list: [], recapRes: recap })
    expect(await screen.findByText('Mês fechado')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ver relatórios' }))
    expect(await screen.findByText('Página Balanço mensal')).toBeInTheDocument()
  })

  it('Importar e Exportar CSV continuam disponíveis; exportar fica desligado sem linhas', async () => {
    const { unmount } = setup()
    await screen.findByText('Academia')
    expect(screen.getByRole('button', { name: /Importar CSV/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Exportar CSV/ })).toBeEnabled()
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    fireEvent.click(screen.getByRole('button', { name: /Importar CSV/ }))
    expect(click).toHaveBeenCalled() // abre o seletor de arquivo
    click.mockRestore()
    unmount()
    setup({ list: [] })
    await screen.findByText(/Nenhuma transação|Mês fechado/)
    expect(screen.getByRole('button', { name: /Exportar CSV/ })).toBeDisabled()
  })
})

describe('Extrato — celular continua o mesmo', () => {
  it('abaixo de 901px a árvore é a do celular (cabeçalho azul, sem abas nem tabela do desktop)', async () => {
    setDesktop(false)
    setup()
    await screen.findByText('Academia')
    expect(document.querySelector('.ex-hero')).not.toBeNull()
    expect(document.querySelector('.ndx-card')).toBeNull()
    expect(document.querySelector('.nds-tabs')).toBeNull()
  })
})
