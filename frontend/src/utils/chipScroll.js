// Atalhos (chips) com setas, em Metas e no Extrato: rola um passo de cada vez, SEM passar do começo nem do fim.
//
// Antes as setas chamavam scrollBy({ left: ±150, behavior: 'smooth' }). Quando o destino cai fora do alcance
// (ex.: scrollLeft 150 + 150 = 300, com máximo de 205), o iOS Safari deixa o carrossel PARADO além do limite — sobra um
// vazio ao lado do último atalho (ou do primeiro). Pedir já o destino dentro de [0, máximo] evita isso nos dois lados.
export function scrollChipsBy(el, dir, step = 150) {
  if (!el) return
  const max = Math.max(0, el.scrollWidth - el.clientWidth)
  const left = Math.min(max, Math.max(0, el.scrollLeft + dir * step))
  if (typeof el.scrollTo === 'function') el.scrollTo({ left, behavior: 'smooth' })
  else el.scrollLeft = left
}
