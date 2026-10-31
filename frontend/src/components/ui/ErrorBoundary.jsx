import { Component } from 'react'

// Detecta falha de carregamento de chunk JS (deploy novo invalida hashes antigos)
function isChunkError(error) {
  const msg = error?.message || ''
  return (
    msg.includes('Failed to fetch') ||
    msg.includes('dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('Unable to preload CSS') ||
    (error?.name === 'ChunkLoadError')
  )
}

// Chave em sessionStorage, não variável de módulo — uma variável de módulo
// (`let _reloaded = false`) volta a `false` a cada reload, porque o módulo
// inteiro é reexecutado do zero; ela não protege contra o MESMO erro se
// repetindo a cada reload (loop automático, sem interação do usuário, se um
// deploy sair com um chunk persistentemente quebrado). sessionStorage
// sobrevive ao reload — só reseta quando a aba fecha de verdade.
const RELOADED_KEY = 'errorboundary_chunk_reloaded'

export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error?.message, info?.componentStack?.split('\n')[1])
    }
    // Chunk stale após deploy novo → recarrega uma vez automaticamente
    let alreadyReloaded = true
    try { alreadyReloaded = sessionStorage.getItem(RELOADED_KEY) === '1' } catch { /* storage bloqueado */ }
    if (isChunkError(error) && !alreadyReloaded) {
      try { sessionStorage.setItem(RELOADED_KEY, '1') } catch { /* storage bloqueado */ }
      window.location.reload()
    }
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100vh', gap: '16px',
        fontFamily: 'sans-serif', color: 'var(--color-text, #ccc)',
        background: 'var(--color-bg, #0a0a0a)',
      }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <p style={{ margin: 0, fontSize: 16 }}>Algo deu errado. Recarregue a página.</p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '10px 24px', borderRadius: 8, border: 'none',
            background: 'var(--color-primary, #00ffcc)', color: '#000',
            fontWeight: 700, cursor: 'pointer', fontSize: 14,
          }}
        >
          Recarregar
        </button>
      </div>
    )
  }
}
