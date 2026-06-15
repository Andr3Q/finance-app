import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/layout/Navbar.jsx'
import { analytics } from '../services/analytics.js'
import GradCard from '../components/ui/GradCard.jsx'
import { transactionsAPI, agentAPI } from '../services/api.js'
import { useUser } from '../hooks/useUser.js'
import { useGoals } from '../hooks/useGoals.js'
import CurrencyInput from '../components/ui/CurrencyInput.jsx'
import DateInput from '../components/ui/DateInput.jsx'
import { getCache, setCache } from '../services/cache.js'
import { CATEGORY_LABELS, MONTHS } from '../constants/index.js'
import { fmt, fmtDate } from '../utils/format.js'
import RemindersCard      from '../components/features/settings/RemindersCard.jsx'
import CategoryLimitsCard from '../components/features/settings/CategoryLimitsCard.jsx'
const CACHE_HISTORY = 'analytics:history'
const CACHE_SUBS    = 'analytics:subs'
const TTL_5MIN      = 5 * 60_000

const PARTICLES = [
  { left:  4, size: 3, delay: 0,   dur: 2.8 },
  { left: 16, size: 4, delay: 1.1, dur: 3.3 },
  { left: 30, size: 3, delay: 0.5, dur: 2.5 },
  { left: 46, size: 5, delay: 1.7, dur: 3.6 },
  { left: 60, size: 3, delay: 0.3, dur: 2.9 },
  { left: 74, size: 4, delay: 1.3, dur: 3.1 },
  { left: 86, size: 3, delay: 0.8, dur: 2.6 },
  { left: 95, size: 4, delay: 2.0, dur: 3.4 },
]

const COLORS = ['#4ae2ac','#4f8ef7','#7b2fff','#ff8c42','#ff4757','#ff6b9d']
const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

const EMPTY_FORM = { title: '', targetAmount: '', currentAmount: '', color: '#4ae2ac', deadline: '' }
const DRAFT_KEY  = 'goal-form-draft'

