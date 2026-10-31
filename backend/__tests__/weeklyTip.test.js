'use strict'
const {
  computeWeeklyTipStats, composeTip, buildAdvicePrompt, sanitizeAdvice, DAY_MS,
} = require('../src/services/weeklyTip')

const NOW = new Date('2026-10-21T12:00:00Z')
// Transação "daysAgo" dias antes de NOW.
const tx = (daysAgo, category, amount) => ({ category, amount, date: new Date(NOW.getTime() - daysAgo * DAY_MS) })

// 3 períodos de referência com Alimentação = 500 e Transporte = 200 cada.
const baseline = [
  tx(40, 'food', 500), tx(40, 'transport', 200),
  tx(70, 'food', 500), tx(70, 'transport', 200),
  tx(100, 'food', 500), tx(100, 'transport', 200),
]

describe('computeWeeklyTipStats', () => {
  test('aponta a categoria com maior excesso em reais sobre a média dos períodos anteriores', () => {
    const stats = computeWeeklyTipStats([...baseline, tx(5, 'food', 590), tx(5, 'transport', 400)], NOW)
    // food: 590 vs 500 → +90 (18%); transport: 400 vs 200 → +200 (100%) — vence o maior excesso
    expect(stats).toMatchObject({ category: 'transport', label: 'Transporte', pct: 100, excess: 200, current: 400, average: 200, baselineWindows: 3 })
  })

  test('devolve o percentual arredondado e os valores com 2 casas', () => {
    const stats = computeWeeklyTipStats([...baseline, tx(3, 'food', 590), tx(3, 'transport', 200)], NOW)
    expect(stats).toMatchObject({ category: 'food', pct: 18, excess: 90, current: 590, average: 500 })
  })

  test('sem período de referência com gastos, não há base: null', () => {
    expect(computeWeeklyTipStats([tx(3, 'food', 900)], NOW)).toBeNull()
  })

  test('sem gastos nos últimos 30 dias: null', () => {
    expect(computeWeeklyTipStats(baseline, NOW)).toBeNull()
  })

  test('média considera só períodos com gasto registrado (período vazio não puxa a média pra baixo)', () => {
    // só 1 período de referência (food 500); os outros 2 sem nenhuma transação
    const stats = computeWeeklyTipStats([tx(40, 'food', 500), tx(3, 'food', 700)], NOW)
    expect(stats).toMatchObject({ category: 'food', average: 500, excess: 200, baselineWindows: 1 })
  })

  test('categoria sem gasto nos períodos de referência não gera dica (sem média)', () => {
    expect(computeWeeklyTipStats([...baseline, tx(3, 'leisure', 900)], NOW)).toBeNull()
  })

  test('abaixo de 10% ou de R$ 30 a mais não vira dica', () => {
    // food +8% (540 vs 500)
    expect(computeWeeklyTipStats([...baseline, tx(3, 'food', 540), tx(3, 'transport', 200)], NOW)).toBeNull()
    // +50% mas só R$ 20 de excesso (60 vs 40)
    const small = [tx(40, 'leisure', 40), tx(70, 'leisure', 40), tx(100, 'leisure', 40), tx(3, 'leisure', 60)]
    expect(computeWeeklyTipStats(small, NOW)).toBeNull()
  })

  test('contas fixas, entradas e "outros" nunca viram dica', () => {
    const txs = ['fixed', 'income', 'other'].flatMap(c => [tx(40, c, 100), tx(70, c, 100), tx(3, c, 900)])
    expect(computeWeeklyTipStats(txs, NOW)).toBeNull()
  })

  test('lançamento com data futura é ignorado', () => {
    expect(computeWeeklyTipStats([...baseline, tx(-3, 'food', 900), tx(3, 'transport', 200)], NOW)).toBeNull()
  })

  test('transações além de 120 dias não entram na média', () => {
    const stats = computeWeeklyTipStats([tx(40, 'food', 500), tx(130, 'food', 9999), tx(3, 'food', 700)], NOW)
    expect(stats.average).toBe(500)
  })

  test('aceita amount como Decimal/string (Prisma)', () => {
    const stats = computeWeeklyTipStats([tx(40, 'food', '500.00'), tx(3, 'food', '700.00')], NOW)
    expect(stats.excess).toBe(200)
  })
})

describe('composeTip', () => {
  const stats = { label: 'Alimentação', excess: 280.4 }
  test('sem IA: só o que os números provam', () => {
    expect(composeTip(null, stats)).toBe('Voltar à sua média em alimentação poupa cerca de R$ 280 por mês.')
  })
  test('com IA: frase prática + a conta calculada no servidor', () => {
    expect(composeTip('Cozinhar mais em casa ajuda.', stats))
      .toBe('Cozinhar mais em casa ajuda. Voltar à média poupa cerca de R$ 280 por mês.')
  })
})

describe('buildAdvicePrompt', () => {
  test('só leva a categoria e proíbe números — nenhum texto digitado pelo usuário', () => {
    const { system, user } = buildAdvicePrompt({ label: 'Alimentação', pct: 18, excess: 90, current: 590 })
    expect(user).toContain('Alimentação')
    // as estatísticas calculadas (pct 18, excesso 90, atual 590) não vão pro modelo
    for (const n of ['18', '90', '590']) expect(user).not.toContain(n)
    expect(system).toMatch(/sem números/i)
  })
})

describe('sanitizeAdvice', () => {
  test('aceita frase curta e limpa formatação', () => {
    expect(sanitizeAdvice('  **Planeje as refeições da semana**  ')).toBe('Planeje as refeições da semana.')
  })
  test('mantém pontuação final existente', () => {
    expect(sanitizeAdvice('Leve marmita ao trabalho!')).toBe('Leve marmita ao trabalho!')
  })
  test('rejeita qualquer dígito (valor inventado ou "2 vezes")', () => {
    expect(sanitizeAdvice('Economize R$ 280 cozinhando.')).toBeNull()
    expect(sanitizeAdvice('Cozinhe 2 vezes por semana.')).toBeNull()
  })
  test('rejeita "R$" mesmo sem dígito, texto vazio, longo demais e não-string', () => {
    expect(sanitizeAdvice('Gaste menos de R$ cem.')).toBeNull()
    expect(sanitizeAdvice('   ')).toBeNull()
    expect(sanitizeAdvice('a'.repeat(141))).toBeNull()
    expect(sanitizeAdvice(undefined)).toBeNull()
    expect(sanitizeAdvice({ content: 'x' })).toBeNull()
  })
})
