import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import SettingsMonthlyClose from '../pages/SettingsMonthlyClose.jsx'

vi.mock('../services/api.js', () => ({
  reportsAPI: { monthlyClose: vi.fn(), history: vi.fn(), pdf: vi.fn() },
  transactionsAPI: { monthlyRecap: vi.fn(), list: vi.fn() },
}))
vi.mock('../services/cache.js', () => ({ invalidateCache: vi.fn() }))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))
vi.mock('../components/ui/UpgradeModal.jsx', () => ({ default: ({ reason, onClose }) => <div role="dialog" aria-label="Convite ao Pro">{reason}<button onClick={onClose}>fechar convite</button></div> }))
vi.mock('../utils/txCache.js', () => ({ currentBrasiliaMonthYear: () => ({ month: 10, year: 2026 }) }))

import { reportsAPI, transactionsAPI } from '../services/api.js'
import { invalidateCache } from '../services/cache.js'

// como o servidor manda: salário (15.000) e lançamentos de entrada (1.800) separados; "Entradas" é a soma, igual ao Início
const RECAP = { hasData: true, saved: 9500, salary: 15000, totalIncome: 1800, totalExpenses: 7300 }
const HISTORY = [{ month: 9, year: 2026 }, { month: 8, year: 2026 }, { month: 7, year: 2026 }]

function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}</div> }
function renderPage(user = {}, entries = ['/settings/fechamento'], index) {
  const u = { id: 'u1', name: 'Ana', plan: 'pro', ...user }
  sessionStorage.setItem('user', JSON.stringify(u))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: u }))
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <Where />
      <Routes>
        <Route path="/settings/fechamento" element={<SettingsMonthlyClose />} />
        <Route path="*" element={<div>outra tela</div>} />
      </Routes>
    </MemoryRouter>
  )
}
const closeBtn = () => screen.getByRole('button', { name: /Fechar mês e gerar PDF/ })
const confirmClose = () => fireEvent.click(within(screen.getByRole('dialog', { name: 'Fechar o mês?' })).getByRole('button', { name: 'Fechar mês' }))

beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear(); localStorage.clear()
  transactionsAPI.monthlyRecap.mockResolvedValue({ data: RECAP })
  transactionsAPI.list.mockResolvedValue({ data: { data: [{ id: 't1' }], total: 12 } }) // o mês tem lançamentos abertos
  reportsAPI.history.mockResolvedValue({ data: HISTORY })
  reportsAPI.monthlyClose.mockResolvedValue({ data: { message: 'Mês fechado com sucesso! Relatório enviado para ana@x.com' } })
  reportsAPI.pdf.mockResolvedValue({ data: new Blob(['%PDF'], { type: 'application/pdf' }) })
  vi.spyOn(window, 'confirm').mockReturnValue(true) // não deve mais ser usado: a confirmação é uma janela do app
  URL.createObjectURL = vi.fn(() => 'blob:x'); URL.revokeObjectURL = vi.fn()
})
afterEach(() => { vi.restoreAllMocks() })

