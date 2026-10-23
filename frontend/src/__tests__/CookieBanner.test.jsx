import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CookieBanner, { hasConsent } from '../components/features/CookieBanner.jsx'

vi.mock('../services/analytics.js', () => ({ initAnalytics: vi.fn() }))
import { initAnalytics } from '../services/analytics.js'

const KEY = 'analytics-consent'
function renderBanner({ loggedIn = false } = {}) {
  const user = loggedIn ? { id: 'u1', name: 'Ana' } : {}
  sessionStorage.setItem('user', JSON.stringify(user))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: user }))
  return render(<MemoryRouter><CookieBanner /></MemoryRouter>)
}

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear() })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Aviso de cookies', () => {
  it('sem decisão guardada: mostra o texto, o link da Política de Privacidade e os dois botões', () => {
    renderBanner()
    const region = screen.getByRole('region', { name: 'Aviso de cookies' })
    expect(region).toHaveTextContent('Usamos cookies analíticos para melhorar sua experiência. Seus dados nunca são vendidos.')
    expect(screen.getByRole('link', { name: 'Política de Privacidade' })).toHaveAttribute('href', '/privacidade')
    expect(screen.getByRole('button', { name: 'Recusar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aceitar' })).toBeInTheDocument()
  })

  it('Aceitar guarda "accepted", liga o analytics e some', () => {
    renderBanner()
    fireEvent.click(screen.getByRole('button', { name: 'Aceitar' }))
    expect(localStorage.getItem(KEY)).toBe('accepted')
    expect(initAnalytics).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('region', { name: 'Aviso de cookies' })).not.toBeInTheDocument()
    expect(hasConsent()).toBe(true)
  })

  it('Recusar guarda "declined", NÃO liga o analytics e some', () => {
    renderBanner()
    fireEvent.click(screen.getByRole('button', { name: 'Recusar' }))
    expect(localStorage.getItem(KEY)).toBe('declined')
    expect(initAnalytics).not.toHaveBeenCalled()
    expect(screen.queryByRole('region', { name: 'Aviso de cookies' })).not.toBeInTheDocument()
    expect(hasConsent()).toBe(false)
  })

  it('quem já decidiu (aceitou ou recusou) não vê o aviso de novo', () => {
    for (const value of ['accepted', 'declined']) {
      localStorage.setItem(KEY, value)
      const { container, unmount } = renderBanner()
      expect(container).toBeEmptyDOMElement()
      unmount()
    }
  })

  it('armazenamento bloqueado (aba privada): decidir não quebra e o aviso some nesta visita', () => {
    renderBanner()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado') }) // depois do render: o helper também grava no storage
    fireEvent.click(screen.getByRole('button', { name: 'Aceitar' }))
    expect(screen.queryByRole('region', { name: 'Aviso de cookies' })).not.toBeInTheDocument()
    expect(initAnalytics).toHaveBeenCalledTimes(1)
  })

  it('logado, o cartão sobe pra ficar acima da barra de baixo (classe ck-nav); visitante não', () => {
    const logged = renderBanner({ loggedIn: true })
    expect(screen.getByRole('region', { name: 'Aviso de cookies' })).toHaveClass('ck-banner', 'ck-nav')
    logged.unmount()
    renderBanner()
    expect(screen.getByRole('region', { name: 'Aviso de cookies' })).not.toHaveClass('ck-nav')
  })

  it('enquanto aberto, avisa a página (data-ck-open e --ck-pad); ao decidir ou desmontar, tira tudo', () => {
    const root = document.documentElement
    const first = renderBanner()
    expect(root).toHaveAttribute('data-ck-open')
    expect(root.style.getPropertyValue('--ck-pad')).toContain('env(safe-area-inset-bottom')
    fireEvent.click(screen.getByRole('button', { name: 'Recusar' }))
    expect(root).not.toHaveAttribute('data-ck-open')
    expect(root.style.getPropertyValue('--ck-pad')).toBe('')
    first.unmount()

    localStorage.clear()
    const second = renderBanner()
    expect(root).toHaveAttribute('data-ck-open')
    second.unmount() // sair da tela com o aviso aberto não deixa o respiro nem o "data-ck-open" pra trás
    expect(root).not.toHaveAttribute('data-ck-open')
    expect(root.style.getPropertyValue('--ck-pad')).toBe('')
  })

  it('o respiro acompanha a altura do cartão: quando ele muda de tamanho, o --ck-pad é recalculado', () => {
    let notify
    vi.stubGlobal('ResizeObserver', class { constructor(cb) { notify = cb } observe() {} disconnect() {} })
    let height = 132
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ height, width: 300, top: 0, left: 0, right: 300, bottom: height, x: 0, y: 0, toJSON() {} }))
    renderBanner()
    const root = document.documentElement
    expect(root.style.getPropertyValue('--ck-pad')).toMatch(/^calc\(132px \+ 12px/)
    height = 176 // ex.: o texto passou a quebrar em mais linhas
    act(() => notify())
    expect(root.style.getPropertyValue('--ck-pad')).toMatch(/^calc\(176px \+ 12px/)
  })
})
