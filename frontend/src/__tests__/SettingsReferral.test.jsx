import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import SettingsReferral from '../pages/SettingsReferral.jsx'

vi.mock('../services/api.js', () => ({ authAPI: { referralStats: vi.fn() } }))
vi.mock('../services/analytics.js', () => ({ analytics: { track: vi.fn() } }))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))

import { authAPI } from '../services/api.js'
import { analytics } from '../services/analytics.js'

const STATS = { referralCode: 'A1B2C3D4', referredCount: 2, rewardedCount: 2, maxReferrals: 5, limitReached: false, bonusDays: 10 }
const LINK = `${window.location.origin}/register?ref=A1B2C3D4`

function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}</div> }
function renderPage({ stats = STATS, user = { id: 'u1', referralCode: 'A1B2C3D4' }, entries = ['/settings', '/settings/indique'], index = 1 } = {}) {
  sessionStorage.setItem('user', JSON.stringify(user))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: user }))
  if (stats instanceof Error) authAPI.referralStats.mockRejectedValue(stats)
  else authAPI.referralStats.mockResolvedValue({ data: stats })
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <Where />
      <Routes>
        <Route path="/settings/indique" element={<SettingsReferral />} />
        <Route path="*" element={<div>outra tela</div>} />
      </Routes>
    </MemoryRouter>
  )
}

let writeText
beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear()
  writeText = vi.fn().mockResolvedValue()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  Object.defineProperty(navigator, 'share', { value: undefined, configurable: true, writable: true })
})

describe('Indique e ganhe', () => {
  it('mostra o código, o bônus e o andamento dos convites vindos do servidor', async () => {
    renderPage()
    expect(await screen.findByText('2 de 5')).toBeInTheDocument()
    expect(screen.getByText('Ganhe 10 dias de Pro por amigo.')).toBeInTheDocument()
    expect(screen.getByText('A1B2C3D4')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2')
    expect(screen.getByText('Mais 3 amigos e você completa o limite de bônus.')).toBeInTheDocument()
    expect(document.querySelector('.rf-bar-fill').style.width).toBe('40%')
  })

  it('usa o bônus e o limite que o servidor informar, não números fixos', async () => {
    renderPage({ stats: { ...STATS, bonusDays: 30, maxReferrals: 8, rewardedCount: 1, referredCount: 1 } })
    expect(await screen.findByText('1 de 8')).toBeInTheDocument()
    expect(screen.getByText('Ganhe 30 dias de Pro por amigo.')).toBeInTheDocument()
    expect(screen.getByText(/Até 8 amigos com bônus/)).toBeInTheDocument()
  })

  it('singular quando falta um amigo; sem amigos cadastrados convida a compartilhar', async () => {
    const one = renderPage({ stats: { ...STATS, rewardedCount: 4, referredCount: 4 } })
    expect(await screen.findByText('Mais 1 amigo e você completa o limite de bônus.')).toBeInTheDocument()
    one.unmount()
    renderPage({ stats: { ...STATS, rewardedCount: 0, referredCount: 0 } })
    expect(await screen.findByText('Nenhum amigo cadastrado ainda. Compartilhe seu convite!')).toBeInTheDocument()
  })

  it('amigos cadastrados que ainda não confirmaram o e-mail aparecem como pendentes (e não contam no "de 5")', async () => {
    renderPage({ stats: { ...STATS, referredCount: 4, rewardedCount: 2 } })
    expect(await screen.findByText('2 de 5')).toBeInTheDocument()
    expect(screen.getByText(/2 amigos cadastrados aguardam confirmar o e-mail/)).toBeInTheDocument()
    expect(document.querySelector('.rf-bar-fill').style.width).toBe('40%')
  })

  it('um único pendente concorda no singular', async () => {
    renderPage({ stats: { ...STATS, referredCount: 3, rewardedCount: 2 } })
    expect(await screen.findByText(/1 amigo cadastrado aguarda confirmar o e-mail/)).toBeInTheDocument()
  })

  it('limite alcançado: parabeniza e não oferece mais código nem compartilhar', async () => {
    renderPage({ stats: { ...STATS, rewardedCount: 5, referredCount: 5, limitReached: true } })
    expect(await screen.findByText('Você garantiu todos os bônus!')).toBeInTheDocument()
    expect(screen.getByText('5 de 5')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Copiar/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Compartilhar convite' })).not.toBeInTheDocument()
    expect(screen.queryByText('A1B2C3D4')).not.toBeInTheDocument()
  })

  it('Copiar copia o LINK de cadastro com o código e confirma com "Copiado!"', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Copiar/ }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(LINK))
    expect(await screen.findByRole('button', { name: /Copiado!/ })).toBeInTheDocument()
    expect(analytics.track).toHaveBeenCalledWith('referral_link_copied')
  })

  it('Compartilhar usa o compartilhamento do aparelho; sem ele, abre o WhatsApp com o link', async () => {
    const share = vi.fn().mockResolvedValue()
    Object.defineProperty(navigator, 'share', { value: share, configurable: true, writable: true })
    const first = renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Compartilhar convite' }))
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: LINK }))
    first.unmount()

    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true, writable: true })
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Compartilhar convite' }))
    expect(open).toHaveBeenCalledTimes(1)
    expect(open.mock.calls[0][0]).toContain('https://wa.me/?text=')
    expect(decodeURIComponent(open.mock.calls[0][0])).toContain(LINK)
    open.mockRestore()
  })

  it('"ou enviar por e-mail" abre o e-mail com o link', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'ou enviar por e-mail' }))
    expect(open.mock.calls[0][0]).toMatch(/^mailto:\?subject=/)
    expect(decodeURIComponent(open.mock.calls[0][0])).toContain(LINK)
    open.mockRestore()
  })

  it('sem o código no usuário salvo usa o que veio do servidor; sem nenhum, os botões ficam desligados', async () => {
    const first = renderPage({ user: { id: 'u1' } })
    expect(await screen.findByText('A1B2C3D4')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Compartilhar convite' })).toBeEnabled()
    first.unmount()
    renderPage({ user: { id: 'u1' }, stats: new Error('offline') })
    expect(await screen.findByText(/Não foi possível carregar seus convites/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Copiar/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Compartilhar convite' })).toBeDisabled()
  })

  it('falha ao carregar os números não impede de copiar quando o código já é conhecido', async () => {
    renderPage({ stats: new Error('offline') })
    expect(await screen.findByText(/Não foi possível carregar seus convites/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Copiar/ }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(LINK))
  })

  it('voltar retorna à tela anterior; aberta direto pela URL vai pro Perfil', async () => {
    const first = renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Voltar' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/settings')
    first.unmount()
    renderPage({ entries: ['/settings/indique'], index: 0 })
    fireEvent.click(await screen.findByRole('button', { name: 'Voltar' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/settings')
  })
})
