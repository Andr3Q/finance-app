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

function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}</div> }
function renderPage({ plan = 'elite', data = SUBS, entries = ['/assinaturas'], index } = {}) {
  const user = { id: 'u1', plan }
  sessionStorage.setItem('user', JSON.stringify(user))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: user }))
  if (data instanceof Error) transactionsAPI.subscriptions.mockRejectedValue(data)
  else transactionsAPI.subscriptions.mockResolvedValue({ data })
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <Where />
      <Routes>
        <Route path="/assinaturas" element={<Subscriptions />} />
        <Route path="*" element={<div>outra tela</div>} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear(); localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'], now: NOW })
})
afterEach(() => { vi.useRealTimers() })

describe('Assinaturas', () => {
  it('total detectado e uma linha por assinatura, com valor e há quanto tempo foi a última cobrança', async () => {
    renderPage()
    const sum = await screen.findByLabelText('Total das assinaturas')
    expect(within(sum).getByText('A Nancy detectou')).toBeInTheDocument()
    expect(within(sum).getByText('R$ 119,00/mês')).toBeInTheDocument()
    expect(screen.getByText('R$ 55,90 · cobrada há 2 dias')).toBeInTheDocument()
    expect(screen.getByText('R$ 21,90 · cobrada hoje')).toBeInTheDocument()
    expect(screen.getByText('R$ 41,20 · cobrada há 40 dias')).toBeInTheDocument()
    expect(screen.getByText('Desative para a Nancy lembrar você de cancelar.')).toBeInTheDocument()
    expect(transactionsAPI.subscriptions).toHaveBeenCalledWith({ strict: 1 })
  })

  it('a cobrança que parou de vir (mais de 35 dias) aparece em vermelho; as outras não', async () => {
    renderPage()
    expect((await screen.findByText(/cobrada há 40 dias/)).className).toContain('stale')
    expect(screen.getByText(/cobrada há 2 dias/).className).not.toContain('stale')
  })

  it('interruptores começam ligados (mantida); desligar guarda o lembrete e ligar de novo remove', async () => {
    renderPage()
    const sw = await screen.findAllByRole('switch')
    expect(sw.map(s => s.getAttribute('aria-checked'))).toEqual(['true', 'true', 'true'])
    fireEvent.click(sw[2])
    expect(sw[2]).toHaveAttribute('aria-checked', 'false')
    expect(JSON.parse(localStorage.getItem('nancy:subs-cancel'))['armazenamento em nuvem']).toMatchObject({ name: 'Armazenamento em nuvem', amount: 41.2 })
    fireEvent.click(sw[2])
    expect(sw[2]).toHaveAttribute('aria-checked', 'true')
    expect(JSON.parse(localStorage.getItem('nancy:subs-cancel'))).toEqual({})
  })

  it('o lembrete marcado continua marcado ao reabrir a tela', async () => {
    const first = renderPage()
    fireEvent.click((await screen.findAllByRole('switch'))[0])
    first.unmount()
    renderPage()
    expect((await screen.findAllByRole('switch')).map(s => s.getAttribute('aria-checked'))).toEqual(['false', 'true', 'true'])
  })

  it('ocultar valores esconde os R$', async () => {
    localStorage.setItem('hide-balance', '1')
    renderPage()
    await screen.findByLabelText('Total das assinaturas')
    expect(screen.queryByText(/R\$ \d/)).not.toBeInTheDocument()
    expect(screen.getByText('R$ ••••/mês')).toBeInTheDocument()
  })

  it('quem não é Elite vê o convite e nada é buscado', async () => {
    renderPage({ plan: 'pro' })
    expect(await screen.findByText('Recurso Elite')).toBeInTheDocument()
    expect(transactionsAPI.subscriptions).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Ver planos' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/planos')
  })

  it('sem assinaturas detectadas: explica o que falta; falha ao carregar: tentar de novo', async () => {
    const empty = renderPage({ data: [] })
    expect(await screen.findByText('Nenhuma assinatura detectada ainda')).toBeInTheDocument()
    empty.unmount()
    renderPage({ data: new Error('offline') })
    expect(await screen.findByText('Não foi possível carregar')).toBeInTheDocument()
    transactionsAPI.subscriptions.mockResolvedValue({ data: SUBS })
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('A Nancy detectou')).toBeInTheDocument()
  })

  it('voltar retorna à tela anterior; aberta direto pela URL vai pras Metas', async () => {
    const first = renderPage({ entries: ['/goals', '/assinaturas'], index: 1 })
    fireEvent.click(await screen.findByRole('button', { name: 'Voltar' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/goals')
    first.unmount()
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Voltar' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/goals')
  })
})
