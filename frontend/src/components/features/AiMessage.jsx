import { Fragment } from 'react'
import { parseAiText, parseInline } from '../../utils/aiText.js'

function Inline({ text }) {
  return parseInline(text).map((part, i) => (part.bold ? <strong key={i}>{part.text}</strong> : <Fragment key={i}>{part.text}</Fragment>))
}

// Resposta da Nancy IA já formatada: negrito, lista, título e tabela de verdade (ver utils/aiText.js).
export default function AiMessage({ text }) {
  const blocks = parseAiText(text)
  return (
    <div className="nia-rich">
      {blocks.map((b, i) => {
        if (b.type === 'ul' || b.type === 'ol') {
          const List = b.type
          return <List key={i}>{b.items.map((item, j) => <li key={j}><Inline text={item} /></li>)}</List>
        }
        if (b.type === 'table') {
          const width = Math.max(b.header.length, ...b.rows.map(r => r.length))
          const pad = (row) => Array.from({ length: width }, (_, k) => row[k] ?? '')
          return (
            <div key={i} className="nia-table-wrap">
              <table className="nia-table">
                <thead><tr>{pad(b.header).map((c, k) => <th key={k}><Inline text={c} /></th>)}</tr></thead>
                <tbody>{b.rows.map((row, r) => <tr key={r}>{pad(row).map((c, k) => <td key={k}><Inline text={c} /></td>)}</tr>)}</tbody>
              </table>
            </div>
          )
        }
        return <p key={i} className={b.type === 'heading' ? 'nia-heading' : undefined}><Inline text={b.text} /></p>
      })}
    </div>
  )
}
