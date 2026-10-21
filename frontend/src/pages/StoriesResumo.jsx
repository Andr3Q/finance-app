import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { MONTHS } from '../constants/index.js'
import { transactionsAPI, goalsAPI } from '../services/api.js'
import { fmt } from '../utils/format.js'

const STORY_DURATION_MS = 5000
const RING_R    = 46
const RING_CIRC = 2 * Math.PI * RING_R

const IconPause = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
)
const IconPlay = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
)
const IconClose = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
)

const money = (n, decimals = 2) => {
  const abs = Math.abs(Number(n) || 0)
  const body = decimals === 0 ? Math.round(abs).toLocaleString('pt-BR') : fmt(abs)
  return `${n < 0 ? '−' : ''}R$ ${body}`
}
// "R$ 10 mil" quando redondo; senão o valor inteiro.
const moneyGoal = (n) => (n % 1000 === 0 ? `R$ ${n / 1000} mil` : `R$ ${n.toLocaleString('pt-BR')}`)

const monthName = (m) => MONTHS[m - 1].toLowerCase()

function healthWord(score) {
  if (score >= 80) return 'Excelente.'
  if (score >= 60) return 'Estável.'
  if (score >= 40) return 'Fique de olho.'
  if (score >= 20) return 'Atenção.'
  return 'Momento crítico.'
}

