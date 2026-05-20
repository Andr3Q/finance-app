import { useState, useEffect, useCallback } from 'react'
import Navbar from '../components/layout/Navbar.jsx'
import { goalsAPI } from '../services/api.js'
import CurrencyInput from '../components/ui/CurrencyInput.jsx'
import DateInput from '../components/ui/DateInput.jsx'
import { getCache, setCache, invalidateCache } from '../services/cache.js'

const CACHE_KEY = 'goals:list'

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

const COLORS = ['#4ac46e','#4f8ef7','#7b2fff','#ff8c42','#ff4757','#ff6b9d']
const fmt = (n) => (n ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : null

const EMPTY_FORM = { title: '', targetAmount: '', currentAmount: '', color: '#4ac46e', deadline: '' }

function GoalForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial || EMPTY_FORM)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  return (
    <div className="gls-modal-overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="gls-modal">
        <div className="gls-modal-head">
          <span>{initial?.id ? 'Editar meta' : 'Nova meta'}</span>
          <button className="gls-modal-close" onClick={onCancel}>
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
          <button className="gls-btn-ghost" onClick={onCancel} disabled={saving}>Cancelar</button>
          <button className="gls-btn-save" onClick={() => onSave(form)} disabled={saving}>
            {saving ? <span className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} /> : null}
            {initial?.id ? 'Salvar alterações' : 'Criar meta'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Goals() {
  const [goals,   setGoals]   = useState([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState(null)   // null | 'new' | goal-object for edit
  const [saving,  setSaving]  = useState(false)
  const [toast,   setToast]   = useState(null)

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  const fetch = useCallback(async (force = false) => {
    if (!force) {
      const cached = getCache(CACHE_KEY)
      if (cached) { setGoals(cached); setLoading(false); return }
    }
    try {
      const { data } = await goalsAPI.list()
      setCache(CACHE_KEY, data, 60_000)
      setGoals(data)
    } catch (err) {
      if (err.response) showToast('Erro ao carregar metas.', false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const handleSave = async (form) => {
    if (!form.title.trim()) return showToast('Informe o nome da meta.', false)
    if (!form.targetAmount || form.targetAmount <= 0) return showToast('Informe um valor-alvo válido.', false)
    setSaving(true)
    try {
      if (modal?.id) {
        await goalsAPI.update(modal.id, form)
        showToast('Meta atualizada!')
      } else {
        await goalsAPI.create(form)
        showToast('Meta criada!')
      }
      setModal(null)
      invalidateCache(CACHE_KEY)
      fetch(true)
    } catch (err) {
      showToast(err.response?.data?.error || 'Erro ao salvar meta.', false)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Remover esta meta?')) return
    try {
      await goalsAPI.remove(id)
      showToast('Meta removida.')
      invalidateCache(CACHE_KEY)
      fetch(true)
    } catch {
      showToast('Erro ao remover meta.', false)
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
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4ac46e" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
                </svg>
              </div>
              <div className="gls-hero-text">
                <div className="cfg-ch-title">Minhas metas</div>
                <div className="cfg-ch-sub">Acompanhe seus objetivos financeiros</div>
              </div>
              <button className="gls-btn-new" onClick={() => setModal('new')}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Nova meta
              </button>
            </div>

            {loading ? (
              <div style={{ display:'flex', justifyContent:'center', padding:'40px 0' }}>
                <span className="spinner" style={{ width: 22, height: 22, borderWidth: 2.5 }} />
              </div>
            ) : goals.length === 0 ? (
              <div className="gls-empty-state">
                <div className="gls-empty-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4ac46e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
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
            ) : (
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
    </>
  )
}
