import { useState, useEffect, useRef } from 'react'
import { transactionsAPI } from '../services/api.js'
import Navbar          from '../components/Navbar.jsx'
import TransactionForm from '../components/TransactionForm.jsx'
import { CategoryIcon } from '../components/icons.jsx'

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
      const res = await transactionsAPI.list()
      setTransactions(res.data)
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

  return (
    <>
      <Navbar />

      {toast && (
        <div className={`toast ${toast.ok ? 'tok' : 'terr'}`} style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 400, whiteSpace: 'nowrap' }}>
          {toast.msg}
        </div>
      )}

      <input
        type="file" accept=".csv" ref={fileInputRef}
        style={{ display: 'none' }} onChange={handleImportCSV}
      />

      <div className="pwnav fade-in">
        <div className="dsb-content">

          {/* ── Cards de resumo ── */}
          <div className="txr-metrics r1">

            <div className="txr-card txr-card-main">
              <div className="txr-card-glow" />
              <div className="txr-card-inner">
                <div className="txr-metric-label">
                  <div className={`txr-dot ${balancePos ? 'green' : 'red'}`} />
                  Saldo do mês
                </div>
                <div className={`txr-metric-value ${balancePos ? '' : 'neg'}`}>
                  R$ {fmt(Math.abs(balance))}
                </div>
                <div className="txr-metric-sub">
                  {balancePos ? '↑ Positivo' : '↓ Negativo'} · {MONTHS[now.getMonth()]}
                </div>
              </div>
            </div>

            <div className="txr-card txr-card-dark">
              <div className="txr-card-inner">
                <div className="txr-metric-label">
                  <div className="txr-dot green" />
                  Total entradas
                </div>
                <div className="txr-metric-value green">R$ {fmt(totalIncome)}</div>
                <div className="txr-metric-sub">
                  {transactions.filter(t => t.type === 'income').length} transações
                </div>
              </div>
            </div>

            <div className="txr-card txr-card-dark">
              <div className="txr-card-inner">
                <div className="txr-metric-label">
                  <div className="txr-dot red" />
                  Total saídas
                </div>
                <div className="txr-metric-value red">R$ {fmt(totalExpenses)}</div>
                <div className="txr-metric-sub">
                  {transactions.filter(t => t.type === 'expense').length} transações
                </div>
              </div>
            </div>

          </div>

          {/* ── Toolbar ── */}
          <div className="txr-toolbar r2">
            <div className="txr-toolbar-left">
              <div className="txr-search-wrap">
                <svg className="txr-search-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  type="text" className="txr-search-input"
                  placeholder="Buscar por descrição, categoria…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {search && (
                  <button className="txr-search-clear" onClick={() => setSearch('')}>×</button>
                )}
              </div>
              <div className="txr-pills">
                {FILTER_PILLS.map(p => (
                  <button
                    key={p.value}
                    className={`txr-pill ${filter === p.value ? 'on' : ''}`}
                    onClick={() => setFilter(p.value)}
                  >
                    <span className="txr-pill-icon">{p.icon}</span>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="txr-toolbar-right">
              <button className="txr-btn txr-btn-ghost" onClick={() => fileInputRef.current?.click()}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <span>Importar CSV</span>
              </button>
              <button className="txr-btn txr-btn-primary" onClick={() => setShowForm(true)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                <span>Nova Transação</span>
              </button>
            </div>
          </div>

          {/* ── Painel de transações ── */}
          <div className="txr-panel r3">

            <div className="txr-panel-head">
              <div>
                <div className="txr-panel-title">Movimentações</div>
                <div className="txr-panel-sub">
                  {filtered.length} transação(ões) em {MONTHS[now.getMonth()]} {now.getFullYear()}
                </div>
              </div>
              <div className="txr-head-chip">{MONTHS[now.getMonth()]} {now.getFullYear()}</div>
            </div>

            <div className="txr-table-hdr">
              <div />
              <div className="txr-th">Descrição</div>
              <div className="txr-th txr-hide-sm">Categoria</div>
              <div className="txr-th txr-hide-sm">Data</div>
              <div className="txr-th txr-th-right">Valor</div>
              <div />
            </div>

            {loading ? (
              <div className="txr-empty">
                <div className="dsb-loader-ring" style={{ margin: '0 auto' }} />
              </div>
            ) : filtered.length === 0 ? (
              <div className="txr-empty">
                <div className="txr-empty-ico">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4ac46e" strokeWidth="1.5" strokeLinecap="round">
                    <rect x="2" y="3" width="20" height="14" rx="2"/>
                    <line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                  </svg>
                </div>
                <div className="txr-empty-title">Nenhuma transação</div>
                <div className="txr-empty-sub">
                  {search || filter !== 'all'
                    ? 'Tente ajustar os filtros de busca.'
                    : 'Registre sua primeira transação do mês.'}
                </div>
                {!search && filter === 'all' && (
                  <button className="txr-btn txr-btn-primary" style={{ marginTop: 16 }} onClick={() => setShowForm(true)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    <span>Nova Transação</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="txr-list">
                {filtered.map((t, i) => {
                  const isInc    = t.type === 'income'
                  const catLabel = CATEGORY_LABELS[t.category] || t.category
                  const desc     = t.description || catLabel
                  const isFixed  = desc.toLowerCase().includes('[fixa]')
                  return (
                    <div key={t.id} className="txr-row" style={{ animationDelay: `${i * 0.04}s` }}>
                      <div className={`txr-stripe ${isInc ? 'inc' : 'exp'}`} />
                      <div className={`txr-ico ${isInc ? 'inc' : 'exp'}`}>
                        <CategoryIcon category={t.category} size={14} color={isInc ? '#4ac46e' : 'rgba(255,255,255,.38)'} />
                      </div>
                      <div className="txr-row-info">
                        <div className="txr-row-name">{desc}</div>
                        <div className="txr-row-meta">
                          {isFixed ? 'Conta fixa' : isInc ? 'Entrada' : 'Despesa variável'}
                        </div>
                      </div>
                      <div className="txr-row-cat txr-hide-sm">
                        <span className={`txr-tag ${isInc ? 'inc' : isFixed ? 'fix' : 'exp'}`}>{catLabel}</span>
                      </div>
                      <div className="txr-row-date txr-hide-sm">
                        {new Date(t.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </div>
                      <div className="txr-row-val-wrap">
                        <div className={`txr-row-val ${isInc ? 'inc' : 'exp'}`}>
                          {isInc ? '+' : '−'}R$ {fmt(t.amount)}
                        </div>
                        <span className={`txr-type-badge ${isFixed ? 'fix' : isInc ? 'inc' : 'exp'}`}>
                          {isFixed ? 'Fixo' : isInc ? 'Receita' : 'Variável'}
                        </span>
                      </div>
                      <div className="txr-row-actions">
                        <button className="txr-del-btn" title="Excluir" onClick={() => handleDelete(t.id)}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                            <path d="M10 11v6M14 11v6"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {!loading && filtered.length > 0 && (
              <div className="txr-footer">
                <span>{filtered.length} registro(s) · {MONTHS[now.getMonth()]} {now.getFullYear()}</span>
                <span className="txr-footer-totals">
                  Entradas: <strong style={{ color: '#4ac46e' }}>R$ {fmt(totalIncome)}</strong>
                  &nbsp;·&nbsp;
                  Saídas: <strong style={{ color: '#ff4757' }}>R$ {fmt(totalExpenses)}</strong>
                </span>
              </div>
            )}

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
