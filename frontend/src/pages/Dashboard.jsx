import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { transactionsAPI, agentAPI, goalsAPI } from '../services/api.js'
import { useUser } from '../hooks/useUser.js'
import { useTheme } from '../hooks/useTheme.js'
import { getCache, setCache, invalidateCache } from '../services/cache.js'
import Navbar from '../components/layout/Navbar.jsx'
import GradCard from '../components/ui/GradCard.jsx'
import TransactionForm from '../components/features/TransactionForm.jsx'
import AutoLaunchPrompt from '../components/features/AutoLaunchPrompt.jsx'
import SearchOverlay   from '../components/features/SearchOverlay.jsx'
import { CategoryIcon } from '../components/ui/icons.jsx'
import { CATEGORY_LABELS, MONTHS } from '../constants/index.js'
import { fmt, fmtShort } from '../utils/format.js'
import { playSoftChime, getTrialNotif, getSalaryNotif } from '../utils/notifications.js'

export default function Dashboard() {
  const navigate = useNavigate()
  const user = useUser()
  const { theme, toggle: toggleTheme } = useTheme()

  const [summary,      setSummary]      = useState(null)
  const [transactions, setTransactions] = useState([])
  const [limits,       setLimits]       = useState([])
  const [budgets,      setBudgets]      = useState([])
  const [loading,      setLoading]      = useState(true)
  const [showForm,     setShowForm]     = useState(false)
  const [toast,        setToast]        = useState(null)
  const [txFilter,     setTxFilter]     = useState('all')
  const [activeMetric, setActiveMetric] = useState('saldo')
  const [showSearch,   setShowSearch]   = useState(false)
  const [feedExpanded, setFeedExpanded] = useState(false)
  const FEED_PREVIEW = 3
  const [prediction,   setPrediction]   = useState(null)
  const [predLoading,  setPredLoading]  = useState(false)
  const [goals,        setGoals]        = useState([])

  const [showBell,           setShowBell]           = useState(false)
  const [bellDismissed,      setBellDismissed]      = useState(false)
  const [trialBellDismissed, setTrialBellDismissed] = useState(false)
  const bellRef = useRef(null)

  const salaryNotif = getSalaryNotif()
  const trialNotif  = user.id ? getTrialNotif(user) : null
  const hasNotif    = (!!salaryNotif && !bellDismissed) || (!!trialNotif && !trialBellDismissed)

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

  useEffect(() => {
    if (!showBell) return
    const handler = (e) => { if (bellRef.current && !bellRef.current.contains(e.target)) setShowBell(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showBell])

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
    score >= 60 ? '#4ae2ac' :
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

  const HB_COLORS  = ['var(--c)','#00b4d8','#7b2fff','#ff6b9d','#ffc107','#ff8c42','#4f8ef7','#4ae2ac']
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

          {/* ══ MOBILE HEADER (baseado no Dashboard.html de referência) ══ */}
          <header className="hb-topbar hb-mobile-only">
            <div className="hb-brand">
              <div className="hb-logo-box">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 16l5-5 3 3 7-7"/><path d="M15 7h5v5"/>
                </svg>
              </div>
              <div className="hb-greet">
                <span className="hb-hi">Olá,</span>
                <span className="hb-name">{user.name || 'bem-vindo'}</span>
              </div>
            </div>
            <div className="hb-hdr-actions">
              <button className="hb-iconbtn" onClick={toggleTheme} aria-label="Alternar tema">
                {theme === 'dark' ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                  </svg>
                )}
              </button>

              {/* Sino de notificações — mobile */}
              <div className="dsb-bell-wrap" ref={bellRef} style={{ position:'relative' }}>
                <button className="hb-iconbtn" onClick={() => setShowBell(b => !b)} aria-label="Notificações">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                    <path d="M13.73 21a2 2 0 01-3.46 0"/>
                  </svg>
                  {hasNotif && <span className="dsb-bell-dot" />}
                </button>
                {showBell && (
                  <div className="dsb-bell-drop" style={{ right:0, left:'auto', top:'calc(100% + 8px)' }}>
                    <div className="dsb-bell-drop-title">Notificações</div>
                    {(salaryNotif && !bellDismissed) || (trialNotif && !trialBellDismissed) ? (
                      <>
                        {salaryNotif && !bellDismissed && (
                          <div className="dsb-bell-item">
                            <div className="dsb-bell-item-ico">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ae2ac" strokeWidth="2" strokeLinecap="round">
                                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                              </svg>
                            </div>
                            <div className="dsb-bell-item-body">
                              <div className="dsb-bell-item-title">Lembrete de salário</div>
                              <div className="dsb-bell-item-msg">{salaryNotif.msg}</div>
                            </div>
                            <button className="dsb-bell-item-close" onClick={() => { setBellDismissed(true); setShowBell(false) }}>
                              <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
                              </svg>
                            </button>
                          </div>
                        )}
                        {trialNotif && !trialBellDismissed && (
                          <div className="dsb-bell-item">
                            <div className="dsb-bell-item-ico">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round">
                                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                              </svg>
                            </div>
                            <div className="dsb-bell-item-body">
                              <div className="dsb-bell-item-title">Trial Pro</div>
                              <div className="dsb-bell-item-msg">{trialNotif.msg}</div>
                              <button
                                onClick={() => { setShowBell(false); navigate('/planos') }}
                                style={{ marginTop:6, fontSize:11, fontWeight:700, color:'#4ae2ac', background:'none', border:'none', padding:0, cursor:'pointer' }}
                              >
                                Assinar Pro →
                              </button>
                            </div>
                            <button className="dsb-bell-item-close" onClick={() => setTrialBellDismissed(true)}>
                              <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
                              </svg>
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="dsb-bell-empty">Sem notificações</div>
                    )}
                  </div>
                )}
              </div>

              <button className="hb-iconbtn" onClick={() => setShowSearch(true)} aria-label="Buscar">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>
                </svg>
              </button>
            </div>
          </header>

          {/* ── Tabs + Card — container único sem gap entre eles ── */}
          <div className="hb-kpi-block hb-mobile-only">
          <div className="hb-balance-tabs">
            {[
              { key:'saldo',    label:'Saldo'    },
              { key:'entradas', label:'Entradas' },
              { key:'gastos',   label:'Gastos'   },
              { key:'score',    label:'Score'    },
            ].map(t => (
              <button
                key={t.key}
                className={`hb-btab${activeMetric === t.key ? ' active' : ''}`}
                onClick={() => setActiveMetric(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Green card mobile ── */}
          <div className="hb-card">
            {activeMetric === 'saldo' && (
              <div className="hb-pane">
                <div className="hb-pane-top">
                  <span className="hb-pane-lbl">Saldo disponível</span>
                  <button className="hb-pane-link" onClick={() => navigate('/transactions')}>
                    Extrato
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                  </button>
                </div>
                <div className="hb-pane-val" style={{ color: summary?.currentBalance < 0 ? '#FF6F6F' : '#F2F2F2' }}>
                  R$ {fmt(summary?.currentBalance)}
                </div>
                <span className="hb-pane-pill" style={{ color: healthColor, borderColor: `${healthColor}60`, background: `${healthColor}0d` }}>{healthLabel}</span>
              </div>
            )}
            {activeMetric === 'entradas' && (
              <div className="hb-pane">
                <div className="hb-pane-top"><span className="hb-pane-lbl">Salário + Entradas</span></div>
                <div className="hb-pane-val" style={{ color:'#4ae2ac' }}>R$ {fmt(summary?.totalAvailable)}</div>
                <div className="hb-pane-sub">
                  Salário: <b>R$ {fmt(summary?.salary)}</b>
                  {summary?.totalIncome > 0 && <> · Extras: <b>+R$ {fmtShort(summary?.totalIncome)}</b></>}
                </div>
              </div>
            )}
            {activeMetric === 'gastos' && (
              <div className="hb-pane">
                <div className="hb-pane-top">
                  <span className="hb-pane-lbl">Total gasto</span>
                </div>
                <div className="hb-pane-val" style={{ color:'#FF6F6F' }}>R$ {fmt(summary?.totalExpenses)}</div>
                <div className="hb-prog"><b style={{ width:`${Math.min(pct,100)}%`, background: pct > 100 ? 'linear-gradient(90deg,#FF9F6F,#FF6F6F)' : 'linear-gradient(90deg,#2bbf96,#4ae2ac)' }} /></div>
                <div className="hb-prog-cap"><span>{pct}% do orçamento</span><span>{MONTHS[now.getMonth()]}</span></div>
              </div>
            )}
            {activeMetric === 'score' && (
              <div className="hb-pane">
                <div className="hb-pane-top"><span className="hb-pane-lbl">Score financeiro</span></div>
                <div className="hb-pane-val" style={{ color: scoreColor }}>
                  {score !== null ? score : '—'}
                  {score !== null && <span className="hb-pane-val-sub">/100</span>}
                </div>
                <div className="hb-prog"><b style={{ width:`${score ?? 0}%`, background:`linear-gradient(90deg,#2bbf96,${scoreColor})` }} /></div>
                <div className="hb-prog-cap"><span>{score ?? 0} de 100</span><span style={{ color: scoreColor }}>{scoreLabel}</span></div>
              </div>
            )}
            <button className="hb-btn-main" onClick={() => setShowForm(true)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#062611" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
              Nova Transação
            </button>
          </div>
          </div>{/* .hb-kpi-block */}

          {/* ══ DESKTOP HERO — tabs + card + gráfico (baseado em Dashboard Desktop.html) ══ */}
          {(() => {
            // dados por tab
            const bal  = summary?.currentBalance  ?? 0
            const inc  = summary?.totalAvailable  ?? 0
            const exp  = summary?.totalExpenses   ?? 0
            const sc   = score ?? 0

            // Gera série de 8 pontos terminando no valor atual.
            // Suporta valores negativos — sem clamping em zero.
            const makeSeries = (end) => {
              if (end === 0) return [0,0,0,0,0,0,0,0]
              const abs = Math.abs(end)
              const sign = end < 0 ? -1 : 1
              // Tendência crescente (positivo) ou decrescente (negativo)
              const pts = [abs*.15, abs*.28, abs*.38, abs*.52, abs*.65, abs*.78, abs*.92, abs]
              return pts.map(v => v * sign)
            }

            const META = {
              saldo:    { lbl:'Saldo disponível',   val:`R$ ${fmt(bal)}`,  cls: bal<0?'hh-red':'hh-white', chip:healthLabel, sub:`${MONTHS[now.getMonth()]}`, color:'#4ae2ac', title:`Evolução do saldo · ${MONTHS[now.getMonth()]}`,    leg:'Saldo',    series: makeSeries(bal) },
              entradas: { lbl:'Salário + Entradas', val:`R$ ${fmt(inc)}`,  cls:'hh-green', chip:`+R$ ${fmtShort(summary?.totalIncome??0)} extras`, sub:`Salário R$ ${fmt(summary?.salary??0)}`, color:'#4ae2ac', title:`Entradas acumuladas · ${MONTHS[now.getMonth()]}`, leg:'Entradas', series: makeSeries(inc) },
              gastos:   { lbl:'Total gasto',         val:`R$ ${fmt(exp)}`,  cls:'hh-red',   chip:`${pct}% do orçamento`, sub:`${MONTHS[now.getMonth()]}`, color:'#FF6F6F', title:`Gastos acumulados · ${MONTHS[now.getMonth()]}`,   leg:'Gastos',   series: makeSeries(exp) },
              score:    { lbl:'Score financeiro',    val:`${sc}`,           cls:'hh-green', chip:scoreLabel, sub:`${MONTHS[now.getMonth()]}`, color: scoreColor, title:`Evolução do score · ${MONTHS[now.getMonth()]}`, leg:'Score', series:[sc-22,sc-17,sc-12,sc-9,sc-6,sc-3,sc-1,sc].map(v=>Math.max(0,v)) },
            }
            const m = META[activeMetric] || META.saldo

            // Gera caminho SVG da série
            const W=600, padX=12, top=24, bot=190
            const ss = m.series
            const mn = Math.min(...ss), mx = Math.max(...ss), rng = (mx-mn)||1
            const pts = ss.map((v,i) => {
              const x = padX + (W-2*padX)*(i/(ss.length-1))
              const y = bot - ((v-mn)/rng)*(bot-top)
              return [x,y]
            })
            const linePath = pts.map((p,i) => (i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ')
            const areaPath = linePath + ` L ${pts[pts.length-1][0].toFixed(1)} ${bot} L ${pts[0][0].toFixed(1)} ${bot} Z`
            const dotX = pts[pts.length-1][0], dotY = pts[pts.length-1][1]
            const isRed = m.color === '#FF6F6F'

            return (
              <section className="hb-desktop-only hb-hero-section">
                {/* Tabs */}
                <div className="hb-hero-tabs">
                  {[['saldo','Saldo'],['entradas','Entradas'],['gastos','Gastos'],['score','Score']].map(([key,label]) => (
                    <button key={key}
                      className={`hb-htab${activeMetric===key?' active':''}`}
                      onClick={() => setActiveMetric(key)}>
                      {label}
                    </button>
                  ))}
                </div>
                {/* Hero card */}
                <div className="hb-hero">
                  {/* Partículas animadas */}
                  <div className="grad-particles hb-hero-particles" aria-hidden="true">
                    {[5,14,22,33,44,55,65,76,85,94].map((left, i) => (
                      <span key={i} className="grad-particle" style={{
                        left:`${left}%`, width:`${2+(i%3)}px`, height:`${2+(i%3)}px`,
                        animationDelay:`${(i*.5)%3}s`, animationDuration:`${2+(i%4)*.65}s`,
                        opacity: 0.3+(i%3)*.18,
                      }} />
                    ))}
                  </div>
                  {/* Left */}
                  <div className="hb-hero-left">
                    <div className="hb-hero-lbl">{m.lbl}</div>
                    <div className={`hb-hero-val ${m.cls}`}>{m.val}{activeMetric==='score' && <small>/100</small>}</div>
                    <div className="hb-hero-meta">
                      <span className="hb-hero-chip">{m.chip}</span>
                      <span className="hb-hero-sub">{m.sub}</span>
                    </div>
                    <button className="hb-hero-btn" onClick={() => setShowForm(true)}>
                      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#062611" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                      Nova Transação
                    </button>
                  </div>
                  {/* Right: chart */}
                  <div className="hb-hero-chart">
                    <div className="hb-chart-head">
                      <span className="hb-chart-title">{m.title}</span>
                      <span className="hb-chart-legend"><i style={{ background: m.color }}/>{m.leg}</span>
                    </div>
                    <svg viewBox="0 0 600 220" preserveAspectRatio="none" className="hb-chart-svg">
                      <defs>
                        <linearGradient id={`hbGreen${activeMetric}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={isRed?'rgba(255,111,111,.30)':'rgba(74,226,172,.34)'}/>
                          <stop offset="100%" stopColor={isRed?'rgba(255,111,111,0)':'rgba(74,226,172,0)'}/>
                        </linearGradient>
                      </defs>
                      <g stroke="#19211a" strokeWidth="1">
                        <line x1="10" y1="40"  x2="590" y2="40"/>
                        <line x1="10" y1="100" x2="590" y2="100"/>
                        <line x1="10" y1="160" x2="590" y2="160"/>
                      </g>
                      <path d={areaPath} fill={`url(#hbGreen${activeMetric})`}/>
                      <path d={linePath} fill="none" stroke={m.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                      <circle cx={dotX} cy={dotY} r="5" fill={m.color} stroke="#0a160f" strokeWidth="3"/>
                    </svg>
                    <div className="hb-xaxis">
                      <span>1 {MONTHS[now.getMonth()].slice(0,3)}</span>
                      <span>8</span><span>15</span><span>22</span>
                      <span>30</span>
                    </div>
                  </div>
                </div>
              </section>
            )
          })()}

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

      <SearchOverlay
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
        transactions={transactions}
      />
    </>
  )

}
