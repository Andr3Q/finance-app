// ═══════════════════════════════════════════════════════
// 📄 src/services/pdfService.js — Geração de PDF
//
// Usa o PDFKit para gerar um relatório mensal em PDF.
// Retorna um Buffer (arquivo em memória) que é enviado
// como anexo no e-mail.
// ═══════════════════════════════════════════════════════

const PDFDocument = require('pdfkit')
const { MONTHS: MONTH_NAMES } = require('../utils/constants')

const CATEGORY_LABELS = {
  food:        '🍔 Alimentação',
  shopping:    '🛍️ Shopping',
  transport:   '🚗 Transporte',
  health:      '💊 Saúde',
  leisure:     '🎮 Lazer',
  education:   '📚 Educação',
  home:        '🏠 Casa',
  income:      '💰 Entrada',
  other:       '📦 Outros'
}

/**
 * Gera o PDF do relatório mensal
 * @param {object} user          - Dados do usuário
 * @param {number} month         - Mês (1-12)
 * @param {number} year          - Ano
 * @param {object} summary       - Resumo financeiro
 * @param {array}  transactions  - Lista de transações do mês
 * @returns {Promise<Buffer>}    - PDF como Buffer
 */
function generateMonthlyPDF(user, month, year, summary, transactions) {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ margin: 50, size: 'A4' })
    const chunks = []

    // Coleta os pedaços do PDF gerado
    doc.on('data',  chunk => chunks.push(chunk))
    doc.on('end',   ()    => resolve(Buffer.concat(chunks)))
    doc.on('error', err   => reject(err))

    const monthName = MONTH_NAMES[month - 1]

    // ── Cabeçalho ──────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 120).fill('#1a1a3e')

    doc.fontSize(28).fillColor('#ffffff')
       .text('FinançasPro 💸', 50, 35)

    doc.fontSize(12).fillColor('#a0a0d0')
       .text(`Relatório Mensal — ${monthName} de ${year}`, 50, 75)

    doc.moveDown(4)

    // ── Dados do Usuário ────────────────────────────────
    doc.fontSize(14).fillColor('#333333')
       .text(`Olá, ${user.name}!`, 50, 140)
    doc.fontSize(11).fillColor('#666666')
       .text(`E-mail: ${user.email}`, 50, 162)
       .text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 50, 178)

    // ── Linha separadora ────────────────────────────────
    doc.moveTo(50, 200).lineTo(545, 200).strokeColor('#e0e0e0').stroke()

    // ── Resumo Financeiro ───────────────────────────────
    doc.moveDown(2)
    doc.fontSize(16).fillColor('#1a1a3e').text('Resumo do Mês', 50, 215)

    const rows = [
      { label: '💰 Salário Mensal',       value: summary.salary,          color: '#00b871' },
      { label: '📋 Contas Fixas',          value: -summary.totalFixedCosts, color: '#ff4757' },
      { label: '💵 Entradas Extras',       value: summary.totalIncome,     color: '#00b871' },
      { label: '🛍️  Total de Gastos',      value: -summary.totalExpenses,  color: '#ff4757' },
      { label: '✅ Saldo Final',            value: summary.currentBalance,  color: summary.currentBalance >= 0 ? '#00b871' : '#ff4757' }
    ]

    let rowY = 245
    rows.forEach((row, i) => {
      const bg = i % 2 === 0 ? '#f9f9f9' : '#ffffff'
      doc.rect(50, rowY, 495, 28).fill(bg)
      doc.fontSize(11).fillColor('#333').text(row.label, 60, rowY + 8)
      const valStr = `R$ ${Math.abs(row.value).toFixed(2).replace('.', ',')}`
      doc.fillColor(row.color).text(
        (row.value < 0 ? '- ' : '+ ') + valStr,
        400, rowY + 8,
        { width: 135, align: 'right' }
      )
      rowY += 30
    })

    rowY += 20

    // ── Transações Detalhadas ───────────────────────────
    doc.fontSize(16).fillColor('#1a1a3e').text('Transações do Mês', 50, rowY)
    rowY += 30

    // Cabeçalho da tabela
    doc.rect(50, rowY, 495, 25).fill('#1a1a3e')
    doc.fontSize(10).fillColor('#fff')
       .text('Data',        60,  rowY + 7)
       .text('Descrição',   135, rowY + 7)
       .text('Categoria',   305, rowY + 7)
       .text('Valor',       450, rowY + 7, { width: 85, align: 'right' })
    rowY += 28

    transactions.forEach((t, i) => {
      // Quebra de página se necessário
      if (rowY > 740) {
        doc.addPage()
        rowY = 50
      }

      const bg = i % 2 === 0 ? '#f9f9f9' : '#ffffff'
      doc.rect(50, rowY, 495, 24).fill(bg)

      const date     = new Date(t.date).toLocaleDateString('pt-BR')
      const catLabel = CATEGORY_LABELS[t.category] || t.category
      const valColor = t.type === 'income' ? '#00b871' : '#ff4757'
      const valStr   = `${t.type === 'income' ? '+' : '-'} R$ ${t.amount.toFixed(2).replace('.', ',')}`

      doc.fontSize(9).fillColor('#555')
         .text(date,              60,  rowY + 7)
         .text(t.description || '-', 135, rowY + 7, { width: 160, ellipsis: true })
         .text(catLabel,          305, rowY + 7, { width: 135 })
      doc.fillColor(valColor)
         .text(valStr,            450, rowY + 7, { width: 85, align: 'right' })

      rowY += 26
    })

    if (transactions.length === 0) {
      doc.fontSize(11).fillColor('#999').text('Nenhuma transação registrada neste mês.', 60, rowY + 10)
    }

    // ── Rodapé ──────────────────────────────────────────
    doc.fontSize(9).fillColor('#aaaaaa')
       .text(
         'FinançasPro — Seu controle financeiro pessoal',
         50, 790, { align: 'center', width: 495 }
       )

    doc.end()
  })
}

module.exports = { generateMonthlyPDF }
