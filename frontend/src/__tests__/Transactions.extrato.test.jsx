import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom'
import Transactions from '../pages/Transactions.jsx'

vi.mock('../services/api.js', () => ({
  transactionsAPI: { list: vi.fn(), remove: vi.fn(), importCSV: vi.fn(), monthlyRecap: vi.fn() },
  installmentsAPI: { list: vi.fn(), create: vi.fn(), pay: vi.fn(), unpay: vi.fn(), remove: vi.fn() },
}))
vi.mock('../services/cache.js', () => ({ getCache: vi.fn(() => null), setCache: vi.fn(), invalidateCache: vi.fn() }))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))
// O formulário de transação tem testes próprios — aqui só interessa quando e com o quê ele abre.
vi.mock('../components/features/TransactionForm.jsx', () => ({
  default: ({ initialData, editingId }) => (
    <div role="dialog" aria-label="formulário">{editingId ? `editando ${initialData.description}` : 'nova transação'}</div>
  ),
}))

import { transactionsAPI, installmentsAPI } from '../services/api.js'

const now  = new Date()
const MONTHS_PT = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']
// Outro dia do MESMO mês (nunca hoje), pra o teste não atravessar a virada de mês.
const otherDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() === 1 ? 2 : 1, 12)

const tx = (over = {}) => ({
  id: 'tx-1', description: 'Almoço', amount: 100, type: 'expense', category: 'food',
  date: now.toISOString(), month: now.getMonth() + 1, year: now.getFullYear(), archived: false, ...over,
})

const txs = [
  tx({ id: 'a', description: 'Academia', amount: 200, category: 'fixed' }),
  tx({ id: 'b', description: 'Roupa', amount: 350, category: 'shopping' }),
  tx({ id: 'c', description: 'Dividendos', amount: 1800, type: 'income', category: 'income', date: otherDay.toISOString() }),
]
// salário 6.000 + lançamentos de entrada 10.800 = Entradas 16.800; 16.800 − 7.300 = Resultado 9.500 (o cartão fecha)
const recap = { hasData: true, saved: 9500, salary: 6000, totalIncome: 10800, totalExpenses: 7300 }

function setup({ list = txs, recapRes = recap, entry = '/transactions' } = {}) {
  transactionsAPI.list.mockResolvedValue({ data: { data: list } })
  installmentsAPI.list.mockResolvedValue({ data: [] })
  if (recapRes instanceof Error) transactionsAPI.monthlyRecap.mockRejectedValue(recapRes)
  else transactionsAPI.monthlyRecap.mockResolvedValue({ data: recapRes })
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/contas-do-mes" element={<div>Página Contas do mês</div>} />
        <Route path="/parcelados" element={<div>Página Parcelados</div>} />
        <Route path="/settings/fechamento" element={<div>Página Balanço mensal</div>} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
})

