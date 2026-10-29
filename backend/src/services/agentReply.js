'use strict'
const { partsBrasilia } = require('../utils/helpers')

// Formatação e limpeza do texto que a Nancy IA mostra ao usuário. Deterministas de propósito: o modelo (LLM) pode não
// seguir a instrução do prompt de sistema, então o que o app mostra não depende só de ele obedecer.

// R$ 1.234,56 (ponto no milhar, vírgula nos centavos, R$ antes). Não usa Intl: o separador/espaço muda conforme o ICU.
function brl(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 'R$ 0,00'
  const [int, dec] = Math.abs(n).toFixed(2).split('.')
  return `${n < 0 ? '-' : ''}R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`
}

// dd/mm/aaaa no dia de Brasília (o ISO em UTC daria o dia seguinte para lançamentos feitos à noite).
function dateBR(date) {
  const { day, month, year } = partsBrasilia(new Date(date))
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`
}

// Mesma definição do guard de emoji dos testes (o "✓" simples, U+2713, não conta). Junta o ZWJ e o keycap, que só
// existem para montar emoji. Leva junto o espaço que vinha depois, para não sobrar buraco no texto.
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{2712}\u{2714}-\u{27BF}\u{2B50}\u{2B55}\u{FE0F}\u{200D}\u{20E3}]+[ \t]?/gu

// O modelo costuma escrever o milhar com espaço ("7 377,80"), às vezes sem quebra (U+00A0/U+202F/U+2009).
const SEP = '[\\u00A0\\u202F\\u2009 ]'
const dots = (group) => group.replace(new RegExp(SEP, 'g'), '.')
const THOUSANDS_WITH_CENTS = new RegExp(`(?<![\\d.,])(\\d{1,3}(?:${SEP}\\d{3})+)(?=,\\d{2}(?!\\d))`, 'g')
const THOUSANDS_AFTER_SYMBOL = new RegExp(`(R\\$[\\u00A0 ]?)(\\d{1,3}(?:${SEP}\\d{3})+)(?![\\d,])`, 'g')
// "0 R$" / "123,45 R$" (símbolo depois do número) — mas nunca "R$ 100,00 R$ 200,00", onde o 2º R$ pertence ao 2º valor.
const AMOUNT_BEFORE_SYMBOL = /(?<![\d.,]|R\$[  ]?)(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)[  ]R\$(?![  ]?\d)/g

// "R$ 7 377,80" -> "R$ 7.377,80" · "5 680,00" -> "5.680,00" · "0 R$" -> "R$ 0"
function fixMoney(text) {
  return text
    .replace(THOUSANDS_WITH_CENTS, dots)
    .replace(THOUSANDS_AFTER_SYMBOL, (_, symbol, group) => symbol + dots(group))
    .replace(AMOUNT_BEFORE_SYMBOL, 'R$ $1')
    .replace(/(\d)[\u00A0\u202F\u2009 ]%/g, '$1%') // o app escreve "26%", sem espaço (o modelo usa espaço comum ou fino sem quebra)
}

// O que sai pro usuário: sem emoji, dinheiro no padrão brasileiro, sem linhas em branco sobrando nem espaço na ponta.
function sanitizeReply(text) {
  if (typeof text !== 'string') return ''
  return fixMoney(text.replace(EMOJI, ''))
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

module.exports = { brl, dateBR, sanitizeReply }
