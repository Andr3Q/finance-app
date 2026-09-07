import { render, screen } from '@testing-library/react'
import ErrorBoundary from '../components/ui/ErrorBoundary.jsx'

// Suprime o log de erro que o React imprime no console para todo erro
// capturado por um Error Boundary — é ruído esperado nesses testes.
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  sessionStorage.clear()
})
afterEach(() => {
  console.error.mockRestore()
})

function ThrowChunkError() {
  throw new Error('Failed to fetch dynamically imported module: /assets/Foo-abc123.js')
}

function ThrowGenericError() {
  throw new Error('bug qualquer de render, não relacionado a chunk')
}

describe('ErrorBoundary — guarda contra loop de reload em erro de chunk', () => {
  test('regressão: reload NÃO se repete depois que a página já recarregou uma vez (sessionStorage sobrevive ao reload, ao contrário de variável de módulo)', () => {
    // jsdom trava reload/assign/replace do window.location como
    // não-configuráveis — só dá pra trocar o objeto location inteiro.
    const reloadSpy = vi.fn()
    const originalLocation = window.location
    delete window.location
    window.location = { ...originalLocation, reload: reloadSpy }

    try {
      // 1º carregamento: erro de chunk → recarrega automaticamente 1x.
      const { unmount } = render(
        <ErrorBoundary><ThrowChunkError /></ErrorBoundary>
      )
      expect(reloadSpy).toHaveBeenCalledTimes(1)
      unmount()

      // Simula a página real recarregando: sessionStorage sobrevive (é
      // exatamente isso que falhava antes — uma variável de módulo `let`
      // voltaria a `false` aqui, permitindo reload de novo, infinitamente,
      // se o mesmo chunk continuasse quebrado no próximo carregamento).
      render(<ErrorBoundary><ThrowChunkError /></ErrorBoundary>)
      expect(reloadSpy).toHaveBeenCalledTimes(1) // continua 1, não foi de novo
      expect(screen.getByText(/algo deu errado/i)).toBeInTheDocument()
    } finally {
      window.location = originalLocation
    }
  })

  test('erro genérico (não é falha de chunk) nunca recarrega sozinho — só mostra a tela de erro', () => {
    // jsdom trava reload/assign/replace do window.location como
    // não-configuráveis — só dá pra trocar o objeto location inteiro.
    const reloadSpy = vi.fn()
    const originalLocation = window.location
    delete window.location
    window.location = { ...originalLocation, reload: reloadSpy }

    try {
      render(<ErrorBoundary><ThrowGenericError /></ErrorBoundary>)
      expect(reloadSpy).not.toHaveBeenCalled()
      expect(screen.getByText(/algo deu errado/i)).toBeInTheDocument()
    } finally {
      window.location = originalLocation
    }
  })

  test('sem erro nenhum, renderiza os filhos normalmente', () => {
    render(<ErrorBoundary><div>conteúdo normal</div></ErrorBoundary>)
    expect(screen.getByText('conteúdo normal')).toBeInTheDocument()
  })
})
