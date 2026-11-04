import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
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

const setDesktop = (is) => { window.matchMedia = vi.fn(() => ({ matches: is, addEventListener() {}, removeEventListener() {} })) }
const RECAP = { hasData: true, saved: 9500, salary: 15000, totalIncome: 1800, totalExpenses: 7300 }
const HISTORY = [{ month: 9, year: 2026 }, { month: 8, year: 2026 }, { month: 7, year: 2026 }]
function setup(plan = 'pro') {
  const u = { id: 'u-bm', name: 'Ana', plan }
  sessionStorage.setItem('user', JSON.stringify(u))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: u }))
  transactionsAPI.monthlyRecap.mockResolvedValue({ data: RECAP })
  transactionsAPI.list.mockResolvedValue({ data: { data: [], total: 12 } })
  reportsAPI.history.mockResolvedValue({ data: HISTORY })
  return render(<MemoryRouter initialEntries={['/settings/fechamento']}><Routes><Route path="/settings/fechamento" element={<SettingsMonthlyClose />} /></Routes></MemoryRouter>)
}

beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); localStorage.clear(); setDesktop(true) })
afterEach(() => { delete window.matchMedia })

describe('Balanço mensal no desktop (design "Nancy Desktop", tela 29)', () => {
  it('menu da conta (Balanço mensal aceso), cartão azul do mês com resultado, entradas e saídas, e os relatórios anteriores', async () => {
    setup()
    expect(within(screen.getByRole('navigation', { name: 'Conta' })).getByRole('button', { name: 'Balanço mensal' })).toHaveAttribute('aria-current', 'page')
    const card = await screen.findByLabelText('Resultado do mês')
    expect(card).toHaveTextContent('Outubro 2026')
    expect(await within(card).findByText('+R$ 9.500,00')).toBeInTheDocument()
    expect(card).toHaveTextContent('R$ 16.800,00')
    expect(card).toHaveTextContent('R$ 7.300,00')
    expect(await screen.findByText('Setembro 2026')).toBeInTheDocument()
    expect(document.querySelector('.nst-bm')).not.toBeNull()
    expect(document.querySelector('.fin-hero')).toBeNull()
  })

  it('fechar pede confirmação e só então fecha o mês', async () => {
    reportsAPI.monthlyClose.mockResolvedValue({ data: { message: 'Mês fechado!' } })
    setup()
    await userEvent.click(await screen.findByRole('button', { name: /Fechar mês e gerar PDF/ }))
    expect(screen.getByRole('dialog', { name: 'Fechar o mês?' })).toBeInTheDocument()
    expect(reportsAPI.monthlyClose).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Fechar mês' }))
    await waitFor(() => expect(reportsAPI.monthlyClose).toHaveBeenCalled())
    expect(await screen.findByText('Mês fechado!')).toBeInTheDocument()
  })

  it('baixar um relatório anterior chama a API do PDF', async () => {
    reportsAPI.pdf.mockResolvedValue({ data: new ArrayBuffer(8) })
    URL.createObjectURL = vi.fn(() => 'blob:x'); URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Baixar relatório de Setembro 2026' }))
    await waitFor(() => expect(reportsAPI.pdf).toHaveBeenCalledWith(9, 2026))
    click.mockRestore()
  })

  it('plano gratuito: fechar e baixar abrem o convite ao Pro', async () => {
    setup('free')
    await userEvent.click(await screen.findByRole('button', { name: /Fechar mês e gerar PDF/ }))
    expect(await screen.findByRole('dialog', { name: 'Convite ao Pro' })).toHaveTextContent('O relatório PDF mensal é exclusivo do plano Pro.')
  })
})

describe('Balanço mensal — celular continua o mesmo', () => {
  it('abaixo de 901px: cabeçalho azul', async () => {
    setDesktop(false)
    setup()
    expect(await screen.findByRole('heading', { name: 'Balanço mensal' })).toBeInTheDocument()
    expect(document.querySelector('.nst-bm')).toBeNull()
  })
})
