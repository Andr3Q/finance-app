import { buildRecapSlides, buildTipSlides, buildGoalSlides, maskSlides, money, HIDDEN_AMOUNT } from './storySlides.js'
import { MONTHS } from '../constants/index.js'

// Carrossel de resumos do Início no desktop (design "Nancy Desktop", tela 08): os MESMOS slides do resumo do mês da tela 09 (um só
// cálculo no servidor, o mesmo do celular), reorganizados no cartão do design: etiqueta em caixa alta, título, valor grande à direita
// e subtítulo, sobre o degradê de cada slide.
export const CAROUSEL_MS = 4000 // 4 s por slide, como no protótipo

// Degradês do design por fluxo e slide ("Nancy Desktop": cada slide tem o seu)
const BG = {
  'resumo:intro':    'linear-gradient(120deg,#1546FF,#0A2A9E)',
  'resumo:saved':    'linear-gradient(120deg,#1546FF,#12C985)',
  'resumo:spending': 'linear-gradient(120deg,#0A2A9E,#1546FF)',
  'resumo:win':      'linear-gradient(120deg,#0E9A69,#12C985)',
  'resumo:health':   'linear-gradient(120deg,#1546FF,#6A9BFF)',
  'resumo:goal':     'linear-gradient(120deg,#071330,#1546FF)',
  'anterior:saved':  'linear-gradient(120deg,#0A2A9E,#1546FF)',
  'anterior:health': 'linear-gradient(120deg,#1546FF,#12C985)',
  'dicas:tip':       'linear-gradient(120deg,#0E9A69,#1546FF)',
  'dicas:subs':      'linear-gradient(120deg,#071330,#0E9A69)',
  'metas:goal':      'linear-gradient(120deg,#0E9A69,#12C985)',
}
// resumo vindo do servidor sem o mês (ou com mês fora de 1 a 12) é incompleto
const validMonth = (m) => Number.isInteger(m) && m >= 1 && m <= 12
const FALLBACK_BG = 'linear-gradient(120deg,#1546FF,#0A2A9E)'
const capital = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t)

// Slides de um fluxo de resumo (os MESMOS da tela de stories do celular) no formato do cartão do design: etiqueta em caixa alta,
// título, valor grande e subtítulo. flow = 'resumo' (mês atual), 'anterior' (mês anterior), 'dicas' ou 'metas'.
// Dado incompleto ou de formato antigo NÃO quebra a tela (o chamador desenha o Início/a tela sem o carrossel): devolve [].
export function viewerSlides(flow, data, { hidden = false } = {}) {
  try {
    let slides
    if (flow === 'dicas') slides = buildTipSlides(data)
    else if (flow === 'metas') slides = buildGoalSlides(data)
    else {
      if (!data || !data.hasData || !validMonth(data.month)) return []
      slides = buildRecapSlides(data, flow === 'anterior' ? -1 : 0)
    }
    if (hidden) slides = maskSlides(slides)
    return mapSlides(slides, flow, data)
  } catch { return [] }
}

function mapSlides(slides, flow, data) {
  const mes = flow === 'resumo' ? MONTHS[data.month - 1].toUpperCase() : ''
  return slides.map(s => {
    const bg = BG[`${flow}:${s.id}`] || FALLBACK_BG
    if (s.id === 'intro') {
      return { id: 'intro', k: `RESUMO DE ${mes}`, t: `Seu mês em ${slides.length} histórias.`, v: '', s: 'Passe o mouse para pausar · clique para avançar', bg }
    }
    // resumo do mês anterior: o design escreve "VOCÊ GUARDOU / Setembro fechou no azul."
    if (flow === 'anterior' && s.id === 'saved') {
      return { id: s.id, k: (s.headline || '').toUpperCase(), t: `${capital(s.eyebrow)} fechou ${data.saved >= 0 ? 'no azul' : 'no vermelho'}.`, v: (s.big || '').replace(/,00$/, ''), s: s.sub || '', bg, cta: s.cta }
    }
    // maiores gastos mostra o valor do maior; saúde financeira, a pontuação
    let v = s.big || ''
    if (!v && s.bars?.length) v = s.bars[0].hidden ? HIDDEN_AMOUNT : money(s.bars[0].amount, 0)
    if (!v && s.ring != null) v = String(s.ring)
    // o design escreve valores redondos sem centavos ("R$ 9.500"); com centavos de verdade o valor sai inteiro
    v = v.replace(/,00$/, '')
    return { id: s.id, k: (s.eyebrow || '').toUpperCase(), t: s.headline || '', v, s: s.sub || '', bg, cta: s.cta }
  })
}

// recap = resposta do resumo do mês (loadStory 'resumo'); hidden = "ocultar valores" ligado
export const carouselSlides = (recap, { hidden = false } = {}) => viewerSlides('resumo', recap, { hidden })

// Faixa do selo de saúde financeira do anel (curto, cabe dentro do anel de 150px)
export function healthTag(score) {
  if (score === null || score === undefined) return '—'
  if (score >= 80) return 'Excelente'
  if (score >= 60) return 'Saudável'
  if (score >= 40) return 'Atenção'
  if (score >= 20) return 'Cuidado'
  return 'Crítico'
}

// "+4 pontos vs setembro. Contas em dia e 56% da renda poupada." — a renda é salário + entradas; poupar = entradas − saídas.
// O trecho "vs mês anterior" só aparece quando o resumo do mês traz as duas pontuações.
export function healthNote({ summary, unpaidCount, recap }) {
  const entradas = (summary?.salary || 0) + (summary?.totalIncome || 0)
  const saidas = summary?.totalExpenses || 0
  let delta = ''
  if (recap && recap.score != null && recap.scorePrev != null && validMonth(recap.prevMonth)) {
    const diff = recap.score - recap.scorePrev
    const prev = MONTHS[recap.prevMonth - 1].toLowerCase()
    delta = diff === 0 ? `Igual a ${prev}. ` : `${diff > 0 ? '+' : '−'}${Math.abs(diff)} ${Math.abs(diff) === 1 ? 'ponto' : 'pontos'} vs ${prev}. `
  }
  const contas = unpaidCount === 0 ? 'Contas em dia' : `${unpaidCount} ${unpaidCount === 1 ? 'conta' : 'contas'} a pagar`
  const poupada = entradas > 0 && entradas > saidas ? Math.round(((entradas - saidas) / entradas) * 100) : null
  return `${delta}${contas}${poupada !== null ? ` e ${poupada}% da renda poupada` : ''}.`
}
