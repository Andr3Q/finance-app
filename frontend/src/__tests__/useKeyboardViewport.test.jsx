import { render, act } from '@testing-library/react'
import { useRef } from 'react'
import { useKeyboardViewport } from '../hooks/useKeyboardViewport.js'

// Teclado do celular: não encolhe a tela do app, só diminui a parte VISÍVEL (window.visualViewport).
// O hook marca o elemento com data-kb e escreve --vv-top / --vv-h para a folha acompanhar essa parte.

function Caixa({ enabled = true }) {
  const ref = useRef(null)
  useKeyboardViewport(ref, enabled)
  return <div ref={ref} data-testid="caixa" />
}

// visualViewport falso: lê os números de `st` e dispara resize/scroll como o navegador.
function instalaVisualViewport(st) {
  const vv = new EventTarget()
  Object.defineProperties(vv, {
    height:    { get: () => st.height },
    offsetTop: { get: () => st.offsetTop },
    scale:     { get: () => st.scale },
  })
  Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })
  return vv
}

const original = { vv: Object.getOwnPropertyDescriptor(window, 'visualViewport'), h: window.innerHeight, w: window.innerWidth }
const tamanhoDaTela = (w, h) => { window.innerWidth = w; window.innerHeight = h }

afterEach(() => {
  if (original.vv) Object.defineProperty(window, 'visualViewport', original.vv)
  else delete window.visualViewport
  tamanhoDaTela(original.w, original.h)
})

describe('useKeyboardViewport', () => {
  it('sem teclado (parte visível = tela inteira) não marca nada', () => {
    tamanhoDaTela(390, 844)
    instalaVisualViewport({ height: 844, offsetTop: 0, scale: 1 })
    const { getByTestId } = render(<Caixa />)
    const el = getByTestId('caixa')
    expect(el).not.toHaveAttribute('data-kb')
    expect(el.style.getPropertyValue('--vv-h')).toBe('')
  })

  it('teclado abriu: marca data-kb e escreve a altura e o deslocamento da parte visível', () => {
    tamanhoDaTela(390, 844)
    const st = { height: 844, offsetTop: 0, scale: 1 }
    const vv = instalaVisualViewport(st)
    const { getByTestId } = render(<Caixa />)
    const el = getByTestId('caixa')

    act(() => { st.height = 464; st.offsetTop = 310; vv.dispatchEvent(new Event('resize')) })
    expect(el).toHaveAttribute('data-kb')
    expect(el.style.getPropertyValue('--vv-h')).toBe('464px')
    expect(el.style.getPropertyValue('--vv-top')).toBe('310px')

    // o iPhone vai rolando a página enquanto o teclado sobe: o deslocamento acompanha (evento scroll)
    act(() => { st.offsetTop = 120; vv.dispatchEvent(new Event('scroll')) })
    expect(el.style.getPropertyValue('--vv-top')).toBe('120px')
  })

  it('teclado fechou: tudo é removido e o elemento volta ao CSS normal', () => {
    tamanhoDaTela(390, 844)
    const st = { height: 464, offsetTop: 0, scale: 1 }
    const vv = instalaVisualViewport(st)
    const { getByTestId } = render(<Caixa />)
    const el = getByTestId('caixa')
    expect(el).toHaveAttribute('data-kb')                // já abriu com o teclado aberto

    act(() => { st.height = 844; vv.dispatchEvent(new Event('resize')) })
    expect(el).not.toHaveAttribute('data-kb')
    expect(el.style.getPropertyValue('--vv-h')).toBe('')
    expect(el.style.getPropertyValue('--vv-top')).toBe('')
  })

  it('encolher pouco (barra de endereço do Safari, ~100px) não conta como teclado', () => {
    tamanhoDaTela(390, 844)
    instalaVisualViewport({ height: 744, offsetTop: 0, scale: 1 })
    const { getByTestId } = render(<Caixa />)
    expect(getByTestId('caixa')).not.toHaveAttribute('data-kb')
  })

  it('zoom da página (scale > 1) também encolhe a parte visível, mas não é teclado', () => {
    tamanhoDaTela(390, 844)
    instalaVisualViewport({ height: 400, offsetTop: 0, scale: 2 })
    const { getByTestId } = render(<Caixa />)
    expect(getByTestId('caixa')).not.toHaveAttribute('data-kb')
  })

  it('no Android o teclado às vezes encolhe o innerHeight junto: a altura de repouso lembrada ainda detecta', () => {
    tamanhoDaTela(390, 844)
    const st = { height: 844, offsetTop: 0, scale: 1 }
    const vv = instalaVisualViewport(st)
    const { getByTestId } = render(<Caixa />)
    act(() => { window.innerHeight = 470; st.height = 470; vv.dispatchEvent(new Event('resize')) })
    expect(getByTestId('caixa')).toHaveAttribute('data-kb')
  })

  it('girar a tela recomeça a medida (largura diferente): paisagem sem teclado não vira "teclado aberto"', () => {
    tamanhoDaTela(390, 844)
    const st = { height: 844, offsetTop: 0, scale: 1 }
    const vv = instalaVisualViewport(st)
    const { getByTestId } = render(<Caixa />)
    act(() => { tamanhoDaTela(844, 390); st.height = 390; vv.dispatchEvent(new Event('resize')) })
    expect(getByTestId('caixa')).not.toHaveAttribute('data-kb')
  })

  it('desligado (desktop) ou sem visualViewport: não faz nada e não quebra', () => {
    tamanhoDaTela(390, 844)
    instalaVisualViewport({ height: 464, offsetTop: 0, scale: 1 })
    const desligado = render(<Caixa enabled={false} />)
    expect(desligado.getByTestId('caixa')).not.toHaveAttribute('data-kb')
    desligado.unmount()

    delete window.visualViewport
    const semApi = render(<Caixa />)
    expect(semApi.getByTestId('caixa')).not.toHaveAttribute('data-kb')
  })

  it('ao sair, tira os ouvintes e limpa o elemento', () => {
    tamanhoDaTela(390, 844)
    const st = { height: 464, offsetTop: 0, scale: 1 }
    const vv = instalaVisualViewport(st)
    const remove = vi.spyOn(vv, 'removeEventListener')
    const { getByTestId, unmount } = render(<Caixa />)
    const el = getByTestId('caixa')
    expect(el).toHaveAttribute('data-kb')
    unmount()
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function))
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function))
    expect(el).not.toHaveAttribute('data-kb')
  })
})
