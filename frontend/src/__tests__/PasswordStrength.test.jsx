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

  it('mostra "Muito fraca" para senha só com letras minúsculas (1 de 4 critérios do backend)', () => {
    render(<PasswordStrength password="a" />)
    expect(screen.getByText('Muito fraca')).toBeInTheDocument()
  })

  it('mostra "Fraca" para senha com só comprimento + minúscula (2 de 4 critérios do backend)', () => {
    render(<PasswordStrength password="abcdefgh" />)
    expect(screen.getByText('Fraca')).toBeInTheDocument()
  })

  it('mostra "Média" para senha com maiúscula + minúscula + comprimento, faltando número (3 de 4)', () => {
    render(<PasswordStrength password="Abcdefgh" />)
    expect(screen.getByText('Média')).toBeInTheDocument()
  })

  // Regressão: essa é literalmente a senha mínima que o backend aceita
  // (PASSWORD_REGEX exige só comprimento 8+, minúscula, maiúscula e número —
  // caractere especial nunca foi exigido). Antes do fix, isso aparecia como
  // "Média", passando a falsa impressão de que a senha não seria aceita.
  it('mostra "Forte" para a senha mínima que o backend de fato aceita (sem caractere especial)', () => {
    render(<PasswordStrength password="Password1" />)
    expect(screen.getByText('Forte')).toBeInTheDocument()
  })

  it('mostra "Forte" também com o bônus de caractere especial', () => {
    render(<PasswordStrength password="Password1!" />)
    expect(screen.getByText('Forte')).toBeInTheDocument()
  })

  // Regressão: o cálculo antigo somava os 5 critérios sem checar QUAIS —
  // uma senha faltando maiúscula (exigida) mas com caractere especial
  // (opcional) pontuava igual a uma que atende o mínimo de verdade, e o
  // backend rejeitaria essa senha mesmo assim.
  it('NÃO mostra "Forte" para senha com caractere especial no lugar de um critério exigido (backend ainda rejeitaria)', () => {
    render(<PasswordStrength password="abcdefg1!" />) // sem maiúscula — PASSWORD_REGEX exige
    expect(screen.queryByText('Forte')).not.toBeInTheDocument()
  })

  it('renderiza 4 barras de indicador', () => {
    const { container } = render(<PasswordStrength password="Password1!" />)
    const bars = container.querySelectorAll('div > div > div > div')
    expect(bars.length).toBe(4)
  })
})
