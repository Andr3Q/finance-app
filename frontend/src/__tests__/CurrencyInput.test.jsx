import { useState } from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CurrencyInput from '../components/ui/CurrencyInput.jsx'

function setup(value = '', onChange = vi.fn()) {
  const result = render(<CurrencyInput value={value} onChange={onChange} />)
  return { input: screen.getByRole('textbox'), onChange, ...result }
}

// Pai de verdade: guarda o valor e pode limpá-lo de fora (como os formulários fazem depois de salvar).
function Controlled({ initial = '', exposeReset }) {
  const [v, setV] = useState(initial)
  exposeReset(() => setV(''))
  return <CurrencyInput value={v} onChange={setV} />
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

  it('valor 0 não escreve "0,00" no campo (mostra o placeholder), pra dígitos digitados não caírem nos centavos', async () => {
    const onChange = vi.fn()
    const { input } = setup(0, onChange)
    expect(input.value).toBe('')
    await userEvent.type(input, '5000')
    expect(input.value).toBe('5.000')
    expect(onChange).toHaveBeenLastCalledWith(5000)
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

  describe('valor limpo por fora enquanto o campo está em foco', () => {
    it('o formulário limpa o valor (ex.: Enter para salvar): o campo esvazia mesmo com o foco nele', async () => {
      let reset
      render(<Controlled exposeReset={fn => { reset = fn }} />)
      const input = screen.getByRole('textbox')
      await userEvent.type(input, '2000')
      expect(input).toHaveFocus()
      expect(input.value).toBe('2.000')
      act(() => reset())
      expect(input.value).toBe('')
    })

    it('digitar normalmente não é atrapalhado (o valor de fora acompanha o que está escrito)', async () => {
      render(<Controlled exposeReset={() => {}} />)
      const input = screen.getByRole('textbox')
      await userEvent.type(input, '99,9')
      expect(input.value).toBe('99,9')
      await userEvent.type(input, '0')
      expect(input.value).toBe('99,90')
    })

    it('digitar "0" e depois outro número funciona (zero não reseta o campo no meio da digitação)', async () => {
      render(<Controlled exposeReset={() => {}} />)
      const input = screen.getByRole('textbox')
      await userEvent.type(input, '0')
      expect(input.value).toBe('0')
      await userEvent.type(input, '5')
      expect(input.value).toBe('5')
    })
  })
})

