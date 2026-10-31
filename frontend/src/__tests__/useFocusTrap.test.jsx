import { useRef, useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { useFocusTrap } from '../hooks/useFocusTrap.js'

function Harness({ initiallyActive = true }) {
  const ref = useRef(null)
  const [active, setActive] = useState(initiallyActive)
  useFocusTrap(ref, active)
  return (
    <>
      <button>fora antes</button>
      <div ref={ref} role="dialog">
        <button>primeiro</button>
        <input aria-label="campo" />
        <button disabled>desligado</button>
        <button>último</button>
      </div>
      <button>fora depois</button>
      <button onClick={() => setActive(a => !a)}>alternar</button>
    </>
  )
}

const tab = (shiftKey = false) => fireEvent.keyDown(document, { key: 'Tab', shiftKey })

describe('useFocusTrap', () => {
  it('Tab no último item volta ao primeiro; Shift+Tab no primeiro vai ao último (ignora o desligado)', () => {
    render(<Harness />)
    const first = screen.getByText('primeiro'); const last = screen.getByText('último')
    last.focus(); tab()
    expect(document.activeElement).toBe(first)
    first.focus(); tab(true)
    expect(document.activeElement).toBe(last)
  })

  it('no meio do diálogo o Tab segue o caminho normal do navegador (não interfere)', () => {
    render(<Harness />)
    screen.getByLabelText('campo').focus()
    const prevented = !fireEvent.keyDown(document, { key: 'Tab' })
    expect(prevented).toBe(false)
  })

  it('foco que está fora do diálogo é trazido para dentro', () => {
    render(<Harness />)
    screen.getByText('fora depois').focus()
    tab()
    expect(document.activeElement).toBe(screen.getByText('primeiro'))
  })

  it('inativo (desktop, janela flutuante): não prende o foco', () => {
    render(<Harness initiallyActive={false} />)
    const last = screen.getByText('último')
    last.focus()
    const prevented = !fireEvent.keyDown(document, { key: 'Tab' })
    expect(prevented).toBe(false)
    expect(document.activeElement).toBe(last)
  })

  it('ao desativar, devolve o foco a quem estava com ele antes de abrir', () => {
    render(<Harness initiallyActive={false} />)
    const toggle = screen.getByText('alternar')
    toggle.focus()
    fireEvent.click(toggle)                    // ativa (abre)
    screen.getByText('primeiro').focus()
    fireEvent.click(screen.getByText('alternar')) // desativa (fecha)
    expect(document.activeElement).toBe(toggle)
  })
})
