import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CurrencyInput from '../components/ui/CurrencyInput.jsx'

function setup(value = '', onChange = vi.fn()) {
  const result = render(<CurrencyInput value={value} onChange={onChange} />)
  return { input: screen.getByRole('textbox'), onChange, ...result }
}

describe('CurrencyInput', () => {
  it('renderiza vazio quando value está vazio', () => {
    const { input } = setup('')
    expect(input.value).toBe('')
  })

  it('formata valor inicial numérico em pt-BR', () => {
    const { input } = setup(1500)
    expect(input.value).toBe('1.500,00')
  })

  it('formata digitação de inteiro sem vírgula', async () => {
    const onChange = vi.fn()
    const { input } = setup('', onChange)
    await userEvent.type(input, '1500')
    expect(input.value).toBe('1.500')
    expect(onChange).toHaveBeenLastCalledWith(1500)
  })

  it('formata digitação com centavos (vírgula)', async () => {
    const onChange = vi.fn()
    const { input } = setup('', onChange)
    await userEvent.type(input, '99,90')
    expect(input.value).toBe('99,90')
    expect(onChange).toHaveBeenLastCalledWith(99.9)
  })

  it('no blur com valor > 0 formata para 2 casas decimais', async () => {
    const onChange = vi.fn()
    const { input } = setup('', onChange)
    await userEvent.type(input, '150')
    fireEvent.blur(input)
    expect(input.value).toBe('150,00')
    expect(onChange).toHaveBeenLastCalledWith(150)
  })

  it('no blur com valor 0 reseta campo e chama onChange("")', async () => {
    const onChange = vi.fn()
    const { input } = setup('', onChange)
    await userEvent.type(input, '0')
    fireEvent.blur(input)
    expect(input.value).toBe('')
    expect(onChange).toHaveBeenLastCalledWith('')
  })

  it('no blur com campo vazio chama onChange("")', () => {
    const onChange = vi.fn()
    const { input } = setup('', onChange)
    fireEvent.blur(input)
    expect(onChange).toHaveBeenLastCalledWith('')
  })

  it('não atualiza display quando field está focado e value externo muda', () => {
    const onChange = vi.fn()
    const { rerender } = render(<CurrencyInput value={100} onChange={onChange} />)
    const input = screen.getByRole('textbox')
    fireEvent.focus(input)
    rerender(<CurrencyInput value={200} onChange={onChange} />)
    expect(input.value).toBe('100,00')
  })

  it('atualiza display quando field não está focado e value externo muda', () => {
    const onChange = vi.fn()
    const { rerender } = render(<CurrencyInput value={100} onChange={onChange} />)
    const input = screen.getByRole('textbox')
    rerender(<CurrencyInput value={250} onChange={onChange} />)
    expect(input.value).toBe('250,00')
  })
})
