import { Component } from 'react'

export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Crash capturado:', error, info.componentStack)
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
        <span style={{ fontSize: 40 }}>⚠️</span>
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
