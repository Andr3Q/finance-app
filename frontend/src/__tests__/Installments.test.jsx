import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import Installments from '../pages/Installments.jsx'

vi.mock('../services/api.js', () => ({
  installmentsAPI: { list: vi.fn(), create: vi.fn(), pay: vi.fn(), unpay: vi.fn(), remove: vi.fn() },
}))
vi.mock('../services/cache.js', () => ({ getCache: vi.fn(() => null), setCache: vi.fn(), invalidateCache: vi.fn() }))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))

import { installmentsAPI } from '../services/api.js'
import { invalidateCache } from '../services/cache.js'

// Mesmo cálculo do util — descobre o mês REAL atual (Brasília) sem mockar a data do sistema.
function currentBrasiliaMonthYear() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: 'numeric' }).formatToParts(new Date())
  const get = (type) => Number(parts.find(p => p.type === type).value)
  return { month: get('month'), year: get('year') }
}

const mkPlan = (over = {}) => ({ id: 'plan-001', name: 'iPhone 15', amount: 500, totalInstallments: 12, paidInstallments: 0, ...over })

function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}</div> }

function renderPage({ plans = [], entries = ['/parcelados'], index } = {}) {
  installmentsAPI.list.mockResolvedValue({ data: plans })
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <Where />
      <Routes>
        <Route path="/parcelados" element={<Installments />} />
        <Route path="*" element={<div>outra tela</div>} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => { vi.clearAllMocks() })

describe('Parcelados — lista', () => {
  it('cabeçalho, mensagem vazia e formulário quando não há compras', async () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Compras parceladas' })).toBeInTheDocument()
    expect(screen.getByText('Parcelas em andamento')).toBeInTheDocument()
    expect(await screen.findByText(/nenhuma compra parcelada/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText('O que você comprou?')).toBeInTheDocument()
  })

  it('card mostra nome, "N de M parcelas", valor da parcela, restante e a barra de progresso', async () => {
    renderPage({ plans: [mkPlan({ name: 'Notebook', amount: 600, totalInstallments: 10, paidInstallments: 3 })] })
    expect(await screen.findByText('Notebook')).toBeInTheDocument()
    expect(screen.getByText('3 de 10 parcelas')).toBeInTheDocument()
    expect(screen.getByText('R$ 600,00')).toBeInTheDocument()
    expect(screen.getByText('Restante: R$ 4.200,00')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '30')
  })

  it('"Pagar parcela" tem o número da parcela no nome acessível', async () => {
    renderPage({ plans: [mkPlan()] })
    expect(await screen.findByRole('button', { name: /pagar parcela 1\/12/i })).toHaveTextContent('Pagar parcela')
  })

  it('compra quitada mostra "✓ Quitado" e não oferece pagar', async () => {
    renderPage({ plans: [mkPlan({ paidInstallments: 12 })] })
    expect(await screen.findByText(/✓ quitado/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /pagar parcela/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/restante/i)).not.toBeInTheDocument()
  })

  it('"Desfazer" só aparece no detalhe (toque no card) e só quando há parcela paga', async () => {
    renderPage({ plans: [mkPlan({ id: 'a', name: 'Com pagas', paidInstallments: 3 }), mkPlan({ id: 'b', name: 'Sem pagas', paidInstallments: 0 })] })
    await screen.findByText('Com pagas')
    expect(screen.queryByRole('button', { name: /desfazer/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /com pagas/i }))
    expect(screen.getByRole('button', { name: /desfazer/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /sem pagas/i }))
    expect(screen.queryByRole('button', { name: /desfazer/i })).not.toBeInTheDocument()
  })
})

describe('Parcelados — pagar e desfazer', () => {
  it('pagar chama a API, mostra o aviso e invalida o cache do mês REAL e do Início', async () => {
    installmentsAPI.pay.mockResolvedValue({})
    renderPage({ plans: [mkPlan()] })
    fireEvent.click(await screen.findByRole('button', { name: /pagar parcela/i }))

    await waitFor(() => expect(installmentsAPI.pay).toHaveBeenCalledWith('plan-001'))
    expect(await screen.findByText(/parcela registrada como transação/i)).toBeInTheDocument()
    const { month, year } = currentBrasiliaMonthYear()
    expect(invalidateCache).toHaveBeenCalledWith(`transactions:list:${year}-${month}`)
    expect(invalidateCache).toHaveBeenCalledWith('dashboard')
  })

  it('erro ao pagar mostra a mensagem do servidor', async () => {
    installmentsAPI.pay.mockRejectedValue({ response: { data: { error: 'Todas as parcelas já foram pagas.' } } })
    renderPage({ plans: [mkPlan()] })
    fireEvent.click(await screen.findByRole('button', { name: /pagar parcela/i }))
    expect(await screen.findByText(/todas as parcelas já foram pagas/i)).toBeInTheDocument()
  })

  it('desfazer chama a API, avisa e invalida o cache do mês REAL', async () => {
    installmentsAPI.unpay.mockResolvedValue({})
    renderPage({ plans: [mkPlan({ paidInstallments: 2 })] })
    fireEvent.click(await screen.findByRole('button', { name: /iphone 15/i }))
    fireEvent.click(screen.getByRole('button', { name: /desfazer/i }))

    await waitFor(() => expect(installmentsAPI.unpay).toHaveBeenCalledWith('plan-001'))
    expect(await screen.findByText(/parcela desfeita/i)).toBeInTheDocument()
    const { month, year } = currentBrasiliaMonthYear()
    expect(invalidateCache).toHaveBeenCalledWith(`transactions:list:${year}-${month}`)
  })
})

