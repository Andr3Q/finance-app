import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { transactionsAPI, goalsAPI } from '../services/api.js'
import { useUser } from '../hooks/useUser.js'
import { useForcedLightTheme } from '../hooks/useTheme.js'
import { getCache, setCache, invalidateCache } from '../services/cache.js'
import Navbar from '../components/layout/Navbar.jsx'
import GradCard from '../components/ui/GradCard.jsx'
import TransactionForm from '../components/features/TransactionForm.jsx'
import AutoLaunchPrompt from '../components/features/AutoLaunchPrompt.jsx'
import { CategoryIcon } from '../components/ui/icons.jsx'
import { CATEGORY_LABELS, MONTHS } from '../constants/index.js'
import { fmt } from '../utils/format.js'
import { monthGrowthPct, projectedBalance } from '../utils/homeMetrics.js'
import { readSeen, resumoKey, dicasKey, metasKey } from '../utils/storiesSeen.js'
import { playSoftChime, getTrialNotif, getSalaryNotif } from '../utils/notifications.js'
import { buildNotifications, countUnread, readNotifIds } from '../utils/notificationsFeed.js'
import { readCancelFlags, cancelReminders } from '../utils/subsCancel.js'
import { readReminders } from '../utils/reminders.js'

const IconEye = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
)
const IconEyeOff = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
)
const IconPlus = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
)
const IconSwap = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/>
    <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/>
  </svg>
)
const IconTarget = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
    <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>
  </svg>
)
const IconSparkle = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z"/>
  </svg>
)

