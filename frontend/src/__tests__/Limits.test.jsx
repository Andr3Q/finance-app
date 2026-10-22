import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import Limits from '../pages/Limits.jsx'

vi.mock('../services/api.js', () => ({
  transactionsAPI: { dashboard: vi.fn() },
  budgetAPI: { setLimit: vi.fn(), removeLimit: vi.fn() },
}))
vi.mock('../services/cache.js', () => ({ getCache: vi.fn(() => null), setCache: vi.fn(), invalidateCache: vi.fn() }))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))

import { transactionsAPI, budgetAPI } from '../services/api.js'
import { invalidateCache } from '../services/cache.js'

const expense = (category, amount) => ({ type: 'expense', category, amount })
const DASH = {
  limits: [{ category: 'shopping', amount: 500 }, { category: 'food', amount: 1500 }, { category: 'transport', amount: 600 }],
  transactions: [expense('food', 1165), expense('transport', 575), expense('shopping', 350), { type: 'income', category: 'food', amount: 5000 }],
}

function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}</div> }
function renderPage({ plan = 'pro', data = DASH, entries = ['/limites'], index } = {}) {
  const user = { id: 'u1', plan }
  sessionStorage.setItem('user', JSON.stringify(user))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: user }))
  if (data instanceof Error) transactionsAPI.dashboard.mockRejectedValue(data)
  else transactionsAPI.dashboard.mockResolvedValue({ data })
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <Where />
      <Routes>
        <Route path="/limites" element={<Limits />} />
        <Route path="*" element={<div>outra tela</div>} />
      </Routes>
    </MemoryRouter>
  )
}
const names = () => Array.from(document.querySelectorAll('.lm-name')).map(n => n.textContent)
const type = (el, value) => fireEvent.change(el, { target: { value } })

beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); localStorage.clear(); budgetAPI.setLimit.mockResolvedValue({}); budgetAPI.removeLimit.mockResolvedValue({}) })

