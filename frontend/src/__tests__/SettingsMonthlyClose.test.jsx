import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import SettingsMonthlyClose from '../pages/SettingsMonthlyClose.jsx'

vi.mock('../services/api.js', () => ({
  reportsAPI: { monthlyClose: vi.fn(), history: vi.fn(), pdf: vi.fn() },
  transactionsAPI: { monthlyRecap: vi.fn() },
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

beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear(); localStorage.clear()
  transactionsAPI.monthlyRecap.mockResolvedValue({ data: RECAP })
  reportsAPI.history.mockResolvedValue({ data: HISTORY })
  reportsAPI.monthlyClose.mockResolvedValue({ data: { message: 'Mês fechado com sucesso! Relatório enviado para ana@x.com' } })
  reportsAPI.pdf.mockResolvedValue({ data: new Blob(['%PDF'], { type: 'application/pdf' }) })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
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
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('zerar os gastos do mês'))
    await waitFor(() => expect(reportsAPI.monthlyClose).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Mês fechado com sucesso! Relatório enviado para ana@x.com')).toBeInTheDocument()
    expect(invalidateCache).toHaveBeenCalledWith('dashboard')
    await waitFor(() => expect(reportsAPI.history).toHaveBeenCalledTimes(2))
    expect(transactionsAPI.monthlyRecap).toHaveBeenCalledTimes(2)
  })

  it('cancelar a confirmação não fecha nada', async () => {
    window.confirm.mockReturnValue(false)
    renderPage()
    await screen.findByText('+R$ 9.500,00')
    fireEvent.click(closeBtn())
    expect(reportsAPI.monthlyClose).not.toHaveBeenCalled()
  })

  it('erro ao fechar aparece como aviso e o botão volta', async () => {
    reportsAPI.monthlyClose.mockRejectedValue({ response: { data: { error: 'Erro ao fechar o mês. Tente novamente.' } } })
    renderPage()
    await screen.findByText('+R$ 9.500,00')
    fireEvent.click(closeBtn())
    expect(await screen.findByText('Erro ao fechar o mês. Tente novamente.')).toBeInTheDocument()
    expect(closeBtn()).toBeEnabled()
  })

  it('plano grátis: o botão abre o convite ao Pro e nada é fechado', async () => {
    renderPage({ plan: 'free' })
    await screen.findByText('+R$ 9.500,00')
    fireEvent.click(closeBtn())
    expect(screen.getByRole('dialog', { name: 'Convite ao Pro' })).toHaveTextContent('exclusivo do plano Pro')
    expect(window.confirm).not.toHaveBeenCalled()
    expect(reportsAPI.monthlyClose).not.toHaveBeenCalled()
  })

  it('servidor recusa por ser plano grátis (403 limitReached): abre o convite', async () => {
    reportsAPI.monthlyClose.mockRejectedValue({ response: { status: 403, data: { limitReached: true, error: 'x' } } })
    renderPage()
    await screen.findByText('+R$ 9.500,00')
    fireEvent.click(closeBtn())
    expect(await screen.findByRole('dialog', { name: 'Convite ao Pro' })).toBeInTheDocument()
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
