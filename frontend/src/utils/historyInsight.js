// Tela Histórico (Nancy 2, tela 20): números do gráfico e a frase de destaque. Função pura.
import { MONTHS } from '../constants/index.js'

// 9500 → "9.5k", 880 → "880", 123000 → "123k", -1200 → "-1.2k"
export function fmtK(v) {
  const n = Number(v) || 0
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs < 1000) return `${sign}${Math.round(abs)}`
  const k = abs / 1000
  return `${sign}${k >= 100 ? Math.round(k) : (Math.round(k * 10) / 10).toString()}k`
}

/**
 * @param {Array<{month, year, saved, active}>} months do mais antigo ao atual (o último é o mês corrente)
 * @returns {{ kind: 'best'|'above'|'below', title, text, pct } | null}
 */
export function historyInsight(months) {
  if (!Array.isArray(months) || months.length < 2) return null
  const current = months[months.length - 1]
  if (!current.active) return null
  const earlier = months.slice(0, -1).filter(m => m.active)
  if (earlier.length === 0) return null

  const avg = earlier.reduce((s, m) => s + m.saved, 0) / earlier.length
  if (!(avg > 0) || !(current.saved > 0)) return null // % sobre média zerada/negativa não diz nada

  const pct  = Math.round(Math.abs((current.saved - avg) / avg) * 100)
  const name = MONTHS[current.month - 1]
  const yearBest = months.filter(m => m.active && m.year === current.year).every(m => m.saved <= current.saved)
  const best     = earlier.every(m => m.saved <= current.saved)

  if (current.saved > avg) {
    return {
      kind: best ? 'best' : 'above', pct,
      title: best && yearBest && earlier.some(m => m.year === current.year) ? 'Seu melhor mês do ano'
           : best ? `Seu melhor mês em ${months.length} meses` : 'Acima da média',
      text: `${name} superou a média dos meses anteriores em ${pct}%.`,
    }
  }
  return { kind: 'below', pct, title: 'Abaixo da média', text: `${name} ficou ${pct}% abaixo da média dos meses anteriores.` }
}
