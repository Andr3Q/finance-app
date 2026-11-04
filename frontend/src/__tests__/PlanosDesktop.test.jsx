import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Planos from '../pages/Planos.jsx'

vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))
vi.mock('../services/api.js', () => ({
  paymentsAPI: { createPreference: vi.fn() },
  authAPI:     { me: vi.fn() },
}))
vi.mock('../services/analytics.js', () => ({ analytics: { track: vi.fn(), identify: vi.fn() } }))
import { paymentsAPI } from '../services/api.js'

const setDesktop = (is) => { window.matchMedia = vi.fn(() => ({ matches: is, addEventListener() {}, removeEventListener() {} })) }
function setup(plan = 'free', { logged = true } = {}) {
  if (logged) {
    const u = { id: 'u-pl', name: 'Ana', plan, emailVerified: true }
    sessionStorage.setItem('user', JSON.stringify(u))
    window.dispatchEvent(new CustomEvent('user-updated', { detail: u }))
  }
  return render(
    <MemoryRouter initialEntries={['/planos']}>
      <Routes>
        <Route path="/planos" element={<Planos />} />
        <Route path="/register" element={<div>Tela de Registro</div>} />
        <Route path="/settings/pagamentos" element={<div>Tela de Pagamentos</div>} />
      </Routes>
    </MemoryRouter>
  )
}
const card = (name) => screen.getByRole('region', { name: `Plano ${name}` })

beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); setDesktop(true) })
afterEach(() => { delete window.matchMedia })

