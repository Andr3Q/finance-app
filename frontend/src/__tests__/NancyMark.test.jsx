import { render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import NancyMark from '../components/ui/NancyMark.jsx'

// Ícone 6b do design: degradê #2F6BFF → #0A2A9E, "n" branco e 3 pontos (branco 70%, #93F0CB, #3BE3A0).
describe('NancyMark (ícone do Nancy)', () => {
  it('desenha o quadrado arredondado em degradê, o "n" e os 3 pontos do ícone 6b', () => {
    const { container } = render(<NancyMark size={48} />)
    const svg = container.querySelector('svg.nancy-mark')
    expect(svg).toHaveAttribute('viewBox', '0 0 100 100')
    expect(svg).toHaveAttribute('width', '48')
    expect(svg).toHaveAttribute('height', '48')
    expect(svg).toHaveAttribute('aria-hidden', 'true') // escondido dos leitores de tela
    expect([...svg.querySelectorAll('stop')].map(s => s.getAttribute('stop-color'))).toEqual(['#2F6BFF', '#0A2A9E'])
    expect(svg.querySelector('rect')).toHaveAttribute('rx', '23')
    expect(svg.querySelector('path')).toHaveAttribute('fill', '#fff')
    expect([...svg.querySelectorAll('circle')].map(c => [c.getAttribute('cx'), c.getAttribute('cy'), c.getAttribute('r'), c.getAttribute('fill'), c.getAttribute('opacity')])).toEqual([
      ['63', '70', '2.6', '#fff', '.7'], ['71.5', '63', '3.8', '#93F0CB', null], ['82', '54', '5.4', '#3BE3A0', null],
    ])
  })

  it('tamanho padrão é 40', () => {
    const { container } = render(<NancyMark />)
    expect(container.querySelector('svg')).toHaveAttribute('width', '40')
  })

  it('duas instâncias na mesma tela não dividem o id do degradê', () => {
    const { container } = render(<><NancyMark /><NancyMark /></>)
    const ids = [...container.querySelectorAll('linearGradient')].map(g => g.id)
    expect(new Set(ids).size).toBe(2)
    ids.forEach(id => expect(id).not.toMatch(/[:\s]/)) // ":" do useId quebra o url(#id) em alguns navegadores
    container.querySelectorAll('svg').forEach((svg, i) => expect(svg.querySelector('rect').getAttribute('fill')).toBe(`url(#${ids[i]})`))
  })

  it('o favicon vetorial (icon.svg) é o mesmo ícone, com o mesmo "n"', () => {
    const svg = readFileSync(resolve(process.cwd(), 'public', 'icon.svg'), 'utf8')
    const { container } = render(<NancyMark />)
    expect(svg).toContain('#2F6BFF'); expect(svg).toContain('#0A2A9E'); expect(svg).toContain('rx="23"')
    const d = container.querySelector('path').getAttribute('d')
    expect(svg).toContain(`d="${d}"`)
  })
})
