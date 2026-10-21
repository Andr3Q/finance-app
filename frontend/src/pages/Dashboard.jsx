import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
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
import { readSeen, resumoKey, dicasKey, metasKey } from '../utils/storiesSeen.js'
import { playSoftChime, getTrialNotif, getSalaryNotif } from '../utils/notifications.js'

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
  const { theme, toggle: toggleTheme } = useTheme()

  const [summary,      setSummary]      = useState(null)
  const [transactions, setTransactions] = useState([])
  const [limits,       setLimits]       = useState([])
  const [budgets,      setBudgets]      = useState([])
  const [loading,      setLoading]      = useState(true)
  const [showForm,     setShowForm]     = useState(false)
  const [quickAddType, setQuickAddType] = useState(null) // 'income' | 'expense' | null
  const [toast,        setToast]        = useState(null)
  const [showSearch,   setShowSearch]   = useState(false)
  // Preferência de privacidade (ocultar valores) persiste entre sessões —
  // sem isso o usuário teria que escondê-los de novo toda vez que abrisse o app.
  const [hideBalance,  setHideBalance]  = useState(() => {
    try { return localStorage.getItem('hide-balance') === '1' } catch { return false }
  })
  const [prediction,   setPrediction]   = useState(null)
  const [predLoading,  setPredLoading]  = useState(false)
  const [goals,        setGoals]        = useState([])
  const [confirmDeleteTx, setConfirmDeleteTx] = useState(null)

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
    try {
      await transactionsAPI.remove(id)
      fetchData(true)
    } catch {
      showToast('Erro ao remover transação.', false)
    }
    setConfirmDeleteTx(null)
  }

  const pct = summary?.percentUsed || 0
  const now = new Date()

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

  const scoreColor = score === null ? 'var(--t2)' :
    score >= 80 ? 'var(--c)' :
    score >= 60 ? '#4ae2ac' :
    score >= 40 ? '#ffc107' :
    score >= 20 ? '#ff8c42' : '#ff4757'

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

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh' }}>
      <div style={{ textAlign:'center' }}>
        <div className="dsb-loader"><div className="dsb-loader-ring" /></div>
        <p style={{ color:'var(--t2)', fontSize:13, marginTop:16 }}>Carregando suas finanças…</p>
      </div>
    </div>
  )

  const RING_R          = 24
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
                  <span className="home-hi">{greeting},</span>
                  <span className="home-name">{firstName || 'bem-vindo'}</span>
                </div>
              </div>
              <div className="home-hero-actions">
                <button className="home-iconbtn" onClick={toggleTheme} aria-label="Alternar tema">
                  {theme === 'dark' ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                    </svg>
                  )}
                </button>
                <button className="home-iconbtn" onClick={() => setShowSearch(true)} aria-label="Buscar">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>
                  </svg>
                </button>
                <button className="home-iconbtn" onClick={toggleHideBalance} aria-label={hideBalance ? 'Mostrar valores' : 'Ocultar valores'}>
                  {hideBalance ? <IconEyeOff /> : <IconEye />}
                </button>
                <div className="dsb-bell-wrap" ref={bellRef} style={{ position:'relative' }}>
                  <button className="home-iconbtn" onClick={() => setShowBell(b => !b)} aria-label="Notificações">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
              </div>
            </div>

            <div className="home-balance-lbl">Saldo disponível</div>
            <div className="home-balance-val">
              {hideBalance ? 'R$ ••••••' : `R$ ${fmt(summary?.currentBalance)}`}
            </div>

            <div className="home-quick-actions">
              <button className="home-qa-btn" onClick={() => setShowForm(true)}>
                <span className="home-qa-ico"><IconPlus /></span>Adicionar
              </button>
              <button className="home-qa-btn" onClick={() => navigate('/transactions')}>
                <span className="home-qa-ico"><IconSwap /></span>Extrato
              </button>
              <button className="home-qa-btn" onClick={() => navigate('/goals')}>
                <span className="home-qa-ico"><IconTarget /></span>Metas
              </button>
              <button className="home-qa-btn home-qa-btn-active" onClick={() => window.dispatchEvent(new Event('nancy:open-agent-chat'))}>
                <span className="home-qa-ico"><IconSparkle /></span>Nancy IA
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
                <svg width="64" height="64" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r={RING_R} fill="none" stroke="var(--bd)" strokeWidth="6" />
                  <circle
                    cx="32" cy="32" r={RING_R} fill="none"
                    stroke={scoreColor} strokeWidth="6" strokeLinecap="round"
                    strokeDasharray={RING_CIRC} strokeDashoffset={scoreRingOffset}
                    transform="rotate(-90 32 32)"
                    style={{ transition:'stroke-dashoffset .8s cubic-bezier(.4,0,.2,1), stroke .4s' }}
                  />
                </svg>
                <span className="home-health-score">{score ?? '—'}</span>
              </div>
              <div>
                <div className="home-health-title">Saúde financeira</div>
                <div className="home-health-sub" style={{ color: scoreColor }}>{healthLabel}</div>
              </div>
            </div>

            <div className="home-stats-row">
              <div className="home-stat">
                <span className="home-stat-dot" style={{ background:'#4ae2ac' }} />
                <span className="home-stat-lbl">Entradas</span>
                <span className="home-stat-val">{hideBalance ? '••••' : `R$ ${fmtShort(summary?.totalAvailable)}`}</span>
              </div>
              <div className="home-stat">
                <span className="home-stat-dot" style={{ background:'#4f8ef7' }} />
                <span className="home-stat-lbl">Saídas</span>
                <span className="home-stat-val">{hideBalance ? '••••' : `R$ ${fmtShort(summary?.totalExpenses)}`}</span>
              </div>
              <div className="home-stat">
                <span className="home-stat-dot" style={{ background:'#9fe8d1' }} />
                <span className="home-stat-lbl">Contas fixas</span>
                <span className="home-stat-val">{hideBalance ? '••••' : `R$ ${fmtShort(summary?.totalFixedCosts)}`}</span>
              </div>
            </div>

            {isPro && (prediction || predLoading) && (
              <button className="home-insight" onClick={() => window.dispatchEvent(new Event('nancy:open-agent-chat'))}>
                <span className="home-insight-ico"><IconSparkle /></span>
                <span className="home-insight-text">{predLoading ? 'Analisando seu mês...' : prediction}</span>
                <span className="home-insight-cta">Perguntar à Nancy →</span>
              </button>
            )}

            <div className="home-recent">
              <div className="home-section-head">
                <h2 className="home-section-title">Últimas</h2>
                <button className="home-section-link" onClick={() => navigate('/transactions')}>Ver extrato →</button>
              </div>
              {recentTx.length === 0 ? (
                <div className="hb-empty">Nenhuma transação encontrada</div>
              ) : recentTx.map(t => {
                const isInc = t.type === 'income'
                const desc  = t.description || CATEGORY_LABELS[t.category] || t.category
                return (
                  <div key={t.id} className="home-recent-row">
                    <div className={`home-recent-ico ${isInc ? 'inc' : 'exp'}`}>
                      <CategoryIcon category={t.category} size={15} color="currentColor" />
                    </div>
                    <div className="home-recent-body">
                      <span className="home-recent-name">{desc}</span>
                      <span className="home-recent-meta">
                        {CATEGORY_LABELS[t.category]} · {new Date(t.date).toLocaleDateString('pt-BR', { day:'2-digit', month:'short' })}
                      </span>
                    </div>
                    <span className={`home-recent-amt ${isInc ? 'inc' : 'exp'}`}>
                      {hideBalance ? '••••' : `${isInc ? '+' : '−'}R$ ${fmt(t.amount)}`}
                    </span>
                    <button className="home-recent-del" onClick={() => setConfirmDeleteTx(t.id)} title="Remover" aria-label="Remover transação">
                      <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
                      </svg>
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* "+" flutuante isolado removido — a mesma ação agora vive no botão
          central da barra de navegação (menu rápido: Receita/Despesa/
          Parcelamento/IA/Metas), evitando dois "+" com comportamentos
          diferentes na mesma tela. */}

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

      <SearchOverlay
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
        transactions={transactions}
      />

      {confirmDeleteTx && createPortal(
        <div className="gls-modal-overlay" onClick={() => setConfirmDeleteTx(null)}>
          <div className="gls-modal" style={{ maxWidth:360 }} onClick={e => e.stopPropagation()}>
            <div className="gls-modal-head">
              <span>Remover transação</span>
              <button className="gls-modal-close" onClick={() => setConfirmDeleteTx(null)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="gls-modal-body" style={{ textAlign:'center', paddingTop:8 }}>
              <div style={{ width:48, height:48, borderRadius:12, background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.2)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                  <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                </svg>
              </div>
              <div style={{ fontWeight:700, fontSize:15, color:'var(--t1)', marginBottom:8 }}>Tem certeza?</div>
              <div style={{ fontSize:13, color:'var(--t2)', lineHeight:1.6 }}>Esta transação será removida permanentemente.</div>
            </div>
            <div className="gls-modal-foot">
              <button className="gls-btn-ghost" onClick={() => setConfirmDeleteTx(null)}>Cancelar</button>
              <button className="gls-btn-save" style={{ background:'#ef4444' }} onClick={() => handleDelete(confirmDeleteTx)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                </svg>
                Sim, excluir
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )

}
