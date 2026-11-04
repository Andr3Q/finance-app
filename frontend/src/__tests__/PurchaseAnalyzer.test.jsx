import { render, screen, waitFor, within, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import PurchaseAnalyzer from '../pages/PurchaseAnalyzer.jsx'

vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))
vi.mock('../services/api.js', () => ({
  analyzerAPI: { base: vi.fn() },
  transactionsAPI: { create: vi.fn() },
  installmentsAPI: { create: vi.fn() },
  goalsAPI: { create: vi.fn() },
}))
vi.mock('../services/cache.js', () => ({ invalidateCache: vi.fn() }))
vi.mock('../services/storiesData.js', () => ({ invalidateStories: vi.fn() }))
import { analyzerAPI, transactionsAPI, installmentsAPI, goalsAPI } from '../services/api.js'
import { invalidateCache } from '../services/cache.js'

const setDesktop = (is) => { window.matchMedia = vi.fn(() => ({ matches: is, addEventListener() {}, removeEventListener() {} })) }
// o cenário do design: renda 15.000, fixas 5.127, parcelas 1.000/mês, variável 2.220, saldo 23.500, saúde 79
const BASE = { income: 15000, fixedTotal: 5127, installmentsMonthly: 1000, variableAvg: 2220, monthlyCost: 7347, leftover: 6653, balance: 23500, score: 79, hasHistory: true }
function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}</div> }
function setup(base = BASE) {
  if (base instanceof Error) analyzerAPI.base.mockRejectedValue(base)
  else analyzerAPI.base.mockResolvedValue({ data: base })
  return render(
    <MemoryRouter initialEntries={['/analisador']}>
      <Where />
      <Routes>
        <Route path="/analisador" element={<PurchaseAnalyzer />} />
        <Route path="*" element={<div>outra tela</div>} />
      </Routes>
    </MemoryRouter>
  )
}
const price = () => screen.getByLabelText('Valor')
const analyze = () => userEvent.click(screen.getByRole('button', { name: /Analisar com a Nancy/ }))

beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear(); localStorage.clear(); setDesktop(true)
  transactionsAPI.create.mockResolvedValue({ data: {} })
  installmentsAPI.create.mockResolvedValue({ data: {} })
  goalsAPI.create.mockResolvedValue({ data: {} })
})
afterEach(() => { delete window.matchMedia })

