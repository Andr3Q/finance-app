import { buildRecapSlides, maskSlides, money, HIDDEN_AMOUNT } from './storySlides.js'
import { MONTHS } from '../constants/index.js'

// Carrossel de resumos do Início no desktop (design "Nancy Desktop", tela 08): os MESMOS slides do resumo do mês da tela 09 (um só
// cálculo no servidor, o mesmo do celular), reorganizados no cartão do design: etiqueta em caixa alta, título, valor grande à direita
// e subtítulo, sobre o degradê de cada slide.
export const CAROUSEL_MS = 4000 // 4 s por slide, como no protótipo

const BG = {
  intro:    'linear-gradient(120deg,#1546FF,#0A2A9E)',
  saved:    'linear-gradient(120deg,#1546FF,#12C985)',
  spending: 'linear-gradient(120deg,#0A2A9E,#1546FF)',
  win:      'linear-gradient(120deg,#0E9A69,#12C985)',
  health:   'linear-gradient(120deg,#1546FF,#6A9BFF)',
  goal:     'linear-gradient(120deg,#071330,#1546FF)',
}

// recap = resposta do resumo do mês (loadStory 'resumo'); hidden = "ocultar valores" ligado
// O resumo vem do servidor e este cartão monta os slides NA HORA de desenhar o Início: um resumo incompleto ou de formato antigo
// (sem o mês, sem a lista de gastos...) não pode derrubar a tela inteira — nesse caso simplesmente não há carrossel.
const validMonth = (m) => Number.isInteger(m) && m >= 1 && m <= 12

export function carouselSlides(recap, { hidden = false } = {}) {
  if (!recap || !recap.hasData || !validMonth(recap.month)) return []
  try { return buildCarousel(recap, hidden) } catch { return [] }
}

function buildCarousel(recap, hidden) {
  let slides = buildRecapSlides(recap, 0)
  if (hidden) slides = maskSlides(slides)
  const mes = MONTHS[recap.month - 1].toUpperCase()
  return slides.map(s => {
    if (s.id === 'intro') {
      return { id: 'intro', k: `RESUMO DE ${mes}`, t: `Seu mês em ${slides.length} histórias.`, v: '', s: 'Passe o mouse para pausar · clique para avançar', bg: BG.intro }
    }
    // maiores gastos mostra o valor do maior; saúde financeira, a pontuação
    let v = s.big || ''
    if (!v && s.bars?.length) v = hidden ? HIDDEN_AMOUNT : money(s.bars[0].amount, 0)
    if (!v && s.ring != null) v = String(s.ring)
    return { id: s.id, k: (s.eyebrow || '').toUpperCase(), t: s.headline || '', v, s: s.sub || '', bg: BG[s.id] || BG.intro }
  })
}

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
