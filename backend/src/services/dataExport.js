// ═══════════════════════════════════════════════════════
// src/services/dataExport.js — "Meus dados" em CSV e PDF
//
// Mesmo conteúdo do export JSON de GET /auth/export-data (LGPD Art. 15),
// em formatos que a pessoa abre direto: planilha (CSV, UTF-8 com BOM e ";"
// pro Excel em português) e PDF legível.
// ═══════════════════════════════════════════════════════

const PDFDocument = require('pdfkit')
const { CATEGORY_LABELS } = require('../utils/constants')

const TZ = 'America/Sao_Paulo'
const PDF_MAX_TRANSACTIONS = 2000 // o PDF é pra ler; o CSV e o JSON levam tudo

const num   = (v) => Number(v ?? 0)
const money = (v) => num(v).toFixed(2).replace('.', ',')
const day   = (d) => (d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: TZ }) : '')
const catLabel = (c) => CATEGORY_LABELS[c] || c || ''
const typeLabel = (t) => (t === 'income' ? 'Entrada' : 'Gasto')

// ── CSV ──────────────────────────────────────────────
// Texto digitado pela pessoa (descrição, nome da conta/meta) que comece com = + - @ ou tabulação vira fórmula
// quando a planilha é aberta (CSV injection) — prefixa com apóstrofo. Números e datas gerados aqui não passam por isso.
const FORMULA_START = /^[=+\-@\t\r]/
const text = (v) => {
  const s = String(v ?? '')
  return FORMULA_START.test(s) ? `'${s}` : s
}
const cell = (v) => {
  const s = String(v ?? '')
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const row = (cells) => cells.map(cell).join(';')

function buildCsv(data) {
  const { profile, transactions = [], goals = [], budgets = [], installmentPlans = [], categoryLimits = [] } = data
  const out = []
  const section = (title, header, rows) => {
    out.push(row([title]))
    out.push(row(header))
    if (rows.length === 0) out.push(row(['(nada registrado)']))
    rows.forEach(r => out.push(row(r)))
    out.push('')
  }

  out.push(row(['Nancy — Meus dados']))
  out.push(row(['Conta', text(profile.name), text(profile.email)]))
  out.push(row(['Exportado em', new Date(data.exportedAt).toLocaleString('pt-BR', { timeZone: TZ })]))
  out.push('')

  section('Transações', ['Data', 'Descrição', 'Categoria', 'Tipo', 'Valor (R$)', 'Mês fechado'],
    transactions.map(t => [day(t.date), text(t.description), catLabel(t.category), typeLabel(t.type), money(t.amount), t.archived ? 'Sim' : 'Não']))
  section('Metas', ['Meta', 'Valor da meta (R$)', 'Guardado (R$)', 'Prazo', 'Criada em'],
    goals.map(g => [text(g.title), money(g.targetAmount), money(g.currentAmount), day(g.deadline), day(g.createdAt)]))
  section('Contas fixas', ['Conta', 'Valor (R$)', 'Vence no dia', 'Termina em'],
    budgets.map(b => [text(b.name), money(b.amount), b.dueDay ?? '', day(b.endDate)]))
  section('Compras parceladas', ['Compra', 'Valor da parcela (R$)', 'Parcelas pagas', 'Total de parcelas', 'Primeira parcela'],
    installmentPlans.map(p => [text(p.name), money(p.amount), p.paidInstallments, p.totalInstallments, `${String(p.startMonth).padStart(2, '0')}/${p.startYear}`]))
  section('Limites por categoria', ['Categoria', 'Limite mensal (R$)'],
    categoryLimits.map(l => [catLabel(l.category), money(l.amount)]))

  // BOM: sem ele o Excel abre UTF-8 como Latin-1 e quebra os acentos. CRLF é o fim de linha padrão do formato.
  return '\uFEFF' + out.join('\r\n') + '\r\n'
}

// ── PDF ──────────────────────────────────────────────
// Helvetica do PDFKit não tem emoji nem boa parte do Unicode: o que está fora do Latin-1/pontuação comum é descartado
// em vez de virar caracteres corrompidos.
const pdfText = (v) => String(v ?? '').replace(/[^ -~ -ÿ–—‘-”•€]/g, '').trim()

function generateDataPDF(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' })
    const chunks = []
    doc.on('data', c => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const { profile, transactions = [], goals = [], budgets = [], installmentPlans = [], categoryLimits = [] } = data
    const LEFT = 50, WIDTH = 495
    let y = 0

    doc.rect(0, 0, doc.page.width, 100).fill('#1C48FF')
    doc.fontSize(26).fillColor('#ffffff').text('Nancy', LEFT, 32)
    doc.fontSize(12).fillColor('#DCE5FF').text('Meus dados', LEFT, 66)

    doc.fontSize(12).fillColor('#121A33').text(pdfText(profile.name) || '-', LEFT, 118)
    doc.fontSize(10).fillColor('#5B6784')
      .text(pdfText(profile.email), LEFT, 136)
      .text(`Exportado em ${new Date(data.exportedAt).toLocaleString('pt-BR', { timeZone: TZ })}`, LEFT, 150)
    y = 180

    const ensure = (h) => { if (y + h > 780) { doc.addPage(); y = 50 } }

    const table = (title, cols, rows, note) => {
      ensure(70)
      doc.fontSize(14).fillColor('#121A33').text(title, LEFT, y)
      y += 24
      if (note) { doc.fontSize(8.5).fillColor('#99A5BE').text(note, LEFT, y, { width: WIDTH }); y += 14 }
      if (rows.length === 0) {
        doc.fontSize(10).fillColor('#99A5BE').text('Nada registrado.', LEFT + 4, y)
        y += 28
        return
      }
      const header = () => {
        doc.rect(LEFT, y, WIDTH, 22).fill('#F2F6FF')
        let x = LEFT + 6
        doc.fontSize(8.5).fillColor('#5B6784')
        cols.forEach(c => { doc.text(c.label, x, y + 7, { width: c.w - 8, align: c.align || 'left', lineBreak: false }); x += c.w })
        y += 24
      }
      header()
      rows.forEach(r => {
        if (y + 20 > 780) { doc.addPage(); y = 50; header() }
        let x = LEFT + 6
        doc.fontSize(9).fillColor('#121A33')
        cols.forEach((c, i) => { doc.text(String(r[i] ?? ''), x, y + 4, { width: c.w - 8, align: c.align || 'left', ellipsis: true, lineBreak: false }); x += c.w })
        doc.moveTo(LEFT, y + 19).lineTo(LEFT + WIDTH, y + 19).strokeColor('#EDF2F8').lineWidth(0.5).stroke()
        y += 20
      })
      y += 18
    }

    const shown = transactions.slice(0, PDF_MAX_TRANSACTIONS)
    table('Transações',
      [{ label: 'Data', w: 70 }, { label: 'Descrição', w: 195 }, { label: 'Categoria', w: 100 }, { label: 'Tipo', w: 50 }, { label: 'Valor (R$)', w: 80, align: 'right' }],
      shown.map(t => [day(t.date), pdfText(t.description), catLabel(t.category), typeLabel(t.type), money(t.amount)]),
      transactions.length > shown.length ? `Mostrando as ${shown.length} mais recentes de ${transactions.length}. O CSV e o JSON levam todas.` : null)
    table('Metas',
      [{ label: 'Meta', w: 185 }, { label: 'Valor da meta', w: 90, align: 'right' }, { label: 'Guardado', w: 90, align: 'right' }, { label: 'Prazo', w: 130 }],
      goals.map(g => [pdfText(g.title), money(g.targetAmount), money(g.currentAmount), day(g.deadline) || 'Sem prazo']))
    table('Contas fixas',
      [{ label: 'Conta', w: 215 }, { label: 'Valor (R$)', w: 90, align: 'right' }, { label: 'Vence no dia', w: 90, align: 'right' }, { label: 'Termina em', w: 100 }],
      budgets.map(b => [pdfText(b.name), money(b.amount), b.dueDay ?? '', day(b.endDate)]))
    table('Compras parceladas',
      [{ label: 'Compra', w: 185 }, { label: 'Parcela (R$)', w: 90, align: 'right' }, { label: 'Pagas', w: 70, align: 'right' }, { label: 'Total', w: 70, align: 'right' }, { label: '1ª parcela', w: 80, align: 'right' }],
      installmentPlans.map(p => [pdfText(p.name), money(p.amount), p.paidInstallments, p.totalInstallments, `${String(p.startMonth).padStart(2, '0')}/${p.startYear}`]))
    table('Limites por categoria',
      [{ label: 'Categoria', w: 300 }, { label: 'Limite mensal (R$)', w: 195, align: 'right' }],
      categoryLimits.map(l => [catLabel(l.category), money(l.amount)]))

    doc.end()
  })
}

module.exports = { buildCsv, generateDataPDF, PDF_MAX_TRANSACTIONS }