describe('Balanço mensal', () => {
  it('cabeçalho, resultado do mês (mesmo cálculo do Extrato), entradas e saídas', async () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Balanço mensal' })).toBeInTheDocument()
    expect(screen.getByText('Fechar o mês e gerar relatório')).toBeInTheDocument()
    expect(screen.getByText('Outubro 2026')).toBeInTheDocument()
    expect(await screen.findByText('+R$ 9.500,00')).toBeInTheDocument()
    expect(screen.getByText('R$ 16.800,00')).toHaveClass('in')
    expect(screen.getByText('R$ 7.300,00')).toBeInTheDocument()
    expect(transactionsAPI.monthlyRecap).toHaveBeenCalledWith(0)
  })

  it('resultado negativo vem com sinal de menos; sem lançamentos ou sem resposta vira "—" e zeros', async () => {
    transactionsAPI.monthlyRecap.mockResolvedValueOnce({ data: { ...RECAP, saved: -250, salary: 0, totalIncome: 100, totalExpenses: 350 } })
    const { unmount } = renderPage()
    expect(await screen.findByText('−R$ 250,00')).toBeInTheDocument()
    unmount()
    transactionsAPI.monthlyRecap.mockResolvedValueOnce({ data: { hasData: false } })
    renderPage()
    await waitFor(() => expect(screen.getByText('—')).toBeInTheDocument())
    expect(screen.getAllByText('R$ 0,00')).toHaveLength(2)
  })

  it('falha ao buscar o resumo: "—", sem quebrar a tela', async () => {
    transactionsAPI.monthlyRecap.mockRejectedValue(new Error('off'))
    renderPage()
    await waitFor(() => expect(screen.getByText('—')).toBeInTheDocument())
    expect(closeBtn()).toBeEnabled()
  })

  it('ocultar valores (preferência do Início) mascara os valores', async () => {
    localStorage.setItem('hide-balance', '1')
    renderPage()
    await waitFor(() => expect(screen.getAllByText('R$ ••••').length).toBeGreaterThanOrEqual(3))
    expect(screen.queryByText('+R$ 9.500,00')).not.toBeInTheDocument()
  })

  it('fechar o mês: confirma, chama a API, mostra a mensagem, limpa o cache do Início e recarrega', async () => {
    renderPage()
    await screen.findByText('+R$ 9.500,00')
    fireEvent.click(closeBtn())
    const dialog = screen.getByRole('dialog', { name: 'Fechar o mês?' })
    expect(dialog).toHaveTextContent('zerar os gastos do mês')
    expect(dialog).toHaveTextContent('Não dá para desfazer')
    expect(window.confirm).not.toHaveBeenCalled() // janela do app, não a caixa nativa do navegador
    expect(reportsAPI.monthlyClose).not.toHaveBeenCalled() // nada é fechado antes de confirmar
    confirmClose()
    await waitFor(() => expect(reportsAPI.monthlyClose).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Mês fechado com sucesso! Relatório enviado para ana@x.com')).toBeInTheDocument()
    expect(invalidateCache).toHaveBeenCalledWith('dashboard')
    await waitFor(() => expect(reportsAPI.history).toHaveBeenCalledTimes(2))
    expect(transactionsAPI.monthlyRecap).toHaveBeenCalledTimes(2)
  })

  it('"Voltar" e Esc na confirmação não fecham nada', async () => {
    renderPage()
    await screen.findByText('+R$ 9.500,00')
    fireEvent.click(closeBtn())
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Fechar o mês?' })).getByRole('button', { name: 'Voltar' }))
    expect(screen.queryByRole('dialog', { name: 'Fechar o mês?' })).not.toBeInTheDocument()
    fireEvent.click(closeBtn())
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Fechar o mês?' })).not.toBeInTheDocument()
    expect(reportsAPI.monthlyClose).not.toHaveBeenCalled()
  })

  it('erro ao fechar aparece como aviso e o botão volta', async () => {
    reportsAPI.monthlyClose.mockRejectedValue({ response: { data: { error: 'Erro ao fechar o mês. Tente novamente.' } } })
    renderPage()
    await screen.findByText('+R$ 9.500,00')
    fireEvent.click(closeBtn())
    confirmClose()
    expect(await screen.findByText('Erro ao fechar o mês. Tente novamente.')).toBeInTheDocument()
    expect(closeBtn()).toBeEnabled()
  })

  it('plano grátis: o botão abre o convite ao Pro e nada é fechado', async () => {
    renderPage({ plan: 'free' })
    await screen.findByText('+R$ 9.500,00')
    fireEvent.click(closeBtn())
    expect(screen.getByRole('dialog', { name: 'Convite ao Pro' })).toHaveTextContent('exclusivo do plano Pro')
    expect(screen.queryByRole('dialog', { name: 'Fechar o mês?' })).not.toBeInTheDocument()
    expect(reportsAPI.monthlyClose).not.toHaveBeenCalled()
  })

  it('servidor recusa por ser plano grátis (403 limitReached): abre o convite', async () => {
    reportsAPI.monthlyClose.mockRejectedValue({ response: { status: 403, data: { limitReached: true, error: 'x' } } })
    renderPage()
    await screen.findByText('+R$ 9.500,00')
    fireEvent.click(closeBtn())
    confirmClose()
    expect(await screen.findByRole('dialog', { name: 'Convite ao Pro' })).toBeInTheDocument()
  })
})

