import { scrollChipsBy } from '../utils/chipScroll.js'

// Elemento falso: jsdom não faz layout, então scrollLeft/scrollWidth/clientWidth vêm do teste.
const box = ({ scrollLeft = 0, scrollWidth = 471, clientWidth = 266, scrollTo = vi.fn() } = {}) => ({ scrollLeft, scrollWidth, clientWidth, scrollTo })

describe('scrollChipsBy (setas dos atalhos em Metas e no Extrato)', () => {
  it('anda um passo (150) pra direita e pra esquerda, com rolagem suave', () => {
    const el = box({ scrollLeft: 0 })
    scrollChipsBy(el, 1)
    expect(el.scrollTo).toHaveBeenLastCalledWith({ left: 150, behavior: 'smooth' })
    el.scrollLeft = 150
    scrollChipsBy(el, -1)
    expect(el.scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: 'smooth' })
  })

  it('nunca pede um destino além do FIM (máximo = scrollWidth − clientWidth = 205): 150 + 150 vira 205, não 300', () => {
    const el = box({ scrollLeft: 150 })
    scrollChipsBy(el, 1)
    expect(el.scrollTo).toHaveBeenLastCalledWith({ left: 205, behavior: 'smooth' })
    el.scrollLeft = 205
    scrollChipsBy(el, 1)
    expect(el.scrollTo).toHaveBeenLastCalledWith({ left: 205, behavior: 'smooth' })
  })

  it('nunca pede um destino antes do COMEÇO: 100 − 150 vira 0, não −50', () => {
    const el = box({ scrollLeft: 100 })
    scrollChipsBy(el, -1)
    expect(el.scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: 'smooth' })
  })

  it('o passo é configurável (Extrato usa 140)', () => {
    const el = box({ scrollLeft: 0 })
    scrollChipsBy(el, 1, 140)
    expect(el.scrollTo).toHaveBeenLastCalledWith({ left: 140, behavior: 'smooth' })
  })

  it('tudo cabe na tela (sem o que rolar): fica em 0, nunca negativo', () => {
    const el = box({ scrollLeft: 0, scrollWidth: 200, clientWidth: 266 })
    scrollChipsBy(el, 1)
    expect(el.scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: 'smooth' })
    scrollChipsBy(el, -1)
    expect(el.scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: 'smooth' })
  })

  it('navegador sem scrollTo: ajusta scrollLeft direto, também dentro do limite; sem elemento não faz nada', () => {
    const el = { scrollLeft: 150, scrollWidth: 471, clientWidth: 266 }
    scrollChipsBy(el, 1)
    expect(el.scrollLeft).toBe(205)
    scrollChipsBy(el, -1, 500)
    expect(el.scrollLeft).toBe(0)
    expect(() => scrollChipsBy(null, 1)).not.toThrow()
  })
})
