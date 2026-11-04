import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Installments from '../pages/Installments.jsx'

vi.mock('../services/api.js', () => ({
  installmentsAPI: { list: vi.fn(), create: vi.fn(), pay: vi.fn(), unpay: vi.fn(), remove: vi.fn() },
}))
vi.mock('../services/cache.js', () => ({ getCache: vi.fn(() => null), setCache: vi.fn(), invalidateCache: vi.fn() }))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))
import { installmentsAPI } from '../services/api.js'

const setDesktop = (is) => { window.matchMedia = vi.fn(() => ({ matches: is, addEventListener() {}, removeEventListener() {} })) }
const plan = (over = {}) => ({ id: 'i1', name: 'Notebook', amount: 600, totalInstallments: 10, paidInstallments: 3, startMonth: 9, startYear: 2026, ...over })
const PLANS = [plan(), plan({ id: 'i2', name: 'Geladeira', amount: 400, totalInstallments: 8, paidInstallments: 6, startMonth: 5, startYear: 2026 }), plan({ id: 'i3', name: 'Celular', amount: 150, totalInstallments: 4, paidInstallments: 4, startMonth: 6, startYear: 2026 })]
function setup(plans = PLANS) {
  installmentsAPI.list.mockResolvedValue({ data: plans })
  return render(<MemoryRouter initialEntries={['/parcelados']}><Routes><Route path="/parcelados" element={<Installments />} /></Routes></MemoryRouter>)
}
const cards = () => [...document.querySelectorAll('.ndi-card:not(.ndi-new):not(.ndi-empty)')]

beforeEach(() => { vi.clearAllMocks(); setDesktop(true) })
afterEach(() => { delete window.matchMedia })

