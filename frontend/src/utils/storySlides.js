import { MONTHS } from '../constants/index.js'
import { fmt } from './format.js'

// Construção dos slides das stories (tela 09 do Nancy 2). Tudo puro: recebe os
// dados do backend e devolve a lista de slides que StoriesResumo desenha.
//
// Regra geral: slide cujo dado real não existe (sem metas, sem mês anterior
// pra comparar, nenhuma assinatura...) simplesmente não entra, em vez de
// mostrar o número do protótipo. Os textos do design só descrevem o "melhor
// caso"; quando a realidade é outra o layout é o mesmo com texto honesto.

const DAY_MS = 24 * 60 * 60 * 1000

export const monthName = (m) => MONTHS[m - 1].toLowerCase()

export const money = (n, decimals = 2) => {
  const abs = Math.abs(Number(n) || 0)
  const body = decimals === 0 ? Math.round(abs).toLocaleString('pt-BR') : fmt(abs)
  return `${n < 0 ? '−' : ''}R$ ${body}`
}

// "R$ 10 mil" quando redondo; senão o valor inteiro.
export const moneyGoal = (n) => (n % 1000 === 0 ? `R$ ${n / 1000} mil` : `R$ ${n.toLocaleString('pt-BR')}`)

// ── Ocultar valores ──────────────────────────────────────────────────────
// Mesma preferência do Início ("hide-balance"): valores em reais viram "R$ ••••"
// — inclusive dentro de frases (inclusive a dica vinda do servidor) e nas barras
// de gastos. Percentuais e contagens continuam visíveis, como no Início.
export const HIDDEN_AMOUNT = 'R$ ••••'

export const maskAmounts = (text) =>
  typeof text === 'string' ? text.replace(/−?R\$\s?[\d.,]+(?:\s?mil)?/g, HIDDEN_AMOUNT) : text

export function maskSlides(slides) {
  return slides.map(s => ({
    ...s,
    headline: maskAmounts(s.headline),
    big:      maskAmounts(s.big),
    sub:      maskAmounts(s.sub),
    bars:     s.bars?.map(b => ({ ...b, hidden: true })),
  }))
}

export function healthWord(score) {
  if (score >= 80) return 'Excelente.'
  if (score >= 60) return 'Estável.'
  if (score >= 40) return 'Fique de olho.'
  if (score >= 20) return 'Atenção.'
  return 'Momento crítico.'
}

