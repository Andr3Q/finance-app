'use strict'
const request = require('supertest')
const jwt     = require('jsonwebtoken')
const zlib    = require('zlib')

jest.mock('../src/lib/prisma', () => require('./__mocks__/prisma'))
jest.mock('../src/services/emailService', () => {
  const fn = () => jest.fn().mockResolvedValue(true)
  return {
    sendEmail: fn(), sendWelcomeEmail: fn(), sendVerificationEmail: fn(),
    sendResetEmail: fn(), sendRenewalReminderEmail: fn(), sendTrialExpiryEmail: fn(),
    sendReferralRewardEmail: fn(), sendWeeklyDigest: fn(), sendPlanExpiredEmail: fn(),
    sendMonthlyReport: fn(), sendPlanActivationEmail: fn(),
  }
})

const prisma = require('./__mocks__/prisma')
const app    = require('../src/server')
const { buildSheet, buildFeed, sheetWindow, INSTALLMENT_TX } = require('../src/services/sheet')
const { buildXlsx, crc32, colName } = require('../src/services/xlsx')

const JWT_SECRET = process.env.JWT_SECRET
const USER_ID    = '550e8400-e29b-41d4-a716-446655440000'
const makeToken  = () => jwt.sign({ userId: USER_ID }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' })

// ── dados do cenário do design: hoje é outubro/2026 ──
const NOW = { month: 10, year: 2026 }
const B = { rent: 'b-rent', luz: 'b-luz', gym: 'b-gym', boleto: 'b-boleto' }
const budgets = [
  { id: B.gym,    name: 'Academia',      amount: 200,  dueDay: 20, endDate: null },
  { id: B.rent,   name: 'Aluguel',       amount: 3500, dueDay: 5,  endDate: null },
  { id: B.boleto, name: 'Boleto da TV',  amount: 100,  dueDay: 28, endDate: new Date('2026-11-30T15:00:00Z') },
  { id: B.luz,    name: 'Conta de luz',  amount: 380,  dueDay: 12, endDate: null },
]
const installments = [
  { id: 'i-note', name: 'Notebook',  amount: 600, totalInstallments: 10, paidInstallments: 3, startMonth: 9, startYear: 2026 },
  { id: 'i-gela', name: 'Geladeira', amount: 400, totalInstallments: 8,  paidInstallments: 6, startMonth: 5, startYear: 2026 },
  { id: 'i-old',  name: 'Antigo',    amount: 90,  totalInstallments: 3,  paidInstallments: 3, startMonth: 1, startYear: 2026 }, // acabou em março
]
const tx = (month, type, category, amount, description, extra = {}) => ({
  type, category, amount, description, month, year: 2026, date: new Date(Date.UTC(2026, month - 1, 10, 15)), budgetId: null, ...extra,
})
const transactions = [
  tx(8, 'income', 'income', 1200, 'Freelance'), tx(8, 'expense', 'food', 1320, 'Mercado'), tx(8, 'expense', 'fixed', 342, 'Conta de luz', { budgetId: B.luz }),
  tx(9, 'expense', 'food', 1410, 'Mercado'), tx(9, 'expense', 'shopping', 420, 'Roupa'), tx(9, 'expense', 'shopping', 400, 'Geladeira (parcela 5/8)'),
  tx(9, 'expense', 'fixed', 365, 'Conta de luz', { budgetId: B.luz }),
  tx(10, 'income', 'income', 1800, 'Freelance'), tx(10, 'expense', 'food', 1165, 'Mercado'), tx(10, 'expense', 'shopping', 350, 'Roupa'),
  tx(10, 'expense', 'fixed', 380, 'Conta de luz', { budgetId: B.luz }),
]
const sheet = () => buildSheet({ now: NOW, transactions, budgets, installments, salary: 15000 })
const section = (s, id) => s.sections.find(x => x.id === id)
const row = (s, id, label) => section(s, id).rows.find(r => r.label === label)

// ─────────────────────────────────────────────────────────────────
describe('buildSheet — colunas e seções', () => {
  test('três meses reais (dois atrás e o atual) e dois de previsão, com rótulos curtos', () => {
    const s = sheet()
    expect(s.months.map(m => [m.label, m.kind])).toEqual([['AGO', 'past'], ['SET', 'past'], ['OUT', 'current'], ['NOV', 'forecast'], ['DEZ', 'forecast']])
    expect(s.months.map(m => m.year)).toEqual([2026, 2026, 2026, 2026, 2026])
    expect(s.sections.map(x => x.label)).toEqual(['Receitas', 'Contas fixas', 'Parcelas', 'Variáveis'])
  })

  test('vira o ano: em janeiro mostra novembro e dezembro do ano anterior e fevereiro/março à frente', () => {
    const s = buildSheet({ now: { month: 1, year: 2027 }, transactions: [], budgets: [], installments: [], salary: 0 })
    expect(s.months.map(m => `${m.label}/${m.year}`)).toEqual(['NOV/2026', 'DEZ/2026', 'JAN/2027', 'FEV/2027', 'MAR/2027'])
    expect(sheetWindow({ month: 1, year: 2027 })).toEqual({ month: 11, year: 2026 })
  })

  test('Receitas: salário igual em todos os meses; entrada extra real e previsão = média dos meses com movimento', () => {
    const s = sheet()
    expect(row(s, 'income', 'Salário').values).toEqual([15000, 15000, 15000, 15000, 15000])
    expect(row(s, 'income', 'Freelance').values).toEqual([1200, 0, 1800, 1000, 1000]) // (1200 + 0 + 1800) / 3
    expect(section(s, 'income').total).toEqual([16200, 15000, 16800, 16000, 16000])
  })

  test('Contas fixas: ordem por vencimento; pago de verdade nos passados; previsto no atual; valor atual na previsão', () => {
    const s = sheet()
    expect(section(s, 'fixed').rows.map(r => r.label)).toEqual(['Aluguel', 'Conta de luz', 'Academia', 'Boleto da TV'])
    expect(row(s, 'fixed', 'Conta de luz').values).toEqual([342, 365, 380, 380, 380]) // o pago de cada mês
    expect(row(s, 'fixed', 'Aluguel').values).toEqual([null, null, 3500, 3500, 3500])  // sem pagamento nos passados: "–"; atual = previsto
    expect(row(s, 'fixed', 'Academia').values).toEqual([null, null, 200, 200, 200])
    expect(section(s, 'fixed').total).toEqual([342, 365, 4180, 4180, 4080])
  })

  test('conta com prazo some da previsão depois do mês final', () => {
    expect(row(sheet(), 'fixed', 'Boleto da TV').values).toEqual([null, null, 100, 100, null])
  })

  test('conta fixa com pagamento parcial/duplo no mês soma os pagamentos', () => {
    const extra = [...transactions, tx(10, 'expense', 'fixed', 20, 'Conta de luz (ajuste)', { budgetId: B.luz })]
    expect(row(buildSheet({ now: NOW, transactions: extra, budgets, installments, salary: 15000 }), 'fixed', 'Conta de luz').values[2]).toBe(400)
  })

  test('Parcelas: cada parcelamento do primeiro ao último mês, rótulo com as pagas, e os já encerrados ficam de fora', () => {
    const s = sheet()
    expect(section(s, 'installments').rows.map(r => r.label)).toEqual(['Notebook (3/10)', 'Geladeira (6/8)'])
    expect(row(s, 'installments', 'Notebook (3/10)').values).toEqual([null, 600, 600, 600, 600])
    expect(row(s, 'installments', 'Geladeira (6/8)').values).toEqual([400, 400, 400, 400, 400])
    expect(section(s, 'installments').total).toEqual([400, 1000, 1000, 1000, 1000])
  })

  test('parcelamento que termina dentro da janela some das colunas seguintes', () => {
    const s = buildSheet({ now: NOW, transactions: [], budgets: [], salary: 0, installments: [{ id: 'x', name: 'Celular', amount: 150, totalInstallments: 4, paidInstallments: 3, startMonth: 7, startYear: 2026 }] })
    expect(row(s, 'installments', 'Celular (3/4)').values).toEqual([150, 150, 150, null, null]) // jul-out
  })

  test('Variáveis: por categoria, sem as contas fixas nem as parcelas pagas (já têm linha própria)', () => {
    const s = sheet()
    expect(section(s, 'variable').rows.map(r => r.label)).toEqual(['Alimentação', 'Shopping'])
    expect(row(s, 'variable', 'Alimentação').values).toEqual([1320, 1410, 1165, 1298.33, 1298.33])
    expect(row(s, 'variable', 'Shopping').values).toEqual([0, 420, 350, 256.67, 256.67]) // a parcela de 400 não entra aqui
    expect(section(s, 'variable').total).toEqual([1320, 1830, 1515, 1555, 1555])
  })

  test('Saldo do mês = receitas − contas fixas − parcelas − variáveis', () => {
    expect(sheet().net).toEqual([14138, 11805, 10105, 9265, 9365])
  })

  test('mês sem movimento antes da pessoa começar não puxa a média da previsão para baixo', () => {
    const s = buildSheet({
      now: NOW, budgets: [], installments: [], salary: 0,
      transactions: [tx(10, 'expense', 'food', 900, 'Mercado'), tx(10, 'income', 'income', 600, 'Extra')],
    })
    expect(row(s, 'variable', 'Alimentação').values).toEqual([0, 0, 900, 900, 900]) // média só do mês que existe
    expect(row(s, 'income', 'Extra').values).toEqual([0, 0, 600, 600, 600])
  })

  test('sem nenhuma transação não há previsão inventada (zeros) e o salário zerado não vira linha', () => {
    const s = buildSheet({ now: NOW, transactions: [], budgets: [], installments: [], salary: 0 })
    expect(section(s, 'income').rows).toEqual([])
    expect(s.net).toEqual([0, 0, 0, 0, 0])
  })

  test('mais de quatro fontes de entrada: as menores viram "Outras entradas"', () => {
    const many = ['A', 'B', 'C', 'D', 'E', 'F'].map((n, i) => tx(10, 'income', 'income', 100 * (6 - i), n))
    const s = buildSheet({ now: NOW, transactions: many, budgets: [], installments: [], salary: 0 })
    expect(section(s, 'income').rows.map(r => r.label)).toEqual(['A', 'B', 'C', 'D', 'Outras entradas'])
    expect(row(s, 'income', 'Outras entradas').values[2]).toBe(300) // E 200 + F 100
    expect(section(s, 'income').total[2]).toBe(2100) // nenhuma entrada se perde no agrupamento
  })

  test('entradas com a mesma descrição (maiúsculas diferentes) viram uma linha só', () => {
    const s = buildSheet({ now: NOW, budgets: [], installments: [], salary: 0, transactions: [tx(10, 'income', 'income', 100, 'Freela'), tx(10, 'income', 'income', 50, ' freela ')] })
    expect(section(s, 'income').rows).toHaveLength(1)
    expect(section(s, 'income').rows[0].values[2]).toBe(150)
  })

  test('conta fixa excluída: o pagamento sem vínculo continua contando como "Outras contas fixas"', () => {
    const orphan = [tx(9, 'expense', 'fixed', 250, 'Internet'), tx(10, 'expense', 'fixed', 250, 'Internet')]
    const s = buildSheet({ now: NOW, transactions: orphan, budgets: [], installments: [], salary: 0 })
    expect(row(s, 'fixed', 'Outras contas fixas').values).toEqual([0, 250, 250, 250, 250])
  })

  test('transações arquivadas pelo fechamento do mês contam (o servidor manda todas)', () => {
    const s = buildSheet({ now: NOW, budgets: [], installments: [], salary: 0, transactions: [{ ...tx(9, 'expense', 'food', 700, 'Mercado'), archived: true }] })
    expect(row(s, 'variable', 'Alimentação').values[1]).toBe(700)
  })

  test('cada linha editável aponta para o que muda quando o valor é editado (salário e conta fixa)', () => {
    const s = sheet()
    expect(row(s, 'income', 'Salário').edit).toEqual({ kind: 'salary' })
    expect(row(s, 'fixed', 'Aluguel').edit).toEqual({ kind: 'budget', id: B.rent })
    expect(row(s, 'variable', 'Alimentação').edit).toBeUndefined()
    expect(row(s, 'income', 'Freelance').edit).toBeUndefined()
  })
})

describe('INSTALLMENT_TX', () => {
  test('reconhece só a descrição que o pagamento de parcela grava', () => {
    expect(INSTALLMENT_TX.test('Geladeira (parcela 5/8)')).toBe(true)
    expect(INSTALLMENT_TX.test('Geladeira (parcela 5/8) ')).toBe(true)
    expect(INSTALLMENT_TX.test('parcela do carro')).toBe(false)
    expect(INSTALLMENT_TX.test('Geladeira (parcela 5/8) nova')).toBe(false)
  })
})

describe('buildFeed — o que mudou por último', () => {
  const feed = (over = {}) => buildFeed({ now: NOW, transactions, installments, budgets, ...over })

  test('parcela registrada, entrada e conta fixa que mudou de valor, do mais novo para o mais antigo', () => {
    const f = feed()
    expect(f.map(e => e.kind).sort()).toEqual(['bill', 'income', 'income', 'installment']) // as duas entradas (agosto e outubro) contam
    expect(f.find(e => e.kind === 'installment').text).toBe('Parcela 5/8 da Geladeira registrada')
    expect(f.filter(e => e.kind === 'income').map(e => e.text)).toEqual(['Freelance de R$ 1.800 → coluna de outubro atualizada', 'Freelance de R$ 1.200 → coluna de agosto atualizada'])
    expect(f.find(e => e.kind === 'bill').text).toBe('Conta de luz subiu 4% → previsão de novembro ajustada') // 365 → 380
    const dates = f.map(e => +new Date(e.at))
    expect(dates).toEqual([...dates].sort((a, b) => b - a))
  })

  test('conta que caiu de valor diz "caiu"; sem mudança ou sem mês anterior não vira aviso', () => {
    const lower = [...transactions.filter(t => !(t.budgetId && t.month === 10)), tx(10, 'expense', 'fixed', 292, 'Conta de luz', { budgetId: B.luz })]
    expect(feed({ transactions: lower }).find(e => e.kind === 'bill').text).toBe('Conta de luz caiu 20% → previsão de novembro ajustada') // 365 → 292
    const same = [...transactions.filter(t => !(t.budgetId && t.month === 10)), tx(10, 'expense', 'fixed', 365, 'Conta de luz', { budgetId: B.luz })]
    expect(feed({ transactions: same }).find(e => e.kind === 'bill')).toBeUndefined()
    expect(feed({ transactions: transactions.filter(t => t.month !== 9) }).find(e => e.kind === 'bill')).toBeUndefined()
  })

  test('parcela de um parcelamento que já não existe não vira aviso; o limite corta a lista', () => {
    expect(feed({ installments: [] }).find(e => e.kind === 'installment')).toBeUndefined()
    expect(feed({ limit: 1 })).toHaveLength(1)
  })

  test('sem nada registrado, lista vazia', () => {
    expect(feed({ transactions: [], budgets: [] })).toEqual([])
  })
})

// ── xlsx ──
// leitor mínimo de zip: confere diretório central, CRC e conteúdo de cada arquivo
function readZip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  const count = buf.readUInt16LE(eocd + 10), cdOffset = buf.readUInt32LE(eocd + 16)
  const files = {}
  let p = cdOffset
  for (let i = 0; i < count; i++) {
    expect(buf.readUInt32LE(p)).toBe(0x02014b50)
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24)
    const nlen = buf.readUInt16LE(p + 28), off = buf.readUInt32LE(p + 42)
    const name = buf.slice(p + 46, p + 46 + nlen).toString('utf8')
    const lnlen = buf.readUInt16LE(off + 26), lxlen = buf.readUInt16LE(off + 28)
    const raw = buf.slice(off + 30 + lnlen + lxlen, off + 30 + lnlen + lxlen + csize)
    const data = method === 8 ? zlib.inflateRawSync(raw) : raw
    expect(data.length).toBe(usize)
    expect(crc32(data)).toBe(crc)
    files[name] = data.toString('utf8')
    p += 46 + nlen
  }
  return files
}