describe('Limites', () => {
  it('uma linha por categoria com teto, na ordem do design, com "gasto / teto" e a situação de cada uma', async () => {
    renderPage()
    expect(await screen.findByText('Limites por categoria')).toBeInTheDocument()
    expect(screen.getByText('Teto de gasto por categoria')).toBeInTheDocument()
    expect(screen.getByText('A Nancy avisa quando passar de 80%')).toBeInTheDocument()
    expect(names()).toEqual(['Alimentação', 'Transporte', 'Shopping'])
    expect(Array.from(document.querySelectorAll('.lm-amt')).map(n => n.textContent)).toEqual([
      'R$ 1.165,00 / R$ 1.500,00', 'R$ 575,00 / R$ 600,00', 'R$ 350,00 / R$ 500,00',
    ])
    expect(screen.getByText('R$ 335,00 disponível')).toBeInTheDocument()
    expect(screen.getByText('Atenção: 96% usado')).toHaveClass('warn')
    expect(screen.getByText('R$ 150,00 disponível')).not.toHaveClass('warn')
    const fills = Array.from(document.querySelectorAll('.lm-fill'))
    expect(fills.map(f => f.className)).toEqual(['lm-fill ok', 'lm-fill warn', 'lm-fill ok'])
    expect(fills[0].style.width).toMatch(/^77\.6/)
    expect(fills[2].style.width).toBe('70%')
  })

  it('estourou o teto: barra cheia e vermelha com quanto passou', async () => {
    renderPage({ data: { limits: [{ category: 'leisure', amount: 200 }], transactions: [expense('leisure', 260.5)] } })
    expect(await screen.findByText('Passou R$ 60,50 do limite')).toHaveClass('over')
    const fill = document.querySelector('.lm-fill')
    expect(fill).toHaveClass('over')
    expect(fill.style.width).toBe('100%')
  })

  it('"Novo limite": mostra as 8 categorias, escolhe a primeira sem teto e salva pela API, recarregando a lista', async () => {
    renderPage()
    await screen.findByText('Novo limite')
    expect(screen.getAllByRole('radio').map(r => r.textContent)).toEqual(['Alimentação', 'Transporte', 'Shopping', 'Saúde'])
    expect(screen.getByRole('radio', { name: 'Saúde' })).toHaveAttribute('aria-checked', 'true')   // primeira sem teto
    transactionsAPI.dashboard.mockResolvedValue({ data: { ...DASH, limits: [...DASH.limits, { category: 'health', amount: 300 }] } })
    type(screen.getByPlaceholderText('Teto (R$)'), '300')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(budgetAPI.setLimit).toHaveBeenCalledWith({ category: 'health', amount: 300 }))
    expect(await screen.findByText('Limite salvo!')).toBeInTheDocument()
    expect(invalidateCache).toHaveBeenCalledWith('dashboard')
    await waitFor(() => expect(names()).toContain('Saúde'))
  })

  it('"Mais" mostra as outras 4 categorias e "Menos" volta; com teto numa delas, as 8 já vêm abertas', async () => {
    renderPage()
    await screen.findByText('Novo limite')
    fireEvent.click(screen.getByRole('button', { name: 'Mais' }))
    expect(screen.getAllByRole('radio').map(r => r.textContent)).toEqual(['Alimentação', 'Transporte', 'Shopping', 'Saúde', 'Lazer', 'Educação', 'Casa', 'Outros'])
    fireEvent.click(screen.getByRole('radio', { name: 'Casa' }))
    expect(screen.getByRole('radio', { name: 'Casa' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Menos' }))
    expect(screen.getAllByRole('radio')).toHaveLength(4)
  })

  it('categoria extra com teto: as 8 categorias vêm abertas e não há "Mais"', async () => {
    renderPage({ data: { limits: [{ category: 'leisure', amount: 200 }], transactions: [expense('leisure', 50)] } })
    await screen.findByText('Novo limite')
    expect(screen.getAllByRole('radio')).toHaveLength(8)
    expect(screen.queryByRole('button', { name: /^(Mais|Menos)$/ })).not.toBeInTheDocument()
    expect(names()).toEqual(['Lazer'])
  })

  it('todas as 4 principais com teto: a escolha inicial cai numa extra e as 8 abrem', async () => {
    renderPage({ data: { limits: ['food', 'transport', 'shopping', 'health'].map(category => ({ category, amount: 100 })), transactions: [] } })
    await screen.findByText('Novo limite')
    expect(screen.getByRole('radio', { name: 'Lazer' })).toHaveAttribute('aria-checked', 'true')
  })

  it('escolher uma categoria que já tem teto abre o valor pra editar', async () => {
    renderPage()
    await screen.findByText('Novo limite')
    fireEvent.click(screen.getByRole('radio', { name: 'Transporte' }))
    expect(screen.getByPlaceholderText('Teto (R$)')).toHaveValue('600,00')
    expect(screen.getByRole('radio', { name: 'Transporte' })).toHaveAttribute('aria-checked', 'true')
  })

  it('salvar sem valor avisa e não chama a API; erro do servidor aparece e o valor continua', async () => {
    renderPage()
    await screen.findByText('Novo limite')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Informe o teto de gasto.')
    expect(budgetAPI.setLimit).not.toHaveBeenCalled()
    budgetAPI.setLimit.mockRejectedValue({ response: { data: { error: 'Valor excede o limite permitido.' } } })
    type(screen.getByPlaceholderText('Teto (R$)'), '999')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Valor excede o limite permitido.')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Teto (R$)')).toHaveValue('999,00')
  })

  it('o X remove o teto da categoria e recarrega', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Remover limite de Shopping' }))
    await waitFor(() => expect(budgetAPI.removeLimit).toHaveBeenCalledWith('shopping'))
    expect(invalidateCache).toHaveBeenCalledWith('dashboard')
    expect(transactionsAPI.dashboard).toHaveBeenCalledTimes(2)
  })

  it('sem nenhum teto: mensagem vazia e o formulário continua disponível', async () => {
    renderPage({ data: { limits: [], transactions: [] } })
    expect(await screen.findByText(/Nenhum limite definido/)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Alimentação' })).toHaveAttribute('aria-checked', 'true')
  })

  it('ocultar valores (preferência do Início) mascara os valores e mantém a porcentagem', async () => {
    localStorage.setItem('hide-balance', '1')
    renderPage()
    await screen.findByText('Limites por categoria')
    expect(Array.from(document.querySelectorAll('.lm-amt')).map(n => n.textContent)).toEqual(Array(3).fill('R$ •••• / R$ ••••'))
    expect(screen.getAllByText('R$ •••• disponível')).toHaveLength(2)
    expect(screen.getByText('Atenção: 96% usado')).toBeInTheDocument()
  })

  it('plano grátis vê o convite, não chama a API, e "Ver planos" leva aos planos', async () => {
    renderPage({ plan: 'free' })
    expect(await screen.findByText('Recurso Pro')).toBeInTheDocument()
    expect(transactionsAPI.dashboard).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Ver planos' }))
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/planos'))
  })

  it('falha ao carregar mostra "Tentar de novo", que recarrega', async () => {
    renderPage({ data: new Error('off') })
    expect(await screen.findByText('Não foi possível carregar')).toBeInTheDocument()
    transactionsAPI.dashboard.mockResolvedValue({ data: DASH })
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Alimentação', { selector: '.lm-name' })).toBeInTheDocument()
  })

  it('voltar retorna à tela anterior', async () => {
    renderPage({ entries: ['/goals', '/limites'], index: 1 })
    fireEvent.click(await screen.findByRole('button', { name: 'Voltar' }))
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/goals'))
  })
})
