import { render, screen, within, act } from '@testing-library/react'
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

// Analisador de compras no CELULAR (design Nancy 2, tela 37): a mesma conta do desktop (hooks/usePurchaseAnalyzer.js e utils/purchaseAnalysis.js,
// testadas em PurchaseAnalyzer.test.jsx e purchaseAnalysis.test.js), em outra tela: formulário → resultado, com "Editar" e "Analisar outra compra".
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
const item = () => screen.getByLabelText('Produto')
const price = () => screen.getByLabelText('Valor')
const analyze = () => userEvent.click(screen.getByRole('button', { name: /Analisar com a Nancy/ }))
const fill = async (name, value) => { await userEvent.type(item(), name); await userEvent.type(price(), value); await analyze() }

beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear(); localStorage.clear(); setDesktop(false)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  transactionsAPI.create.mockResolvedValue({ data: {} })
  installmentsAPI.create.mockResolvedValue({ data: {} })
  goalsAPI.create.mockResolvedValue({ data: {} })
})
afterEach(() => { delete window.matchMedia; vi.restoreAllMocks() })

describe('Analisador de compras no celular — formulário', () => {
  it('não manda mais para o Início: abre a tela, com o cabeçalho das telas internas, o convite e os números reais', async () => {
    const { container } = setup()
    expect(screen.getByTestId('where')).toHaveTextContent('/analisador')
    expect(screen.getByRole('heading', { level: 1, name: 'Analisador de compras' })).toBeInTheDocument()
    expect(screen.getByText('A Nancy avalia antes de você comprar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Pergunte antes de passar o cartão.' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'O que você quer comprar?' })).toBeInTheDocument()
    expect(item()).toHaveAttribute('placeholder', 'Ex.: Notebook novo')
    expect(screen.getByLabelText('Desconto no Pix (%)')).toHaveValue('5')
    expect(screen.getByLabelText('Juros (% a.m.)')).toHaveValue('0')
    const box = screen.getByLabelText('A Nancy está usando')
    expect(await within(box).findByText('R$ 15.000,00')).toBeInTheDocument()
    for (const t of ['Contas fixas', 'R$ 5.127,00', 'R$ 1.000,00/mês', 'R$ 6.653,00/mês', 'R$ 23.500,00']) expect(box).toHaveTextContent(t)
    expect(container.querySelector('.ndz-page')).toBeNull() // é a tela do celular, não a do desktop
    expect(analyzerAPI.base).toHaveBeenCalledTimes(1)
  })

  it('exemplos preenchem produto e valor; as vezes só aparecem em "Parcelado" (padrão, 10x)', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Sofá · R$ 3.200' }))
    expect(item()).toHaveValue('Sofá')
    expect(price()).toHaveValue('3.200')
    expect(screen.getByRole('button', { name: 'Parcelado' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '10x' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: '6x' }))
    expect(screen.getByRole('button', { name: '6x' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Pix / débito' }))
    expect(screen.queryByRole('group', { name: 'Em quantas vezes?' })).not.toBeInTheDocument()
  })

  it('sem valor avisa e deixa o campo com a borda vermelha; digitar tira o aviso', async () => {
    const { container } = setup()
    await screen.findByText('R$ 15.000,00')
    await analyze()
    expect(screen.getByRole('alert')).toHaveTextContent('Informe o valor da compra.')
    expect(container.querySelector('.anm-price')).toHaveClass('err')
    await userEvent.type(price(), '5')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(container.querySelector('.anm-price')).not.toHaveClass('err')
  })

  it('sem salário cadastrado manda ir a Finanças', async () => {
    setup({ ...BASE, income: 0 })
    await screen.findByText('R$ 0,00')
    await fill('Sofá', '3000')
    expect(screen.getByRole('alert')).toHaveTextContent('Informe seu salário em Finanças')
    await userEvent.click(screen.getByRole('button', { name: 'Ir para Finanças' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/finance')
  })

  it('falha ao carregar os números: avisa e deixa tentar de novo', async () => {
    setup(new Error('rede'))
    expect(await screen.findByText(/Não foi possível carregar seus números/)).toBeInTheDocument()
    analyzerAPI.base.mockResolvedValue({ data: BASE })
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('R$ 15.000,00')).toBeInTheDocument()
  })
})

describe('Analisador de compras no celular — resultado', () => {
  it('analisar mostra só o resultado: barra da compra, veredito, porquês, as 7 formas e o próximo passo', async () => {
    const { container } = setup()
    await screen.findByText('R$ 15.000,00')
    await fill('Celular novo', '7000')
    // o formulário some
    expect(screen.queryByLabelText('Valor')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Pergunte antes de passar o cartão.' })).not.toBeInTheDocument()
    const resumo = screen.getByLabelText('Compra analisada')
    expect(resumo).toHaveTextContent('Celular novo')
    expect(resumo).toHaveTextContent('R$ 7.000,00 · Parcelado em 10x')
    const verdict = screen.getByLabelText('Veredito da Nancy')
    expect(verdict).toHaveClass('tone-pix')
    expect(within(verdict).getByRole('heading', { name: 'Pague à vista no Pix' })).toBeInTheDocument()
    expect(verdict).toHaveTextContent('Saúde financeira depois da compra')
    expect(screen.getByLabelText('Por que essa resposta').querySelectorAll('.anm-reason').length).toBeGreaterThanOrEqual(4)
    const opts = [...container.querySelectorAll('.anm-opt')]
    expect(opts.map(o => o.querySelector('.anm-opt-label').textContent)).toEqual(['Pix / débito', 'Crédito 1x', 'Crédito 2x', 'Crédito 3x', 'Crédito 6x', 'Crédito 10x', 'Crédito 12x'])
    expect(opts[0]).toHaveClass('rec')
    expect(opts[0]).toHaveTextContent('R$ 6.650,00')
    expect(opts[0]).toHaveTextContent('Recomendado')
    expect(opts[0]).not.toHaveTextContent('/mês')       // à vista não tem "/mês"
    expect(opts[5]).toHaveClass('mine')
    expect(opts[5]).toHaveTextContent('Sua escolha')
    expect(opts[5]).toHaveTextContent('/mês')           // parcelado tem
    expect(screen.getByLabelText('Próximo passo')).toHaveTextContent('Registrar compra no Pix')
    expect(screen.getByRole('button', { name: 'Analisar outra compra' })).toBeInTheDocument()
  })

  it('cada análise leva a tela para o topo', async () => {
    setup()
    await screen.findByText('R$ 15.000,00')
    window.scrollTo.mockClear()
    await fill('Celular novo', '7000')
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0)
  })

  it('"Editar" volta ao formulário com os dados; uma nova análise troca o veredito', async () => {
    setup()
    await screen.findByText('R$ 15.000,00')
    await fill('Celular novo', '7000')
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }))
    expect(screen.queryByLabelText('Veredito da Nancy')).not.toBeInTheDocument()
    expect(item()).toHaveValue('Celular novo')
    expect(price()).toHaveValue('7000')
    await userEvent.clear(item()); await userEvent.type(item(), 'Carro seminovo')
    await userEvent.clear(price()); await userEvent.type(price(), '85000')
    await analyze()
    const verdict = screen.getByLabelText('Veredito da Nancy')
    expect(verdict).toHaveClass('tone-wait')
    expect(within(verdict).getByRole('heading', { name: 'Não compre agora' })).toBeInTheDocument()
    expect(screen.getByLabelText('Compra analisada')).toHaveTextContent('Carro seminovo')
  })

  it('"Editar" e depois um valor vazio não traz o resultado velho de volta: fica no formulário com o aviso', async () => {
    setup()
    await screen.findByText('R$ 15.000,00')
    await fill('Celular novo', '7000')
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }))
    await userEvent.clear(price())
    await analyze()
    expect(screen.getByRole('alert')).toHaveTextContent('Informe o valor da compra.')
    expect(screen.queryByLabelText('Veredito da Nancy')).not.toBeInTheDocument()
  })

  it('"Analisar outra compra" limpa produto e valor e mantém a forma de pagar escolhida', async () => {
    setup()
    await screen.findByText('R$ 15.000,00')
    await userEvent.click(screen.getByRole('button', { name: 'Crédito 1x' }))
    await fill('Sofá', '3200')
    await userEvent.click(screen.getByRole('button', { name: 'Analisar outra compra' }))
    expect(screen.queryByLabelText('Veredito da Nancy')).not.toBeInTheDocument()
    expect(item()).toHaveValue('')
    expect(price()).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Crédito 1x' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('clicar em Analisar antes de os números chegarem mostra "analisando" (só enquanto carrega) e sai a análise quando chegarem', async () => {
    let resolve
    analyzerAPI.base.mockReturnValue(new Promise(r => { resolve = r }))
    render(<MemoryRouter initialEntries={['/analisador']}><Routes><Route path="/analisador" element={<PurchaseAnalyzer />} /></Routes></MemoryRouter>)
    await userEvent.type(price(), '7000')
    await analyze()
    expect(screen.getByText('Nancy está analisando suas contas…')).toBeInTheDocument()
    expect(screen.queryByLabelText('Valor')).not.toBeInTheDocument()
    await act(async () => { resolve({ data: BASE }) })
    expect(await screen.findByLabelText('Veredito da Nancy')).toBeInTheDocument()
    expect(screen.queryByText('Nancy está analisando suas contas…')).not.toBeInTheDocument()
  })

  it('compra grande demais: "Não compre agora" e o botão vira "Guardar para comprar depois"', async () => {
    setup()
    await screen.findByText('R$ 15.000,00')
    await fill('Carro seminovo', '85000')
    expect(screen.getByLabelText('Veredito da Nancy')).toHaveClass('tone-wait')
    expect(screen.getByLabelText('Próximo passo')).toHaveTextContent('Guardar para comprar depois')
  })
})