describe('Extrato — cartão do resultado do mês', () => {
  it('mostra o resultado e as entradas/saídas do mês (mesmo cálculo da story "Você guardou")', async () => {
    setup()
    expect(await screen.findByText(`Resultado de ${MONTHS_PT[now.getMonth()]}`)).toBeInTheDocument()
    expect(await screen.findByText('+R$ 9.500,00')).toBeInTheDocument()
    // "Entradas" soma o salário (como o Início e o Balanço mensal): 6.000 + 10.800 — assim Entradas − Saídas = Resultado
    expect(screen.getByText('R$ 16.800,00')).toBeInTheDocument()
    expect(screen.queryByText('R$ 10.800,00')).not.toBeInTheDocument()
    expect(screen.getByText('R$ 7.300,00')).toBeInTheDocument()
    expect(transactionsAPI.monthlyRecap).toHaveBeenCalledWith(0)
  })

  it('enquanto o mês carrega, Entradas e Saídas mostram "—" (não R$ 0,00, que parecia mês sem movimento)', async () => {
    transactionsAPI.list.mockReturnValue(new Promise(() => {}))        // a lista nunca chega (carregando)
    transactionsAPI.monthlyRecap.mockReturnValue(new Promise(() => {}))
    installmentsAPI.list.mockResolvedValue({ data: [] })
    render(
      <MemoryRouter initialEntries={['/transactions']}>
        <Routes><Route path="/transactions" element={<Transactions />} /></Routes>
      </MemoryRouter>
    )
    expect(await screen.findByText('Entradas', { selector: '.ex-result-sub-lbl' })).toBeInTheDocument()
    expect(screen.queryByText('R$ 0,00')).not.toBeInTheDocument()
    expect(document.querySelectorAll('.ex-mono')[0]).toHaveTextContent('—')
    expect(document.querySelectorAll('.ex-mono')[1]).toHaveTextContent('—')
  })

  it('resultado negativo aparece com sinal de menos e estilo de alerta', async () => {
    setup({ recapRes: { hasData: true, saved: -300, totalIncome: 0, totalExpenses: 300 } })
    const val = await screen.findByText('−R$ 300,00')
    expect(val).toHaveClass('neg')
  })

  it('sem o cálculo do servidor mostra "—" no resultado e usa as transações nas entradas/saídas', async () => {
    setup({ recapRes: new Error('fora do ar') })
    await screen.findByText('Academia')
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('R$ 1.800,00')).toBeInTheDocument() // entradas calculadas das transações
    expect(screen.getByText('R$ 550,00')).toBeInTheDocument()   // saídas: 200 + 350
  })

  it('mês sem lançamentos não inventa resultado ("—")', async () => {
    setup({ list: [], recapRes: { hasData: false, saved: 3500, totalIncome: 0, totalExpenses: 0 } })
    await screen.findByText(/nenhuma transação encontrada/i)
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByText('+R$ 3.500,00')).not.toBeInTheDocument()
  })

  it('voltar um mês pede o resultado daquele mês (offset -1) e o próximo mês fica desabilitado no mês atual', async () => {
    setup()
    await screen.findByText('Academia')
    expect(screen.getByLabelText('Próximo mês')).toBeDisabled()
    fireEvent.click(screen.getByLabelText('Mês anterior'))
    await waitFor(() => expect(transactionsAPI.monthlyRecap).toHaveBeenCalledWith(-1))
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const yearSuffix = prev.getFullYear() !== now.getFullYear() ? ` de ${prev.getFullYear()}` : ''
    expect(await screen.findByText(`Resultado de ${MONTHS_PT[prev.getMonth()]}${yearSuffix}`)).toBeInTheDocument()
    expect(screen.getByLabelText('Próximo mês')).toBeEnabled()
  })
})

describe('Extrato — lista por dia', () => {
  it('um cartão por dia: hoje leva "HOJE ·" e cada cabeçalho mostra o líquido do dia', async () => {
    setup()
    const today = await screen.findByText(/^HOJE · [A-ZÁ]{3}, \d{2} [A-Z]{3}$/)
    expect(within(today.parentElement).getByText('−R$ 550,00')).toBeInTheDocument()   // 200 + 350 em saídas
    const other = screen.getByText(/^(?!HOJE)[A-ZÁ]{3}, \d{2} [A-Z]{3}$/)
    expect(within(other.parentElement).getByText('+R$ 1.800,00')).toBeInTheDocument() // só uma entrada
  })

  it('cada linha mostra descrição, categoria e valor com sinal; contas fixas aparecem na lista', async () => {
    setup()
    expect(await screen.findByText('Academia')).toBeInTheDocument()
    expect(screen.getByText('Contas fixas')).toBeInTheDocument()
    expect(screen.getByText('−R$ 200,00')).toBeInTheDocument()
    expect(screen.getByText('+R$ 1.800,00', { selector: '.ex-row-val' })).toBeInTheDocument()
  })

  it('filtros: Entradas e Saídas separam pelo tipo (Saídas inclui contas fixas)', async () => {
    setup()
    await screen.findByText('Academia')
    await userEvent.click(screen.getByRole('button', { name: /^entradas$/i }))
    expect(screen.getByText('Dividendos')).toBeInTheDocument()
    expect(screen.queryByText('Academia')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^saídas$/i }))
    expect(screen.getByText('Academia')).toBeInTheDocument()
    expect(screen.getByText('Roupa')).toBeInTheDocument()
    expect(screen.queryByText('Dividendos')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^todas$/i }))
    expect(screen.getByText('Dividendos')).toBeInTheDocument()
  })

  it('busca filtra por descrição e o × limpa', async () => {
    setup()
    await screen.findByText('Academia')
    await userEvent.type(screen.getByPlaceholderText('Buscar no extrato'), 'roup')
    expect(screen.getByText('Roupa')).toBeInTheDocument()
    expect(screen.queryByText('Academia')).not.toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Limpar busca'))
    expect(screen.getByText('Academia')).toBeInTheDocument()
  })

  it('tocar na linha abre a edição daquela transação', async () => {
    setup()
    await userEvent.click(await screen.findByText('Roupa'))
    expect(screen.getByRole('dialog', { name: 'formulário' })).toHaveTextContent('editando Roupa')
  })

  it('× abre a confirmação, e só "Sim, excluir" remove (cancelar não remove)', async () => {
    transactionsAPI.remove.mockResolvedValue({})
    setup()
    await screen.findByText('Roupa')
    const row = screen.getByText('Roupa').closest('.ex-row')
    await userEvent.click(within(row).getByLabelText('Remover transação'))
    expect(screen.getByText('Remover transação', { selector: 'span' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^cancelar$/i }))
    expect(transactionsAPI.remove).not.toHaveBeenCalled()

    await userEvent.click(within(row).getByLabelText('Remover transação'))
    await userEvent.click(screen.getByRole('button', { name: /sim, excluir/i }))
    await waitFor(() => expect(transactionsAPI.remove).toHaveBeenCalledWith('b'))
  })
})