describe('buildXlsx', () => {
  test('zip válido com as partes de um .xlsx e CRC correto em cada uma', () => {
    const files = readZip(buildXlsx({ sheetName: 'Planilha IA', rows: [{ cells: ['Conta', 'AGO'], bold: true }, { cells: ['Aluguel', 3500.5] }] }))
    expect(Object.keys(files).sort()).toEqual(['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml'])
    expect(files['xl/workbook.xml']).toContain('name="Planilha IA"')
    expect(files['xl/worksheets/sheet1.xml']).toContain('<c r="B2" s="2"><v>3500.5</v></c>')
    expect(files['xl/worksheets/sheet1.xml']).toContain('<c r="A1" t="inlineStr" s="1">')
  })

  test('texto nunca é fórmula: "=" no começo vai como texto, e caracteres especiais e de controle são tratados', () => {
    const files = readZip(buildXlsx({ sheetName: 'X', rows: [{ cells: ['=HYPERLINK("http://x")', 'A & B <c>\u0001'] }] }))
    const xml = files['xl/worksheets/sheet1.xml']
    expect(xml).toContain('t="inlineStr"')
    expect(xml).not.toContain('<f>')
    expect(xml).toContain('=HYPERLINK(&quot;http://x&quot;)')
    expect(xml).toContain('A &amp; B &lt;c&gt;')
    expect(xml).not.toMatch(/\u0001/)
  })

  test('células vazias e valores não finitos não geram célula', () => {
    const xml = readZip(buildXlsx({ sheetName: 'X', rows: [{ cells: ['a', null, '', NaN, 2] }] }))['xl/worksheets/sheet1.xml']
    expect(xml).toContain('r="A1"')
    expect(xml).toContain('r="E1"')
    expect(xml).not.toContain('r="B1"')
    expect(xml).not.toContain('r="C1"')
    expect(xml).not.toContain('r="D1"') // NaN não vira o texto "NaN"
  })

  test('nomes de coluna: A..Z, AA..', () => {
    expect([0, 1, 25, 26, 27, 701, 702].map(colName)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'ZZ', 'AAA'])
  })

  test('crc32 confere com o valor conhecido de "123456789"', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xCBF43926)
  })
})

