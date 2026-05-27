import { render, screen } from '@testing-library/react'
import PasswordStrength from '../components/ui/PasswordStrength.jsx'

describe('PasswordStrength', () => {
  it('não renderiza nada quando password está vazio', () => {
    const { container } = render(<PasswordStrength password="" />)
    expect(container.firstChild).toBeNull()
  })

  it('não renderiza nada quando password é undefined', () => {
    const { container } = render(<PasswordStrength />)
    expect(container.firstChild).toBeNull()
  })

  it('mostra "Muito fraca" para senha só com letras minúsculas', () => {
    render(<PasswordStrength password="abcdefgh" />)
    expect(screen.getByText('Muito fraca')).toBeInTheDocument()
  })

  it('mostra "Fraca" para senha com maiúscula + minúscula (sem número)', () => {
    render(<PasswordStrength password="Abcdefgh" />)
    expect(screen.getByText('Fraca')).toBeInTheDocument()
  })

  it('mostra "Média" para senha com maiúscula + minúscula + número', () => {
    render(<PasswordStrength password="Password1" />)
    expect(screen.getByText('Média')).toBeInTheDocument()
  })

  it('mostra "Forte" para senha com todos os critérios incluindo especial', () => {
    render(<PasswordStrength password="Password1!" />)
    expect(screen.getByText('Forte')).toBeInTheDocument()
  })

  it('renderiza 4 barras de indicador', () => {
    const { container } = render(<PasswordStrength password="Password1!" />)
    const bars = container.querySelectorAll('div > div > div')
    expect(bars.length).toBe(4)
  })
})
