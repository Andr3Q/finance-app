'use strict'
// Importação de CSV (Extrato → "Importar CSV"). Funções puras, testáveis sem banco.
//
// Aceita dois mundos: (1) o CSV que o próprio Nancy exporta ("Data","Descrição","Categoria","Tipo","Valor (R$)", datas dd/mm/aaaa,
// vírgula decimal, valor negativo nas saídas) — a ida e volta do backup do usuário — e (2) extratos de banco, que só têm
// descrição e valor (tipo pelo sinal, data de hoje, categoria "Outros").

const { CATEGORY_LABELS, VALID_CATEGORIES, MAX_AMOUNT } = require('./constants')
const { parseDateInput, partsBrasilia } = require('./helpers')

const MAX_CSV_ROWS = 500
const DAY_MS = 24 * 60 * 60 * 1000

// "Valor (R$)" → "valor r", "Descrição" → "descricao"
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const HEADERS = {
  description: ['descricao', 'description', 'historico', 'detalhes', 'memo', 'nome', 'name'],
  amount:      ['valor', 'valor r', 'amount', 'lancamento', 'quantia'],
  date:        ['data', 'date', 'data lancamento', 'dt'],
  type:        ['tipo', 'type'],
  category:    ['categoria', 'category'],
}

const INCOME_WORDS  = new Set(['entrada', 'receita', 'income', 'credito', 'credit', 'c'])
const EXPENSE_WORDS = new Set(['saida', 'despesa', 'expense', 'debito', 'debit', 'd'])

// categoria por chave (food) ou por rótulo (Alimentação, Entrada Extra, Contas fixas...)
const CATEGORY_LOOKUP = new Map()
for (const key of VALID_CATEGORIES) { CATEGORY_LOOKUP.set(norm(key), key); CATEGORY_LOOKUP.set(norm(CATEGORY_LABELS[key]), key) }

// Primeira coluna do registro cujo cabeçalho (normalizado) é um dos nomes aceitos; undefined se não houver.
function pick(record, names) {
  for (const header of Object.keys(record)) {
    if (names.includes(norm(header))) return record[header]
  }
  return undefined
}

function parseCsvAmount(raw) {
  const s = String(raw ?? '').replace(/R\$/gi, '').replace(/\s/g, '')
  const lastComma = s.lastIndexOf(',')
  const lastDot   = s.lastIndexOf('.')

  if (lastComma === -1 && lastDot === -1) return parseFloat(s)

  let t = s
  if (lastComma > lastDot) {
    // ',' é o separador mais à direita → decimal pt-BR ("1.234,56"). '.' = milhar.
    t = t.replace(/\./g, '').replace(',', '.')
  } else {
    // '.' é o separador mais à direita (ou único). 3 dígitos após ele = milhar pt-BR sem decimais ("1.234" → 1234);
    // qualquer outra contagem = decimal ("1234.56").
    const digitsAfter = t.length - lastDot - 1
    t = digitsAfter === 3 ? t.replace(/\./g, '') : t.replace(/,/g, '')
  }
  return parseFloat(t)
}

// "25/10/2026", "25/10/26", "25-10-2026" ou "2026-10-25" → Date (meia-noite de Brasília) ou null. Vazio → undefined (usa hoje).
function parseCsvDate(raw, now = new Date()) {
  const s = String(raw ?? '').trim()
  if (!s) return undefined
  let iso = null
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(s)
  if (m) iso = `${m[1]}-${m[2]}-${m[3]}`
  else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s))) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3]
    iso = `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  if (!iso) return null
  const date = parseDateInput(iso)
  if (!date) return null
  // sanidade: nada de 1900 nem de data distante no futuro (erro de digitação) — até amanhã, por causa do fuso
  if (date.getUTCFullYear() < 2000 || date.getTime() > now.getTime() + DAY_MS) return null
  return date
}

const typeFrom = (raw) => {
  const w = norm(raw)
  return INCOME_WORDS.has(w) ? 'income' : EXPENSE_WORDS.has(w) ? 'expense' : null
}

const cleanText = (v, max = 255) => String(v ?? '').replace(/[\x00-\x1F\x7F]/g, ' ').trim().substring(0, max)

/**
 * @param {Array<object>} records  linhas do csv-parse (colunas: true)
 * @param {object} o  { now, limit }  limit = quantas ainda cabem no plano (null = sem limite)
 * @returns {{ rows: object[], skipped: number, hasAmountColumn: boolean }}
 */
function buildImportRows(records, { now = new Date(), limit = null } = {}) {
  const rows = []
  let skipped = 0
  const hasAmountColumn = records.length > 0 && Object.keys(records[0]).some(h => HEADERS.amount.includes(norm(h)))

  for (const record of records) {
    if (limit !== null && rows.length >= limit) break

    const amount = parseCsvAmount(pick(record, HEADERS.amount) ?? '0')
    if (isNaN(amount) || amount === 0 || Math.abs(amount) > MAX_AMOUNT) { skipped++; continue }

    const date = parseCsvDate(pick(record, HEADERS.date), now)
    if (date === null) { skipped++; continue } // coluna de data presente mas inválida: não chuta "hoje"
    const when = date || now

    // O tipo da coluna "Tipo" vale mais que o sinal (valor positivo + "Saída" é uma saída); sem a coluna, o sinal decide.
    const type = typeFrom(pick(record, HEADERS.type)) || (amount > 0 ? 'income' : 'expense')
    const mapped = CATEGORY_LOOKUP.get(norm(pick(record, HEADERS.category)))
    const category = type === 'income' ? 'income' : (mapped && mapped !== 'income' ? mapped : 'other')

    const { month, year } = partsBrasilia(when)
    rows.push({
      description: cleanText(pick(record, HEADERS.description)) || 'Importação',
      amount:      Math.abs(amount),
      type, category, date: when, month, year,
    })
  }
  return { rows, skipped, hasAmountColumn }
}

module.exports = { buildImportRows, parseCsvAmount, parseCsvDate, MAX_CSV_ROWS }