function DepositModal({ goal, onConfirm, onCancel, saving }) {
  const [amount, setAmount] = useState('')
  const pct       = goal.targetAmount > 0
    ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100))
    : 0
  const remaining    = Math.max(0, goal.targetAmount - goal.currentAmount)
  const depositValue = parseFloat(amount) || 0
  const willComplete = remaining > 0 && depositValue >= remaining

  return (
    <div className="gls-modal-overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="gls-modal" style={{ maxWidth: 380 }}>
        <div className="gls-modal-head">
          <span>Depositar na meta</span>
          <button className="gls-modal-close" onClick={onCancel}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="gls-modal-body">
          <div className="gls-dep-goal-name" style={{ color: goal.color }}>{goal.title}</div>
          <div className="gls-dep-progress">
            <div className="gls-card-bar" style={{ marginBottom: 6 }}>
              <div className="gls-card-bar-fill" style={{ width: `${pct}%`, background: goal.color }} />
            </div>
            <div className="gls-dep-amounts">
              <span style={{ color: goal.color }}>R$ {fmt(goal.currentAmount)}</span>
              <span className="gls-dep-sep">de R$ {fmt(goal.targetAmount)}</span>
              {remaining > 0 && <span className="gls-dep-rem">faltam R$ {fmt(remaining)}</span>}
            </div>
          </div>
          <label className="gls-label">Valor a depositar</label>
          <div className="gls-input-prefix">
            <span>R$</span>
            <CurrencyInput
              className="gls-input-inner"
              placeholder="0,00"
              value={amount}
              onChange={setAmount}
              autoFocus
            />
          </div>
          {willComplete && (
            <div style={{ marginTop:10, padding:'10px 12px', borderRadius:10, background:'rgba(74,226,172,.1)', border:'1px solid rgba(74,226,172,.25)', display:'flex', alignItems:'center', gap:8, fontSize:13, color:'#4ae2ac', fontWeight:600 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ae2ac" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/><polyline points="8 12 11 15 16 9"/>
              </svg>
              Parabéns! Com este depósito você concluirá sua meta!
            </div>
          )}
        </div>
        <div className="gls-modal-foot">
          <button className="gls-btn-ghost" onClick={onCancel} disabled={saving}>Cancelar</button>
          <button
            className="gls-btn-save"
            style={{ background: goal.color }}
            onClick={() => onConfirm(depositValue)}
            disabled={saving || !(depositValue > 0)}
          >
            {saving
              ? <span className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} />
              : null}
            {willComplete ? '🎯 Concluir meta' : 'Depositar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function GoalForm({ initial, onSave, onCancel, saving }) {
  const isNew = !initial?.id
  const [form, setForm] = useState(() => {
    if (isNew) {
      try {
        const saved = sessionStorage.getItem(DRAFT_KEY)
        if (saved) return JSON.parse(saved)
      } catch {}
    }
    return initial || EMPTY_FORM
  })
  const [formErr, setFormErr] = useState('')

  const set = (k, v) => setForm(p => {
    const next = { ...p, [k]: v }
    if (isNew) {
      try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next)) } catch {}
    }
    if (formErr) setFormErr('')
    return next
  })

  const handleSave = () => {
    const current = parseFloat(form.currentAmount) || 0
    const target  = parseFloat(form.targetAmount)  || 0
    if (target > 0 && current > target) {
      setFormErr('O valor já guardado não pode ser maior do que o valor total da meta.')
      return
    }
    setFormErr('')
    if (isNew) sessionStorage.removeItem(DRAFT_KEY)
    onSave(form)
  }

  const handleCancel = () => {
    if (isNew) sessionStorage.removeItem(DRAFT_KEY)
    onCancel()
  }

  return (
    <div className="gls-modal-overlay" onClick={e => e.target === e.currentTarget && handleCancel()}>
      <div className="gls-modal">
        <div className="gls-modal-head">
          <span>{initial?.id ? 'Editar meta' : 'Nova meta'}</span>
          <button className="gls-modal-close" onClick={handleCancel}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="gls-modal-body">
          <label className="gls-label">Nome da meta</label>
          <input className="gls-input" placeholder="Ex: Reserva de emergência" maxLength={80}
            value={form.title} onChange={e => set('title', e.target.value)} autoFocus />

          <label className="gls-label">Valor-alvo</label>
          <div className="gls-input-prefix">
            <span>R$</span>
            <CurrencyInput className="gls-input-inner" placeholder="0,00"
              value={form.targetAmount} onChange={v => set('targetAmount', v)} />
          </div>

          <label className="gls-label">Já guardei (opcional)</label>
          <div className="gls-input-prefix">
            <span>R$</span>
            <CurrencyInput className="gls-input-inner" placeholder="0,00"
              value={form.currentAmount} onChange={v => set('currentAmount', v)} />
          </div>
          {formErr && (
            <div style={{ fontSize:12, color:'#ef4444', marginTop:5, display:'flex', alignItems:'center', gap:5 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {formErr}
            </div>
          )}

          <label className="gls-label">Prazo (opcional)</label>
          <DateInput className="gls-input"
            value={form.deadline} onChange={v => set('deadline', v)} />

          <label className="gls-label">Cor</label>
          <div className="gls-colors">
            {COLORS.map(c => (
              <button key={c} className={`gls-color-dot${form.color === c ? ' sel' : ''}`}
                style={{ background: c }} onClick={() => set('color', c)} type="button" />
            ))}
          </div>
        </div>
        <div className="gls-modal-foot">
          <button className="gls-btn-ghost" onClick={handleCancel} disabled={saving}>Cancelar</button>
          <button className="gls-btn-save" onClick={handleSave} disabled={saving}>
            {saving ? <span className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} /> : null}
            {initial?.id ? 'Salvar alterações' : 'Criar meta'}
          </button>
        </div>
      </div>
    </div>
  )
}