// ── Resumo do mês ────────────────────────────────────────────────────────
// Mês atual → resumo completo (6 slides); mês anterior → versão curta de 2
// slides, como no design.
export function buildRecapSlides(recap, offset) {
  const name     = monthName(recap.month)
  const prevName = recap.prevMonth ? monthName(recap.prevMonth) : null
  const nextYm   = recap.month === 12 ? { month: 1, year: recap.year + 1 } : { month: recap.month + 1, year: recap.year }
  const nextName = monthName(nextYm.month)
  const compact  = offset < 0
  const slides   = []

  if (!compact) slides.push({ id: 'intro', theme: 'blue' })

  // Saldo do mês
  const delta = recap.savedDeltaPct
  if (compact) {
    const below = recap.belowAverage
    slides.push({
      id: 'saved', theme: 'blue', eyebrow: name, headline: 'Você guardou',
      big: money(recap.saved, 0), bigAccent: true,
      sub: recap.saved < 0 ? 'Um mês apertado.'
        : below ? `Um mês sólido, com ${below.label} ${below.pct}% abaixo da média.`
        : 'Um mês sólido.',
    })
  } else {
    const deltaText = delta === null ? null : `${Math.abs(delta)}% ${delta >= 0 ? 'a mais' : 'a menos'} que ${prevName}.`
    slides.push(recap.saved >= 0 ? {
      id: 'saved', theme: 'mix', eyebrow: 'Você guardou',
      headline: recap.isBestOfYear ? 'Seu melhor mês do ano.' : `Seu ${name} fechou no azul.`,
      big: money(recap.saved),
      sub: [deltaText, recap.isBestOfYear ? 'Continue assim!' : null].filter(Boolean).join(' ') || null,
    } : {
      id: 'saved', theme: 'mix', eyebrow: 'Saldo do mês',
      headline: `Seu ${name} fechou no vermelho.`,
      big: money(recap.saved),
      sub: deltaText,
    })
  }

  // Maiores gastos (só resumo completo)
  if (!compact && recap.topExpenses.length > 0) {
    const top = recap.topExpenses[0]
    slides.push({
      id: 'spending', theme: 'blue', eyebrow: 'Para onde foi', headline: 'Seus maiores gastos',
      bars: recap.topExpenses.map(e => ({ label: e.label, amount: e.amount, pct: (e.amount / top.amount) * 100 })),
      sub: top.category === 'fixed' && recap.fixedSharePct >= 50
        ? `As contas fixas são ${recap.fixedSharePct}% do total, e isso é bom sinal de previsibilidade.`
        : `${top.label} foi o maior gasto: ${Math.round((top.amount / recap.totalExpenses) * 100)}% do total.`,
    })
  }

  // Maior vitória (só resumo completo): só afirma o que os dados provam — o
  // app não registra juros nem atraso, então nada disso é dito.
  if (!compact) {
    if (recap.fixedTotal > 0 && recap.fixedPaid === recap.fixedTotal) {
      slides.push({
        id: 'win', theme: 'green', eyebrow: 'Maior vitória', headline: 'Tudo em dia',
        big: `${recap.fixedPaid}/${recap.fixedTotal}`, sub: 'Contas fixas pagas este mês.',
      })
    } else if (recap.expensesDeltaPct !== null && recap.expensesDeltaPct < 0) {
      slides.push({
        id: 'win', theme: 'green', eyebrow: 'Maior vitória', headline: 'Gastou menos',
        big: `${Math.abs(recap.expensesDeltaPct)}%`, sub: `a menos em gastos que em ${prevName}.`,
      })
    }
  }

  // Saúde financeira
  if (recap.score !== null) {
    const diff = recap.scorePrev === null ? 0 : recap.score - recap.scorePrev
    const step = recap.nextStep
      ? `Próximo passo: levar ${recap.nextStep.goalTitle} a ${recap.nextStep.targetPct}%.`
      : 'Próximo passo: criar uma meta para guardar mais.'
    if (compact) {
      const n = recap.scoreNext
      slides.push({
        id: 'health', theme: 'mix', eyebrow: 'Saúde financeira', headline: healthWord(recap.score), ring: recap.score,
        sub: n === null ? `${recap.score} pontos.`
          : `${recap.score} pontos. Seu score de ${nextName} ${n > recap.score ? 'subiu' : n < recap.score ? 'caiu' : 'ficou igual'} a partir daqui.`,
      })
    } else {
      slides.push({
        id: 'health', theme: 'blue', eyebrow: 'Saúde financeira',
        headline: diff > 0 ? `Subiu ${diff} ${diff === 1 ? 'ponto' : 'pontos'}.`
          : diff < 0 ? `Caiu ${-diff} ${diff === -1 ? 'ponto' : 'pontos'}.`
          : healthWord(recap.score),
        ring: recap.score, sub: step,
      })
    }
  }

  // Convite pra meta do mês seguinte (só resumo do mês atual)
  if (!compact && recap.suggestedGoal) {
    slides.push({
      id: 'goal', theme: 'mix', eyebrow: `Meta de ${nextName}`, headline: 'Bora guardar',
      big: `${moneyGoal(recap.suggestedGoal)}?`,
      sub: 'Com base no seu ritmo, a Nancy acha que dá. Quer criar a meta?',
      cta: { kind: 'create-goal', label: `Criar meta de ${nextName}`, amount: recap.suggestedGoal, nextYm, nextName },
    })
  }

  return slides
}

