import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { transactionsAPI, agentAPI, goalsAPI } from '../services/api.js'
import { useUser } from '../hooks/useUser.js'
import { getCache, setCache, invalidateCache } from '../services/cache.js'
import Navbar from '../components/layout/Navbar.jsx'
import GradCard from '../components/ui/GradCard.jsx'
import TransactionForm from '../components/features/TransactionForm.jsx'
import AutoLaunchPrompt from '../components/features/AutoLaunchPrompt.jsx'
import { CategoryIcon } from '../components/ui/icons.jsx'
import { CATEGORY_LABELS, MONTHS } from '../constants/index.js'
import { fmt, fmtShort } from '../utils/format.js'

export default function Dashboard() {
  const navigate = useNavigate()
  const user = useUser()

  const [summary,      setSummary]      = useState(null)
  const [transactions, setTransactions] = useState([])
  const [limits,       setLimits]       = useState([])
  const [budgets,      setBudgets]      = useState([])
  const [loading,      setLoading]      = useState(true)
  const [showForm,     setShowForm]     = useState(false)
  const [toast,        setToast]        = useState(null)
  const [txFilter,     setTxFilter]     = useState('all')
  const [feedExpanded, setFeedExpanded] = useState(false)
  const FEED_PREVIEW = 3
  const [prediction,   setPrediction]   = useState(null)
  const [predLoading,  setPredLoading]  = useState(false)
  const [goals,        setGoals]        = useState([])

  const isPro = user.plan === 'pro' || user.plan === 'elite'

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

  useEffect(() => {
    const handler = () => fetchData(true)
    window.addEventListener('budget-updated', handler)
    return () => window.removeEventListener('budget-updated', handler)
  }, [fetchData])

  // Predição IA — cache em sessionStorage (apaga ao fechar a aba, não persiste dados financeiros)
  useEffect(() => {
    if (!summary || !transactions.length) return
    if (!isPro) return
    const d = new Date()
    const key = `ai-predict-${d.getMonth() + 1}-${d.getFullYear()}`
    try {
      const cached = JSON.parse(sessionStorage.getItem(key) || 'null')
      if (cached?.ts && Date.now() - cached.ts < 6 * 3600 * 1000) {
        setPrediction(cached.text)
        return
      }
    } catch {}
    let cancelled = false
    setPredLoading(true)
    agentAPI.predict()
      .then(({ data }) => {
        if (cancelled) return
        const text = data.prediction || ''
        setPrediction(text)
        sessionStorage.setItem(key, JSON.stringify({ text, ts: Date.now() }))
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setPredLoading(false) })
    return () => { cancelled = true }
  }, [summary, transactions.length, isPro])

  useEffect(() => {
    let cancelled = false
    goalsAPI.list()
      .then(({ data }) => { if (!cancelled) setGoals(Array.isArray(data) ? data.slice(0, 3) : []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const handleRefreshPrediction = () => {
    const d = new Date()
    const key = `ai-predict-${d.getMonth() + 1}-${d.getFullYear()}`
    sessionStorage.removeItem(key)
    setPrediction(null)
    setPredLoading(true)
    agentAPI.predict()
      .then(({ data }) => {
        const text = data.prediction || ''
        setPrediction(text)
        sessionStorage.setItem(key, JSON.stringify({ text, ts: Date.now() }))
      })
      .catch(() => {})
      .finally(() => setPredLoading(false))
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Remover esta transação?')) return
    try {
      await transactionsAPI.remove(id)
      fetchData(true)
    } catch {
      showToast('Erro ao remover transação.', false)
    }
  }

  const pct        = summary?.percentUsed || 0
  const now        = new Date()

  const healthLabel =
    pct === 0  ? 'Sem gastos' :
    pct < 50   ? 'Saudável'   :
    pct < 70   ? 'Normal'     :
    pct < 90   ? 'Atenção'    :
    pct < 100  ? 'Crítico'    : 'No limite'

  const healthColor =
    pct < 50  ? 'var(--c)' :
    pct < 70  ? '#ffc107' :
    pct < 90  ? '#ff8c42' : '#ff4757'

  const score = useMemo(() => {
    if (!summary || summary.totalAvailable <= 0) return null
    const budgetPts  = Math.round(Math.max(0, 60 * (1 - Math.min(pct, 100) / 100)))
    const balanceRatio = Math.max(0, Math.min(1, summary.currentBalance / summary.totalAvailable))
    const balancePts = Math.round(40 * balanceRatio)
    return budgetPts + balancePts
  }, [summary, pct])

  const scoreLabel = score === null ? '—' :
    score >= 80 ? 'Excelente' :
    score >= 60 ? 'Bom' :
    score >= 40 ? 'Regular' :
    score >= 20 ? 'Atenção' : 'Crítico'

  const scoreColor = score === null ? 'var(--t2)' :
    score >= 80 ? 'var(--c)' :
    score >= 60 ? '#00d084' :
    score >= 40 ? '#ffc107' :
    score >= 20 ? '#ff8c42' : '#ff4757'

  const filteredTx = useMemo(() =>
    txFilter === 'all' ? transactions : transactions.filter(t => t.type === txFilter)
  , [transactions, txFilter])

  const totalExpenses = summary?.totalExpenses || 0

  const topCategories = useMemo(() => {
    const map = {}
    transactions.filter(t => t.type === 'expense').forEach(t => {
      map[t.category] = (map[t.category] || 0) + Number(t.amount)
    })
    return Object.entries(map)
      .map(([cat, val]) => ({ cat, val, label: CATEGORY_LABELS[cat] || cat }))
      .sort((a, b) => b.val - a.val)
      .slice(0, 5)
  }, [transactions])

  const groupedTx = useMemo(() => {
    const todayMs  = new Date().setHours(0,0,0,0)
    const yestMs   = todayMs - 86400000
    const groups   = new Map()
    filteredTx.forEach(t => {
      const dMs = new Date(t.date).setHours(0,0,0,0)
      const key = dMs === todayMs ? 'Hoje' : dMs === yestMs ? 'Ontem'
        : new Date(t.date).toLocaleDateString('pt-BR', { day:'2-digit', month:'short' })
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(t)
    })
    return [...groups.entries()]
  }, [filteredTx])

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh' }}>
      <div style={{ textAlign:'center' }}>
        <div className="dsb-loader"><div className="dsb-loader-ring" /></div>
        <p style={{ color:'var(--t2)', fontSize:13, marginTop:16 }}>Carregando suas finanças…</p>
      </div>
    </div>
  )

  const HB_COLORS  = ['var(--c)','#00b4d8','#7b2fff','#ff6b9d','#ffc107','#ff8c42','#4f8ef7','#00d084']
  const RING_R     = 58
  const RING_CIRC  = 2 * Math.PI * RING_R
  const ringOffset = RING_CIRC * (1 - Math.min(pct, 100) / 100)

  return (
    <>
      <Navbar />

      {toast && (
        <div className={`toast ${toast.ok ? 'tok' : 'terr'}`} style={{ position:'fixed', top:16, left:'50%', transform:'translateX(-50%)', zIndex:400, whiteSpace:'nowrap' }}>
          {toast.msg}
        </div>
      )}

      <div className="pwnav fade-in">
        <AutoLaunchPrompt autoLaunched={summary?.autoLaunched} onLaunched={() => fetchData()} />

        <div className="hb-page">

          {/* ── Linha de métricas (Stripe) ── */}
          <div className="hb-metrics">
            <div className="grad-particles" aria-hidden="true">
              {[5,14,24,35,46,57,67,78,87,95].map((left, i) => (
                <span key={i} className="grad-particle" style={{
                  left:`${left}%`,
                  width: `${2 + (i % 3)}px`,
                  height: `${2 + (i % 3)}px`,
                  animationDelay: `${(i * 0.5) % 3}s`,
                  animationDuration: `${2 + (i % 4) * 0.65}s`,
                  opacity: 0.25 + (i % 3) * 0.15,
                }} />
              ))}
            </div>
            <div className="hb-metric">
              <div className="hb-metric-lbl">Saldo disponível</div>
              <div className="hb-metric-val" style={{ color: summary?.currentBalance < 0 ? '#ff6b6b' : 'var(--t1)' }}>
                R$ {fmt(summary?.currentBalance)}
              </div>
              <span className="hb-metric-badge" style={{ background:`${healthColor}18`, color: healthColor, border:`1px solid ${healthColor}28` }}>{healthLabel}</span>
            </div>

            <div className="hb-metric-sep" />

            <div className="hb-metric">
              <div className="hb-metric-lbl">Salário + Entradas</div>
              <div className="hb-metric-val" style={{ color:'var(--c)' }}>R$ {fmt(summary?.totalAvailable)}</div>
              {summary?.totalIncome > 0
                ? <span className="hb-metric-hint">+R$ {fmtShort(summary?.totalIncome)} extras este mês</span>
                : <span className="hb-metric-hint">Salário: R$ {fmt(summary?.salary)}</span>}
            </div>

            <div className="hb-metric-sep" />

            <div className="hb-metric">
              <div className="hb-metric-lbl">Total gasto</div>
              <div className="hb-metric-val" style={{ color:'#ff6b6b' }}>R$ {fmt(summary?.totalExpenses)}</div>
              <span className="hb-metric-hint">{pct}% do orçamento · {MONTHS[now.getMonth()]}</span>
            </div>

            <div className="hb-metric-sep" />

            <div className="hb-metric">
              <div className="hb-metric-lbl">Score financeiro</div>
              <div className="hb-metric-val" style={{ color: scoreColor }}>
                {score !== null ? score : '—'}
                {score !== null && <span style={{ fontSize: 13, fontWeight: 400, color: 'rgba(255,255,255,.3)', marginLeft: 4 }}>/100</span>}
              </div>
              <span className="hb-metric-badge" style={{ background:`${scoreColor}18`, color: scoreColor, border:`1px solid ${scoreColor}28` }}>
                {scoreLabel}
              </span>
            </div>

            <button className="hb-new-btn" onClick={() => setShowForm(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Nova Transação
            </button>
          </div>

          {/* ── Grid principal (Linear) ── */}
          <div className="hb-grid">

            {/* ── Coluna esquerda ── */}
            <div className="hb-left">

              {/* Ring hero (Monzo) */}
              <div className="hb-ring-card">
                <div className="hb-ring-glow-bg" />
                <div className="hb-ring-particles" aria-hidden="true">
                  {[
                    { left:  5, size: 3, delay: 0,   dur: 2.8 },
                    { left: 15, size: 4, delay: 1.1, dur: 3.2 },
                    { left: 28, size: 3, delay: 0.5, dur: 2.5 },
                    { left: 45, size: 5, delay: 1.7, dur: 3.5 },
                    { left: 60, size: 3, delay: 0.3, dur: 2.9 },
                    { left: 74, size: 4, delay: 1.3, dur: 3.1 },
                    { left: 85, size: 3, delay: 0.8, dur: 2.6 },
                    { left: 93, size: 4, delay: 1.9, dur: 3.3 },
                  ].map((p, i) => (
                    <span key={i} className="hb-ring-particle" style={{
                      left: `${p.left}%`, width: p.size, height: p.size,
                      animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`,
                    }} />
                  ))}
                </div>
                <div className="hb-ring-wrap">
                  <svg width="148" height="148" viewBox="0 0 148 148">
                    <circle cx="74" cy="74" r={RING_R} fill="none" className="hb-ring-track" strokeWidth="9" />
                    <circle
                      cx="74" cy="74" r={RING_R} fill="none"
                      stroke={healthColor} strokeWidth="9"
                      strokeLinecap="round"
                      strokeDasharray={RING_CIRC}
                      strokeDashoffset={ringOffset}
                      transform="rotate(-90 74 74)"
                      style={{ transition:'stroke-dashoffset .8s cubic-bezier(.4,0,.2,1), stroke .4s' }}
                    />
                  </svg>
                  <div className="hb-ring-inner">
                    <div className="hb-ring-pct" style={{ color: healthColor }}>{pct}%</div>
                    <div className="hb-ring-sub">usado</div>
                  </div>
                </div>
                <div className="hb-ring-info">
                  <div className="hb-ring-period">{MONTHS[now.getMonth()]} {now.getFullYear()}</div>
                  <div className="hb-ring-title">Orçamento mensal</div>
                  <div className="hb-ring-bar">
                    <div className="hb-ring-bar-fill" style={{ width:`${Math.min(pct,100)}%`, background: healthColor }} />
                  </div>
                  <div className="hb-ring-bar-labels">
                    <span>R$ {fmt(summary?.totalExpenses)} gasto</span>
                    <span>de R$ {fmt(summary?.totalAvailable)}</span>
                  </div>
                </div>
              </div>

              {/* Contas fixas pendentes */}
              {!summary?.autoLaunched && budgets.length > 0 && (
                <div className="hb-bars-card">
                  <div className="hb-card-head">
                    <span className="hb-card-title">Contas fixas do mês</span>
                    <button className="hb-card-link" onClick={() => navigate('/settings')}>Gerenciar →</button>
                  </div>
                  {budgets.map((b) => (
                    <div key={b.id} className="hb-bar-row">
                      <div className="hb-bar-dot" style={{ background: '#ff8c42' }} />
                      <div className="hb-bar-name">{b.name}</div>
                      <div className="hb-bar-track">
                        <div className="hb-bar-fill" style={{ width: summary?.totalFixedCosts > 0 ? `${(b.amount / summary.totalFixedCosts) * 100}%` : '0%', background: '#ff8c42' }} />
                      </div>
                      <div className="hb-bar-right">
                        <span className="hb-bar-val">R$ {fmtShort(b.amount)}</span>
                        <span className="hb-bar-pct" style={{ color:'#ff8c42' }}>pendente</span>
                      </div>
                    </div>
                  ))}
                  <div className="hb-fixed-total-row">
                    <span>Total a lançar</span>
                    <span>R$ {fmt(summary?.totalFixedCosts)}</span>
                  </div>
                </div>
              )}

              {/* Barras de categoria (Stripe) */}
              <div className="hb-bars-card">
                <div className="hb-card-head">
                  <span className="hb-card-title">Gastos por categoria</span>
                  <button className="hb-card-link" onClick={() => navigate('/transactions')}>Ver detalhes →</button>
                </div>
                {topCategories.length === 0 ? (
                  <div className="hb-empty">Sem gastos registrados este mês</div>
                ) : topCategories.map((c, i) => {
                  const barPct  = totalExpenses > 0 ? (c.val / totalExpenses) * 100 : 0
                  const lim     = limits.find(l => l.category === c.cat)
                  const over    = lim && c.val > lim.amount
                  const limPct  = lim ? Math.min(100, Math.round((c.val / lim.amount) * 100)) : null
                  return (
                    <div key={c.cat} className="hb-bar-row">
                      <div className="hb-bar-dot" style={{ background: over ? '#ff4757' : HB_COLORS[i % HB_COLORS.length] }} />
                      <div className="hb-bar-name">{c.label}</div>
                      <div className="hb-bar-track">
                        <div className="hb-bar-fill" style={{ width:`${barPct}%`, background: over ? '#ff4757' : HB_COLORS[i % HB_COLORS.length] }} />
                      </div>
                      <div className="hb-bar-right">
                        <span className="hb-bar-val">R$ {fmtShort(c.val)}</span>
                        {lim
                          ? <span className="hb-bar-pct" style={{ color: over ? '#ff4757' : '#ffc107' }}>
                              {over ? '⚠ limite' : `${limPct}% do limite`}
                            </span>
                          : <span className="hb-bar-pct">{Math.round(barPct)}%</span>
                        }
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Previsão IA */}
              <GradCard
                iconBg="rgba(123,47,255,.1)" iconBorder="rgba(123,47,255,.25)"
                icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7b2fff" strokeWidth="2" strokeLinecap="round"><path d="M12 2a10 10 0 110 20A10 10 0 0112 2z"/><path d="M12 6v6l4 2"/></svg>}
                title="Previsão IA"
                sub={`Análise do mês de ${MONTHS[now.getMonth()]}`}
                right={
                  !predLoading && (
                    <button className="dsb-pred-refresh" onClick={handleRefreshPrediction} title="Atualizar previsão">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
                      </svg>
                    </button>
                  )
                }
              >
                {!isPro ? (
                  <div className="anl-empty" style={{ flexDirection: 'column', gap: 10 }}>
                    <span style={{ fontSize: 12 }}>Disponível no plano <strong style={{ color: 'var(--c)' }}>Pro</strong></span>
                    <button onClick={() => navigate('/planos')} style={{ background: 'color-mix(in srgb, var(--c) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--c) 25%, transparent)', borderRadius: 6, padding: '5px 12px', color: 'var(--c)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                      Ver planos →
                    </button>
                  </div>
                ) : predLoading ? (
                  <div className="anl-loading">
                    <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                  </div>
                ) : prediction ? (
                  <p className="anl-desc" style={{ margin: 0 }}>{prediction}</p>
                ) : (
                  <div className="anl-empty">
                    <span>Registre transações para gerar uma previsão</span>
                  </div>
                )}
              </GradCard>

              {/* Metas — resumo */}
              {goals.length > 0 && (
                <div className="hb-bars-card">
                  <div className="hb-card-head">
                    <span className="hb-card-title">Metas financeiras</span>
                    <button className="hb-card-link" onClick={() => navigate('/goals')}>Ver todas →</button>
                  </div>
                  {goals.map(g => {
                    const pct = g.targetAmount > 0 ? Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100)) : 0
                    return (
                      <div key={g.id} className="hb-bar-row">
                        <div className="hb-bar-dot" style={{ background: g.color }} />
                        <div className="hb-bar-name">{g.title}</div>
                        <div className="hb-bar-track">
                          <div className="hb-bar-fill" style={{ width: `${pct}%`, background: g.color }} />
                        </div>
                        <div className="hb-bar-right">
                          <span className="hb-bar-val">R$ {(g.currentAmount ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</span>
                          <span className="hb-bar-pct">{pct}%</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Upgrade */}
              {!isPro && (
                <div className="hb-upgrade" onClick={() => navigate('/planos')} role="button" tabIndex={0}>
                  {/* partículas */}
                  <div className="hb-upg-particles" aria-hidden="true">
                    {[
                      { left:  6, size: 4, delay: 0,   dur: 2.8 },
                      { left: 18, size: 3, delay: 0.7, dur: 2.4 },
                      { left: 32, size: 5, delay: 1.2, dur: 3.1 },
                      { left: 50, size: 3, delay: 0.4, dur: 2.6 },
                      { left: 65, size: 4, delay: 1.6, dur: 2.9 },
                      { left: 78, size: 5, delay: 0.9, dur: 3.3 },
                      { left: 90, size: 3, delay: 0.2, dur: 2.5 },
                    ].map((p, i) => (
                      <span key={i} className="hb-upg-particle" style={{
                        left: `${p.left}%`, width: p.size, height: p.size,
                        animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`,
                      }} />
                    ))}
                  </div>
                  <div className="hb-upg-glow" />
                  <div className="hb-upg-glow hb-upg-glow2" />
                  <div className="hb-upg-ico">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                    </svg>
                  </div>
                  <div className="hb-upg-body">
                    <div className="hb-upg-title">Upgrade para Pro</div>
                    <div className="hb-upg-sub">Ilimitado · PDF · CSV · Limites por categoria</div>
                  </div>
                  <div className="hb-upg-arrow">›</div>
                </div>
              )}
            </div>

            {/* ── Coluna direita — feed por data (Linear + Monzo) ── */}
            <div className="hb-right">
              <div className="hb-feed-card">
                <div className="hb-card-head">
                  <span className="hb-card-title">Atividade</span>
                  <div className="hb-feed-tabs">
                    {[['all','Todos'],['expense','Gastos'],['income','Entradas']].map(([val, label]) => (
                      <button key={val} className={`hb-feed-tab${txFilter === val ? ' active' : ''}`} onClick={() => { setTxFilter(val); setFeedExpanded(false) }}>{label}</button>
                    ))}
                  </div>
                  <button className="hb-card-link" onClick={() => navigate('/transactions')}>Ver tudo →</button>
                </div>

                {groupedTx.length === 0 ? (
                  <div className="hb-empty">Nenhuma transação encontrada</div>
                ) : (
                  <>
                    <div className={feedExpanded ? 'hb-feed' : 'hb-feed hb-feed-collapsed'}>
                      {groupedTx.map(([dateLabel, txs]) => (
                        <div key={dateLabel}>
                          <div className="hb-feed-date">{dateLabel}</div>
                          {txs.map((t, i) => {
                            const isInc  = t.type === 'income'
                            const desc   = t.description || CATEGORY_LABELS[t.category] || t.category
                            const isLast = i === txs.length - 1
                            return (
                              <div key={t.id} className="hb-feed-item">
                                <div className="hb-feed-timeline">
                                  <div className={`hb-feed-dot ${isInc ? 'inc' : 'exp'}`} style={{
                                    boxShadow: isInc ? '0 0 0 3px color-mix(in srgb, var(--c) 15%, transparent)' : 'none'
                                  }}>
                                    <CategoryIcon category={t.category} size={13} color="currentColor" />
                                  </div>
                                  {!isLast && <div className="hb-feed-line" />}
                                </div>
                                <div className="hb-feed-body">
                                  <div className="hb-feed-row">
                                    <span className="hb-feed-name">{desc}</span>
                                    <span className={`hb-feed-amt ${isInc ? 'inc' : 'exp'}`}>{isInc ? '+' : '−'}R$ {fmt(t.amount)}</span>
                                  </div>
                                  <div className="hb-feed-meta">
                                    <span className="hb-feed-cat">{CATEGORY_LABELS[t.category]}</span>
                                  </div>
                                  <button className="hb-feed-del" onClick={() => handleDelete(t.id)} title="Remover">
                                    <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
                                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                    {groupedTx.length > FEED_PREVIEW && (
                      <button className="hb-feed-toggle" onClick={() => setFeedExpanded(v => !v)}>
                        {feedExpanded ? '↑ Ver menos' : `↓ Ver mais (${groupedTx.length - FEED_PREVIEW} datas)`}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>

      <button className="fab" onClick={() => setShowForm(true)} aria-label="Nova transação">
        <svg viewBox="0 0 20 20" fill="currentColor" width="22" height="22">
          <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/>
        </svg>
      </button>

      {showForm && (
        <TransactionForm
          onClose={() => setShowForm(false)}
          onSuccess={() => { setShowForm(false); fetchData(true) }}
        />
      )}
    </>
  )

}
