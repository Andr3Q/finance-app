// Analisador de compras (design "Nancy Desktop", tela 38): compara as formas de pagar uma compra com o que sobra por mês, as parcelas
// atuais e o saldo da pessoa. É conta, não modelo de IA (o "IA" é do design): o mesmo cálculo do protótipo, sobre os números reais
// vindos de GET /api/analyzer/base. Roda no navegador, então a resposta é instantânea.
import { fmt } from './format.js'

export const PARCELAS = [2, 3, 6, 10, 12]
export const MAX_DISCOUNT = 30
export const MAX_RATE = 15

const round2 = (n) => Math.round(n * 100) / 100
// parcela com juros dá dízima (7.078,098): arredonda aos centavos antes de formatar
const money = (n) => `R$ ${fmt(round2(n))}`
const pc = (x) => `${Math.round(x * 100)}%`
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))

// "7.000" → 7000; "1.234,56" → 1234.56; vazio ou lixo → 0 (mesma regra do protótipo)
export function parseNum(v) {
  const x = parseFloat(String(v ?? '').replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(x) ? x : 0
}

const FORMAS = [['pix', 1], ['c1', 1], ['c2', 2], ['c3', 3], ['c6', 6], ['c10', 10], ['c12', 12]]
const labelOf = (o) => (o.k === 'pix' ? 'Pix / débito' : o.k === 'c1' ? 'Crédito 1x' : `Crédito ${o.n}x`)

/**
 * @param {object} base  { income, fixedTotal, installmentsMonthly, variableAvg, monthlyCost, leftover, balance, score } (GET /api/analyzer/base)
 * @param {object} input { item, price, discount (% no Pix), rate (% ao mês), mode: 'pix'|'c1'|'cN', parcelas: 2|3|6|10|12 }
 * @returns {null | { verdict, reasons, options, rec, months, registerLabel, chosenKey }}  null quando o valor não é positivo
 */
export function analyzePurchase(base, input) {
  const price = parseNum(input.price)
  if (!(price > 0)) return null
  const dsc = clamp(parseNum(input.discount), 0, MAX_DISCOUNT) / 100
  const jr = clamp(parseNum(input.rate), 0, MAX_RATE) / 100
  const { income, installmentsMonthly: parcEx, leftover: sobra, balance, monthlyCost: custo, score: B } = base
  const renda = income > 0 ? income : 1

  const opts = FORMAS.map(([k, n]) => {
    const pv = k === 'pix' ? price * (1 - dsc) : n === 1 ? price : (jr > 0 ? (price * jr) / (1 - Math.pow(1 + jr, -n)) : price / n)
    const total = n === 1 ? pv : pv * n
    const comp = (parcEx + (n === 1 ? 0 : pv)) / renda
    const ok = n === 1 ? pv <= balance - custo : (comp <= 0.3 && pv <= sobra * 0.4)
    // à vista pesa pelo tanto do saldo que a compra leva; parcelado, pelo quanto compromete a renda e pelos juros pagos
    const cashHit = balance > 0 ? Math.min(pv / balance, 2) * 22 : 44
    const hit = n === 1 ? cashHit - (k === 'c1' ? 1 : 0) : comp * 30 + ((total - price) / price) * 40
    return { k, n, pv, total, comp, ok, score: Math.max(15, Math.round(B - hit + (n === 1 ? 0 : 6))) }
  })
  const [cash, c1] = opts
  const okP = opts.slice(2).filter(o => o.ok)

  let rec = null
  if (cash.ok && dsc >= 0.03) rec = cash
  else if (c1.ok && price <= sobra) rec = c1
  else if (okP.length && jr === 0) rec = okP.find(o => o.pv <= sobra * 0.25) || okP[okP.length - 1]
  else if (okP.length && jr > 0) { const c = okP.filter(o => (o.total - price) / price < 0.1); rec = c.length ? c[0] : null }
  if (!rec) rec = c1.ok ? c1 : cash.ok ? cash : null
  // a recomendada nunca fica abaixo de outra opção na coluna "Saúde"
  let recScore = null
  if (rec) {
    const top = Math.max(...opts.filter(o => o !== rec).map(o => o.score))
    recScore = rec.score <= top ? Math.min(100, top + 2) : rec.score
  }
  const scoreOf = (o) => (o === rec ? recScore : o.score)

  // em quantos meses guardando metade da sobra a compra cabe à vista
  const months = Math.max(1, Math.ceil((price * (1 - dsc)) / (sobra * 0.5)))
  const delta = (s) => (s === B ? `mantém ${B}` : `${s > B ? '+' : '−'}${Math.abs(s - B)} pontos`)

  let verdict
  if (!rec) {
    verdict = { tone: 'wait', title: 'Não compre agora', score: B, delta: `mantém ${B}`,
      sub: `Guardando ${money(sobra * 0.5)} por mês, você compra à vista em ${months} ${months > 1 ? 'meses' : 'mês'} sem apertar o orçamento nem tocar na reserva.` }
  } else if (rec.k === 'pix') {
    verdict = { tone: 'pix', title: 'Pague à vista no Pix', score: recScore, delta: delta(recScore),
      sub: `Pague ${money(rec.pv)}${dsc > 0 ? ` com ${pc(dsc)} de desconto` : ''}. Seu saldo continua acima de 1 mês de custos (${money(custo)}) e você não cria parcela nova.` }
  } else if (rec.k === 'c1') {
    verdict = { tone: 'c1', title: 'Crédito à vista (1x)', score: recScore, delta: delta(recScore),
      sub: `${dsc > 0 ? 'O desconto no Pix é pequeno, então ' : 'Sem desconto no Pix, '}vale passar em 1x no cartão: ${money(rec.pv)} entra na próxima fatura e seu dinheiro rende mais uns 30 dias.` }
  } else {
    verdict = { tone: 'cN', title: `Crédito parcelado em ${rec.n}x${jr > 0 ? '' : ' sem juros'}`, score: recScore, delta: delta(recScore),
      sub: `${money(rec.pv)} por mês usa ${pc(rec.pv / sobra)} da sua sobra mensal e mantém seu saldo livre para imprevistos.` }
  }

  const chosenKey = input.mode === 'pix' ? 'pix' : input.mode === 'c1' ? 'c1' : `c${PARCELAS.includes(Number(input.parcelas)) ? Number(input.parcelas) : 10}`
  const chosen = opts.find(o => o.k === chosenKey)
  const R = (ok, text) => ({ ok, text })
  const reasons = [R(true, `Sua sobra média é ${money(sobra)}/mês depois de contas fixas, parcelas e gastos variáveis.`)]
  // a conta de parcelas usa a que ele pensou em fazer, ou 10x quando ele pensou em pagar à vista
  const pn = rec && rec.n > 1 ? rec : opts.find(o => o.k === (chosen.n > 1 ? chosen.k : 'c10'))
  reasons.push(R(pn.comp <= 0.3, `Parcelando em ${pn.n}x, suas parcelas passam a comprometer ${pc(pn.comp)} da renda (limite saudável: 30%).`))
  reasons.push(R(cash.ok, `À vista, seu saldo cairia para ${money(balance - cash.pv)}${cash.ok ? ', ainda acima' : ', abaixo'} da sua reserva de 1 mês (${money(custo)}).`))
  if (jr > 0) reasons.push(R(false, `Os juros do cartão somam ${money(opts.find(o => o.k === 'c12').total - price)} a mais em 12x.`))
  else if (dsc > 0) reasons.push(R(true, `À vista você economiza ${money(price * dsc)} com o desconto.`))
  else reasons.push(R(true, 'Sem juros: parcelar não custa nada a mais, e o dinheiro segue rendendo na sua conta.'))
  const chosenName = chosen.k === 'pix' ? 'Pix / débito à vista' : chosen.k === 'c1' ? 'crédito à vista (1x)' : `crédito em ${chosen.n}x`
  if (chosen !== rec) {
    reasons.unshift(R(chosen.ok, `Você pensou em ${chosenName}: ${chosen.ok ? `também cabe no orçamento (saúde ${scoreOf(chosen)}), mas a opção recomendada pesa menos nas suas finanças.` : 'essa forma aperta seu orçamento agora.'}`))
  } else {
    reasons.unshift(R(true, `Boa escolha: ${chosenName} é exatamente o que a Nancy recomenda.`))
  }

  const options = opts.map(o => {
    const isRec = o === rec
    const isChosen = o === chosen && !isRec
    return {
      k: o.k, label: labelOf(o), pv: o.pv, total: o.total, pct: o.pv / sobra, score: scoreOf(o),
      tag: isRec ? 'Recomendado' : isChosen ? 'Sua escolha' : o.ok ? 'Possível' : 'Aperta',
      tone: isRec ? 'rec' : isChosen ? 'mine' : o.ok ? 'ok' : 'tight',
    }
  })

  const registerLabel = !rec ? 'Guardar para comprar depois'
    : rec.k === 'pix' ? 'Registrar compra no Pix'
    : rec.k === 'c1' ? 'Registrar no crédito 1x'
    : `Registrar em ${rec.n}x no crédito`

  return {
    price, verdict, reasons, options, months, registerLabel, chosenKey,
    // o que "registrar" grava: à vista vira uma saída; parcelado vira um parcelamento (valor da parcela e quantas); sem recomendação vira meta
    rec: rec ? { k: rec.k, n: rec.n, pv: round2(rec.pv), total: round2(rec.total) } : null,
  }
}
