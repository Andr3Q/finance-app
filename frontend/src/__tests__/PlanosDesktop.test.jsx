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

beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); setDesktop(true) })
afterEach(() => { delete window.matchMedia })

describe('Planos no desktop (design "Nancy Desktop", tela 30)', () => {
  it('menu da conta com Planos aceso e os três cartões de plano lado a lado', () => {
    const { container } = setup('free')
    expect(within(screen.getByRole('navigation', { name: 'Conta' })).getByRole('button', { name: 'Planos' })).toHaveAttribute('aria-current', 'page')
    expect(container.querySelector('.nst-pl')).not.toBeNull()
    expect(container.querySelectorAll('.nst-pl .pl-card.pl-free, .nst-pl .pl-card.pl-pro, .nst-pl .pl-card.pl-elite').length).toBe(3)
    expect(screen.queryByRole('button', { name: 'Voltar' })).not.toBeInTheDocument()
  })

  it('o plano atual aparece marcado e o botão de upgrade segue funcionando (Pro -> Elite)', async () => {
    window.open = vi.fn(() => ({ close: vi.fn(), location: {} }))
    paymentsAPI.createPreference.mockResolvedValue({ data: { checkoutUrl: 'https://pagamento.exemplo/x' } })
    const { container } = setup('pro')
    expect(container.querySelector('.pl-pro')).toHaveAttribute('aria-current', 'true')
    await userEvent.click(screen.getByRole('button', { name: /fazer upgrade para elite/i }))
    expect(paymentsAPI.createPreference).toHaveBeenCalledWith('elite', 'monthly')
  })

  it('alternar Mensal/Anual muda o período enviado ao pagamento', async () => {
    window.open = vi.fn(() => ({ close: vi.fn(), location: {} }))
    paymentsAPI.createPreference.mockResolvedValue({ data: { checkoutUrl: 'https://pagamento.exemplo/x' } })
    setup('free')
    expect(screen.getByRole('button', { name: 'Mensal' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: /^Anual/ }))
    expect(screen.getByRole('button', { name: /^Anual/ })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: /assinar pro/i }))
    expect(paymentsAPI.createPreference).toHaveBeenCalledWith('pro', 'annual')
  })

  it('Elite: "Mudar para Pro" abre o aviso de rebaixamento por cima da tela', async () => {
    setup('elite')
    await userEvent.click(screen.getByRole('button', { name: /mudar para pro/i }))
    expect(screen.getByRole('dialog', { name: /downgrade de plano/i })).toBeInTheDocument()
  })

  it('sem login a página continua a de sempre (sem menu da conta)', () => {
    setup('free', { logged: false })
    expect(screen.queryByRole('navigation', { name: 'Conta' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument()
  })
})

describe('Planos — celular continua o mesmo', () => {
  it('no celular não há menu da conta e o botão Voltar segue lá', () => {
    setDesktop(false)
    const { container } = setup('free')
    expect(screen.queryByRole('navigation', { name: 'Conta' })).not.toBeInTheDocument()
    expect(container.querySelector('.nst-pl')).toBeNull()
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument()
  })
})
