export const fmt = (n) =>
  n?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) ?? '0,00'

export const fmtShort = (n) => {
  if (!n && n !== 0) return '0'
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 0 })
}

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : null
