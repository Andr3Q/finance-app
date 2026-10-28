import { render, screen, fireEvent, act } from '@testing-library/react'
import { useRef } from 'react'
import { useChipEdges } from '../hooks/useChipEdges.js'

// jsdom não tem layout: scrollWidth/clientWidth/scrollLeft são definidos à mão.
function Harness({ dims }) {
  const ref = useRef(null)
  const { prevDisabled, nextDisabled } = useChipEdges(ref)
  return (
    <div>
      <button disabled={prevDisabled}>anterior</button>
      <div data-testid="chips" ref={el => {
        ref.current = el
        if (el && !el.__patched) {
          el.__patched = true
          Object.defineProperty(el, 'scrollWidth', { configurable: true, get: () => dims.scrollWidth })
          Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => dims.clientWidth })
          Object.defineProperty(el, 'scrollLeft', { configurable: true, get: () => dims.scrollLeft, set: v => { dims.scrollLeft = v } })
        }
      }} />
      <button disabled={nextDisabled}>próximo</button>
    </div>
  )
}

const scrollTo = (dims, left) => act(() => {
  dims.scrollLeft = left
  fireEvent.scroll(screen.getByTestId('chips'))
})

describe('useChipEdges', () => {
  it('no começo: a seta de voltar apaga e a de avançar fica ativa', () => {
    const dims = { scrollWidth: 500, clientWidth: 300, scrollLeft: 0 }
    render(<Harness dims={dims} />)
    // o primeiro cálculo acontece num efeito: dispara um scroll pra ler as medidas já aplicadas
    scrollTo(dims, 0)
    expect(screen.getByRole('button', { name: 'anterior' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'próximo' })).toBeEnabled()
  })

  it('no meio as duas ficam ativas; no fim a de avançar apaga', () => {
    const dims = { scrollWidth: 500, clientWidth: 300, scrollLeft: 0 }
    render(<Harness dims={dims} />)
    scrollTo(dims, 100)
    expect(screen.getByRole('button', { name: 'anterior' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'próximo' })).toBeEnabled()
    scrollTo(dims, 200) // máximo = 500 − 300
    expect(screen.getByRole('button', { name: 'anterior' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'próximo' })).toBeDisabled()
  })

  it('tolera meio pixel de diferença (rolagem fracionada do navegador)', () => {
    const dims = { scrollWidth: 500, clientWidth: 300, scrollLeft: 0 }
    render(<Harness dims={dims} />)
    scrollTo(dims, 199.5)
    expect(screen.getByRole('button', { name: 'próximo' })).toBeDisabled()
  })

  it('quando os atalhos cabem todos (sem rolagem) nenhuma seta apaga', () => {
    const dims = { scrollWidth: 300, clientWidth: 300, scrollLeft: 0 }
    render(<Harness dims={dims} />)
    scrollTo(dims, 0)
    expect(screen.getByRole('button', { name: 'anterior' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'próximo' })).toBeEnabled()
  })

  it('redimensionar a janela recalcula', () => {
    const dims = { scrollWidth: 300, clientWidth: 300, scrollLeft: 0 }
    render(<Harness dims={dims} />)
    dims.scrollWidth = 600
    act(() => { window.dispatchEvent(new Event('resize')) })
    expect(screen.getByRole('button', { name: 'anterior' })).toBeDisabled()
  })
})