describe('Parcelados — remover', () => {
  beforeEach(() => { installmentsAPI.remove.mockResolvedValue({}) })

  const openRemove = async () => {
    renderPage({ plans: [mkPlan()] })
    fireEvent.click(await screen.findByRole('button', { name: /iphone 15/i }))
    fireEvent.click(screen.getByTitle('Remover'))
  }

  it('só remove depois de confirmar', async () => {
    await openRemove()
    expect(installmentsAPI.remove).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: /sim, excluir/i }))
    await waitFor(() => expect(installmentsAPI.remove).toHaveBeenCalledWith('plan-001'))
    expect(await screen.findByText(/parcelamento removido/i)).toBeInTheDocument()
  })

  it('cancelar não remove nada', async () => {
    await openRemove()
    fireEvent.click(await screen.findByRole('button', { name: /cancelar/i }))
    expect(installmentsAPI.remove).not.toHaveBeenCalled()
  })
})

describe('Parcelados — nova compra parcelada', () => {
  beforeEach(() => { installmentsAPI.create.mockResolvedValue({}) })

  async function fill(total, count, name = 'MacBook Pro') {
    await userEvent.type(screen.getByPlaceholderText('O que você comprou?'), name)
    await userEvent.type(screen.getByPlaceholderText('Valor total'), total)
    await userEvent.type(screen.getByPlaceholderText('Parcelas'), count)
  }

  it('o valor TOTAL é dividido pelas parcelas: a API recebe o valor de cada parcela', async () => {
    renderPage()
    await screen.findByText(/nenhuma compra/i)
    await fill('6000', '10')
    expect(screen.getByText('10 parcelas de R$ 600,00')).toBeInTheDocument() // mostra o resultado antes de salvar
    fireEvent.click(screen.getByRole('button', { name: /adicionar parcela/i }))

    await waitFor(() => expect(installmentsAPI.create).toHaveBeenCalledWith({ name: 'MacBook Pro', amount: 600, totalInstallments: 10 }))
    expect(await screen.findByText(/parcelamento criado/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText('O que você comprou?')).toHaveValue('') // formulário limpo
  })

  it('divisão com centavos arredonda pra cima/baixo em 2 casas e mostra o valor usado', async () => {
    renderPage()
    await screen.findByText(/nenhuma compra/i)
    await fill('1000', '3')
    expect(screen.getByText('3 parcelas de R$ 333,33')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /adicionar parcela/i }))
    await waitFor(() => expect(installmentsAPI.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 333.33, totalInstallments: 3 })))
  })

  it('quando o arredondamento muda o total, mostra quanto fica (1.000 em 3x = 999,99); sem diferença não mostra nada', async () => {
    renderPage()
    await screen.findByText(/nenhuma compra/i)
    await fill('1000', '3')
    expect(screen.getByText('Total das parcelas: R$ 999,99 (arredondamento)')).toBeInTheDocument()
    await userEvent.clear(screen.getByPlaceholderText('Parcelas'))
    await userEvent.type(screen.getByPlaceholderText('Parcelas'), '4')
    expect(screen.getByText('4 parcelas de R$ 250,00')).toBeInTheDocument()
    expect(screen.queryByText(/Total das parcelas/)).not.toBeInTheDocument()
  })

  it.each(['0', '1', '361'])('%s parcelas: não chama a API e o app avisa o intervalo aceito (antes o botão parecia não fazer nada)', async (count) => {
    renderPage()
    await screen.findByText(/nenhuma compra/i)
    await fill('500', count, 'Teste')
    fireEvent.click(screen.getByRole('button', { name: /adicionar parcela/i }))
    expect(installmentsAPI.create).not.toHaveBeenCalled()
    expect(await screen.findByText('O número de parcelas deve ser de 2 a 360.')).toBeInTheDocument()
  })

  it('campos vazios não chamam a API e avisam', async () => {
    renderPage()
    await screen.findByText(/nenhuma compra/i)
    fireEvent.click(screen.getByRole('button', { name: /adicionar parcela/i }))
    expect(installmentsAPI.create).not.toHaveBeenCalled()
    expect(await screen.findByText(/preencha nome, valor e número de parcelas/i)).toBeInTheDocument()
  })

  it('erro do servidor aparece no aviso e o formulário não é limpo', async () => {
    installmentsAPI.create.mockRejectedValue({ response: { data: { error: 'Parcelamentos são exclusivos do plano Pro.' } } })
    renderPage()
    await screen.findByText(/nenhuma compra/i)
    await fill('600', '6', 'TV')
    fireEvent.click(screen.getByRole('button', { name: /adicionar parcela/i }))
    expect(await screen.findByText(/exclusivos do plano pro/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText('O que você comprou?')).toHaveValue('TV')
  })
})

describe('Parcelados — navegação', () => {
  it('voltar retorna à tela anterior; aberta direto pela URL, vai pro Extrato', async () => {
    const first = renderPage({ entries: ['/dashboard', '/parcelados'], index: 1 })
    fireEvent.click(await screen.findByRole('button', { name: 'Voltar' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard')
    first.unmount()

    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Voltar' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/transactions')
  })

  it('vindo do "Compra Parcelada" do menu do "+", o cursor já fica no nome da compra', async () => {
    installmentsAPI.list.mockResolvedValue({ data: [] })
    render(
      <MemoryRouter initialEntries={[{ pathname: '/parcelados', state: { focusForm: true } }]}>
        <Routes><Route path="/parcelados" element={<Installments />} /></Routes>
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getByPlaceholderText('O que você comprou?')).toHaveFocus())
  })
})