describe('Balanço mensal — mês já fechado e conta que fecha', () => {
  it('mês sem lançamentos abertos que tem resultado = FECHADO: o botão vira "Mês já fechado" (desligado) e aponta para o relatório', async () => {
    transactionsAPI.list.mockResolvedValue({ data: { data: [], total: 0 } })
    renderPage()
    await screen.findByText('+R$ 9.500,00')
    const btn = await screen.findByRole('button', { name: 'Mês já fechado' })
    expect(btn).toBeDisabled()
    expect(screen.queryByRole('button', { name: /Fechar mês e gerar PDF/ })).not.toBeInTheDocument()
    expect(screen.getByText('Os lançamentos de outubro estão no relatório abaixo.')).toBeInTheDocument()
  })

  it('mês sem nenhum lançamento: "Nada para fechar"', async () => {
    transactionsAPI.list.mockResolvedValue({ data: { data: [], total: 0 } })
    transactionsAPI.monthlyRecap.mockResolvedValue({ data: { hasData: false } })
    renderPage()
    expect(await screen.findByRole('button', { name: 'Nada para fechar' })).toBeDisabled()
  })

  it('se não der pra saber quantos lançamentos estão abertos (falha na consulta), o botão de fechar continua disponível', async () => {
    transactionsAPI.list.mockRejectedValue(new Error('off'))
    renderPage()
    await screen.findByText('+R$ 9.500,00')
    expect(closeBtn()).toBeEnabled()
  })

  it('o resultado explica as contas fixas a pagar que já desconta (Entradas − Saídas − a pagar = Resultado)', async () => {
    transactionsAPI.monthlyRecap.mockResolvedValue({ data: { ...RECAP, unpaidFixedCosts: 430 } })
    renderPage()
    expect(await screen.findByText('Já desconta R$ 430,00 de contas fixas a pagar.')).toBeInTheDocument()
  })

  it('sem contas a pagar, a linha não aparece', async () => {
    renderPage()
    await screen.findByText('+R$ 9.500,00')
    expect(screen.queryByText(/Já desconta/)).not.toBeInTheDocument()
  })

  it('o servidor recusa por mês já fechado (409): avisa e atualiza a tela', async () => {
    reportsAPI.monthlyClose.mockRejectedValue({ response: { status: 409, data: { error: 'Este mês já foi fechado. Os lançamentos estão no relatório de "Relatórios anteriores".', alreadyClosed: true } } })
    renderPage()
    await screen.findByText('+R$ 9.500,00')
    fireEvent.click(closeBtn())
    confirmClose()
    expect(await screen.findByText(/Este mês já foi fechado/)).toBeInTheDocument()
    await waitFor(() => expect(transactionsAPI.list).toHaveBeenCalledTimes(2)) // recarregou
  })
})

describe('Balanço mensal — relatórios anteriores', () => {
  it('lista os meses fechados, do mais novo ao mais antigo, cada um com o botão de baixar', async () => {
    renderPage()
    expect(await screen.findByText('Setembro 2026')).toBeInTheDocument()
    expect(Array.from(document.querySelectorAll('.bm-row-name')).map(n => n.textContent)).toEqual(['Setembro 2026', 'Agosto 2026', 'Julho 2026'])
    expect(screen.getByRole('button', { name: 'Baixar relatório de Agosto 2026' })).toBeInTheDocument()
  })

  it('baixar: pede o PDF daquele mês e dispara o download com o nome do arquivo', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Baixar relatório de Agosto 2026' }))
    await waitFor(() => expect(reportsAPI.pdf).toHaveBeenCalledWith(8, 2026))
    await waitFor(() => expect(click).toHaveBeenCalled())
    expect(URL.createObjectURL).toHaveBeenCalled()
  })

  it('falha ao baixar mostra o aviso', async () => {
    reportsAPI.pdf.mockRejectedValue(new Error('x'))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Baixar relatório de Julho 2026' }))
    expect(await screen.findByText('Não foi possível baixar o relatório. Tente de novo.')).toBeInTheDocument()
  })

  it('plano grátis: baixar abre o convite e não pede o PDF', async () => {
    renderPage({ plan: 'free' })
    fireEvent.click(await screen.findByRole('button', { name: 'Baixar relatório de Julho 2026' }))
    expect(screen.getByRole('dialog', { name: 'Convite ao Pro' })).toBeInTheDocument()
    expect(reportsAPI.pdf).not.toHaveBeenCalled()
  })

  it('sem meses fechados: mensagem; histórico indisponível: outra mensagem', async () => {
    reportsAPI.history.mockResolvedValueOnce({ data: [] })
    const { unmount } = renderPage()
    expect(await screen.findByText(/Nenhum mês fechado ainda/)).toBeInTheDocument()
    unmount()
    reportsAPI.history.mockRejectedValueOnce(new Error('off'))
    renderPage()
    expect(await screen.findByText('Não foi possível carregar os relatórios agora.')).toBeInTheDocument()
  })

  it('voltar retorna à tela anterior', async () => {
    renderPage({}, ['/settings', '/settings/fechamento'], 1)
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/settings'))
  })
})