export default function Dashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  // Stories já abertas neste aparelho (anel apagado no círculo). Lido na montagem:
  // abrir uma story navega pra outra rota, então o Início remonta ao voltar.
  const [seen] = useState(readSeen)
  const seenCls = (key) => (seen[key] ? ' is-seen' : '')
  const user = useUser()
  useForcedLightTheme() // Início é desenhado só no claro (design Nancy 2)

  const [summary,      setSummary]      = useState(null)
  const [transactions, setTransactions] = useState([])
  const [limits,       setLimits]       = useState([])
  const [budgets,      setBudgets]      = useState([])
  const [loading,      setLoading]      = useState(true)
  const [showForm,     setShowForm]     = useState(false)
  const [quickAddType, setQuickAddType] = useState(null) // 'income' | 'expense' | null
  const [toast,        setToast]        = useState(null)
  // Preferência de privacidade (ocultar valores) persiste entre sessões —
  // sem isso o usuário teria que escondê-los de novo toda vez que abrisse o app.
  const [hideBalance,  setHideBalance]  = useState(() => {
    try { return localStorage.getItem('hide-balance') === '1' } catch { return false }
  })
  const [goals,        setGoals]        = useState([])

  // O sino leva à tela Notificações; o pontinho aparece enquanto houver aviso que o usuário
  // ainda não viu neste aparelho (lido na montagem: abrir a tela navega pra outra rota,
  // então o Início remonta ao voltar).
  const [trialBellDismissed, setTrialBellDismissed] = useState(false)
  const [seenNotifs] = useState(readNotifIds)

  const salaryNotif = getSalaryNotif()
  const trialNotif  = user.id ? getTrialNotif(user) : null

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  const fetchData = useCallback(async (invalidate = false) => {
    if (invalidate) invalidateCache('dashboard')
    const cached = getCache('dashboard')
    if (cached) {
      setSummary(cached.summary || null)
      setTransactions(Array.isArray(cached.transactions) ? cached.transactions : [])
      setLimits(cached.limits || [])
      setBudgets(cached.budgets || [])
      setLoading(false)
    }
    try {
      const { data } = await transactionsAPI.dashboard()
      if (!data || typeof data !== 'object') throw new Error('invalid response')
      setSummary(data.summary || null)
      setTransactions(Array.isArray(data.transactions) ? data.transactions : [])
      setLimits(data.limits || [])
      setBudgets(data.budgets || [])
      setCache('dashboard', data)
    } catch {
      if (!cached) showToast('Erro ao carregar dados.', false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Abre o formulário já no tipo certo quando vem do menu rápido do "+" na
  // barra de navegação (navigate('/dashboard', { state: { openTxForm } })).
  // Limpa o state da navegação depois de consumir, pra não reabrir sozinho
  // se o usuário voltar pra essa tela depois (ex: botão voltar do navegador).
  useEffect(() => {
    const type = location.state?.openTxForm
    if (type === 'income' || type === 'expense') {
      setQuickAddType(type)
      setShowForm(true)
      navigate(location.pathname, { replace: true, state: {} })
    } else if (location.state?.openChat) {
      // Vem do "Revisar com a Nancy" das stories (que ficam por cima do chat).
      // O setTimeout adia o evento pra depois do commit: o AgentChat é irmão
      // desta página e só registra o listener no efeito dele, que roda depois
      // do nosso na montagem.
      setTimeout(() => window.dispatchEvent(new Event('nancy:open-agent-chat')), 0)
      navigate(location.pathname, { replace: true, state: {} })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  useEffect(() => {
    const handler = () => fetchData(true)
    window.addEventListener('budget-updated', handler)
    return () => window.removeEventListener('budget-updated', handler)
  }, [fetchData])

  useEffect(() => {
    let cancelled = false
    goalsAPI.list()
      .then(({ data }) => { if (!cancelled) setGoals(Array.isArray(data) ? data.slice(0, 3) : []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const dismiss = () => setTrialBellDismissed(true)
    window.addEventListener('trial-bell-dismiss', dismiss)
    // Descarta imediatamente se o modal já foi exibido nesta sessão
    if (sessionStorage.getItem('trial_just_expired')) dismiss()
    return () => window.removeEventListener('trial-bell-dismiss', dismiss)
  }, [])

  useEffect(() => {
    if (!trialNotif || trialBellDismissed) return
    if (sessionStorage.getItem('trial-bell-sound-played')) return
    sessionStorage.setItem('trial-bell-sound-played', '1')
    playSoftChime()
  }, [!!trialNotif])

  const pct = summary?.percentUsed || 0
  const now = new Date()
  const hasNotif = countUnread(
    buildNotifications({ now, summary, transactions, limits, budgets, salaryNotif, trialNotif: trialBellDismissed ? null : trialNotif, cancelReminders: cancelReminders(readCancelFlags()), reminderState: readReminders() }),
    seenNotifs,
  ) > 0

  // Score financeiro (0-100) — igual já existia, só ganhou um rótulo/visual
  // novo ("Saúde financeira") nesta tela.
  const score = useMemo(() => {
    if (!summary || summary.totalAvailable <= 0) return null
    const budgetPts  = Math.round(Math.max(0, 60 * (1 - Math.min(pct, 100) / 100)))
    const balanceRatio = Math.max(0, Math.min(1, summary.currentBalance / summary.totalAvailable))
    const balancePts = Math.round(40 * balanceRatio)
    return budgetPts + balancePts
  }, [summary, pct])

  const healthLabel = score === null ? '—' :
    score >= 80 ? 'Finanças excelentes' :
    score >= 60 ? 'Finanças saudáveis' :
    score >= 40 ? 'Fique de olho' :
    score >= 20 ? 'Precisa de atenção' : 'Momento crítico'

  // anel + texto do rótulo por faixa (design: verde #19C884 / #117953 no "saudável")
  const scoreRing = score === null ? '#99A5BE' :
    score >= 60 ? '#19C884' : score >= 40 ? '#F5A524' : score >= 20 ? '#FF8C42' : '#FF4757'
  const scoreInk = score === null ? '#5B6784' :
    score >= 60 ? '#117953' : score >= 40 ? '#B26A00' : score >= 20 ? '#B54708' : '#B42318'

  const toggleHideBalance = () => {
    setHideBalance(v => {
      const next = !v
      try { localStorage.setItem('hide-balance', next ? '1' : '0') } catch {}
      return next
    })
  }

  const greeting = now.getHours() < 12 ? 'Bom dia' : now.getHours() < 18 ? 'Boa tarde' : 'Boa noite'
  const firstName = user.name?.split(' ')[0] || ''
  const initials  = user.name ? user.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase() : '?'
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)

  // Progresso médio das metas ativas — alimenta o círculo "Metas" dos
  // Resumos; os círculos em si ainda não abrem a visualização em stories
  // (tela própria, "Resumo em stories", ainda não implementada).
  const goalsAvgPct = goals.length
    ? Math.round(goals.reduce((s, g) => s + (g.targetAmount > 0 ? Math.min(1, g.currentAmount / g.targetAmount) : 0), 0) / goals.length * 100)
    : null

  const recentTx = useMemo(() => transactions.slice(0, 5), [transactions])

  const fmtInt = (n) => Math.round(Number(n) || 0).toLocaleString('pt-BR')
  const HIDDEN = 'R$ ••••'
  const monthName = MONTHS[now.getMonth()].toLowerCase()

  const monthGrowth = useMemo(() => monthGrowthPct(summary), [summary])
  const dayOfMonth  = now.getDate()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const projected   = useMemo(() => projectedBalance(summary, dayOfMonth, daysInMonth), [summary, dayOfMonth, daysInMonth])

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh' }}>
      <div style={{ textAlign:'center' }}>
        <div className="dsb-loader"><div className="dsb-loader-ring" /></div>
        <p style={{ color:'var(--t2)', fontSize:13, marginTop:16 }}>Carregando suas finanças…</p>
      </div>
    </div>
  )

  const RING_R          = 25
  const RING_CIRC       = 2 * Math.PI * RING_R
  const scoreRingOffset = RING_CIRC * (1 - (score ?? 0) / 100)

  return (
    <>
      <Navbar />

      {toast && (
        <div className={`toast ${toast.ok ? 'tok' : 'terr'}`} style={{ position:'fixed', top:16, left:'50%', transform:'translateX(-50%)', zIndex:9001, whiteSpace:'nowrap' }}>
          {toast.msg}
        </div>
      )}

      <div className="pwnav fade-in">
        <AutoLaunchPrompt autoLaunched={summary?.autoLaunched} onLaunched={() => fetchData()} />

        <div className="home-page">
          <div className="home-hero">
            <div className="home-hero-top">
              <div className="home-user">
                <div className="home-avatar">{initials}</div>
                <div className="home-greet">
                  <span className="home-hi">{greeting}</span>
                  <span className="home-name">{firstName || 'bem-vindo'}</span>
                </div>
              </div>
              <div className="home-hero-actions">
                <button className="home-iconbtn" onClick={toggleHideBalance} aria-label={hideBalance ? 'Mostrar valores' : 'Ocultar valores'}>
                  {hideBalance ? <IconEyeOff /> : <IconEye />}
                </button>
                <button className="home-iconbtn" onClick={() => navigate('/notificacoes')} aria-label="Notificações">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                    <path d="M13.73 21a2 2 0 01-3.46 0"/>
                  </svg>
                  {hasNotif && <span className="dsb-bell-dot" />}
                </button>
              </div>
            </div>

            <div className="home-balance-lbl">Saldo disponível</div>
            <div className="home-balance-val">
              {hideBalance ? 'R$ ••••••' : `R$ ${fmt(summary?.currentBalance)}`}
            </div>
            {monthGrowth !== null && (
              <span className={`home-badge${monthGrowth < 0 ? ' neg' : ''}`}>
                {monthGrowth > 0 ? '+' : monthGrowth < 0 ? '−' : ''}{Math.min(999, Math.abs(monthGrowth)).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% no mês
              </span>
            )}

            <div className="home-quick-actions">
              <button className="home-qa-btn" onClick={() => setShowForm(true)}>
                <span className="home-qa-ico"><IconPlus /></span><span className="home-qa-lbl">Adicionar</span>
              </button>
              <button className="home-qa-btn" onClick={() => navigate('/transactions')}>
                <span className="home-qa-ico"><IconSwap /></span><span className="home-qa-lbl">Extrato</span>
              </button>
              <button className="home-qa-btn" onClick={() => navigate('/goals')}>
                <span className="home-qa-ico"><IconTarget /></span><span className="home-qa-lbl">Metas</span>
              </button>
              <button className="home-qa-btn home-qa-btn-active" onClick={() => window.dispatchEvent(new Event('nancy:open-agent-chat'))}>
                <span className="home-qa-ico"><IconSparkle /></span><span className="home-qa-lbl">Nancy IA</span>
              </button>
            </div>
          </div>

          <div className="home-body">

            {/* Resumos em stories — os 4 círculos abrem a tela 09 (mesma rota,
                fluxo escolhido por state.story): mês atual e mês anterior
                (resumo do mês), Dicas IA e Metas. Anel menta = story nova;
                depois de aberta o anel apaga (print do design: "Outubro"). */}
            <h2 className="home-section-title">Resumos</h2>
            <div className="home-stories-row">
              <button className={`home-story home-story-blue${seenCls(resumoKey(0))}`} onClick={() => navigate('/resumo-stories', { state: { monthOffset: 0 } })}>
                <span>{MONTHS[now.getMonth()].slice(0, 3).toUpperCase()}</span>
                <small>{MONTHS[now.getMonth()]}</small>
              </button>
              <button className={`home-story home-story-light${seenCls(dicasKey())}`} onClick={() => navigate('/resumo-stories', { state: { story: 'dicas' } })}>
                <span><IconSparkle /></span>
                <small>Dicas IA</small>
              </button>
              <button className={`home-story home-story-ring${seenCls(metasKey())}`} onClick={() => navigate('/resumo-stories', { state: { story: 'metas' } })}>
                <span>{goalsAvgPct !== null ? `${goalsAvgPct}%` : '—'}</span>
                <small>Metas</small>
              </button>
              <button className={`home-story home-story-navy${seenCls(resumoKey(-1))}`} onClick={() => navigate('/resumo-stories', { state: { monthOffset: -1 } })}>
                <span>{MONTHS[prevMonthDate.getMonth()].slice(0, 3).toUpperCase()}</span>
                <small>{MONTHS[prevMonthDate.getMonth()]}</small>
              </button>
            </div>

            <div className="home-health-card">
              <div className="home-health-ring-wrap">
                <svg width="56" height="56" viewBox="0 0 56 56">
                  <circle cx="28" cy="28" r={RING_R} fill="none" stroke="#E8FBF2" strokeWidth="6" />
                  <circle
                    cx="28" cy="28" r={RING_R} fill="none"
                    stroke={scoreRing} strokeWidth="6" strokeLinecap="round"
                    strokeDasharray={RING_CIRC} strokeDashoffset={scoreRingOffset}
                    transform="rotate(-90 28 28)"
                    style={{ transition:'stroke-dashoffset .8s cubic-bezier(.4,0,.2,1), stroke .4s' }}
                  />
                </svg>
                <span className="home-health-score">{score ?? '—'}</span>
              </div>
              <div>
                <div className="home-health-title">Saúde financeira</div>
                <div className="home-health-sub" style={{ color: scoreInk }}>{healthLabel}</div>
              </div>
            </div>

            <div className="home-stats-row">
              <div className="home-stat">
                <span className="home-stat-dot" style={{ background:'#19C884' }} />
                <span className="home-stat-lbl">Entradas</span>
                <span className="home-stat-val">{hideBalance ? '••••' : fmtInt((summary?.salary || 0) + (summary?.totalIncome || 0))}</span>
              </div>
              <div className="home-stat">
                <span className="home-stat-dot" style={{ background:'#1C48FF' }} />
                <span className="home-stat-lbl">Saídas</span>
                <span className="home-stat-val">{hideBalance ? '••••' : fmtInt(summary?.totalExpenses)}</span>
              </div>
              <div className="home-stat">
                <span className="home-stat-dot" style={{ background:'#BCF4D9' }} />
                <span className="home-stat-lbl">Contas fixas</span>
                <span className="home-stat-val">{hideBalance ? '••••' : fmtInt(summary?.totalFixedCosts)}</span>
              </div>
            </div>

            {projected !== null && (
              <button className="home-insight" onClick={() => window.dispatchEvent(new Event('nancy:open-agent-chat'))}>
                <span className="home-insight-ico"><IconSparkle /></span>
                <span className="home-insight-body">
                  <span className="home-insight-text">
                    No ritmo atual, você termina {monthName} com{' '}
                    <strong className={projected < 0 ? 'neg' : ''}>{hideBalance ? HIDDEN : `R$ ${fmt(Math.abs(projected))}`}</strong>{' '}
                    {projected >= 0 ? 'sobrando.' : 'no vermelho.'}
                  </span>
                  <span className="home-insight-cta">Perguntar à Nancy →</span>
                </span>
              </button>
            )}

            <div className="home-recent">
              <div className="home-recent-head">
                <h2 className="home-recent-title">Últimas</h2>
                <button className="home-recent-link" onClick={() => navigate('/transactions')}>Ver extrato →</button>
              </div>
              {recentTx.length === 0 ? (
                <div className="hb-empty">Nenhuma transação encontrada</div>
              ) : recentTx.map(t => {
                const isInc = t.type === 'income'
                const d     = new Date(t.date)
                const desc  = t.description || CATEGORY_LABELS[t.category] || t.category
                return (
                  <div key={t.id} className="home-recent-row">
                    <div className="home-recent-ico">
                      <CategoryIcon category={t.category} size={16} color="currentColor" />
                    </div>
                    <div className="home-recent-body">
                      <span className="home-recent-name">{desc}</span>
                      <span className="home-recent-meta">
                        {CATEGORY_LABELS[t.category] || t.category} · {String(d.getDate()).padStart(2, '0')} {MONTHS[d.getMonth()].slice(0, 3).toLowerCase()}
                      </span>
                    </div>
                    <span className={`home-recent-amt ${isInc ? 'inc' : 'exp'}`}>
                      {hideBalance ? HIDDEN : `${isInc ? '+' : '−'}R$ ${fmt(t.amount)}`}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* "+" flutuante isolado removido — a mesma ação vive no botão central da
          barra de navegação (menu rápido), evitando dois "+" na mesma tela. */}

      {showForm && (
        <TransactionForm
          initialData={quickAddType ? { type: quickAddType } : undefined}
          onClose={() => { setShowForm(false); setQuickAddType(null) }}
          onSuccess={() => {
            setShowForm(false); setQuickAddType(null)
            // Dispara o mesmo evento usado em todo outro ponto que muda dado
            // (SalaryCard, CategoryLimitsCard, handlePay/handleUnpay) em vez de
            // chamar fetchData(true) direto — o listener abaixo já faz isso, e
            // sem o evento a página de Transações não sabia que precisava
            // invalidar seu próprio cache (só via TTL de 30s ou refresh manual).
            window.dispatchEvent(new CustomEvent('budget-updated'))
          }}
        />
      )}
    </>
  )

}