describe('Planos no desktop (design "Nancy Desktop", tela 30)', () => {
  it('menu da conta com Planos aceso; título e seletor na mesma linha e os três cartões, sem nada além do design', () => {
    const { container } = setup('elite')
    expect(within(screen.getByRole('navigation', { name: 'Conta' })).getByRole('button', { name: 'Planos' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { name: 'Controle total do seu dinheiro.' })).toBeInTheDocument()
    expect(container.querySelector('.ndpl-head .ndpl-toggle')).not.toBeNull()
    expect(container.querySelectorAll('.ndpl-grid .ndpl-card')).toHaveLength(3)
    // o design não tem comparativo, garantia, perguntas, frase de apoio nem notas de "cancele quando quiser"
    expect(container.querySelector('.pl-compare, .pl-guar, .pl-faq, .pl-lead, .pl-cta-note')).toBeNull()
    expect(screen.queryByText('Comparativo completo')).not.toBeInTheDocument()
    expect(screen.queryByText(/Cancele quando quiser/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Voltar' })).not.toBeInTheDocument()
  })

  it('textos e preços do design em cada cartão', () => {
    setup('elite')
    expect(within(card('Grátis')).getAllByRole('listitem').map(li => li.textContent)).toEqual(['Dashboard do mês', '20 transações por mês', 'Categorias de gastos', 'Exportação CSV'])
    expect(card('Grátis')).toHaveTextContent('R$ 0para sempre')
    expect(card('Pro')).toHaveTextContent('Para quem quer controle total')
    expect(card('Pro')).toHaveTextContent('R$ 9,90/mês')
    expect(within(card('Pro')).getAllByRole('listitem').map(li => li.textContent)).toEqual(['35 transações por mês', '35 contas fixas', 'Limites por categoria', 'Relatório PDF mensal', 'Histórico completo'])
    expect(card('Elite')).toHaveTextContent('O poder da IA nas suas finanças')
    expect(card('Elite')).toHaveTextContent('R$ 34,90/mês')
    expect(within(card('Elite')).getAllByRole('listitem').map(li => li.textContent)).toEqual(['Tudo do Pro', 'Nancy IA ilimitada (texto e áudio)', 'Planilha IA automática', 'Previsão mensal com IA', 'Detector de assinaturas'])
  })

  it('o Pro nunca promete transações ilimitadas (o limite real é 35 por mês)', () => {
    setup('free')
    expect(within(card('Pro')).queryByText(/ilimitadas/i)).not.toBeInTheDocument()
    expect(within(card('Pro')).getByText('35 transações por mês')).toBeInTheDocument()
  })

  it('Elite: selo "Atual" no Elite, "Seu plano atual" desligado e o Pro como "Mudar para Pro"', () => {
    setup('elite')
    expect(card('Elite')).toHaveAttribute('aria-current', 'true')
    expect(within(card('Elite')).getByText('Atual')).toBeInTheDocument()
    expect(within(card('Elite')).getByRole('button', { name: 'Seu plano atual' })).toBeDisabled()
    expect(within(card('Pro')).queryByText('Recomendado')).toBeInTheDocument()
    expect(within(card('Pro')).getByRole('button', { name: 'Mudar para Pro' })).toBeEnabled()
    expect(within(card('Grátis')).getByRole('button', { name: 'Plano básico' })).toBeDisabled()
  })

  it('"Mudar para Pro" no Elite abre o aviso de rebaixamento e não cobra', async () => {
    setup('elite')
    await userEvent.click(within(card('Pro')).getByRole('button', { name: 'Mudar para Pro' }))
    expect(screen.getByRole('dialog', { name: /downgrade de plano/i })).toBeInTheDocument()
    expect(paymentsAPI.createPreference).not.toHaveBeenCalled()
  })

  it('Grátis: Grátis é o atual, Pro é "Recomendado" e os dois pagos têm botão de assinar', async () => {
    window.open = vi.fn(() => ({ close: vi.fn(), location: {} }))
    paymentsAPI.createPreference.mockResolvedValue({ data: { checkoutUrl: 'https://www.mercadopago.com.br/x' } })
    setup('free')
    expect(card('Grátis')).toHaveAttribute('aria-current', 'true')
    expect(within(card('Pro')).getByText('Recomendado')).toBeInTheDocument()
    await userEvent.click(within(card('Elite')).getByRole('button', { name: 'Assinar Elite' }))
    expect(paymentsAPI.createPreference).toHaveBeenCalledWith('elite', 'monthly')
  })

  it('Pro: o Pro é o atual (selo "Atual") e o Elite oferece o upgrade', async () => {
    window.open = vi.fn(() => ({ close: vi.fn(), location: {} }))
    paymentsAPI.createPreference.mockResolvedValue({ data: { checkoutUrl: 'https://www.mercadopago.com.br/x' } })
    setup('pro')
    expect(within(card('Pro')).getByText('Atual')).toBeInTheDocument()
    expect(within(card('Pro')).queryByText('Recomendado')).not.toBeInTheDocument()
    expect(within(card('Pro')).getByRole('button', { name: 'Seu plano atual' })).toBeDisabled()
    await userEvent.click(within(card('Elite')).getByRole('button', { name: 'Fazer upgrade para Elite' }))
    expect(paymentsAPI.createPreference).toHaveBeenCalledWith('elite', 'monthly')
  })

  it('Anual troca os preços pelos que de fato se cobram (R$ 8,25 e R$ 27,90 por mês) e envia o período anual', async () => {
    window.open = vi.fn(() => ({ close: vi.fn(), location: {} }))
    paymentsAPI.createPreference.mockResolvedValue({ data: { checkoutUrl: 'https://www.mercadopago.com.br/x' } })
    setup('free')
    expect(screen.getByRole('button', { name: 'Mensal' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: /^Anual/ }))
    expect(screen.getByRole('button', { name: /^Anual/ })).toHaveAttribute('aria-pressed', 'true')
    expect(card('Pro')).toHaveTextContent('R$ 8,25/mês no anual')
    expect(card('Elite')).toHaveTextContent('R$ 27,90/mês no anual')
    await userEvent.click(within(card('Pro')).getByRole('button', { name: 'Assinar Pro' }))
    expect(paymentsAPI.createPreference).toHaveBeenCalledWith('pro', 'annual')
  })

  it('sem login a página continua a de sempre (sem menu da conta, com o comparativo)', () => {
    setup('free', { logged: false })
    expect(screen.queryByRole('navigation', { name: 'Conta' })).not.toBeInTheDocument()
    expect(screen.getByText('Comparativo completo')).toBeInTheDocument()
  })
})

describe('Planos — celular continua o mesmo', () => {
  it('no celular não há menu da conta, o botão Voltar segue lá e o comparativo também', () => {
    setDesktop(false)
    const { container } = setup('free')
    expect(screen.queryByRole('navigation', { name: 'Conta' })).not.toBeInTheDocument()
    expect(container.querySelector('.ndpl')).toBeNull()
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument()
    expect(screen.getByText('Comparativo completo')).toBeInTheDocument()
  })
})
