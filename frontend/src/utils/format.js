export const fmt = (n) => {
  const num = Number(n)
  return isFinite(num) ? num.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '0,00'
}

export const fmtShort = (n) => {
  const num = Number(n)
  if (!isFinite(num)) return '0'
  if (Math.abs(num) >= 1000) return `${(num / 1000).toFixed(1)}k`
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 0 })
}

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : null
