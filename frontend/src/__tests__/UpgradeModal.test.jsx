import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import UpgradeModal from '../components/ui/UpgradeModal.jsx'

function setup() {
  const onClose = vi.fn()
  render(<MemoryRouter><UpgradeModal onClose={onClose} reason="Você atingiu o limite do plano." /></MemoryRouter>)
  return onClose
}

beforeEach(() => { sessionStorage.clear(); vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('UpgradeModal — tecla Esc', () => {
  it('Esc fecha o convite de plano (depois da animação de saída), uma vez só', () => {
    const onClose = setup()
    expect(screen.getByText('Você atingiu o limite do plano.')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.keyDown(document, { key: 'Escape' }) // apertar de novo durante a animação não fecha duas vezes
    act(() => { vi.advanceTimersByTime(300) })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('outras teclas não fecham', () => {
    const onClose = setup()
    fireEvent.keyDown(document, { key: 'Enter' })
    act(() => { vi.advanceTimersByTime(300) })
    expect(onClose).not.toHaveBeenCalled()
  })
})
