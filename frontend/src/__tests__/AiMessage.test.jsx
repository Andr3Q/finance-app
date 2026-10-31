import { render, screen } from '@testing-library/react'
import AiMessage from '../components/features/AiMessage.jsx'

describe('AiMessage', () => {
  it('tabela com linha curta é completada: todas as linhas ficam com o mesmo número de células', () => {
    render(<AiMessage text={'Categoria | Valor | %\n--- | --- | ---\nCasa | R$ 10,00\nLazer | R$ 5,00 | 33%'} />)
    expect(screen.getAllByRole('columnheader')).toHaveLength(3)
    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(3)
    for (const row of rows) expect(row.children).toHaveLength(3)
  })

  it('lista numerada vira <ol> e a com marcadores vira <ul>', () => {
    const { container } = render(<AiMessage text={'1. um\n2. dois\n\n- a\n- b'} />)
    expect(container.querySelector('ol')).toHaveTextContent('umdois')
    expect(container.querySelector('ul')).toHaveTextContent('ab')
  })

  it('título vira parágrafo em destaque, sem os #', () => {
    const { container } = render(<AiMessage text={'## Resumo\nTexto'} />)
    expect(container.querySelector('p.nia-heading')).toHaveTextContent('Resumo')
    expect(container.textContent).not.toContain('#')
  })

  it('texto vazio não renderiza nada e não quebra', () => {
    const { container } = render(<AiMessage text="" />)
    expect(container.querySelector('.nia-rich')).toBeEmptyDOMElement()
  })
})
