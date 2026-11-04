import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import Reminders from '../pages/Reminders.jsx'

vi.mock('../services/api.js', () => ({ budgetAPI: { list: vi.fn() } }))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))
import { budgetAPI } from '../services/api.js'

const BUDGETS = [
  { id: 'b3', name: 'Cartão de crédito', amount: 900, dueDay: 10 },
  { id: 'b1', name: 'Aluguel', amount: 1800, dueDay: 5 },
  { id: 'b0', name: 'Mercado', amount: 600, dueDay: null },
]
const setDesktop = (is) => { window.matchMedia = vi.fn(() => ({ matches: is, addEventListener() {}, removeEventListener() {} })) }
function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}</div> }
function setup({ plan = 'elite', data = BUDGETS } = {}) {
  const user = { id: 'u-rem', plan }
  sessionStorage.setItem('user', JSON.stringify(user))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: user }))
  if (data instanceof Error) budgetAPI.list.mockRejectedValue(data)
  else budgetAPI.list.mockResolvedValue({ data })
  return render(<MemoryRouter initialEntries={['/lembretes']}><Where /><Routes><Route path="/lembretes" element={<Reminders />} /><Route path="*" element={<div>outra tela</div>} /></Routes></MemoryRouter>)
}
const items = () => [...document.querySelectorAll('.nrm-item')]
const saved = () => JSON.parse(localStorage.getItem('nancy:reminders'))

beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); localStorage.clear(); setDesktop(true) })
afterEach(() => { delete window.matchMedia })

describe('Lembretes no desktop (design "Nancy Desktop", tela 23)', () => {
  it('abas de Metas e uma linha por conta com vencimento, na ordem do mês: "Dia N · 2 dias antes", tudo ligado', async () => {
    setup()
    await screen.findByText('Aluguel')
    const tabs = within(screen.getByRole('navigation', { name: 'Seções de metas' })).getAllByRole('button')
    expect(tabs[3]).toHaveTextContent('Lembretes')
    expect(items().map(i => i.querySelector('.nrm-name').textContent)).toEqual(['Aluguel', 'Cartão de crédito']) // sem dia de vencimento fica de fora
    expect(items()[0].querySelector('.nrm-sub')).toHaveTextContent('Dia 5 · 2 dias antes')
    expect(screen.getAllByRole('switch').every(s => s.getAttribute('aria-checked') === 'true')).toBe(true)
    expect(document.querySelector('.fin-hero')).toBeNull()
  })

  it('o interruptor liga e desliga e fica guardado no aparelho', async () => {
    setup()
    fireEvent.click(await screen.findByRole('switch', { name: 'Lembrete de Aluguel' }))
    expect(screen.getByRole('switch', { name: 'Lembrete de Aluguel' })).toHaveAttribute('aria-checked', 'false')
    expect(saved().bills.b1.on).toBe(false)
  })

  it('tocar na linha abre a janela de antecedência e a escolha muda o texto da linha', async () => {
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Antecedência do lembrete de Aluguel' }))
    const dlg = await screen.findByRole('dialog', { name: 'Lembrete de Aluguel' })
    await userEvent.click(within(dlg).getByRole('radio', { name: '7 dias antes' }))
    await userEvent.click(within(dlg).getByRole('button', { name: 'Pronto' }))
    expect(items()[0].querySelector('.nrm-sub')).toHaveTextContent('Dia 5 · 7 dias antes')
  })

  it('"Novo lembrete" cria um avulso (nome e dia validados) e ele aparece na lista', async () => {
    setup()
    await userEvent.click(await screen.findByRole('button', { name: /Novo lembrete/ }))
    const dlg = await screen.findByRole('dialog', { name: 'Novo lembrete' })
    await userEvent.click(within(dlg).getByRole('button', { name: 'Criar lembrete' }))
    expect(within(dlg).getByRole('alert')).toHaveTextContent('Dê um nome ao lembrete.')
    fireEvent.change(within(dlg).getByLabelText('Nome'), { target: { value: 'IPVA 2027' } })
    fireEvent.change(within(dlg).getByLabelText('Dia do vencimento'), { target: { value: '15' } })
    fireEvent.change(within(dlg).getByLabelText('Repete'), { target: { value: '1' } })
    await userEvent.click(within(dlg).getByRole('button', { name: 'Criar lembrete' }))
    await waitFor(() => expect(items().map(i => i.querySelector('.nrm-name').textContent)).toContain('IPVA 2027'))
    expect(items().find(i => i.textContent.includes('IPVA 2027')).querySelector('.nrm-sub')).toHaveTextContent('Janeiro · 2 dias antes')
  })

  it('remover um avulso pede confirmação', async () => {
    localStorage.setItem('nancy:reminders', JSON.stringify({ bills: {}, custom: [{ id: 'c1', name: 'IPVA', day: 15, month: 1, lead: 7, on: true }] }))
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Antecedência do lembrete de IPVA' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remover lembrete' }))
    expect(screen.getByRole('dialog', { name: /Remover lembrete/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Sim, remover' }))
    await waitFor(() => expect(items().find(i => i.textContent.includes('IPVA'))).toBeUndefined())
  })

  it('fora do Elite: convite e "Ver planos"; sem contas com vencimento: aviso; falha: tentar de novo', async () => {
    const a = setup({ plan: 'pro' })
    expect(await screen.findByRole('heading', { name: 'Recurso Elite' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ver planos' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/planos')
    a.unmount()
    const b = setup({ data: [] })
    expect(await screen.findByText(/Nenhuma conta com dia de vencimento ainda/)).toBeInTheDocument()
    b.unmount()
    setup({ data: new Error('rede') })
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })
})

describe('Lembretes — celular continua o mesmo', () => {
  it('abaixo de 901px: cabeçalho azul e lista do celular', async () => {
    setDesktop(false)
    setup()
    expect(await screen.findByRole('heading', { name: 'Lembretes' })).toBeInTheDocument()
    expect(document.querySelector('.rm-list')).not.toBeNull()
    expect(document.querySelector('.nrm-list')).toBeNull()
  })
})
