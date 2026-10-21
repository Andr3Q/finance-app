import { csvSafe } from '../pages/Transactions.jsx'

// Achado de auditoria de segurança (2026-10-21): CSV Injection / Formula
// Injection — uma descrição de transação começando com =, +, -, @, tab ou CR
// é interpretada como fórmula por Excel/Sheets/LibreOffice ao abrir o CSV
// exportado (ex: "=HYPERLINK(\"http://attacker.com\")").
describe('csvSafe', () => {
  test.each(['=cmd', '+1+1', '-1', '@SUM(A1)', '\tx', '\rx'])(
    'prefixa valores que começam com caractere de fórmula: %s',
    (value) => {
      expect(csvSafe(value)).toBe(`'${value}`)
    }
  )

  test('não mexe em texto normal', () => {
    expect(csvSafe('Almoço no restaurante')).toBe('Almoço no restaurante')
  })

  test('não mexe em texto com = no meio, só no início', () => {
    expect(csvSafe('Conta = R$50')).toBe('Conta = R$50')
  })

  test('trata null/undefined como string vazia', () => {
    expect(csvSafe(null)).toBe('')
    expect(csvSafe(undefined)).toBe('')
  })
})