// ── rota ──
const asUser = (plan) => prisma.user.findUnique.mockResolvedValue({ tokenVersion: 0, plan, planExpiresAt: null, trialEndsAt: null, salary: 15000 })
const fixedNow = () => jest.useFakeTimers({ toFake: ['Date'] }).setSystemTime(new Date('2026-10-20T15:00:00Z'))

describe('GET /api/sheet', () => {
  beforeEach(() => {
    fixedNow()
    prisma.transaction.findMany.mockResolvedValue(transactions)
    prisma.budget.findMany.mockResolvedValue(budgets)
    prisma.installmentPlan.findMany.mockResolvedValue(installments)
  })
  afterEach(() => jest.useRealTimers())

  test('401 sem token', async () => {
    expect((await request(app).get('/api/sheet')).status).toBe(401)
    expect((await request(app).get('/api/sheet/export')).status).toBe(401)
  })

  test.each(['free', 'pro'])('403 no plano %s, com código para a tela mostrar o convite do Elite', async (plan) => {
    asUser(plan)
    const res = await request(app).get('/api/sheet').set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(403)
    expect(res.body).toMatchObject({ code: 'plan_required', plan, limitReached: true }) // limitReached: sem isso o cliente trataria como sessão expirada
    expect(prisma.transaction.findMany).not.toHaveBeenCalled() // nem busca dados
    const exp = await request(app).get('/api/sheet/export').set('Authorization', `Bearer ${makeToken()}`)
    expect(exp.status).toBe(403)
  })

  test('plano Elite vencido volta a ser grátis e perde a planilha', async () => {
    prisma.user.findUnique.mockResolvedValue({ tokenVersion: 0, plan: 'elite', planExpiresAt: new Date('2026-09-01T00:00:00Z'), trialEndsAt: null, salary: 15000 })
    const res = await request(app).get('/api/sheet').set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(403)
  })

  test('Elite: colunas, seções, saldo e o que mudou, sem cache', async () => {
    asUser('elite')
    const res = await request(app).get('/api/sheet').set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(200)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.body.months.map(m => m.label)).toEqual(['AGO', 'SET', 'OUT', 'NOV', 'DEZ'])
    expect(res.body.sections.map(s => s.id)).toEqual(['income', 'fixed', 'installments', 'variable'])
    expect(res.body.net).toEqual([14138, 11805, 10105, 9265, 9365])
    expect(res.body.feed.length).toBeGreaterThan(0)
    expect(typeof res.body.generatedAt).toBe('string')
  })

  test('busca só os dados do próprio usuário e a partir do primeiro mês real', async () => {
    asUser('elite')
    await request(app).get('/api/sheet').set('Authorization', `Bearer ${makeToken()}`)
    const where = prisma.transaction.findMany.mock.calls[0][0].where
    expect(where.userId).toBe(USER_ID)
    expect(where.OR).toEqual([{ year: { gt: 2026 } }, { year: 2026, month: { gte: 8 } }])
    expect(prisma.budget.findMany.mock.calls[0][0].where).toEqual({ userId: USER_ID })
    expect(prisma.installmentPlan.findMany.mock.calls[0][0].where).toEqual({ userId: USER_ID })
  })

  test('falha no banco devolve 500 sem vazar detalhes', async () => {
    asUser('elite')
    prisma.transaction.findMany.mockRejectedValue(new Error('conexão com senha xyz'))
    const res = await request(app).get('/api/sheet').set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(500)
    expect(JSON.stringify(res.body)).not.toContain('xyz')
  })
})

