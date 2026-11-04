import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import Subscriptions from '../pages/Subscriptions.jsx'

vi.mock('../services/api.js', () => ({ transactionsAPI: { subscriptions: vi.fn() } }))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))
import { transactionsAPI } from '../services/api.js'

const NOW = new Date(2026, 9, 21, 12)
const daysAgo = (n) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString()
const SUBS = [
  { description: 'Streaming de vídeo', amount: 55.9, lastDate: daysAgo(2) },
  { description: 'Música', amount: 21.9, lastDate: daysAgo(0) },
  { description: 'Armazenamento em nuvem', amount: 41.2, lastDate: daysAgo(40) },
]
const setDesktop = (is) => { window.matchMedia = vi.fn(() => ({ matches: is, addEventListener() {}, removeEventListener() {} })) }
function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}</div> }
function setup({ plan = 'elite', data = SUBS } = {}) {
  const user = { id: 'u-subs', plan }
  sessionStorage.setItem('user', JSON.stringify(user))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: user }))
  if (data instanceof Error) transactionsAPI.subscriptions.mockRejectedValue(data)
  else transactionsAPI.subscriptions.mockResolvedValue({ data })
  return render(<MemoryRouter initialEntries={['/assinaturas']}><Where /><Routes><Route path="/assinaturas" element={<Subscriptions />} /><Route path="*" element={<div>outra tela</div>} /></Routes></MemoryRouter>)
}
const items = () => [...document.querySelectorAll('.nsb-item')]

beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); localStorage.clear(); vi.useFakeTimers({ toFake: ['Date'], now: NOW }); setDesktop(true) })
afterEach(() => { vi.useRealTimers(); delete window.matchMedia })

describe('Assinaturas no desktop (design "Nancy Desktop", tela 22)', () => {
  it('abas de Metas e o cartão azul com o total por mês e o aviso de assinatura sem cobrança', async () => {
    setup()
    expect(await screen.findByLabelText('Total das assinaturas')).toHaveTextContent('A Nancy detectou')
    expect(screen.getByLabelText('Total das assinaturas')).toHaveTextContent('R$ 119,00/mês') // 55,90 + 21,90 + 41,20
    expect(screen.getByLabelText('Total das assinaturas')).toHaveTextContent('1 assinatura sem cobrança há mais de 35 dias.')
    const tabs = within(screen.getByRole('navigation', { name: 'Seções de metas' })).getAllByRole('button')
    expect(tabs[2]).toHaveTextContent('Assinaturas')
    expect(document.querySelector('.fin-hero')).toBeNull()
  })

  it('uma linha por assinatura: nome, última cobrança (vermelha quando parou), valor e interruptor ligado', async () => {
    setup()
    await screen.findByText('Música')
    expect(items().map(i => i.querySelector('.nsb-name').textContent)).toEqual(['Streaming de vídeo', 'Música', 'Armazenamento em nuvem'])
    expect(items()[0].querySelector('.nsb-sub')).toHaveTextContent('Última cobrança há 2 dias')
    expect(items()[1].querySelector('.nsb-sub')).toHaveTextContent('Última cobrança hoje')
    expect(items()[2].querySelector('.nsb-sub')).toHaveClass('stale')
    expect(items()[0].querySelector('.nsb-val')).toHaveTextContent('R$ 55,90')
    expect(screen.getAllByRole('switch').every(s => s.getAttribute('aria-checked') === 'true')).toBe(true)
  })

  it('o interruptor liga e desliga o "lembrar de cancelar" (guardado no aparelho)', async () => {
    setup()
    const sw = await screen.findByRole('switch', { name: 'Manter Música' })
    fireEvent.click(sw)
    expect(screen.getByRole('switch', { name: 'Manter Música' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('switch', { name: 'Manter Música' })).not.toHaveClass('on')
    fireEvent.click(screen.getByRole('switch', { name: 'Manter Música' }))
    expect(screen.getByRole('switch', { name: 'Manter Música' })).toHaveAttribute('aria-checked', 'true')
  })

  it('sem assinatura parada, o cartão azul orienta o interruptor; "ocultar valores" esconde os reais', async () => {
    localStorage.setItem('hide-balance', '1')
    setup({ data: SUBS.slice(0, 2) })
    expect(await screen.findByLabelText('Total das assinaturas')).toHaveTextContent('Desative para a Nancy lembrar você de cancelar.')
    expect(document.body.textContent).not.toMatch(/55,90|119/)
    expect(items()[0].querySelector('.nsb-val')).toHaveTextContent('R$ ••••')
  })

  it('fora do Elite: convite e "Ver planos"; sem assinaturas e falha mantêm os textos do app', async () => {
    const a = setup({ plan: 'pro' })
    expect(await screen.findByRole('heading', { name: 'Recurso Elite' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ver planos' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/planos')
    a.unmount()
    const b = setup({ data: [] })
    expect(await screen.findByText('Nenhuma assinatura detectada ainda')).toBeInTheDocument()
    b.unmount()
    setup({ data: new Error('rede') })
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })
})

describe('Assinaturas — celular continua o mesmo', () => {
  it('abaixo de 901px: cabeçalho azul e lista do celular', async () => {
    setDesktop(false)
    setup()
    expect(await screen.findByRole('heading', { name: 'Assinaturas' })).toBeInTheDocument()
    expect(document.querySelector('.sb-list')).not.toBeNull()
    expect(document.querySelector('.nsb-list')).toBeNull()
  })
})
