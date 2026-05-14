import { useState, useEffect, useRef } from 'react'
import { transactionsAPI } from '../services/api.js'
import Navbar from '../components/layout/Navbar.jsx'
import TransactionForm from '../components/features/TransactionForm.jsx'
import { CategoryIcon } from '../components/ui/icons.jsx'

const CATEGORY_LABELS = {
  food:'Alimentação', shopping:'Shopping', transport:'Transporte',
  health:'Saúde', leisure:'Lazer', education:'Educação',
  home:'Casa', income:'Entrada Extra', other:'Outros',
}
const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

const fmt = (n) => n?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) ?? '0,00'

export default function Transactions() {
  const [transactions, setTransactions] = useState([])
  const [loading,      setLoading]      = useState(true)
  const [showForm,     setShowForm]     = useState(false)
  const [filter,       setFilter]       = useState('all')
  const [search,       setSearch]       = useState('')
  const [toast,        setToast]        = useState(null)
  const fileInputRef                    = useRef(null)
  const now                             = new Date()

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  const fetchTransactions = async () => {
    try {
      const res = await transactionsAPI.list({ limit: 200 })
      setTransactions(res.data.data ?? res.data)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchTransactions() }, [])

  const handleImportCSV = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    try {
      setLoading(true)
      const res = await transactionsAPI.importCSV(formData)
      showToast(res.data.message)
      fetchTransactions()
    } catch (err) {
      showToast(err.response?.data?.error || 'Erro ao importar CSV.', false)
      setLoading(false)
    }
    e.target.value = null
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Remover esta transação?')) return
    try {
      await transactionsAPI.remove(id)
      fetchTransactions()
    } catch { showToast('Erro ao remover.', false) }
  }

  const totalExpenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const totalIncome   = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const balance       = totalIncome - totalExpenses
  const balancePos    = balance >= 0

  const filtered = transactions.filter(t => {
    const desc = (t.description || CATEGORY_LABELS[t.category] || '').toLowerCase()
    const cat  = (CATEGORY_LABELS[t.category] || '').toLowerCase()
    const matchSearch = !search || desc.includes(search.toLowerCase()) || cat.includes(search.toLowerCase())
    const matchFilter =
      filter === 'all'     ? true :
      filter === 'expense' ? t.type === 'expense' :
      filter === 'income'  ? t.type === 'income'  :
      filter === 'fixed'   ? (t.description || '').toLowerCase().includes('[fixa]') :
      true
    return matchSearch && matchFilter
  })

  const FILTER_PILLS = [
    { value: 'all',     label: 'Todas',    icon: '◈' },
    { value: 'income',  label: 'Entradas', icon: '↑' },
    { value: 'expense', label: 'Saídas',   icon: '↓' },
    { value: 'fixed',   label: 'Fixas',    icon: '⊞' },
  ]

  // Agrupa por data para o feed
  const grouped = (() => {
    const todayMs = new Date().setHours(0,0,0,0)
    const yestMs  = todayMs - 86400000
    const map     = new Map()
    filtered.forEach(t => {
      const dMs = new Date(t.date).setHours(0,0,0,0)
      const key = dMs === todayMs ? 'Hoje'
        : dMs === yestMs ? 'Ontem'
        : new Date(t.date).toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'short' })
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(t)
    })
    return [...map.entries()]
  })()

  return (
    <>
      <Navbar />

      {toast && (
        <div className={`toast ${toast.ok ? 'tok' : 'terr'}`} style={{ position:'fixed', top:16, left:'50%', transform:'translateX(-50%)', zIndex:400, whiteSpace:'nowrap' }}>
          {toast.msg}
        </div>
      )}

      <input type="file" accept=".csv" ref={fileInputRef} style={{ display:'none' }} onChange={handleImportCSV} />

      <div className="pwnav fade-in">
        <div className="tx1-page">

          {/* ── Hero card ── */}
          <div className="tx1-hero">
            <div className="tx1-hero-glow" />
            <div className="tx1-hero-glow tx1-hero-glow2" />
            <div className="grad-particles" aria-hidden="true">
              {[4,12,22,33,44,55,65,76,85,93].map((left, i) => (
                <span key={i} className="grad-particle" style={{
                  left:`${left}%`,
                  width: `${2 + (i % 3)}px`,
                  height: `${2 + (i % 3)}px`,
                  animationDelay: `${(i * 0.55) % 3}s`,
                  animationDuration: `${2.2 + (i % 4) * 0.6}s`,
                  opacity: 0.3 + (i % 3) * 0.15,
                }} />
              ))}
            </div>
            <div className="tx1-hero-left">
              <div className="tx1-hero-label">{MONTHS[now.getMonth()]} {now.getFullYear()}</div>
              <div className="tx1-hero-balance" style={{ color: balancePos ? 'var(--t1)' : '#ff6b6b' }}>
                {balancePos ? '' : '−'}R$ {fmt(Math.abs(balance))}
              </div>
              <div className="tx1-hero-sub">saldo do mês</div>
              <span className="tx1-hero-badge" style={{ background: balancePos ? 'rgba(74,196,110,.15)' : 'rgba(255,71,87,.12)', color: balancePos ? '#4ac46e' : '#ff4757', border: `1px solid ${balancePos ? 'rgba(74,196,110,.25)' : 'rgba(255,71,87,.2)'}` }}>
                {balancePos ? '↑ Positivo' : '↓ Negativo'}
              </span>
            </div>
            <div className="tx1-hero-stats">
              <div className="tx1-hero-stat">
                <div className="tx1-stat-ico" style={{ background:'rgba(74,196,110,.12)' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4ac46e" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
                  </svg>
                </div>
                <div>
                  <div className="tx1-stat-lbl">Entradas</div>
                  <div className="tx1-stat-val" style={{ color:'#4ac46e' }}>R$ {fmt(totalIncome)}</div>
                </div>
              </div>
              <div className="tx1-hero-stat">
                <div className="tx1-stat-ico" style={{ background:'rgba(255,107,107,.1)' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ff6b6b" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
                  </svg>
                </div>
                <div>
                  <div className="tx1-stat-lbl">Saídas</div>
                  <div className="tx1-stat-val" style={{ color:'#ff6b6b' }}>R$ {fmt(totalExpenses)}</div>
                </div>
              </div>
              <div className="tx1-hero-stat">
                <div className="tx1-stat-ico" style={{ background:'rgba(255,255,255,.06)' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="2.5" strokeLinecap="round">
                    <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                  </svg>
                </div>
                <div>
                  <div className="tx1-stat-lbl">Transações</div>
                  <div className="tx1-stat-val">{transactions.length}</div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Toolbar ── */}
          <div className="tx1-toolbar">
            <div className="tx1-search-wrap">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink:0, color:'rgba(255,255,255,.3)' }}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                className="tx1-search"
                placeholder="Buscar descrição ou categoria…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && <button className="tx1-search-clear" onClick={() => setSearch('')}>×</button>}
            </div>
            <div className="tx1-pills">
              {FILTER_PILLS.map(p => (
                <button key={p.value} className={`tx1-pill${filter === p.value ? ' on' : ''}`} onClick={() => setFilter(p.value)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Lista agrupada ── */}
          <div className="tx1-list-card">
            {loading ? (
              <div className="tx1-empty"><div className="dsb-loader-ring" style={{ margin:'0 auto' }} /></div>
            ) : filtered.length === 0 ? (
              <div className="tx1-empty">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(74,196,110,.4)" strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom:12 }}>
                  <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                </svg>
                <div style={{ fontSize:14, fontWeight:600, color:'rgba(255,255,255,.4)', marginBottom:4 }}>Nenhuma transação encontrada</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,.2)' }}>{search || filter !== 'all' ? 'Ajuste os filtros de busca.' : 'Registre sua primeira transação.'}</div>
              </div>
            ) : (
              <>
                {grouped.map(([dateLabel, txs]) => (
                  <div key={dateLabel}>
                    <div className="tx1-date-label">{dateLabel}</div>
                    {txs.map(t => {
                      const isInc    = t.type === 'income'
                      const catLabel = CATEGORY_LABELS[t.category] || t.category
                      const desc     = t.description || catLabel
                      const isFixed  = desc.toLowerCase().includes('[fixa]')
                      return (
                        <div key={t.id} className="tx1-row">
                          <div className={`tx1-row-ico ${isInc ? 'inc' : 'exp'}`}>
                            <CategoryIcon category={t.category} size={14} color="currentColor" />
                          </div>
                          <div className="tx1-row-info">
                            <div className="tx1-row-name">{desc}</div>
                            <div className="tx1-row-meta">
                              <span className={`tx1-tag ${isInc ? 'inc' : isFixed ? 'fix' : 'exp'}`}>{catLabel}</span>
                              <span className="tx1-row-type">{isFixed ? 'Fixa' : isInc ? 'Entrada' : 'Variável'}</span>
                            </div>
                          </div>
                          <div className="tx1-row-right">
                            <div className={`tx1-row-val ${isInc ? 'inc' : 'exp'}`}>{isInc ? '+' : '−'}R$ {fmt(t.amount)}</div>
                            <div className="tx1-row-date">{new Date(t.date).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})}</div>
                          </div>
                          <button className="tx1-del" onClick={() => handleDelete(t.id)} title="Remover">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                              <polyline points="3 6 5 6 21 6"/>
                              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                              <path d="M10 11v6M14 11v6"/>
                            </svg>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                ))}
                <div className="tx1-footer">
                  <span>{filtered.length} transação(ões)</span>
                  <span>
                    Entradas: <strong style={{ color:'#4ac46e' }}>R$ {fmt(totalIncome)}</strong>
                    &nbsp;·&nbsp;
                    Saídas: <strong style={{ color:'#ff4757' }}>R$ {fmt(totalExpenses)}</strong>
                  </span>
                </div>
              </>
            )}
          </div>

          {/* ── Ações ── */}
          <div className="tx1-toolbar-actions">
            <button className="tx1-btn-ghost" onClick={() => fileInputRef.current?.click()}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              Importar CSV
            </button>
            <button className="tx1-btn-primary" onClick={() => setShowForm(true)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Nova Transação
            </button>
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
          onSuccess={() => { setShowForm(false); fetchTransactions() }}
        />
      )}
    </>
  )
}
