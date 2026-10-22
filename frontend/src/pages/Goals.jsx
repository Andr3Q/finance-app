import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/layout/Navbar.jsx'
import PlanUsageBanner from '../components/ui/PlanUsageBanner.jsx'
import { analytics } from '../services/analytics.js'
import GradCard from '../components/ui/GradCard.jsx'
import { transactionsAPI, agentAPI } from '../services/api.js'
import { useUser } from '../hooks/useUser.js'
import { useForcedLightTheme } from '../hooks/useTheme.js'
import { useGoals } from '../hooks/useGoals.js'
import CurrencyInput from '../components/ui/CurrencyInput.jsx'
import DateInput from '../components/ui/DateInput.jsx'
import { getCache, setCache } from '../services/cache.js'
import { CATEGORY_LABELS, MONTHS } from '../constants/index.js'
import { fmt, fmtDate } from '../utils/format.js'
import RemindersCard      from '../components/features/settings/RemindersCard.jsx'
import CategoryLimitsCard from '../components/features/settings/CategoryLimitsCard.jsx'
const amountBucket = (v) => {
  const n = Number(v)
  if (!n || n <= 0)      return '0'
  if (n <= 100)          return '1-100'
  if (n <= 500)          return '101-500'
  if (n <= 1000)         return '501-1000'
  if (n <= 5000)         return '1001-5000'
  if (n <= 20000)        return '5001-20000'
  return '20000+'
}

const CACHE_HISTORY = 'analytics:history'
const CACHE_SUBS    = 'analytics:subs'
const TTL_5MIN      = 5 * 60_000

const ChipArrow = ({ dir }) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points={dir === 'left' ? '15 18 9 12 15 6' : '9 18 15 12 9 6'}/>
  </svg>
)
const chipIcon = (d) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
)
// As antigas abas viram atalhos do cabeçalho; sem nenhum ativo, a tela mostra as metas.
const TABS = [
  { key: 'historico',   label: 'Histórico',   icon: chipIcon(<><line x1="6" y1="20" x2="6" y2="11"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="18" y1="20" x2="18" y2="14"/></>) },
  { key: 'assinaturas', label: 'Assinaturas', icon: chipIcon(<><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></>) },
  { key: 'lembretes',   label: 'Lembretes',   icon: chipIcon(<><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></>) },
  { key: 'limites',     label: 'Limites',     icon: chipIcon(<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>) },
]

const COLORS = ['#4ae2ac','#4f8ef7','#7b2fff','#ff8c42','#ff4757','#ff6b9d']
const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

const EMPTY_FORM = { title: '', targetAmount: '', currentAmount: '', color: '#4ae2ac', deadline: '' }
const DRAFT_KEY  = 'goal-form-draft'

