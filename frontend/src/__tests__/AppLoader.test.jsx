import { render, screen } from '@testing-library/react'
import AppLoader from '../components/ui/AppLoader.jsx'

describe('AppLoader — tela de carregamento', () => {
  it('é um aviso de status para leitor de tela, com o texto pedido, o ícone do Nancy e o anel', () => {
    const { container } = render(<AppLoader label="Carregando suas finanças…" />)
    expect(screen.getByRole('status')).toHaveTextContent('Carregando suas finanças…')
    expect(container.querySelector('svg.nancy-mark')).not.toBeNull()
    expect(container.querySelector('.app-loader-ring')).not.toBeNull()
  })

  it('sem texto informado diz "Carregando…"', () => {
    render(<AppLoader />)
    expect(screen.getByRole('status')).toHaveTextContent('Carregando…')
  })
})