describe('Analisador de compras (design "Nancy Desktop", tela 38) — formulário', () => {
  it('formulário do design, convite à direita e "A Nancy está usando" com os números reais', async () => {
    setup()
    expect(screen.getByRole('heading', { name: 'O que você quer comprar?' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Ex.: Notebook novo')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Pergunte antes de passar o cartão.' })).toBeInTheDocument()
    expect(screen.getByLabelText('Desconto no Pix (%)')).toHaveValue('5')
    expect(screen.getByLabelText('Juros do parcelado (% a.m.)')).toHaveValue('0')
    const box = screen.getByLabelText('A Nancy está usando')
    expect(await within(box).findByText('R$ 15.000,00')).toBeInTheDocument()
    expect(box).toHaveTextContent('Contas fixas')
    expect(box).toHaveTextContent('R$ 5.127,00')
    expect(box).toHaveTextContent('R$ 1.000,00/mês')
    expect(box).toHaveTextContent('R$ 6.653,00/mês')
    expect(box).toHaveTextContent('R$ 23.500,00')
    expect(box).not.toHaveTextContent('Ainda sem meses fechados')
  })

  it('exemplos preenchem produto e valor; "Parcelado" (padrão, 10x) mostra as vezes e os outros modos as escondem', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Sofá · R$ 3.200' }))
    expect(screen.getByPlaceholderText('Ex.: Notebook novo')).toHaveValue('Sofá')
    expect(price()).toHaveValue('3.200')
    expect(screen.getByRole('button', { name: 'Parcelado' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '10x' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: '6x' }))
    expect(screen.getByRole('button', { name: '6x' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Pix / débito' }))
    expect(screen.queryByRole('group', { name: 'Em quantas vezes?' })).not.toBeInTheDocument()
  })

  it('sem valor pede o valor; sem salário manda ir a Finanças; passando do limite avisa', async () => {
    setup()
    await analyze()
    expect(screen.getByRole('alert')).toHaveTextContent('Informe o valor da compra.')
    await userEvent.type(price(), '999999999')
    await analyze()
    expect(screen.getByRole('alert')).toHaveTextContent('O valor máximo é R$ 99.999.999,00.')
  })

  it('renda zero: pede o salário, com o caminho até Finanças', async () => {
    setup({ ...BASE, income: 0, leftover: 1 })
    await screen.findByText('Renda mensal')
    await userEvent.type(price(), '1000')
    await analyze()
    expect(screen.getByRole('alert')).toHaveTextContent('Informe seu salário em Finanças para a Nancy analisar.')
    await userEvent.click(screen.getByRole('button', { name: 'Ir para Finanças' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/finance')
  })

  it('sem meses fechados avisa que o gasto variável é o deste mês', async () => {
    setup({ ...BASE, hasHistory: false })
    expect(await screen.findByText('Ainda sem meses fechados: o gasto variável é o deste mês.')).toBeInTheDocument()
  })

  it('falha ao carregar os números: avisa e deixa tentar de novo', async () => {
    setup(new Error('x'))
    expect(await screen.findByText(/Não foi possível carregar seus números/)).toBeInTheDocument()
    analyzerAPI.base.mockResolvedValue({ data: BASE })
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('R$ 15.000,00')).toBeInTheDocument()
  })
})

describe('Analisador de compras — o veredito', () => {
  it('compra que cabe com desconto: Pix à vista, com o porquê e a tabela das 7 formas', async () => {
    setup()
    await screen.findByText('R$ 15.000,00')
    await userEvent.type(screen.getByPlaceholderText('Ex.: Notebook novo'), 'Celular novo')
    await userEvent.type(price(), '7000')
    await analyze()
    const verdict = screen.getByLabelText('Veredito da Nancy')
    expect(verdict).toHaveTextContent('VEREDITO DA NANCY · CELULAR NOVO')
    expect(within(verdict).getByRole('heading', { name: 'Pague à vista no Pix' })).toBeInTheDocument()
    expect(verdict).toHaveTextContent('Saúde financeira')
    expect(screen.getByLabelText('Por que essa resposta').querySelectorAll('.ndz-reason').length).toBeGreaterThanOrEqual(4)
    const rows = [...document.querySelectorAll('.ndz-tr.row')]
    expect(rows.map(r => r.querySelector('.ndz-forma').textContent)).toEqual(['Pix / débito', 'Crédito 1x', 'Crédito 2x', 'Crédito 3x', 'Crédito 6x', 'Crédito 10x', 'Crédito 12x'])
    expect(rows[0]).toHaveClass('rec')
    expect(rows[0]).toHaveTextContent('R$ 6.650,00')
    expect(rows[0]).toHaveTextContent('Recomendado')
    expect(rows[5]).toHaveTextContent('Sua escolha') // pensou em parcelar em 10x
    expect(screen.queryByRole('heading', { name: 'Pergunte antes de passar o cartão.' })).not.toBeInTheDocument()
  })

  it('Enter no valor também analisa; trocar a forma e analisar de novo troca a "Sua escolha"', async () => {
    setup()
    await screen.findByText('R$ 15.000,00')
    await userEvent.type(price(), '7000{Enter}')
    expect(screen.getByLabelText('Veredito da Nancy')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Crédito 1x' }))
    await analyze()
    expect([...document.querySelectorAll('.ndz-tr.row')].find(r => r.classList.contains('mine')).querySelector('.ndz-forma').textContent).toBe('Crédito 1x')
  })

  it('compra grande demais: "Não compre agora" e o botão vira "Guardar para comprar depois"', async () => {
    setup()
    await screen.findByText('R$ 15.000,00')
    await userEvent.type(price(), '85000')
    await userEvent.clear(screen.getByLabelText('Desconto no Pix (%)'))
    await analyze()
    expect(screen.getByRole('heading', { name: 'Não compre agora' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar para comprar depois' })).toBeInTheDocument()
  })

  it('clicar em Analisar antes de os números chegarem mostra "analisando" e sai a análise quando chegarem', async () => {
    let resolve
    analyzerAPI.base.mockReturnValue(new Promise(r => { resolve = r }))
    render(<MemoryRouter initialEntries={['/analisador']}><Routes><Route path="/analisador" element={<PurchaseAnalyzer />} /></Routes></MemoryRouter>)
    await userEvent.type(price(), '7000')
    await analyze()
    expect(screen.getByText('Nancy está analisando suas contas…')).toBeInTheDocument()
    await act(async () => { resolve({ data: BASE }) })
    expect(await screen.findByLabelText('Veredito da Nancy')).toBeInTheDocument()
    expect(screen.queryByText('Nancy está analisando suas contas…')).not.toBeInTheDocument()
  })
})

describe('Analisador de compras — próximo passo (faz de verdade)', () => {
  it('à vista: registra a compra como saída em Shopping, atualiza o Início e confirma', async () => {
    setup()
    await screen.findByText('R$ 15.000,00')
    await userEvent.type(screen.getByPlaceholderText('Ex.: Notebook novo'), 'Celular novo')
    await userEvent.type(price(), '7000')
    await analyze()
    await userEvent.click(screen.getByRole('button', { name: 'Registrar compra no Pix' }))
    await waitFor(() => expect(transactionsAPI.create).toHaveBeenCalledWith({ description: 'Celular novo', amount: 6650, type: 'expense', category: 'shopping' }))
    expect(await screen.findByText('Compra registrada no Extrato.', { selector: '.toast' })).toBeInTheDocument() // o aviso de cima (a confirmação fixa é testada à parte)
    expect(invalidateCache).toHaveBeenCalledWith('dashboard')
    expect(analyzerAPI.base).toHaveBeenCalledTimes(2) // recarrega os números; a análise na tela continua
    expect(screen.getByLabelText('Veredito da Nancy')).toBeInTheDocument()
  })

  it('a confirmação FICA na tela (o aviso de cima some em 4 s), o botão trava e há atalho para o Extrato', async () => {
    setup()
    await screen.findByText('R$ 15.000,00')
    await userEvent.click(screen.getByRole('button', { name: 'Celular novo · R$ 7.000' }))
    await analyze()
    await userEvent.click(screen.getByRole('button', { name: 'Registrar compra no Pix' }))
    const box = await screen.findByLabelText('Próximo passo')
    await waitFor(() => expect(within(box).getByRole('status')).toHaveTextContent('Compra registrada no Extrato.'))
    expect(screen.getByRole('button', { name: 'Registrar compra no Pix' })).toBeDisabled()
    await userEvent.click(within(box).getByRole('button', { name: 'Ver no Extrato' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/transactions')
  })

  it('dois cliques no mesmo instante em "Registrar" criam UMA saída só', async () => {
    let finish
    transactionsAPI.create.mockReturnValue(new Promise(r => { finish = r }))
    setup()
    await screen.findByText('R$ 15.000,00')
    await userEvent.click(screen.getByRole('button', { name: 'Celular novo · R$ 7.000' }))
    await analyze()
    const b = screen.getByRole('button', { name: 'Registrar compra no Pix' })
    fireEvent.click(b); fireEvent.click(b); fireEvent.click(b)
    expect(transactionsAPI.create).toHaveBeenCalledTimes(1)
    await act(async () => { finish({ data: {} }) })
  })

  it('analisar de novo limpa a confirmação e libera o botão para a nova análise', async () => {
    setup()
    await screen.findByText('R$ 15.000,00')
    await userEvent.click(screen.getByRole('button', { name: 'Celular novo · R$ 7.000' }))
    await analyze()
    await userEvent.click(screen.getByRole('button', { name: 'Registrar compra no Pix' }))
    await within(screen.getByLabelText('Próximo passo')).findByText('Compra registrada no Extrato.')
    await userEvent.click(screen.getByRole('button', { name: 'Sofá · R$ 3.200' }))
    await analyze()
    expect(within(screen.getByLabelText('Próximo passo')).queryByText('Compra registrada no Extrato.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Registrar/ })).toBeEnabled()
  })

  it('parcelado: cria o parcelamento com o valor da parcela e quantas', async () => {
    setup()
    await screen.findByText('R$ 15.000,00')
    await userEvent.type(screen.getByPlaceholderText('Ex.: Notebook novo'), 'Notebook')
    await userEvent.type(price(), '20000')
    await userEvent.clear(screen.getByLabelText('Desconto no Pix (%)'))
    await analyze()
    await userEvent.click(screen.getByRole('button', { name: /^Registrar em \d+x no crédito$/ }))
    await waitFor(() => expect(installmentsAPI.create).toHaveBeenCalledTimes(1))
    const arg = installmentsAPI.create.mock.calls[0][0]
    expect(arg.name).toBe('Notebook')
    expect(arg.totalInstallments).toBeGreaterThan(1)
    expect(arg.amount * arg.totalInstallments).toBeCloseTo(20000, 0)
    expect(await screen.findByText(/Notebook em \d+x adicionada às parcelas\./, { selector: '.toast' })).toBeInTheDocument()
    expect(within(screen.getByLabelText('Próximo passo')).getByRole('button', { name: 'Ver parcelas' })).toBeInTheDocument() // e a confirmação fixa, com o atalho
  })

  it('plano sem parcelamentos: mostra o aviso do servidor e não some com a análise', async () => {
    installmentsAPI.create.mockRejectedValue({ response: { status: 403, data: { error: 'Parcelamentos são exclusivos do plano Pro.', limitReached: true } } })
    setup()
    await screen.findByText('R$ 15.000,00')
    await userEvent.type(price(), '20000')
    await userEvent.clear(screen.getByLabelText('Desconto no Pix (%)'))
    await analyze()
    await userEvent.click(screen.getByRole('button', { name: /^Registrar em \d+x no crédito$/ }))
    expect(await screen.findByText('Parcelamentos são exclusivos do plano Pro.')).toHaveClass('terr')
    expect(screen.getByLabelText('Veredito da Nancy')).toBeInTheDocument()
  })

  it('sem recomendação, "Guardar para comprar depois" cria a meta (valor e prazo em meses) e abre Metas', async () => {
    setup()
    await screen.findByText('R$ 15.000,00')
    await userEvent.click(screen.getByRole('button', { name: 'Carro seminovo · R$ 85.000' }))
    await userEvent.clear(screen.getByLabelText('Desconto no Pix (%)'))
    await analyze()
    await userEvent.click(screen.getByRole('button', { name: 'Guardar para comprar depois' }))
    await waitFor(() => expect(goalsAPI.create).toHaveBeenCalledTimes(1))
    const arg = goalsAPI.create.mock.calls[0][0]
    expect(arg).toMatchObject({ title: 'Carro seminovo', targetAmount: 85000 })
    expect(arg.deadline).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(screen.getByTestId('where')).toHaveTextContent('/goals')
  })

  it('"Criar meta para comprar depois" cria a meta mesmo com recomendação', async () => {
    setup()
    await screen.findByText('R$ 15.000,00')
    await userEvent.click(screen.getByRole('button', { name: 'Celular novo · R$ 7.000' }))
    await analyze()
    await userEvent.click(screen.getByRole('button', { name: 'Criar meta para comprar depois' }))
    await waitFor(() => expect(goalsAPI.create).toHaveBeenCalledWith(expect.objectContaining({ title: 'Celular novo', targetAmount: 7000 })))
    expect(screen.getByTestId('where')).toHaveTextContent('/goals')
  })

  it('"Perguntar mais à Nancy" abre o chat com a pergunta pronta', async () => {
    setup()
    await screen.findByText('R$ 15.000,00')
    await userEvent.click(screen.getByRole('button', { name: 'Celular novo · R$ 7.000' }))
    await analyze()
    const seen = []
    const on = (e) => seen.push(e.detail)
    window.addEventListener('nancy:open-agent-chat', on)
    await userEvent.click(screen.getByRole('button', { name: 'Perguntar mais à Nancy' }))
    window.removeEventListener('nancy:open-agent-chat', on)
    expect(seen).toEqual([{ message: 'Vale a pena comprar Celular novo de R$ 7.000,00?' }])
  })
})

describe('Analisador de compras — celular', () => {
  it('no celular a rota volta ao Início (a tela é do desktop)', () => {
    setDesktop(false)
    setup()
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard')
    expect(analyzerAPI.base).not.toHaveBeenCalled()
  })
})