describe('Analisador de compras no celular — próximo passo (faz de verdade)', () => {
  it('parcelado: cria o parcelamento, confirma na tela e leva às parcelas', async () => {
    setup()
    await screen.findByText('R$ 15.000,00')
    await userEvent.type(item(), 'Notebook')
    await userEvent.type(price(), '20000')
    await userEvent.clear(screen.getByLabelText('Desconto no Pix (%)')) // sem desconto no Pix e valor alto: a Nancy recomenda parcelar
    await analyze()
    const label = screen.getByLabelText('Próximo passo').querySelector('.anm-primary').textContent
    expect(label).toMatch(/^Registrar em \d+x no crédito$/)
    await userEvent.click(screen.getByRole('button', { name: label }))
    expect(installmentsAPI.create).toHaveBeenCalledTimes(1)
    const arg = installmentsAPI.create.mock.calls[0][0]
    expect(arg.name).toBe('Notebook')
    expect(arg.totalInstallments).toBeGreaterThan(1)
    expect(arg.amount * arg.totalInstallments).toBeCloseTo(20000, 0)
    expect(await within(screen.getByLabelText('Próximo passo')).findByRole('status')).toHaveTextContent('Notebook em') // a confirmação FICA no cartão (o balão de cima some em 4 s)
    expect(screen.getByRole('button', { name: label })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Ver parcelas' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/parcelados')
  })

  it('"Criar meta para comprar depois" cria a meta e abre Metas', async () => {
    setup()
    await screen.findByText('R$ 15.000,00')
    await fill('Celular novo', '7000')
    await userEvent.click(screen.getByRole('button', { name: 'Criar meta para comprar depois' }))
    expect(goalsAPI.create).toHaveBeenCalledTimes(1)
    expect(goalsAPI.create.mock.calls[0][0]).toMatchObject({ title: 'Celular novo', targetAmount: 7000 })
    expect(await screen.findByText('outra tela')).toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent('/goals')
  })

  it('"Perguntar mais à Nancy" abre o chat com a pergunta pronta', async () => {
    setup()
    await screen.findByText('R$ 15.000,00')
    await fill('Celular novo', '7000')
    const got = []
    const on = (e) => got.push(e.detail)
    window.addEventListener('nancy:open-agent-chat', on)
    await userEvent.click(screen.getByRole('button', { name: 'Perguntar mais à Nancy' }))
    window.removeEventListener('nancy:open-agent-chat', on)
    expect(got).toEqual([{ message: 'Vale a pena comprar Celular novo de R$ 7.000,00?' }])
  })
})