// Resumo em stories (tela 09). O conteúdo vem de /transactions/monthly-recap,
// calculado sobre as transações reais do mês — slides cujo dado não existe
// (sem metas, sem mês anterior pra comparar, contas fixas não quitadas...)
// simplesmente não entram, em vez de mostrar o número do protótipo. Os textos
// do design só descrevem o "melhor caso"; quando a realidade é outra o layout
// é o mesmo com texto honesto (ex.: "Caiu 4 pontos", "Seu mês fechou no
// vermelho"). Mês atual → resumo completo (6 slides); mês anterior → versão
// curta de 2 slides, como no design.
function buildSlides(recap, offset) {
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

  // Maior vitória (só resumo completo): só afirma o que os dados provam.
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

export default function StoriesResumo() {
  const navigate = useNavigate()
  const location = useLocation()
  const offset   = Math.min(0, Math.max(-11, Number(location.state?.monthOffset) || 0))

  const [recap,  setRecap]  = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [index,    setIndex]    = useState(0)
  const [paused,   setPaused]   = useState(false)
  const [progress, setProgress] = useState(0) // 0-1 dentro do slide atual
  const [busy,  setBusy]  = useState(false)
  const [toast, setToast] = useState(null)

  const rafRef      = useRef(null)
  const startRef    = useRef(null)
  const pausedAtRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    transactionsAPI.monthlyRecap(offset)
      .then(r => { if (!cancelled) { setRecap(r.data); setStatus('ready') } })
      .catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true }
  }, [offset])

  const slides = useMemo(() => {
    if (!recap || !recap.hasData) return []
    return buildSlides(recap, offset)
  }, [recap, offset])

  const close = () => navigate('/dashboard')

  const goTo = (i) => {
    if (i < 0) return // já no primeiro — tocar na esquerda não faz nada
    if (i >= slides.length) { close(); return } // depois do último — fecha
    pausedAtRef.current = 0
    setIndex(i)
    setProgress(0)
  }

  useEffect(() => {
    if (paused || slides.length === 0) return
    let cancelled = false
    startRef.current = performance.now() - pausedAtRef.current
    const tick = (t) => {
      if (cancelled) return
      const pct = Math.min(1, (t - startRef.current) / STORY_DURATION_MS)
      setProgress(pct)
      if (pct >= 1) { goTo(index + 1); return }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { cancelled = true; cancelAnimationFrame(rafRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, paused, slides.length])

  const togglePause = () => {
    if (!paused) pausedAtRef.current = progress * STORY_DURATION_MS
    setPaused(p => !p)
  }

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  const share = async (slide) => {
    const text = [slide.headline, slide.big, slide.sub].filter(Boolean).join(' — ')
    const title = `Meu resumo de ${monthName(recap.month)} na Nancy`
    try {
      if (navigator.share) { await navigator.share({ title, text }); return }
      await navigator.clipboard.writeText(`${title}: ${text}`)
      showToast('Resumo copiado.')
    } catch { /* usuário cancelou o compartilhamento */ }
  }

  const createGoal = async (cta) => {
    if (busy) return
    setBusy(true)
    try {
      const lastDay = new Date(cta.nextYm.year, cta.nextYm.month, 0).getDate()
      const mm = String(cta.nextYm.month).padStart(2, '0')
      await goalsAPI.create({
        title: `Meta de ${cta.nextName}`,
        targetAmount: cta.amount,
        deadline: `${cta.nextYm.year}-${mm}-${String(lastDay).padStart(2, '0')}`,
      })
      navigate('/goals')
    } catch (err) {
      showToast(err.response?.data?.error || 'Não foi possível criar a meta.', false)
      setBusy(false)
    }
  }

  const slide = slides[index]
  const title = recap ? `Resumo de ${monthName(recap.month)}` : 'Resumo'

  return (
    <div className={`stories-page${slide ? ` stories-theme-${slide.theme}` : ''}`}>
      <div className="stories-progress-row">
        {slides.map((s, i) => (
          <div key={s.id} className="stories-progress-track">
            <div
              className="stories-progress-fill"
              style={{ width: `${(i < index ? 1 : i === index ? progress : 0) * 100}%` }}
            />
          </div>
        ))}
      </div>

      <div className="stories-header">
        <div className="stories-header-user">
          <div className="stories-avatar">n</div>
          <div className="stories-header-text">
            <span className="stories-title">{title}</span>
            <span className="stories-sub">Nancy · resumo</span>
          </div>
        </div>
        <div className="stories-header-actions">
          <button className="stories-iconbtn" onClick={togglePause} aria-label={paused ? 'Retomar' : 'Pausar'}>
            {paused ? <IconPlay /> : <IconPause />}
          </button>
          <button className="stories-iconbtn" onClick={close} aria-label="Fechar">
            <IconClose />
          </button>
        </div>
      </div>

      <button className="stories-tap-zone stories-tap-left" onClick={() => goTo(index - 1)} aria-label="Voltar" />
      <button className="stories-tap-zone stories-tap-right" onClick={() => goTo(index + 1)} aria-label="Avançar" />

      <div className="stories-content">
        {status === 'loading' && <p className="stories-subtext">Montando seu resumo…</p>}
        {status === 'error' && <p className="stories-subtext">Não foi possível carregar o resumo. Tente de novo mais tarde.</p>}
        {status === 'ready' && !recap.hasData && (
          <>
            <div className="stories-eyebrow">Resumo do mês</div>
            <h1 className="stories-headline">Sem movimentações em {monthName(recap.month)}.</h1>
            <p className="stories-subtext">Registre suas transações para ver o resumo aqui.</p>
          </>
        )}

        {slide && (
          <>
            {slide.id === 'intro' ? (
              <>
                <div className="stories-eyebrow">Resumo do mês</div>
                <h1 className="stories-headline">
                  Seu {monthName(recap.month)}<br />
                  em {slides.length} história{slides.length === 1 ? '' : 's'}.
                </h1>
                <p className="stories-subtext">Toque à direita para avançar.</p>
              </>
            ) : (
              <>
                <div className="stories-eyebrow">{slide.eyebrow}</div>
                <h1 className="stories-headline">{slide.headline}</h1>
                {slide.big && <div className={`stories-big${slide.bigAccent ? ' stories-big-accent' : ''}`}>{slide.big}</div>}
                {slide.bars && (
                  <div className="stories-bars">
                    {slide.bars.map((b, i) => (
                      <div key={b.label} className="stories-bar-row">
                        <div className="stories-bar-label"><span>{b.label}</span><span className="stories-mono">{money(b.amount)}</span></div>
                        <div className="stories-bar-track"><div className={`stories-bar-fill stories-bar-fill-${i}`} style={{ width: `${b.pct}%` }} /></div>
                      </div>
                    ))}
                  </div>
                )}
                {slide.ring !== undefined && (
                  <div className="stories-ring">
                    <svg width="112" height="112" viewBox="0 0 112 112">
                      <circle cx="56" cy="56" r={RING_R} fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="9" />
                      <circle cx="56" cy="56" r={RING_R} fill="none" stroke="#34E3A0" strokeWidth="9" strokeLinecap="round"
                        strokeDasharray={RING_CIRC} strokeDashoffset={RING_CIRC * (1 - slide.ring / 100)}
                        transform="rotate(-90 56 56)" />
                    </svg>
                    <span className="stories-ring-score">{slide.ring}</span>
                  </div>
                )}
                {slide.sub && <p className="stories-subtext">{slide.sub}</p>}
              </>
            )}
          </>
        )}
      </div>

      {slide?.cta && (
        <div className="stories-cta-wrap">
          <button className="stories-cta" onClick={() => createGoal(slide.cta)} disabled={busy}>{slide.cta.label}</button>
          <button className="stories-share" onClick={() => share(slide)}>Compartilhar resumo</button>
        </div>
      )}

      {toast && <div className={`stories-toast${toast.ok ? '' : ' stories-toast-err'}`} role="status">{toast.msg}</div>}
    </div>
  )
}