function BarChart({ data }) {
  const maxVal = Math.max(...data.flatMap(d => [d.income, d.expenses]), 1)
  const barH = 100

  return (
    <div className="anl-chart-wrap">
      <div className="anl-chart-legend">
        <span className="anl-legend-dot" style={{ background: '#4ae2ac' }} /> Entradas
        <span className="anl-legend-dot" style={{ background: '#ff6b6b', marginLeft: 14 }} /> Saídas
      </div>
      <div className="anl-chart-body">
        <svg viewBox={`0 0 ${data.length * 52} ${barH + 28}`} className="anl-chart-svg" preserveAspectRatio="none">
          {data.map((d, i) => {
            const incH = (d.income   / maxVal) * barH
            const expH = (d.expenses / maxVal) * barH
            const x    = i * 52
            return (
              <g key={i}>
                <rect x={x + 4}  y={barH - incH} width={20} height={Math.max(incH, 1)}  rx="3" fill="#4ae2ac" opacity=".85" />
                <rect x={x + 27} y={barH - expH} width={20} height={Math.max(expH, 1)} rx="3" fill="#ff6b6b" opacity=".85" />
                <text x={x + 26} y={barH + 18} textAnchor="middle" className="anl-chart-label">
                  {MONTHS_SHORT[d.month - 1]}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      <div className="anl-chart-vals">
        {data.map((d, i) => (
          <div key={i} className="anl-chart-col">
            <span style={{ color: '#4ae2ac' }}>+{fmt(d.income)}</span>
            <span style={{ color: '#ff6b6b' }}>-{fmt(d.expenses)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SubscriptionsList({ data, loading }) {
  if (loading) return (
    <div className="anl-loading">
      <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
    </div>
  )
  if (!Array.isArray(data) || !data.length) return (
    <div className="anl-empty">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="1.5" strokeLinecap="round">
        <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/>
        <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/>
      </svg>
      <span>Nenhuma assinatura detectada</span>
      <span className="anl-empty-sub">Precisamos de pelo menos 2 meses de transações similares</span>
    </div>
  )
  const total = data.reduce((s, s2) => s + s2.amount, 0)
  return (
    <div className="anl-subs-list">
      {data.map((s, i) => (
        <div key={i} className="anl-sub-item">
          <div className="anl-sub-ico">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#7b2fff" strokeWidth="2" strokeLinecap="round">
              <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/>
              <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/>
            </svg>
          </div>
          <div className="anl-sub-info">
            <span className="anl-sub-name">{s.description}</span>
            <span className="anl-sub-cat">{CATEGORY_LABELS[s.category] || s.category} · {s.months}x detectado</span>
          </div>
          <span className="anl-sub-amt">R$ {fmt(s.amount)}/mês</span>
        </div>
      ))}
      <div className="anl-subs-total">
        <span>Total em assinaturas</span>
        <span style={{ color: '#ff6b6b', fontWeight: 700 }}>R$ {fmt(total)}/mês</span>
      </div>
    </div>
  )
}

export default function Goals() {
  const user     = useUser()
  const navigate = useNavigate()
  const { goals, loading, fetchGoals, createGoal, updateGoal, deleteGoal } = useGoals()
  const [modal,           setModal]           = useState(null)
  const [depositGoal,     setDepositGoal]     = useState(null)
  const [saving,          setSaving]          = useState(false)
  const [toast,           setToast]           = useState(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)

  const [history,       setHistory]       = useState([])
  const [subs,          setSubs]          = useState([])
  const [loadingHist,   setLoadingHist]   = useState(true)
  const [loadingSubs,   setLoadingSubs]   = useState(true)
  const [report,        setReport]        = useState(null)
  const [reportLoading, setReportLoading] = useState(false)
  const now = new Date()
  const [reportMonth, setReportMonth] = useState(now.getMonth() + 1)
  const [reportYear,  setReportYear]  = useState(now.getFullYear())
  const reportRef = useRef(null)

  const [activeTab, setActiveTab] = useState('metas')

  const plan    = user?.plan ?? null
  const isFree  = plan === 'free'
  const isPro   = plan === 'pro' || plan === 'elite'
  const isElite = plan === 'elite'
  const proLimit = 4

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  // Adapter para CategoryLimitsCard (usa 'error'|'success'; Goals usa boolean ok)
  const showMsg = (msg, type = 'success') => {
    setToast({ msg, ok: type !== 'error' })
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    fetchGoals()

    let cancelled = false

    const cachedHistory = getCache(CACHE_HISTORY)
    if (cachedHistory) {
      setHistory(cachedHistory)
      setLoadingHist(false)
    } else {
      transactionsAPI.monthlyHistory(6)
        .then(r => { if (!cancelled) { setCache(CACHE_HISTORY, r.data, TTL_5MIN); setHistory(r.data) } })
        .catch(() => { if (!cancelled) setLoadingHist(false) })
        .finally(() => { if (!cancelled) setLoadingHist(false) })
    }

    const cachedSubs = getCache(CACHE_SUBS)
    if (cachedSubs) {
      setSubs(cachedSubs)
      setLoadingSubs(false)
    } else {
      transactionsAPI.subscriptions()
        .then(r => { if (!cancelled) { setCache(CACHE_SUBS, r.data, TTL_5MIN); setSubs(r.data) } })
        .catch(() => { if (!cancelled) setLoadingSubs(false) })
        .finally(() => { if (!cancelled) setLoadingSubs(false) })
    }

    return () => { cancelled = true }
  }, [fetchGoals])

  const handleSave = async (form) => {
    if (!form.title.trim()) return showToast('Informe o nome da meta.', false)
    if (!form.targetAmount || form.targetAmount <= 0) return showToast('Informe um valor-alvo válido.', false)
    setSaving(true)
    try {
      if (modal?.id) {
        await updateGoal(modal.id, form)
        showToast('Meta atualizada!')
      } else {
        await createGoal(form)
        analytics.track('goal_created', { targetAmount: form.targetAmount })
        showToast('Meta criada!')
      }
      setModal(null)
    } catch (err) {
      if (err.response?.data?.limitReached) {
        analytics.track('limit_reached', { feature: 'goals' })
        setModal(null)
        showToast('Você atingiu o limite de metas do seu plano. Faça upgrade para criar mais!', false)
        setTimeout(() => navigate('/planos'), 2500)
        return
      }
      showToast(err.response?.data?.error || 'Erro ao salvar meta.', false)
    } finally {
      setSaving(false)
    }
  }

  const handleDeposit = async (amount) => {
    if (!depositGoal || amount <= 0) return
    setSaving(true)
    try {
      const newAmount = depositGoal.currentAmount + amount
      await updateGoal(depositGoal.id, { currentAmount: newAmount })
      const done = newAmount >= depositGoal.targetAmount
      analytics.track('goal_deposit_made', { amount, goalReached: done })
      showToast(done ? 'Meta atingida! Parabéns!' : 'Depósito registrado!')
      setDepositGoal(null)
    } catch (err) {
      showToast(err.response?.data?.error || 'Erro ao registrar depósito.', false)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = (id) => setDeleteConfirmId(id)

  const confirmDelete = async () => {
    const id = deleteConfirmId
    setDeleteConfirmId(null)
    try {
      await deleteGoal(id)
      showToast('Meta removida.')
    } catch {
      showToast('Erro ao remover meta.', false)
    }
  }

  const generateReport = async () => {
    const cacheKey = `ai-report-${reportMonth}-${reportYear}`
    try {
      const cached = JSON.parse(sessionStorage.getItem(cacheKey) || 'null')
      if (cached?.text && Date.now() - cached.ts < 6 * 3600 * 1000) {
        setReport(cached.text)
        setTimeout(() => reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
        return
      }
    } catch {}

    setReportLoading(true)
    setReport(null)
    try {
      const { data } = await agentAPI.monthlyReport(reportMonth, reportYear)
      const text = data.report || data.text || ''
      setReport(text)
      if (text && !text.startsWith('Nenhuma')) {
        try { sessionStorage.setItem(cacheKey, JSON.stringify({ text, ts: Date.now() })) } catch {}
        showToast('Relatório gerado com sucesso!')
      }
      setTimeout(() => reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    } catch (err) {
      setReport(err.response?.data?.error || 'Erro ao gerar relatório. Tente novamente.')
    } finally {
      setReportLoading(false)
    }
  }

  return (
    <>
      <Navbar />

      {toast && (
        <div className={`toast ${toast.ok ? 'tok' : 'terr'}`}
          style={{ position:'fixed', top:16, left:'50%', transform:'translateX(-50%)', zIndex:500, whiteSpace:'nowrap' }}>
          {toast.msg}
        </div>
      )}

      <div className="pwnav fade-in">
        <div className="dsb-content">
          <div className="gls-page">

            {/* ── Hero ── */}
            <div className="gls-hero">
              <div className="gc-glow" />
              <div className="gc-particles" aria-hidden="true">
                {PARTICLES.map((p, i) => (
                  <span key={i} className="gc-particle" style={{
                    left: `${p.left}%`, width: p.size, height: p.size,
                    animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`,
                  }} />
                ))}
              </div>
              <div className="gls-hero-ico">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4ae2ac" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
                </svg>
              </div>
              <div className="gls-hero-text">
                <div className="cfg-ch-title">Metas & Análises</div>
                <div className="cfg-ch-sub">Objetivos financeiros e acompanhamento histórico</div>
              </div>
              {activeTab === 'metas' && (
                <button className="gls-btn-new"
                  onClick={() => setModal('new')}
                  disabled={(isFree && goals.length >= 1) || (isPro && goals.length >= proLimit)}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Nova meta
                </button>
              )}
            </div>

            {/* ── Tabs ── */}
            <div style={{ display:'flex', gap:4, marginBottom:24, borderBottom:'1px solid var(--bd)', paddingBottom:0, overflowX:'auto', overflowY:'hidden', scrollbarWidth:'none', WebkitOverflowScrolling:'touch', touchAction:'pan-x' }}>
              {[
                { key:'metas',       label:'Metas' },
                { key:'historico',   label:'Histórico' },
                { key:'assinaturas', label:'Assinaturas' },
                { key:'lembretes',   label:'Lembretes' },
                { key:'limites',     label:'Limites' },
              ].map(t => (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  style={{
                    padding:'8px 16px', fontSize:13, fontWeight:600, cursor:'pointer',
                    background:'transparent', border:'none', borderBottom:'2px solid',
                    flexShrink:0, whiteSpace:'nowrap',
                    borderBottomColor: activeTab === t.key ? 'var(--cp)' : 'transparent',
                    color: activeTab === t.key ? 'var(--cp)' : 'var(--t3)',
                    marginBottom:-1, transition:'color .15s, border-color .15s',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── Metas ── */}
            {activeTab === 'metas' && loading ? (
              <div style={{ display:'flex', justifyContent:'center', padding:'40px 0' }}>
                <span className="spinner" style={{ width: 22, height: 22, borderWidth: 2.5 }} />
              </div>
            ) : activeTab === 'metas' && goals.length === 0 ? (
              <div className="gls-empty-state">
                <div className="gls-empty-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4ae2ac" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
                  </svg>
                </div>
                <span>Nenhuma meta ainda</span>
                <span className="gls-empty-sub">Defina um objetivo, acompanhe o progresso e celebre cada conquista.</span>
                <button className="gls-btn-new" onClick={() => setModal('new')}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Criar primeira meta
                </button>
              </div>
            ) : activeTab === 'metas' ? (
              <>
                {isFree && goals.length >= 1 && (
                  <div className="gls-pro-limit-banner">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    Limite de 1 meta no plano Free.{' '}
                    <button className="gls-pro-limit-link" onClick={() => navigate('/planos')}>Fazer upgrade para criar mais</button>
                  </div>
                )}
                {isPro && goals.length >= proLimit && (
                  <div className="gls-pro-limit-banner">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    Limite de {proLimit} metas atingido no plano Pro.{' '}
                    <button className="gls-pro-limit-link" onClick={() => navigate('/planos')}>Fazer upgrade</button>
                  </div>
                )}
                <div className="gls-grid">
                  {goals.map(g => {
                    const pct  = g.targetAmount > 0 ? Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100)) : 0
                    const done = pct >= 100
                    return (
                      <div key={g.id} className="gls-card" style={{ '--gc': g.color }}>
                        <div className="gls-card-top" style={{ borderTopColor: g.color }} />
                        <div className="gls-card-body">
                          <div className="gls-card-row1">
                            <span className="gls-card-title">{g.title}</span>
                            <span className="gls-card-pct" style={{ color: g.color, borderColor: `${g.color}33`, background: `${g.color}12` }}>
                              {done ? '✓' : `${pct}%`}
                            </span>
                          </div>
                          <div className="gls-card-bar-wrap">
                            <div className="gls-card-bar">
                              <div className="gls-card-bar-fill" style={{ width: `${pct}%`, background: g.color }} />
                            </div>
                          </div>
                          <div className="gls-card-amounts">
                            <span style={{ color: g.color }}>R$ {fmt(g.currentAmount)}</span>
                            <span>de R$ {fmt(g.targetAmount)}</span>
                          </div>
                          {g.deadline && (
                            <div className="gls-card-deadline">
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                              </svg>
                              Prazo: {fmtDate(g.deadline)}
                            </div>
                          )}
                          <div className="gls-card-actions">
                            {!done && (
                              <button className="gls-act-btn gls-act-dep" style={{ '--dep-c': g.color }} onClick={() => setDepositGoal(g)}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                                  <circle cx="12" cy="12" r="10"/>
                                  <line x1="12" y1="8" x2="12" y2="16"/>
                                  <polyline points="8 12 12 16 16 12"/>
                                </svg>
                                Depositar
                              </button>
                            )}
                            <button className="gls-act-btn" onClick={() => setModal({ ...g, deadline: g.deadline ? g.deadline.slice(0,10) : '' })}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                              </svg>
                              Editar
                            </button>
                            <button className="gls-act-btn gls-act-del" onClick={() => handleDelete(g.id)}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                                <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                              </svg>
                              Remover
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            ) : null}

            {/* ── Histórico de Gastos ── */}
            {activeTab === 'historico' && (
              <>
                <GradCard
                  iconBg="rgba(79,142,247,.1)" iconBorder="rgba(79,142,247,.25)"
                  icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4f8ef7" strokeWidth="2" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>}
                  title="Evolução mensal"
                  sub="Entradas e saídas dos últimos 6 meses"
                >
                  {loadingHist ? (
                    <div className="anl-loading"><span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /></div>
                  ) : history.length > 0 ? (
                    <BarChart data={history} />
                  ) : (
                    <div className="anl-empty"><span>Sem dados de histórico ainda</span></div>
                  )}
                </GradCard>

                {/* ── Relatório IA (Elite only) ── */}
                {isElite && (
                <GradCard
                  iconBg="rgba(255,140,66,.1)" iconBorder="rgba(255,140,66,.25)"
                  icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ff8c42" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>}
                  title="Relatório mensal IA"
                  sub="Análise completa gerada por inteligência artificial"
                >
                  <div className="anl-report-controls">
                    <select className="anl-report-select" value={reportMonth} onChange={e => setReportMonth(+e.target.value)}>
                      {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                    </select>
                    <select className="anl-report-select" value={reportYear} onChange={e => setReportYear(+e.target.value)}>
                      {Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <button className="anl-report-btn" onClick={generateReport} disabled={reportLoading}>
                      {reportLoading
                        ? <><span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />Gerando...</>
                        : 'Gerar relatório'
                      }
                    </button>
                  </div>
                  {reportLoading && (
                    <div className="anl-loading">
                      <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                    </div>
                  )}
                  {report && !reportLoading && (
                    <div className="anl-report-text" ref={reportRef}>{report}</div>
                  )}
                </GradCard>
                )}
              </>
            )}

            {/* ── Detector de Assinaturas ── */}
            {activeTab === 'assinaturas' && (
              <GradCard
                iconBg="rgba(123,47,255,.1)" iconBorder="rgba(123,47,255,.25)"
                icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7b2fff" strokeWidth="2" strokeLinecap="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>}
                title="Gastos recorrentes detectados"
                sub="Transações que se repetem em meses diferentes"
              >
                <SubscriptionsList data={subs} loading={loadingSubs} />
              </GradCard>
            )}

            {/* ── Lembretes ── */}
            {activeTab === 'lembretes' && (
              <RemindersCard />
            )}

            {/* ── Limites por categoria ── */}
            {activeTab === 'limites' && (
              <CategoryLimitsCard
                isPro={isPro}
                onMessage={showMsg}
                onUpgrade={() => navigate('/planos')}
              />
            )}

          </div>
        </div>
      </div>

      {modal && (
        <GoalForm
          initial={modal === 'new' ? null : modal}
          onSave={handleSave}
          onCancel={() => setModal(null)}
          saving={saving}
        />
      )}

      {depositGoal && (
        <DepositModal
          goal={depositGoal}
          onConfirm={handleDeposit}
          onCancel={() => setDepositGoal(null)}
          saving={saving}
        />
      )}

      {deleteConfirmId && (
        <div className="gls-modal-overlay" onClick={() => setDeleteConfirmId(null)}>
          <div className="gls-modal" style={{ maxWidth:360 }} onClick={e => e.stopPropagation()}>
            <div className="gls-modal-head">
              <span>Remover meta</span>
              <button className="gls-modal-close" onClick={() => setDeleteConfirmId(null)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="gls-modal-body" style={{ textAlign:'center', paddingTop:8 }}>
              <div style={{ width:48, height:48, borderRadius:12, background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.2)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                  <path d="M10 11v6"/><path d="M14 11v6"/>
                  <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                </svg>
              </div>
              <div style={{ fontWeight:700, fontSize:15, color:'var(--t1)', marginBottom:8 }}>Tem certeza?</div>
              <div style={{ fontSize:13, color:'var(--t2)', lineHeight:1.6 }}>
                Esta meta e todo o progresso acumulado serão removidos permanentemente.
              </div>
            </div>
            <div className="gls-modal-foot">
              <button className="gls-btn-ghost" onClick={() => setDeleteConfirmId(null)}>Cancelar</button>
              <button
                className="gls-btn-save"
                style={{ background:'#ef4444' }}
                onClick={confirmDelete}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                </svg>
                Sim, excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
