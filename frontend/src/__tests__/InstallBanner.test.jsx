import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import InstallBanner from '../components/features/InstallBanner.jsx'

beforeEach(() => {
  localStorage.clear()
  window.innerWidth = 390
})

async function renderAt(path) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <InstallBanner />
    </MemoryRouter>
  )
  // o componente decide se mostra dentro de um useEffect (pós-montagem)
  await waitFor(() => {})
}

test('não renderiza nas telas de autenticação (bloqueava login no celular)', async () => {
  for (const path of ['/login', '/register', '/forgot-password', '/reset-password', '/verify-email']) {
    const { unmount } = render(
      <MemoryRouter initialEntries={[path]}>
        <InstallBanner />
      </MemoryRouter>
    )
    await waitFor(() => {})
    expect(screen.queryByText('Instalar Nancy')).not.toBeInTheDocument()
    unmount()
  }
})

test('continua renderizando fora das telas de autenticação', async () => {
  await renderAt('/dashboard')
  expect(await screen.findByText('Instalar Nancy')).toBeInTheDocument()
})

// O design do Nancy não usa emoji: o aviso de instalar tinha 📲, ⚡, ⋮ e ⊕ no texto.
const EMOJI_OR_GLYPH = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2295}\u{22EE}]/u

describe('aviso de instalar — sem emoji', () => {
  it('celular, instruções do Chrome: sem emoji nem símbolos soltos; o menu e o "instalar" são ícones', async () => {
    window.innerWidth = 390
    await renderAt('/dashboard')
    const banner = (await screen.findByText('Instalar Nancy')).closest('div[style]').parentElement
    expect(banner.textContent).not.toMatch(EMOJI_OR_GLYPH)
    expect(banner.querySelector('svg[aria-label="menu"]')).not.toBeNull() // o ⋮ virou ícone
    expect(banner.textContent).toContain('Escolha "Instalar app"')
  })

  it('computador, instruções: sem emoji; o ⊕ virou ícone', async () => {
    window.innerWidth = 1280
    await renderAt('/dashboard')
    const banner = (await screen.findByText('Instalar Nancy')).closest('div[style]').parentElement
    expect(banner.textContent).not.toMatch(EMOJI_OR_GLYPH)
  })

  it('com o prompt nativo disponível, o botão é só "Instalar app" (sem ⚡) e o ícone é o do app', async () => {
    window.innerWidth = 1280
    await renderAt('/dashboard')
    await screen.findByText('Instalar Nancy')
    const evt = new Event('beforeinstallprompt', { cancelable: true })
    evt.prompt = vi.fn(); evt.userChoice = Promise.resolve({ outcome: 'dismissed' })
    window.dispatchEvent(evt)
    const btn = await screen.findByRole('button', { name: 'Instalar app' })
    expect(btn.textContent).not.toMatch(EMOJI_OR_GLYPH)
  })
})