describe('GET /api/sheet/export', () => {
  beforeEach(() => {
    fixedNow()
    prisma.transaction.findMany.mockResolvedValue(transactions)
    prisma.budget.findMany.mockResolvedValue(budgets)
    prisma.installmentPlan.findMany.mockResolvedValue(installments)
    asUser('elite')
  })
  afterEach(() => jest.useRealTimers())

  const download = (q = '') => request(app).get(`/api/sheet/export${q}`).set('Authorization', `Bearer ${makeToken()}`).buffer(true).parse((res, cb) => {
    const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks)))
  })

  test('devolve um .xlsx com nome do mês e a mesma tabela da tela (com previsão)', async () => {
    const res = await download()
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(res.headers['content-disposition']).toBe('attachment; filename="planilha-nancy-2026-10.xlsx"')
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.body.slice(0, 2).toString()).toBe('PK')
    const xml = readZip(res.body)['xl/worksheets/sheet1.xml']
    expect(xml).toContain('AGO/2026')
    expect(xml).toContain('NOV/2026 (previsão)')
    expect(xml).toContain('Saldo do mês')
    expect(xml).toContain('<v>10105</v>') // saldo de outubro
    expect(xml).toContain('Conta de luz')
  })

  test('?forecast=0 tira as colunas de previsão', async () => {
    const xml = readZip((await download('?forecast=0')).body)['xl/worksheets/sheet1.xml']
    expect(xml).toContain('OUT/2026')
    expect(xml).not.toContain('previsão')
    expect(xml).not.toContain('NOV/2026')
    expect(xml).not.toContain('r="E1"') // Conta + 3 meses = A..D
  })
})