function DepositModal({ goal, onConfirm, onCancel, saving, initialAmount = '' }) {
  const [amount, setAmount] = useState(initialAmount)
  const currentAmt   = Number(goal.currentAmount) || 0
  const targetAmt    = Number(goal.targetAmount)  || 0
  const pct          = targetAmt > 0
    ? Math.min(100, Math.round((currentAmt / targetAmt) * 100))
    : 0
  const remaining    = Math.max(0, targetAmt - currentAmt)
  const depositValue = Number(amount) || 0
  const newTotal     = currentAmt + depositValue
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
              <span style={{ color: goal.color }}>R$ {fmt(currentAmt)}</span>
              <span className="gls-dep-sep">de R$ {fmt(targetAmt)}</span>
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
          {depositValue > 0 && (
            <div style={{ marginTop:8, fontSize:12, color:'var(--t2)', display:'flex', alignItems:'center', gap:6 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="2" strokeLinecap="round">
                <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
              </svg>
              Novo total: <strong style={{ color: goal.color }}>R$ {fmt(newTotal)}</strong>
            </div>
          )}
          {willComplete && (
            <div style={{ marginTop:8, padding:'10px 12px', borderRadius:10, background:'rgba(74,226,172,.1)', border:'1px solid rgba(74,226,172,.25)', display:'flex', alignItems:'center', gap:8, fontSize:13, color:'#4ae2ac', fontWeight:600 }}>
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

function GoalForm({ initial, onSave, onCancel, onDelete, saving }) {
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
          {initial?.id && onDelete && (
            <button type="button" className="gls-remove-link" onClick={onDelete} disabled={saving}>Remover meta</button>
          )}
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
  const reportRef   = useRef(null)
  const reportCache = useRef(new Map()) // cache em memória — não persiste em sessionStorage

  const [activeTab, setActiveTab] = useState('metas')
  const [newGoal, setNewGoal] = useState({ title: '', targetAmount: '' })
  const chipsRef = useRef(null)
  const scrollChips = (dir) => chipsRef.current?.scrollBy({ left: dir * 150, behavior: 'smooth' })
  useForcedLightTheme() // tela desenhada só no claro (design Nancy 2)

  const plan    = user?.plan ?? null
  const isFree  = plan === 'free'
  const isPro   = plan === 'pro' || plan === 'elite'
  const isElite = plan === 'elite'
  const proLimit = 4
  const atGoalLimit = (isFree && goals.length >= 1) || (plan === 'pro' && goals.length >= proLimit)

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

    if (isPro) {
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
    } else {
      setLoadingHist(false)
    }

    if (isElite) {
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
    } else {
      setLoadingSubs(false)
    }

    return () => { cancelled = true }
  }, [fetchGoals])

  const handleSave = async (form) => {
    if (!form.title.trim()) { showToast('Informe o nome da meta.', false); return false }
    if (!form.targetAmount || form.targetAmount <= 0) { showToast('Informe um valor-alvo válido.', false); return false }
    setSaving(true)
    try {
      if (modal?.id) {
        await updateGoal(modal.id, form)
        showToast('Meta atualizada!')
      } else {
        await createGoal(form)
        analytics.track('goal_created', { targetAmountRange: amountBucket(form.targetAmount) })
        showToast('Meta criada!')
      }
      setModal(null)
      return true
    } catch (err) {
      if (err.response?.data?.limitReached) {
        analytics.track('limit_reached', { feature: 'goals' })
        setModal(null)
        showToast('Você atingiu o limite de metas do seu plano. Faça upgrade para criar mais!', false)
        setTimeout(() => navigate('/planos'), 2500)
        return false
      }
      showToast(err.response?.data?.error || 'Erro ao salvar meta.', false)
      return false
    } finally {
      setSaving(false)
    }
  }

  const handleDeposit = async (amount) => {
    if (!depositGoal || amount <= 0) return
    const goal = depositGoal.goal
    setSaving(true)
    try {
      const newAmount = Number(goal.currentAmount) + Number(amount)
      await updateGoal(goal.id, { currentAmount: newAmount })
      const done = newAmount >= goal.targetAmount
      analytics.track('goal_deposit_made', { amountRange: amountBucket(amount), goalReached: done })
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
    const cacheKey = `${reportMonth}-${reportYear}`
    const cached = reportCache.current.get(cacheKey)
    if (cached?.text && Date.now() - cached.ts < 6 * 3600 * 1000) {
      setReport(cached.text)
      setTimeout(() => reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
      return
    }

    setReportLoading(true)
    setReport(null)
    try {
      const { data } = await agentAPI.monthlyReport(reportMonth, reportYear)
      const text = data.report || data.text || ''
      setReport(text)
      if (text && !text.startsWith('Nenhuma')) {
        reportCache.current.set(cacheKey, { text, ts: Date.now() })
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
          style={{ position:'fixed', top:16, left:'50%', transform:'translateX(-50%)', zIndex:9001, whiteSpace:'nowrap' }}>
          {toast.msg}
        </div>
      )}

      <div className="pwnav goals-pwnav fade-in">
        <div className="ex-page gl-page">
          <div className="gl-blue">
            <header className="ex-hero gl-hero">
              <h1 className="ex-title">Metas</h1>
              <div className="ex-chips-row">
                <button className="ex-chip-arrow" onClick={() => scrollChips(-1)} aria-label="Atalhos anteriores"><ChipArrow dir="left" /></button>
                <div className="ex-chips" ref={chipsRef}>
                  {TABS.map(t => (
                    <button key={t.key} type="button" className={`ex-chip${activeTab === t.key ? ' on' : ''}`} aria-pressed={activeTab === t.key}
                      onClick={() => setActiveTab(activeTab === t.key ? 'metas' : t.key)}>
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
                <button className="ex-chip-arrow" onClick={() => scrollChips(1)} aria-label="Próximos atalhos"><ChipArrow dir="right" /></button>
              </div>
            </header>

            <div className="gl-body">
            {activeTab === 'metas' && (
              <>
                {!loading && (
                  <PlanUsageBanner plan={plan ?? 'free'} feature="goals" used={goals.length} label="metas" />
                )}
                {loading ? (
                  <div className="gl-loading"><span className="spinner" style={{ width: 22, height: 22, borderWidth: 2.5 }} /></div>
                ) : goals.map(g => {
                  const target = Number(g.targetAmount)
                  const current = Number(g.currentAmount)
                  const pct  = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0
                  const done = pct >= 100
                  const quick = Math.min(500, Math.round((target - current) * 100) / 100)
                  const dl = g.deadline ? new Date(g.deadline) : null
                  return (
                    <section key={g.id} className="gl-card" style={{ '--gc': g.color || '#3DE29F' }}>
                      <div className="gl-card-top">
                        <button type="button" className="gl-card-edit" onClick={() => setModal({ ...g, deadline: g.deadline ? g.deadline.slice(0,10) : '' })} aria-label={`Editar meta ${g.title}`}>
                          <span className="gl-card-title">{g.title}</span>
                          {dl && <span className="gl-card-sub">Até {MONTHS_SHORT[dl.getUTCMonth()].toLowerCase()} {dl.getUTCFullYear()}</span>}
                        </button>
                        <span className="gl-card-pct">{done ? '✓' : `${pct}%`}</span>
                      </div>
                      <div className="gl-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${g.title}: ${pct}%`}>
                        <div className="gl-bar-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="gl-card-foot">
                        <span className="gl-amounts">R$ {fmt(current)} / R$ {fmt(target)}</span>
                        {done ? (
                          <span className="gl-done">Meta atingida</span>
                        ) : (
                          <button type="button" className="gl-dep" onClick={() => setDepositGoal({ goal: g, amount: String(quick) })}
                            aria-label={`Depositar na meta ${g.title}`}>
                            + R$ {Number.isInteger(quick) ? quick.toLocaleString('pt-BR') : fmt(quick)}
                          </button>
                        )}
                      </div>
                    </section>
                  )
                })}

                <section className="gl-new">
                  <h2 className="gl-new-title">Nova meta</h2>
                  <form onSubmit={e => { e.preventDefault(); handleSave({ ...newGoal, currentAmount: '', color: '#3DE29F', deadline: '' }).then(ok => { if (ok) setNewGoal({ title: '', targetAmount: '' }) }) }} className="gl-new-form">
                    <input className="gl-inp" placeholder="Ex.: Carro novo" maxLength={80}
                      value={newGoal.title} onChange={e => setNewGoal(g => ({ ...g, title: e.target.value }))} />
                    <div className="gl-inp gl-inp-money">
                      <CurrencyInput className="gl-inp-inner" placeholder="Valor alvo (R$)"
                        value={newGoal.targetAmount} onChange={v => setNewGoal(g => ({ ...g, targetAmount: v }))} />
                    </div>
                    <button type="submit" className="gl-create" disabled={saving || !newGoal.title.trim() || !(Number(newGoal.targetAmount) > 0) || atGoalLimit}>
                      {saving ? 'Criando…' : 'Criar meta'}
                    </button>
                    {atGoalLimit && <p className="gl-limit">Você atingiu o limite de metas do seu plano.</p>}
                  </form>
                </section>
              </>
            )}

            {activeTab !== 'metas' && (
            <div className="gl-panel">
            {/* ── Histórico de Gastos (Pro+) ── */}
            {activeTab === 'historico' && (
              <>
                {!isPro ? (
                  <div className="cfg-pro-lock" onClick={() => navigate('/planos')} style={{ cursor:'pointer' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--cp)" strokeWidth="1.5" strokeLinecap="round">
                      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                    </svg>
                    <div className="cfg-pro-lock-title">Recurso Pro</div>
                    <div className="cfg-pro-lock-sub">Veja a evolução mensal de entradas e saídas dos últimos 6 meses</div>
                  </div>
                ) : (
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
                )}

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

            {/* ── Detector de Assinaturas (Elite) ── */}
            {activeTab === 'assinaturas' && (
              !isElite ? (
                <div className="cfg-pro-lock" onClick={() => navigate('/planos')} style={{ cursor:'pointer' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round">
                    <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                  </svg>
                  <div className="cfg-pro-lock-title">Recurso Elite</div>
                  <div className="cfg-pro-lock-sub">Detecte automaticamente assinaturas e gastos recorrentes</div>
                </div>
              ) : (
                <GradCard
                  iconBg="rgba(123,47,255,.1)" iconBorder="rgba(123,47,255,.25)"
                  icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7b2fff" strokeWidth="2" strokeLinecap="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>}
                  title="Gastos recorrentes detectados"
                  sub="Transações que se repetem em meses diferentes"
                >
                  <SubscriptionsList data={subs} loading={loadingSubs} />
                </GradCard>
              )
            )}

            {/* ── Lembretes (Elite) ── */}
            {activeTab === 'lembretes' && (
              !isElite ? (
                <div className="cfg-pro-lock" onClick={() => navigate('/planos')} style={{ cursor:'pointer' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round">
                    <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                  </svg>
                  <div className="cfg-pro-lock-title">Recurso Elite</div>
                  <div className="cfg-pro-lock-sub">Receba lembretes automáticos de contas a vencer</div>
                </div>
              ) : (
                <RemindersCard />
              )
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
            )}
            </div>
          </div>
        </div>
      </div>

      {modal && (
        <GoalForm
          initial={modal}
          onSave={handleSave}
          onCancel={() => setModal(null)}
          onDelete={() => { const id = modal.id; setModal(null); handleDelete(id) }}
          saving={saving}
        />
      )}

      {depositGoal && (
        <DepositModal
          goal={depositGoal.goal}
          initialAmount={depositGoal.amount}
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
