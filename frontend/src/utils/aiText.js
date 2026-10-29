// Texto da Nancy IA -> blocos seguros para a tela. O prompt pede texto simples, mas o modelo às vezes devolve markdown
// (negrito, títulos, listas, tabelas): sem isso o usuário via "**R$ 8.822,20**" e "| Categoria | Valor |" cru no celular.
// Só vira estrutura — nunca HTML: quem desenha são elementos React (sem dangerouslySetInnerHTML), então nada que a IA
// escreva (inclusive texto vindo de uma descrição de transação) executa ou vira link.

const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/
const BULLET   = /^\s*[-*•–]\s+(.*)$/
const ORDERED  = /^\s*\d{1,2}[.)]\s+(.*)$/
const HEADING  = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/
const RULE     = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/

const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())

// Texto em partes { text, bold }. Código, link e itálico viram texto puro (só o negrito é preservado).
export function parseInline(text) {
  const plain = String(text ?? '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(?<![*\w])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![*\w])/g, '$1')
  const parts = []
  let last = 0
  for (const m of plain.matchAll(/\*\*([^*]+?)\*\*|__([^_]+?)__/g)) {
    if (m.index > last) parts.push({ text: plain.slice(last, m.index), bold: false })
    parts.push({ text: m[1] ?? m[2], bold: true })
    last = m.index + m[0].length
  }
  if (last < plain.length) parts.push({ text: plain.slice(last), bold: false })
  // sobra de ** sem par ("**texto" cortado no meio) não deve aparecer
  return parts.map(p => (p.bold ? p : { ...p, text: p.text.replace(/\*\*/g, '') })).filter(p => p.text !== '')
}

// -> [{ type: 'p', text } | { type: 'heading', text } | { type: 'ul' | 'ol', items: [text] } | { type: 'table', header: [text], rows: [[text]] }]
export function parseAiText(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n')
  const blocks = []
  let paragraph = []
  const flush = () => { if (paragraph.length) { blocks.push({ type: 'p', text: paragraph.join('\n') }); paragraph = [] } }
  const pushItem = (type, item) => {
    const last = blocks[blocks.length - 1]
    if (last?.type === type) last.items.push(item)
    else blocks.push({ type, items: [item] })
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim() || RULE.test(line)) { flush(); continue }

    if (line.includes('|') && i + 1 < lines.length && lines[i + 1].includes('-') && TABLE_SEPARATOR.test(lines[i + 1])) {
      flush()
      const header = cells(line)
      i += 1 // a linha de separação (|---|---|)
      const rows = []
      while (i + 1 < lines.length && lines[i + 1].trim() && lines[i + 1].includes('|')) rows.push(cells(lines[++i]))
      blocks.push({ type: 'table', header, rows })
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) { flush(); blocks.push({ type: 'heading', text: heading[1] }); continue }

    const bullet = BULLET.exec(line)
    if (bullet) { flush(); pushItem('ul', bullet[1]); continue }

    const ordered = ORDERED.exec(line)
    if (ordered) { flush(); pushItem('ol', ordered[1]); continue }

    paragraph.push(line.replace(/^\s*>\s?/, ''))
  }
  flush()
  return blocks
}