describe('Extrato — remover transação', () => {
  const openDelete = async (name) => {
    await screen.findByText(name)
    const row = screen.getByText(name).closest('.ex-row')
    await userEvent.click(within(row).getByLabelText('Remover transação'))
    return row
  }

  it('a confirmação é um diálogo e diz QUAL transação vai sumir (descrição, valor e data)', async () => {
    setup()
    await openDelete('Roupa')
    const dialog = screen.getByRole('dialog', { name: 'Remover transação' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(within(dialog).getByText('Roupa')).toBeInTheDocument()
    expect(within(dialog).getByText(`−R$ 350,00 · ${now.toLocaleDateString('pt-BR')}`)).toBeInTheDocument()
    expect(within(dialog).getByText('Esta transação será removida permanentemente.')).toBeInTheDocument()
  })

  it('com "ocultar valores" ligado a confirmação também não mostra o valor', async () => {
    localStorage.setItem('hide-balance', '1')
    setup()
    await openDelete('Roupa')
    const dialog = screen.getByRole('dialog', { name: 'Remover transação' })
    expect(within(dialog).queryByText(/350/)).not.toBeInTheDocument()
    expect(within(dialog).getByText(/R\$ ••••/)).toBeInTheDocument()
  })

  it('Esc fecha a confirmação sem remover nada', async () => {
    setup()
    await openDelete('Roupa')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Remover transação' })).not.toBeInTheDocument()
    expect(transactionsAPI.remove).not.toHaveBeenCalled()
    expect(screen.getByText('Roupa')).toBeInTheDocument()
  })

  it('ao confirmar a linha some NA HORA, sem esperar o servidor responder', async () => {
    let finish
    transactionsAPI.remove.mockReturnValue(new Promise(r => { finish = r }))
    setup()
    await openDelete('Roupa')
    await userEvent.click(screen.getByRole('button', { name: /sim, excluir/i }))
    expect(screen.queryByText('Roupa')).not.toBeInTheDocument() // a requisição ainda está no ar
    expect(screen.getByText('Academia')).toBeInTheDocument()
    finish({})
    await waitFor(() => expect(transactionsAPI.remove).toHaveBeenCalledWith('b'))
  })

  it('se o servidor recusar, a lista é recarregada (a linha volta) e o aviso explica', async () => {
    transactionsAPI.remove.mockRejectedValue({ response: { status: 403, data: { error: 'Sem permissão.' } } })
    setup()
    await openDelete('Roupa')
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      await userEvent.click(screen.getByRole('button', { name: /sim, excluir/i }))
      await vi.advanceTimersByTimeAsync(5000) // 3 tentativas com espera entre elas
    } finally { vi.useRealTimers() }
    expect(await screen.findByText('Sem permissão.')).toBeInTheDocument()
    expect(transactionsAPI.remove).toHaveBeenCalledTimes(3)
    expect(await screen.findByText('Roupa')).toBeInTheDocument() // o servidor ainda tem a transação: a lista recarregada traz de volta
  })
})

describe('Extrato — conta que fecha e mês fechado', () => {
  it('o resultado explica as contas fixas a pagar que já desconta; sem contas a pagar a linha não aparece', async () => {
    const { unmount } = setup({ recapRes: { ...recap, unpaidFixedCosts: 430 } })
    expect(await screen.findByText('Já desconta R$ 430,00 de contas fixas a pagar.')).toBeInTheDocument()
    unmount()
    setup()
    await screen.findByText('Roupa')
    expect(screen.queryByText(/Já desconta/)).not.toBeInTheDocument()
  })

  it('com "ocultar valores" a nota das contas a pagar também não mostra o valor', async () => {
    localStorage.setItem('hide-balance', '1')
    setup({ recapRes: { ...recap, unpaidFixedCosts: 430 } })
    expect(await screen.findByText('Já desconta R$ •••• de contas fixas a pagar.')).toBeInTheDocument()
  })

  it('mês FECHADO (tem resultado, mas os lançamentos foram arquivados): diz "Mês fechado" e leva ao relatório — não manda "registrar a primeira transação"', async () => {
    setup({ list: [] })
    expect(await screen.findByText('Mês fechado')).toBeInTheDocument()
    expect(screen.getByText(/foram arquivados no relatório do fechamento/)).toBeInTheDocument()
    expect(screen.queryByText('Registre sua primeira transação.')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ver relatórios' }))
    expect(await screen.findByText('Página Balanço mensal')).toBeInTheDocument()
  })

  it('mês sem resultado e sem lançamentos continua sendo o vazio de sempre (não é "fechado")', async () => {
    setup({ list: [], recapRes: { hasData: false } })
    expect(await screen.findByText('Nenhuma transação encontrada')).toBeInTheDocument()
    expect(screen.queryByText('Mês fechado')).not.toBeInTheDocument()
  })
})

describe('Extrato — mês sem lançamentos', () => {
  it('no mês atual vazio, convida a registrar a primeira transação', async () => {
    setup({ list: [], recapRes: { hasData: false } })
    expect(await screen.findByText('Nenhuma transação encontrada')).toBeInTheDocument()
    expect(screen.getByText('Registre sua primeira transação.')).toBeInTheDocument()
  })

  it('num mês passado vazio diz o mês e não manda "registrar a primeira transação"', async () => {
    transactionsAPI.list.mockImplementation(({ month, year }) => Promise.resolve({
      data: { data: month === now.getMonth() + 1 && year === now.getFullYear() ? txs : [] },
    }))
    setup()
    // o mês passado não teve movimento nenhum (sem resultado): é o vazio de sempre, não um mês "fechado"
    transactionsAPI.monthlyRecap.mockImplementation((offset) => Promise.resolve({ data: offset === 0 ? recap : { hasData: false } }))
    await screen.findByText('Roupa')
    await userEvent.click(screen.getByLabelText('Mês anterior'))
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const yearSuffix = prev.getFullYear() !== now.getFullYear() ? ` de ${prev.getFullYear()}` : ''
    expect(await screen.findByText(`Nenhuma transação em ${MONTHS_PT[prev.getMonth()]}${yearSuffix}`)).toBeInTheDocument()
    expect(screen.getByText('Use as setas para ver outros meses.')).toBeInTheDocument()
    expect(screen.queryByText('Registre sua primeira transação.')).not.toBeInTheDocument()
  })

  it('com busca/filtro ativo, o texto continua sendo o dos filtros', async () => {
    setup()
    await screen.findByText('Roupa')
    await userEvent.type(screen.getByPlaceholderText('Buscar no extrato'), 'zzzz')
    expect(screen.getByText('Nenhuma transação encontrada')).toBeInTheDocument()
    expect(screen.getByText('Ajuste os filtros de busca.')).toBeInTheDocument()
  })
})

describe('Extrato — atalhos do cabeçalho', () => {
  it('"Contas do mês" leva para a tela das contas do mês (/contas-do-mes)', async () => {
    setup()
    await userEvent.click(await screen.findByRole('button', { name: /contas do mês/i }))
    expect(await screen.findByText('Página Contas do mês')).toBeInTheDocument()
  })

  it('"Parcelados" leva para a tela de compras parceladas (/parcelados)', async () => {
    setup()
    await userEvent.click(await screen.findByRole('button', { name: /^parcelados$/i }))
    expect(await screen.findByText('Página Parcelados')).toBeInTheDocument()
  })
})

describe('Extrato — privacidade e plano', () => {
  it('com "ocultar valores" ligado (preferência do Início), nenhum valor em reais aparece', async () => {
    localStorage.setItem('hide-balance', '1')
    setup()
    await screen.findByText('Academia')
    expect(screen.queryByText('+R$ 9.500,00')).not.toBeInTheDocument()
    expect(screen.queryByText('−R$ 200,00')).not.toBeInTheDocument()
    expect(screen.queryByText(/R\$ \d/)).not.toBeInTheDocument()
    expect(screen.getAllByText('R$ ••••').length).toBeGreaterThanOrEqual(5)
  })

  it('o banner de limite do plano só aparece perto do limite (80%+)', async () => {
    sessionStorage.setItem('user', JSON.stringify({ plan: 'free' }))
    const many = Array.from({ length: 16 }, (_, i) => tx({ id: `m${i}`, description: `Item ${i}` }))
    const { unmount } = setup({ list: many })
    expect(await screen.findByText(/16 de 20 transações este mês/i)).toBeInTheDocument()
    unmount()

    setup({ list: many.slice(0, 3) })
    await screen.findByText('Item 0')
    expect(screen.queryByText(/de 20 transações/i)).not.toBeInTheDocument()
  })
})

// ── Navegação rápida entre meses (race condition) ──────────────────

describe('Extrato — navegação rápida entre meses', () => {
  // Regressão: sem guarda de sequência, a resposta da 1ª fetch (mês inicial,
  // rede lenta) podia chegar DEPOIS da 2ª fetch (mês pra onde o usuário já
  // navegou) e sobrescrever `transactions` com o array do mês errado — que o
  // filtro de render (t.month === selMonth) então esconde por completo,
  // fazendo o mês certo (já carregado corretamente) sumir da tela sozinho.
  it('resposta lenta de uma fetch antiga não sobrescreve o mês pra onde o usuário já navegou', async () => {
    const today     = new Date()
    const prevDate   = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const prevMonth  = prevDate.getMonth() + 1
    const prevYear   = prevDate.getFullYear()

    let resolveFirst
    const firstPending = new Promise(res => { resolveFirst = res })

    transactionsAPI.list
      .mockImplementationOnce(() => firstPending) // 1ª fetch (mês inicial, no mount) fica pendurada
      .mockResolvedValueOnce({
        data: {
          data: [{
            id: 'tx-novo', description: 'Mês novo', amount: 200, type: 'expense',
            category: 'food', month: prevMonth, year: prevYear, date: `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`,
          }],
        },
      })

    render(<MemoryRouter><Transactions /></MemoryRouter>)
    fireEvent.click(await screen.findByLabelText('Mês anterior')) // dispara a 2ª fetch, mês diferente da 1ª

    await waitFor(() => expect(screen.getByText('Mês novo')).toBeInTheDocument())

    // Só agora a 1ª fetch (mês antigo, já abandonado) finalmente resolve.
    resolveFirst({
      data: {
        data: [{
          id: 'tx-velho', description: 'Mês velho', amount: 100, type: 'expense',
          category: 'food', month: today.getMonth() + 1, year: today.getFullYear(), date: today.toISOString().slice(0, 10),
        }],
      },
    })
    await new Promise(r => setTimeout(r, 0))

    // Com a guarda de sequência, essa resposta atrasada é descartada — o mês
    // certo continua exibido, não vira uma tela vazia.
    expect(screen.getByText('Mês novo')).toBeInTheDocument()
  })
})



// A barra de cima do desktop leva a busca ao Extrato pelo state da rota (DesktopTopbar).
describe('Extrato — busca vinda da barra de cima (desktop)', () => {
  const GoSearch = ({ q }) => { const nav = useNavigate(); return <button onClick={() => nav('/transactions', { state: { search: q } })}>buscar {q}</button> }

  it('abre já filtrado pelo texto buscado, com o campo preenchido', async () => {
    setup({ entry: { pathname: '/transactions', state: { search: 'roup' } } })
    expect(await screen.findByText('Roupa')).toBeInTheDocument()
    expect(screen.queryByText('Academia')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('Buscar no extrato')).toHaveValue('roup')
  })

  it('sem busca na rota, abre com a lista inteira', async () => {
    setup()
    expect(await screen.findByText('Roupa')).toBeInTheDocument()
    expect(screen.getByText('Academia')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Buscar no extrato')).toHaveValue('')
  })

  it('uma nova busca com o Extrato já aberto troca o filtro', async () => {
    transactionsAPI.list.mockResolvedValue({ data: { data: txs } })
    installmentsAPI.list.mockResolvedValue({ data: [] })
    transactionsAPI.monthlyRecap.mockResolvedValue({ data: recap })
    render(
      <MemoryRouter initialEntries={['/transactions']}>
        <GoSearch q="acad" />
        <Routes><Route path="/transactions" element={<Transactions />} /></Routes>
      </MemoryRouter>
    )
    expect(await screen.findByText('Roupa')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'buscar acad' }))
    await waitFor(() => expect(screen.queryByText('Roupa')).not.toBeInTheDocument())
    expect(screen.getByText('Academia')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Buscar no extrato')).toHaveValue('acad')
  })
})