describe('Compras parceladas no desktop (design "Nancy Desktop", tela 17)', () => {
  it('abas do Extrato (Parceladas acesa) e um cartão por compra: nome, parcelas pagas, valor por mês, restante e término', async () => {
    setup()
    await screen.findByText('Notebook')
    const tabs = within(screen.getByRole('navigation', { name: 'Seções do extrato' })).getAllByRole('button')
    expect(tabs.map(t => t.textContent)).toEqual(['Extrato', 'Contas do mês', 'Parceladas', 'Análise'])
    expect(tabs[2]).toHaveClass('on')
    const c = cards()[0]
    expect(c.querySelector('.ndi-name')).toHaveTextContent('Notebook')
    expect(c.querySelector('.ndi-prog')).toHaveTextContent('3 de 10 parcelas')
    expect(c.querySelector('.ndi-val')).toHaveTextContent('R$ 600,00/mês')
    expect(c.querySelector('.ndi-rest')).toHaveTextContent('Restante: R$ 4.200,00 · termina em jun 2027') // 1ª parcela em set/2026, 10 parcelas
    expect(within(c).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '30')
    expect(within(c).getByRole('button', { name: 'Pagar parcela 4/10' })).toBeInTheDocument()
    expect(document.querySelector('.fin-hero')).toBeNull()
  })

  it('compra quitada mostra "Quitado" no lugar do restante e do botão', async () => {
    setup()
    await screen.findByText('Celular')
    const c = cards()[2]
    expect(c).toHaveClass('done')
    expect(c.querySelector('.ndi-quit')).toHaveTextContent('Quitado')
    expect(within(c).queryByRole('button', { name: /Pagar parcela/ })).not.toBeInTheDocument()
  })

  it('pagar parcela chama a API e avisa', async () => {
    installmentsAPI.pay.mockResolvedValue({})
    setup()
    await screen.findByText('Notebook')
    await userEvent.click(within(cards()[0]).getByRole('button', { name: /Pagar parcela/ }))
    await waitFor(() => expect(installmentsAPI.pay).toHaveBeenCalledWith('i1'))
    expect(await screen.findByText('Parcela registrada como transação!')).toBeInTheDocument()
  })

  it('tocar no cabeçalho abre Desfazer e Remover compra; remover pede confirmação', async () => {
    installmentsAPI.unpay.mockResolvedValue({})
    installmentsAPI.remove.mockResolvedValue({})
    setup()
    await screen.findByText('Notebook')
    await userEvent.click(within(cards()[0]).getByRole('button', { name: /Notebook/ }))
    await userEvent.click(within(cards()[0]).getByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(installmentsAPI.unpay).toHaveBeenCalledWith('i1'))
    await userEvent.click(within(cards()[0]).getByRole('button', { name: 'Remover parcelamento' }))
    expect(screen.getByRole('dialog', { name: /Remover parcelamento/ })).toBeInTheDocument()
    expect(installmentsAPI.remove).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Sim, excluir' }))
    await waitFor(() => expect(installmentsAPI.remove).toHaveBeenCalledWith('i1'))
  })

  it('nova compra: divide o valor pelo número de parcelas, mostra o resultado e cria', async () => {
    installmentsAPI.create.mockResolvedValue({ data: {} })
    setup()
    await screen.findByText('Notebook')
    const form = screen.getByRole('form', { name: 'Nova compra parcelada' })
    fireEvent.change(within(form).getByPlaceholderText('O que você comprou?'), { target: { value: 'TV' } })
    const total = within(form).getByPlaceholderText('Valor total')
    fireEvent.change(total, { target: { value: '1000' } })
    fireEvent.blur(total)
    fireEvent.change(within(form).getByPlaceholderText('Parcelas'), { target: { value: '3' } })
    expect(within(form).getByText('3 parcelas de R$ 333,33')).toBeInTheDocument()
    expect(within(form).getByText(/Total das parcelas: R\$ 999,99/)).toBeInTheDocument() // arredondamento explicado
    await userEvent.click(within(form).getByRole('button', { name: /Adicionar parcela/ }))
    await waitFor(() => expect(installmentsAPI.create).toHaveBeenCalledWith({ name: 'TV', amount: 333.33, totalInstallments: 3 }))
  })

  it('número de parcelas fora de 2 a 360 avisa e não cria', async () => {
    setup()
    await screen.findByText('Notebook')
    const form = screen.getByRole('form', { name: 'Nova compra parcelada' })
    fireEvent.change(within(form).getByPlaceholderText('O que você comprou?'), { target: { value: 'TV' } })
    const total = within(form).getByPlaceholderText('Valor total')
    fireEvent.change(total, { target: { value: '100' } }); fireEvent.blur(total)
    fireEvent.change(within(form).getByPlaceholderText('Parcelas'), { target: { value: '1' } })
    await userEvent.click(within(form).getByRole('button', { name: /Adicionar parcela/ }))
    expect(await screen.findByText('O número de parcelas deve ser de 2 a 360.')).toBeInTheDocument()
    expect(installmentsAPI.create).not.toHaveBeenCalled()
  })

  it('sem compras: o aviso do estado vazio e o formulário continuam', async () => {
    setup([])
    expect(await screen.findByText('Nenhuma compra parcelada')).toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'Nova compra parcelada' })).toBeInTheDocument()
  })

  it('sem o mês de início na resposta, não inventa o término', async () => {
    setup([plan({ startMonth: undefined, startYear: undefined })])
    await screen.findByText('Notebook')
    expect(cards()[0].querySelector('.ndi-rest').textContent).toBe('Restante: R$ 4.200,00')
  })
})

describe('Compras parceladas — celular continua o mesmo', () => {
  it('abaixo de 901px: cabeçalho azul e cartões do celular', async () => {
    setDesktop(false)
    setup()
    expect(await screen.findByRole('heading', { name: 'Compras parceladas' })).toBeInTheDocument()
    expect(document.querySelector('.inst-card')).not.toBeNull()
    expect(document.querySelector('.ndi-card')).toBeNull()
  })
})