// ── Dicas IA ─────────────────────────────────────────────────────────────
// tip  = resposta de GET /agent/weekly-tip ({ tip: null } quando não há base)
// subs = assinaturas detectadas (GET /transactions/subscriptions?strict=1)
export function buildTipSlides({ tip, subs }) {
  const slides = []

  if (tip?.tip) {
    slides.push({
      id: 'tip', theme: 'green', eyebrow: 'Dica da semana',
      headline: `${tip.label} está ${tip.pct}% acima da média.`,
      sub: tip.tip,
    })
  }

  if (subs && subs.length > 0) {
    const total = Math.round(subs.reduce((s, x) => s + Number(x.amount), 0))
    const totalText = `R$ ${total.toLocaleString('pt-BR')}`
    const largest = subs[0] // o endpoint já ordena do maior valor pro menor
    const largestName = String(largest.description).trim().slice(0, 40)
    slides.push({
      id: 'subs', theme: 'blue', eyebrow: 'Assinaturas',
      headline: subs.length === 1 ? `1 assinatura custa ${totalText}/mês.` : `${subs.length} assinaturas somam ${totalText}/mês.`,
      // "Uma delas não é usada há 40 dias" (design) exigiria saber o uso — o
      // app não sabe; o que dá pra afirmar é qual é a mais cara.
      sub: subs.length === 1
        ? `É ${largestName}. Quer revisar?`
        : `A maior é ${largestName} (R$ ${Math.round(largest.amount).toLocaleString('pt-BR')}/mês). Quer revisar?`,
      cta: { kind: 'open-chat', label: 'Revisar com a Nancy' },
    })
  }

  return slides
}

// ── Suas metas ───────────────────────────────────────────────────────────
const ymIndex = (ym) => ym.year * 12 + ym.month

// Mês em que a meta fecha no ritmo atual: média de (valor guardado ÷ dias
// desde a criação), porque o schema não guarda histórico de depósitos. Só
// projeta com a meta tendo 30+ dias e algum valor guardado — antes disso o
// "ritmo" seria ruído. Mais de 5 anos pra frente também não é uma projeção
// que valha mostrar.
export function projectGoalMonth(goal, now = new Date()) {
  const current = Number(goal.currentAmount)
  const target  = Number(goal.targetAmount)
  const elapsedDays = (now.getTime() - new Date(goal.createdAt).getTime()) / DAY_MS
  if (!(elapsedDays >= 30) || !(current > 0) || current >= target) return null

  const daysLeft = (target - current) / (current / elapsedDays)
  if (daysLeft > 365 * 5) return null
  const d = new Date(now.getTime() + daysLeft * DAY_MS)
  return { month: d.getMonth() + 1, year: d.getFullYear() }
}

function goalNote(goal, now) {
  const nowYm = { month: now.getMonth() + 1, year: now.getFullYear() }
  const inMonth = (ym) => (ym.year === nowYm.year ? `em ${monthName(ym.month)}` : `em ${monthName(ym.month)} de ${ym.year}`)

  const proj = projectGoalMonth(goal, now)
  const dl   = goal.deadline ? new Date(goal.deadline) : null
  const dlYm = dl && { month: dl.getMonth() + 1, year: dl.getFullYear() }

  if (proj) {
    const base = ymIndex(proj) === ymIndex(nowYm)
      ? 'No ritmo atual, você chega lá ainda este mês.'
      : `No ritmo atual, você chega lá ${inMonth(proj)}.`
    return dlYm && ymIndex(proj) > ymIndex(dlYm) ? `${base} O prazo é ${inMonth(dlYm)}.` : base
  }
  if (dlYm) return dl < now ? `O prazo era ${inMonth(dlYm)}.` : `Seu prazo é ${inMonth(dlYm)}.`
  return null
}

// A meta do slide: a de maior valor-alvo entre as ainda não concluídas.
export function pickGoal(goals) {
  const open = goals.filter(g => Number(g.targetAmount) > 0 && Number(g.currentAmount) < Number(g.targetAmount))
  if (open.length === 0) return null
  return open.reduce((best, g) => (Number(g.targetAmount) > Number(best.targetAmount) ? g : best))
}

export function buildGoalSlides(goals, now = new Date()) {
  const goal = pickGoal(goals)
  if (!goal) return []
  const target    = Number(goal.targetAmount)
  const remaining = target - Number(goal.currentAmount)
  return [{
    id: 'goal', theme: 'mix', eyebrow: goal.title,
    headline: `Faltam ${Math.max(1, Math.round((remaining / target) * 100))}%.`,
    big: Number.isInteger(remaining) ? money(remaining, 0) : money(remaining),
    sub: goalNote(goal, now),
  }]
}
