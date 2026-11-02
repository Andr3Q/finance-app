import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ProtoIcon from '../components/layout/ProtoIcon.jsx'
import AutoLaunchPrompt from '../components/features/AutoLaunchPrompt.jsx'
import ProtoCategoryIcon from '../components/layout/ProtoCategoryIcon.jsx'
import { CATEGORY_LABELS, MONTHS } from '../constants/index.js'
import { DESKTOP_NAV } from '../utils/desktopNav.js'
import { loadStory, peekStory } from '../services/storiesData.js'
import { carouselSlides, healthTag, healthNote, CAROUSEL_MS } from '../utils/homeCarousel.js'
import { useSplashGone } from '../hooks/useSplashGone.js'

const HIDDEN = 'R$ ••••'
const readyNav = (key) => DESKTOP_NAV.find(i => i.key === key)?.ready

// Valor em reais no formato do design: "R$ 16.800,00"; com sinal "− R$ 200,00" / "+ R$ 1.800,00"
const brl = (n) => Math.abs(Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const money = (n, hidden) => (hidden ? HIDDEN : `${n < 0 ? '− ' : ''}R$ ${brl(n)}`)
const signed = (n, hidden) => (hidden ? HIDDEN : `${n < 0 ? '− ' : '+ '}R$ ${brl(n)}`)

// Resumo do mês (o mesmo da tela de stories): já vem pré-carregado pelo Início; senão busca.
function useRecap(userId) {
  const [recap, setRecap] = useState(() => (userId ? peekStory(userId, 'resumo', 0) ?? null : null))
  useEffect(() => {
    if (!userId) return undefined
    let cancelled = false
    loadStory(userId, 'resumo', 0).then(d => { if (!cancelled) setRecap(d ?? null) }).catch(() => {})
    return () => { cancelled = true }
  }, [userId])
  return recap
}

// Avança sozinho a cada CAROUSEL_MS; passar o mouse pausa (e retoma de onde parou); a barra anda por CSS (sem re-render por quadro).
// O tempo corrido é guardado ao pausar e ZERADO quando um slide novo começa (por qualquer caminho: sozinho, clique no cartão ou na barra).
function useCarousel(count) {
  const [index, setIndex] = useState(0)
  const [hover, setPaused] = useState(false)
  // o Início monta POR BAIXO do vídeo de abertura: o carrossel só começa a contar quando a abertura sai (senão a pessoa perde os primeiros slides)
  const splashGone = useSplashGone()
  const paused = hover || !splashGone
  const clock = useRef({ start: 0, elapsed: 0, shown: -1 })
  useEffect(() => { setIndex(0); clock.current = { start: 0, elapsed: 0, shown: -1 } }, [count])
  useEffect(() => {
    if (count < 2 || paused) return undefined
    if (clock.current.shown !== index) { clock.current.elapsed = 0; clock.current.shown = index } // slide novo: os 4s inteiros
    clock.current.start = performance.now()
    const t = setTimeout(() => setIndex(i => (i + 1) % count), Math.max(0, CAROUSEL_MS - clock.current.elapsed))
    return () => { clearTimeout(t); clock.current.elapsed += performance.now() - clock.current.start }
  }, [index, paused, count])
  return { index, paused: hover, setPaused, next: () => setIndex((index + 1) % count), go: setIndex }
}

function StoryCard({ slides, onAll }) {
  const { index, paused, setPaused, next, go } = useCarousel(slides.length)
  const slide = slides[index] || slides[0]
  return (
    <div className="ndh-story" style={{ background: slide.bg }} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="ndh-story-bars">
        {slides.map((_, i) => (
          <button key={i} type="button" className="ndh-story-bar" onClick={() => go(i)} aria-label={`Ir para o resumo ${i + 1} de ${slides.length}`}>
            <span
              key={i === index ? `cur-${index}` : i}
              className={`ndh-story-fill${i < index ? ' done' : i === index ? ' cur' : ''}`}
              style={i === index ? { animationDuration: `${CAROUSEL_MS}ms`, animationPlayState: paused ? 'paused' : 'running' } : undefined}
            />
          </button>
        ))}
      </div>
      <button type="button" className="ndh-story-body" onClick={next} aria-label="Próximo resumo">
        <span className="ndh-story-text" key={index}>
          <span className="ndh-story-kicker"><ProtoIcon name="spark" size={20} />{slide.k}</span>
          <span className="ndh-story-title">{slide.t}</span>
          {slide.s && <span className="ndh-story-sub">{slide.s}</span>}
        </span>
        {slide.v && <span className="ndh-story-value" key={`v${index}`}>{slide.v}</span>}
      </button>
      <div className="ndh-story-foot">
        <span>{index + 1} / {slides.length}</span>
        <button type="button" className="ndh-story-all" onClick={onAll}>Ver todos os resumos</button>
      </div>
    </div>
  )
}

// Início no desktop (design "Nancy Desktop", tela 08). Só a apresentação — os dados e as regras (carga, cache, lançar contas fixas,
// ocultar valores, projeção) são os do Dashboard, que passa tudo em `ctx`.
export default function DashboardDesktop({ ctx }) {
  const navigate = useNavigate()
  const { user, summary, budgets, recentTx, loadFailed, hidden, monthGrowth, projected, monthName, score, scoreRing, scoreInk, onRetry } = ctx
  const recap = useRecap(user.id)
  const slides = useMemo(() => carouselSlides(recap, { hidden }), [recap, hidden])

  const entradas = (summary?.salary || 0) + (summary?.totalIncome || 0)
  const unpaid = new Set(summary?.unpaidBudgetIds ?? [])
  const upcoming = budgets.filter(b => unpaid.has(b.id)).sort((a, b) => (a.dueDay || 99) - (b.dueDay || 99))
  const fixedPaid = budgets.length - upcoming.length
  const dayNote = recap?.expensesDeltaPct != null && MONTHS[recap.prevMonth - 1]
    ? `${recap.expensesDeltaPct < 0 ? '−' : '+'}${Math.abs(recap.expensesDeltaPct)}% vs ${MONTHS[recap.prevMonth - 1].toLowerCase()}`
    : null
  const stats = [
    { label: 'Entradas', dot: '#12C985', val: money(entradas, hidden), note: summary?.totalIncome > 0 ? `+${hidden ? HIDDEN : `R$ ${brl(summary.totalIncome).replace(',00', '')}`} em outras entradas` : 'Só o salário', ink: '#087A52' },
    { label: 'Saídas', dot: '#1546FF', val: money(summary?.totalExpenses || 0, hidden), note: dayNote || ' ', ink: recap?.expensesDeltaPct < 0 ? '#087A52' : '#5B6785' },
    { label: 'Contas fixas', dot: '#93F0CB', val: money(summary?.totalFixedCosts || 0, hidden), note: budgets.length ? `${fixedPaid} de ${budgets.length} pagas` : 'Nenhuma conta fixa', ink: '#5B6785' },
  ]

  const quick = [
    { key: 'tx', label: 'Nova transação', icon: 'plus', run: () => window.dispatchEvent(new CustomEvent('nancy:new-transaction', { detail: {} })) },
    ...(readyNav('planilha') ? [{ key: 'planilha', label: 'Planilha IA', icon: 'grid', run: () => navigate('/planilha') }] : []),
    ...(readyNav('analisador') ? [{ key: 'analisador', label: 'Analisador', icon: 'card', run: () => navigate('/analisador') }] : []),
    { key: 'chat', label: 'Nancy IA', icon: 'spark', white: true, run: () => window.dispatchEvent(new Event('nancy:open-agent-chat')) },
  ]
  const askNancy = () => window.dispatchEvent(new CustomEvent('nancy:open-agent-chat', {
    detail: { message: projected >= 0 ? 'Como posso sobrar ainda mais este mês?' : 'Como posso fechar este mês no azul?' },
  }))
  const circ = 2 * Math.PI * 62

  return (
    <div className="ndh-page">
      {loadFailed ? (
        <section className="home-error" role="alert">
          <strong>Não foi possível carregar suas finanças.</strong>
          <p>Confira sua conexão e tente de novo. Seus dados continuam salvos.</p>
          <button type="button" className="home-error-btn" onClick={onRetry}>Tentar de novo</button>
        </section>
      ) : (
        <>
          <AutoLaunchPrompt autoLaunched={summary?.autoLaunched} pending={summary?.unpaidBudgetIds?.length || 0} total={budgets.length} />
          <div className="ndh-grid">
            <div className="ndh-main">
              <section className="ndh-hero" aria-label="Saldo disponível">
                <div className="ndh-hero-glow" aria-hidden="true" />
                <div className="ndh-hero-bal">
                  <span className="ndh-hero-lbl">Saldo disponível · {monthName}</span>
                  <span className="ndh-hero-val" data-testid="balance">{hidden ? 'R$ ••••••' : `R$ ${brl(summary?.currentBalance)}`}</span>
                  {monthGrowth !== null && (
                    <span className={`ndh-hero-badge${monthGrowth < 0 ? ' neg' : ''}`}>
                      {monthGrowth > 0 ? '+' : monthGrowth < 0 ? '−' : ''}{Math.min(999, Math.abs(monthGrowth)).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% no mês
                    </span>
                  )}
                </div>
                <div className="ndh-quick">
                  {quick.map(q => (
                    <button key={q.key} type="button" className="ndh-quick-btn" onClick={q.run}>
                      <span className={`ndh-quick-ico${q.white ? ' white' : ''}`}><ProtoIcon name={q.icon} size={22} /></span>
                      <span className="ndh-quick-lbl">{q.label}</span>
                    </button>
                  ))}
                </div>
              </section>

              {slides.length > 0 && <StoryCard slides={slides} onAll={() => navigate('/resumo-stories', { state: { monthOffset: 0 } })} />}

              <div className="ndh-stats">
                {stats.map(x => (
                  <div key={x.label} className="ndh-stat">
                    <span className="ndh-stat-lbl"><span className="ndh-stat-dot" style={{ background: x.dot }} />{x.label}</span>
                    <span className="ndh-stat-val">{x.val}</span>
                    <span className="ndh-stat-note" style={{ color: x.ink }}>{x.note}</span>
                  </div>
                ))}
              </div>

              <section className="ndh-card">
                <div className="ndh-card-head">
                  <h2 className="ndh-card-title">Últimas transações</h2>
                  <button type="button" className="ndh-link" onClick={() => navigate('/transactions')}>Ver extrato →</button>
                </div>
                {recentTx.length === 0 ? (
                  <div className="ndh-empty">Nenhuma transação encontrada</div>
                ) : (
                  <ul className="ndh-rows">
                    {recentTx.map(t => {
                      const inc = t.type === 'income'
                      const d = new Date(t.date)
                      return (
                        <li key={t.id} className="ndh-row">
                          <span className={`ndh-row-ico${inc ? ' inc' : ''}`}><ProtoCategoryIcon category={t.category} size={18} /></span>
                          <span className="ndh-row-desc">{t.description || CATEGORY_LABELS[t.category] || t.category}</span>
                          <span className="ndh-row-cat">{CATEGORY_LABELS[t.category] || t.category}</span>
                          <span className="ndh-row-date">{String(d.getDate()).padStart(2, '0')}/{String(d.getMonth() + 1).padStart(2, '0')}</span>
                          <span className={`ndh-row-amt${inc ? ' inc' : ''}`}>{signed(inc ? t.amount : -t.amount, hidden)}</span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            </div>

            <aside className="ndh-side">
              <section className="ndh-card ndh-health">
                <h2 className="ndh-card-title ndh-health-title">Saúde financeira</h2>
                <div className="ndh-ring">
                  <svg width="150" height="150" viewBox="0 0 150 150" aria-hidden="true" style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx="75" cy="75" r="62" fill="none" stroke="#E9FBF2" strokeWidth="14" />
                    <circle cx="75" cy="75" r="62" fill="none" stroke={scoreRing} strokeWidth="14" strokeLinecap="round"
                      strokeDasharray={`${circ * (score ?? 0) / 100} ${circ}`} />
                  </svg>
                  <div className="ndh-ring-in">
                    <span className="ndh-ring-num">{score ?? '—'}</span>
                    <span className="ndh-ring-tag" style={{ color: scoreInk }}>{healthTag(score)}</span>
                  </div>
                </div>
                <p className="ndh-health-note">{healthNote({ summary, unpaidCount: upcoming.length, recap })}</p>
              </section>

              <section className="ndh-card ndh-bills">
                <h2 className="ndh-card-title">Próximas contas</h2>
                {upcoming.length === 0 ? (
                  <div className="ndh-empty">Nenhuma conta pendente</div>
                ) : upcoming.map(b => (
                  <div key={b.id} className="ndh-bill">
                    <span className="ndh-row-ico"><ProtoIcon name="list" size={20} /></span>
                    <span className="ndh-bill-text"><span className="ndh-bill-name">{b.name}</span><span className="ndh-bill-when">Vence dia {b.dueDay}</span></span>
                    <span className="ndh-bill-val">{money(b.amount, hidden)}</span>
                  </div>
                ))}
              </section>

              {projected !== null && (
                <button type="button" className="ndh-nancy" onClick={askNancy}>
                  <span className="ndh-nancy-title"><span><ProtoIcon name="spark" size={20} /></span>Nancy IA</span>
                  <span className="ndh-nancy-text">
                    No ritmo atual, você termina {monthName} com <b className={projected < 0 ? 'neg' : ''}>{hidden ? HIDDEN : `R$ ${brl(projected).replace(',00', '')}`}</b>{' '}
                    {projected >= 0 ? 'guardados. Quer que eu ajuste sua meta?' : 'no vermelho. Quer ajuda para fechar no azul?'}
                  </span>
                  <span className="ndh-nancy-cta">Conversar →</span>
                </button>
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  )
}
