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
