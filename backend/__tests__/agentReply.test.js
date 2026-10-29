'use strict'
const { brl, dateBR, sanitizeReply } = require('../src/services/agentReply')

describe('brl — R$ 1.234,56', () => {
  test.each([
    [0, 'R$ 0,00'], [5, 'R$ 5,00'], [55.9, 'R$ 55,90'], [999.99, 'R$ 999,99'], [1000, 'R$ 1.000,00'],
    [7377.8, 'R$ 7.377,80'], [1234567.891, 'R$ 1.234.567,89'], [-55.9, '-R$ 55,90'], ['400.00', 'R$ 400,00'],
  ])('%p -> %s', (value, expected) => expect(brl(value)).toBe(expected))

  test('aceita Decimal do Prisma (toString/valueOf em string) e protege de lixo', () => {
    const { Prisma } = require('@prisma/client')
    expect(brl(new Prisma.Decimal('23000.00'))).toBe('R$ 23.000,00')
    expect(brl(undefined)).toBe('R$ 0,00')
    expect(brl('abc')).toBe('R$ 0,00')
    expect(brl(NaN)).toBe('R$ 0,00')
  })
})

describe('dateBR — dd/mm/aaaa no dia de Brasília', () => {
  test('meia-noite de Brasília (03:00 UTC) continua no mesmo dia', () => expect(dateBR(new Date('2026-10-03T03:00:00.000Z'))).toBe('03/10/2026'))
  test('lançamento às 22h de Brasília (01:00 UTC do dia seguinte) fica no dia certo', () => expect(dateBR(new Date('2026-10-19T01:00:00.000Z'))).toBe('18/10/2026'))
  test('aceita string ISO', () => expect(dateBR('2027-01-15T03:00:00.000Z')).toBe('15/01/2027'))
})

describe('sanitizeReply', () => {
  test('tira emoji (e o espaço que vinha junto) sem deixar buraco', () => {
    expect(sanitizeReply('✅ Pagamento registrado!')).toBe('Pagamento registrado!')
    expect(sanitizeReply('Transação criada com sucesso! 🚗💰')).toBe('Transação criada com sucesso!')
    expect(sanitizeReply('Valor 💰 R$ 30,00')).toBe('Valor R$ 30,00')
    expect(sanitizeReply('Atenção ⚠️ gastos altos')).toBe('Atenção gastos altos')
    expect(sanitizeReply('👨‍👩‍👧 família')).toBe('família')
  })

  test('mantém o ✓ do design, setas, acentos e o símbolo da moeda', () => {
    expect(sanitizeReply('✓ Quitado → próximo mês: R$ 10,00 (ação)')).toBe('✓ Quitado → próximo mês: R$ 10,00 (ação)')
  })

  test.each([
    ['Você gastou R$ 7 377,80 este mês.', 'Você gastou R$ 7.377,80 este mês.'],
    ['Você gastou R$ 7 377,80 este mês.', 'Você gastou R$ 7.377,80 este mês.'],
    ['Você gastou R$ 7 377,80 este mês.', 'Você gastou R$ 7.377,80 este mês.'],
    ['Saídas: 5 680,00 e 1 165,00', 'Saídas: 5.680,00 e 1.165,00'],
    ['Saídas: R$ 8 006,90', 'Saídas: R$ 8.006,90'],
    ['Um milhão: R$ 1 234 567,89', 'Um milhão: R$ 1.234.567,89'],
    ['Total de R$ 7 377 no mês', 'Total de R$ 7.377 no mês'],
    ['Você não registrou nenhum gasto (0 R$).', 'Você não registrou nenhum gasto (R$ 0).'],
    ['Sobraram 123,45 R$ no fim', 'Sobraram R$ 123,45 no fim'],
  ])('dinheiro: %s', (input, expected) => expect(sanitizeReply(input)).toBe(expected))

  test.each([
    'Gastou R$ 7.377,80 e R$ 55,90.',        // já certo
    'R$ 100,00 R$ 200,00',                    // o 2º R$ é do 2º valor
    'Dia 15 de outubro, 300 reais',            // números soltos
    'Foram 3 compras de 100 reais cada',
    'Em 2026 você guardou R$ 500,00',
    'Gastos: 1.200,00 (alimentação) e 350,50 (lazer)',
    'Parcela 10/12 de R$ 89,90',
    '15 300',                                   // sem centavos e sem R$: não é dinheiro garantido
  ])('não mexe em texto que já está certo: %s', (text) => expect(sanitizeReply(text)).toBe(text))

  test.each([
    ['Você gastou 71 % da renda e 40 % do limite', 'Você gastou 71% da renda e 40% do limite'],
    ['Já está em 26%', 'Já está em 26%'],
    ['Cresceu 0,5 % no mês', 'Cresceu 0,5% no mês'],
  ])('porcentagem sem espaço, como o resto do app: %s', (input, expected) => expect(sanitizeReply(input)).toBe(expected))

  test('linhas em branco sobrando e espaço na ponta', () => {
    expect(sanitizeReply('  Olá  \n\n\n\nTudo bem?   \n')).toBe('Olá\n\nTudo bem?')
  })

  test('entrada que não é texto vira vazio (o chamador usa a mensagem padrão)', () => {
    for (const v of [undefined, null, 42, {}, []]) expect(sanitizeReply(v)).toBe('')
  })
})
