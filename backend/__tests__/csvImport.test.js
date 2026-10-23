'use strict'
const { buildImportRows, parseCsvAmount, parseCsvDate } = require('../src/utils/csvImport')

const NOW = new Date('2026-10-23T15:00:00Z')

describe('parseCsvAmount', () => {
  test.each([
    ['1234.56', 1234.56], ['1.234,56', 1234.56], ['1.234', 1234], ['-280,00', -280], ['R$ 1.800,00', 1800], ['12', 12], ['-0,5', -0.5],
  ])('%s → %s', (raw, expected) => expect(parseCsvAmount(raw)).toBe(expected))
  test('lixo vira NaN (a linha é ignorada)', () => expect(parseCsvAmount('abc')).toBeNaN())
})

describe('parseCsvDate', () => {
  const ymd = (d) => d.toISOString().slice(0, 10)
  test('dd/mm/aaaa, dd/mm/aa, dd-mm-aaaa e ISO viram meia-noite de Brasília (03:00 UTC), no dia certo', () => {
    for (const raw of ['25/01/2026', '25/01/26', '25-01-2026', '2026-01-25', '2026-01-25T10:00:00']) {
      const d = parseCsvDate(raw, NOW)
      expect(ymd(d)).toBe('2026-01-25')
      expect(d.getUTCHours()).toBe(3)
    }
  })
  test('vazio → undefined (usa hoje); inválido, inexistente, antigo demais ou futuro distante → null', () => {
    expect(parseCsvDate('', NOW)).toBeUndefined()
    expect(parseCsvDate(undefined, NOW)).toBeUndefined()
    for (const raw of ['31/02/2026', 'ontem', '99/99/9999', '01/01/1999', '2030-01-01']) expect(parseCsvDate(raw, NOW)).toBeNull()
  })
  test('até amanhã vale (diferença de fuso), depois não', () => {
    expect(parseCsvDate('24/10/2026', NOW)).toBeInstanceOf(Date)
    expect(parseCsvDate('26/10/2026', NOW)).toBeNull()
  })
})

describe('buildImportRows', () => {
  const rec = (o) => ({ ...o })
  test('o CSV que o próprio app exporta volta inteiro: data, tipo, categoria por rótulo e valor com sinal', () => {
    const { rows, skipped, hasAmountColumn } = buildImportRows([
      rec({ 'Data': '10/01/2026', 'Descrição': 'Dividendos', 'Categoria': 'Entrada Extra', 'Tipo': 'Entrada', 'Valor (R$)': '1800,00' }),
      rec({ 'Data': '12/01/2026', 'Descrição': 'Conta de luz', 'Categoria': 'Contas fixas', 'Tipo': 'Saída', 'Valor (R$)': '-380,00' }),
      rec({ 'Data': '15/01/2026', 'Descrição': 'Almoço', 'Categoria': 'Alimentação', 'Tipo': 'Saída', 'Valor (R$)': '-45,90' }),
    ], { now: NOW })
    expect(hasAmountColumn).toBe(true)
    expect(skipped).toBe(0)
    expect(rows.map(r => [r.description, r.amount, r.type, r.category, r.month, r.year])).toEqual([
      ['Dividendos', 1800, 'income', 'income', 1, 2026],
      ['Conta de luz', 380, 'expense', 'fixed', 1, 2026],
      ['Almoço', 45.9, 'expense', 'food', 1, 2026],
    ])
    expect(rows[0].date.toISOString()).toBe('2026-01-10T03:00:00.000Z')
  })

  test('a coluna Tipo vale mais que o sinal (valor positivo + "expense" é uma saída)', () => {
    const { rows } = buildImportRows([rec({ description: 'Café', amount: '12.34', type: 'expense' })], { now: NOW })
    expect(rows[0]).toMatchObject({ type: 'expense', amount: 12.34 })
  })

  test('sem coluna de tipo, o sinal decide; sem data, usa hoje; categoria desconhecida vira "other"', () => {
    const { rows } = buildImportRows([rec({ Historico: 'PIX recebido', Valor: '100,00', Categoria: 'xyz' }), rec({ Historico: 'Mercado', Valor: '-50,00', Categoria: 'xyz' })], { now: NOW })
    expect(rows.map(r => [r.type, r.category])).toEqual([['income', 'income'], ['expense', 'other']])
    expect(rows[0].month).toBe(10); expect(rows[0].year).toBe(2026)
    expect(rows[0].date).toBe(NOW)
  })

  test('cabeçalhos de extratos de banco (Histórico, Detalhes, Lançamento...) continuam valendo', () => {
    const a = buildImportRows([rec({ 'HISTÓRICO': 'Compra', 'VALOR': '-10,00' })], { now: NOW }).rows[0]
    const b = buildImportRows([rec({ 'Detalhes': 'Tarifa', 'Lançamento': '-3,50' })], { now: NOW }).rows[0]
    expect([a.description, a.amount, b.description, b.amount]).toEqual(['Compra', 10, 'Tarifa', 3.5])
  })

  test('linha com valor inválido ou zero, ou com data presente mas inválida, é ignorada e contada', () => {
    const { rows, skipped } = buildImportRows([
      rec({ description: 'ok', amount: '10', date: '10/01/2026' }),
      rec({ description: 'zero', amount: '0' }),
      rec({ description: 'texto', amount: 'abc' }),
      rec({ description: 'data ruim', amount: '10', date: '31/02/2026' }),
      rec({ description: 'futuro', amount: '10', date: '01/01/2030' }),
    ], { now: NOW })
    expect(rows.map(r => r.description)).toEqual(['ok'])
    expect(skipped).toBe(4)
  })

  test('respeita o limite do plano (para de importar quando acaba o espaço)', () => {
    const records = Array.from({ length: 5 }, (_, i) => rec({ description: `l${i}`, amount: '1' }))
    expect(buildImportRows(records, { now: NOW, limit: 2 }).rows).toHaveLength(2)
  })

  test('sem coluna de valor: hasAmountColumn=false (a rota responde 400 explicando)', () => {
    expect(buildImportRows([rec({ foo: 'x', bar: 'y' })], { now: NOW }).hasAmountColumn).toBe(false)
  })

  test('descrição vazia vira "Importação"; texto de controle é limpo e limitado a 255', () => {
    const { rows } = buildImportRows([rec({ description: '', amount: '5' }), rec({ description: `a\u0000b\n${'x'.repeat(300)}`, amount: '5' })], { now: NOW })
    expect(rows[0].description).toBe('Importação')
    expect(rows[1].description.length).toBeLessThanOrEqual(255)
    expect(rows[1].description).not.toMatch(/[\x00-\x1F]/)
  })
})
