import { render } from '@testing-library/react'
import NancyMark from '../components/ui/NancyMark.jsx'

describe('NancyMark — ícone do Nancy 2', () => {
  it('desenha o "n" e as três bolinhas (branca, menta clara, menta) no tamanho pedido, escondido dos leitores de tela', () => {
    const { container } = render(<NancyMark size={42} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '42')
    expect(svg).toHaveAttribute('height', '42')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg.querySelector('path')).toHaveAttribute('fill', '#fff')
    expect([...svg.querySelectorAll('circle')].map(c => c.getAttribute('fill'))).toEqual(['#fff', '#92EFCA', '#3DE29F'])
  })

  it('tamanho padrão é 40 e o quadrado usa o degradê azul da marca', () => {
    const { container } = render(<NancyMark />)
    expect(container.querySelector('svg')).toHaveAttribute('width', '40')
    const stops = [...container.querySelectorAll('stop')].map(s => s.getAttribute('stop-color'))
    expect(stops).toEqual(['#326AFF', '#122E9C'])
  })

  it('cada instância tem o próprio id de degradê (duas na mesma tela não se confundem) e o retângulo aponta pro dela', () => {
    const { container } = render(<><NancyMark /><NancyMark /></>)
    const ids = [...container.querySelectorAll('linearGradient')].map(g => g.id)
    expect(new Set(ids).size).toBe(2)
    ids.forEach(id => expect(id).not.toMatch(/[:\s]/)) // ":" do useId quebra o url(#id) em alguns navegadores
    const fills = [...container.querySelectorAll('rect')].map(r => r.getAttribute('fill'))
    expect(fills).toEqual(ids.map(id => `url(#${id})`))
  })
})
