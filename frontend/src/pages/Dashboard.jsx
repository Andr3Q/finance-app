import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { transactionsAPI } from '../services/api.js'
import { getCache, setCache, invalidateCache } from '../services/cache.js'
import Navbar           from '../components/Navbar.jsx'
import TransactionForm  from '../components/TransactionForm.jsx'
import SalaryReminder   from '../components/SalaryReminder.jsx'
import AutoLaunchPrompt from '../components/AutoLaunchPrompt.jsx'
import { CategoryIcon } from '../components/icons.jsx'

const CATEGORY_LABELS = {
  food:'Alimentação', shopping:'Shopping', transport:'Transporte',
  health:'Saúde', leisure:'Lazer', education:'Educação',
  home:'Casa', income:'Entrada Extra', other:'Outros',
}

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

const fmt     = (n) => n?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) ?? '0,00'
const fmtShort= (n) => {
  if (!n && n !== 0) return '0'
  if (Math.abs(n) >= 1000) return `${(n/1000).toFixed(1)}k`
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 0 })
}

export default function Dashboard() {
  const navigate = useNavigate()
  let user = {}
  try { user = JSON.parse(localStorage.getItem('user') || '{}') } catch { user = {} }

  const [summary,      setSummary]      = useState(null)
  const [transactions, setTransactions] = useState([])
  const [loading,      setLoading]      = useState(true)
  const [showForm,     setShowForm]     = useState(false)
  const [toast,        setToast]        = useState(null)

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  const fetchData = useCallback(async (invalidate = false) => {
    if (invalidate) invalidateCache('dashboard')
    const cached = getCache('dashboard')
    if (cached) {
      setSummary(cached.summary)
      setTransactions(cached.transactions)
      setLoading(false)
    }
    try {
      const { data } = await transactionsAPI.dashboard()
      setSummary(data.summary)
      setTransactions(data.transactions)
      setCache('dashboard', data)
    } catch (err) {
      console.error(err)
      if (!cached) showToast('Erro ao carregar dados.', false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

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
  const isPro      = user.plan === 'pro'
  const now        = new Date()

  const healthLabel =
    pct === 0  ? 'Sem gastos' :
    pct < 50   ? 'Saudável'   :
    pct < 70   ? 'Normal'     :
    pct < 90   ? 'Atenção'    :
    pct < 100  ? 'Crítico'    : 'No limite'

  const healthColor =
    pct < 50  ? '#4ac46e' :
    pct < 70  ? '#ffc107' :
    pct < 90  ? '#ff8c42' : '#ff4757'

  // Últimas transações para o painel
  const recentTx = useMemo(() => transactions.slice(0, 5), [transactions])

  // Gastos por categoria
  const byCategory = useMemo(() => {
    const map = {}
    transactions.filter(t => t.type === 'expense').forEach(t => {
      map[t.category] = (map[t.category] || 0) + Number(t.amount)
    })
    return Object.entries(map)
      .map(([cat, val]) => ({ cat, val, label: CATEGORY_LABELS[cat] || cat }))
      .sort((a, b) => b.val - a.val)
      .slice(0, 4)
  }, [transactions])

  const totalExpenses = summary?.totalExpenses || 0

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh' }}>
      <div style={{ textAlign:'center' }}>
        <div className="dsb-loader">
          <div className="dsb-loader-ring" />
        </div>
        <p style={{ color:'var(--t2)', fontSize:13, marginTop:16, fontFamily:'var(--fb)' }}>Carregando suas finanças…</p>
      </div>
    </div>
  )

  return (
    <>
      <Navbar />

      {toast && (
        <div className={`toast ${toast.ok ? 'tok' : 'terr'}`} style={{ position:'fixed', top:16, left:'50%', transform:'translateX(-50%)', zIndex:400, whiteSpace:'nowrap' }}>
          {toast.msg}
        </div>
      )}

      <div className="pwnav fade-in">
        <SalaryReminder salary={summary?.salary} />
        <AutoLaunchPrompt autoLaunched={summary?.autoLaunched} onLaunched={() => fetchData()} />

        <div className="dsb-content">

          {/* ══════════════════════════════════
              LINHA 1 — Cards de métricas hero
          ══════════════════════════════════ */}
          <div className="dsh-metrics r1">

            {/* Card principal — Saldo */}
            <div className="dsh-card dsh-card-main">
              <div className="dsh-card-glow" />
              <div className="dsh-card-grid-lines" />
              <div className="dsh-card-inner">
                <div className="dsh-metric-label">
                  <div className="dsh-metric-label-dot dsh-dot-green" />
                  Saldo Disponível
                </div>
                <div className="dsh-metric-value dsh-value-xl">
                  R$ {fmt(summary?.currentBalance)}
                </div>
                <div className="dsh-metric-row">
                  <span className="dsh-badge dsh-badge-green">↑ {pct}% usado</span>
                  <span className="dsh-badge dsh-badge-muted">{MONTHS[now.getMonth()]} {now.getFullYear()}</span>
                </div>
                {/* Barra de progresso */}
                <div className="dsh-prog-wrap">
                  <div className="dsh-prog-labels">
                    <span>Orçamento — {pct}% usado</span>
                    <span className="dsh-prog-max">R$ {fmt(summary?.totalAvailable)} total</span>
                  </div>
                  <div className="dsh-prog-track">
                    <div
                      className="dsh-prog-fill"
                      style={{ width: `${Math.min(pct, 100)}%`, background: healthColor }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Card salário */}
            <div className="dsh-card dsh-card-dark">
              <div className="dsh-card-inner">
                <div className="dsh-metric-label">
                  <div className="dsh-metric-label-dot dsh-dot-muted" />
                  Salário
                </div>
                <div className="dsh-metric-value">R$ {fmt(summary?.salary)}</div>
                <div className="dsh-metric-row">
                  <span className="dsh-badge dsh-badge-muted">Mês atual</span>
                </div>
                <div className="dsh-card-foot">
                  <span className="dsh-foot-lbl">Entrada fixa</span>
                  <span className="dsh-foot-ico dsh-foot-ico-salary">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
                    </svg>
                  </span>
                </div>
              </div>
            </div>

            {/* Card gastos */}
            <div className="dsh-card dsh-card-dark">
              <div className="dsh-card-inner">
                <div className="dsh-metric-label">
                  <div className="dsh-metric-label-dot dsh-dot-red" />
                  Total Gasto
                </div>
                <div className="dsh-metric-value dsh-value-expense">R$ {fmt(summary?.totalExpenses)}</div>
                <div className="dsh-metric-row">
                  <span className="dsh-badge dsh-badge-muted">{pct}% do orçamento</span>
                </div>
                <div className="dsh-card-foot">
                  <span className="dsh-foot-lbl" style={{ color: healthColor }}>{healthLabel}</span>
                  <span className="dsh-foot-ico dsh-foot-ico-expense">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M6 2 3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
                      <line x1="3" y1="6" x2="21" y2="6"/>
                      <path d="M16 10a4 4 0 01-8 0"/>
                    </svg>
                  </span>
                </div>
              </div>
            </div>

          </div>

          {/* ══════════════════════════════════
              LINHA 2 — Grid principal
          ══════════════════════════════════ */}
          <div className="dsh-main-grid r2">

            {/* ── COLUNA ESQUERDA ── */}
            <div className="dsh-left-col">

              {/* Ações rápidas */}
              <div className="dsh-actions-card">
                <div className="dsh-actions-row">
                  <button className="dsh-act-btn dsh-act-primary" onClick={() => setShowForm(true)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    Nova Transação
                  </button>
                  <button className="dsh-act-btn dsh-act-ghost" onClick={() => navigate('/transactions')}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <rect x="2" y="3" width="20" height="14" rx="2"/>
                    </svg>
                    Ver Transações
                  </button>
                  <button className="dsh-act-btn dsh-act-ghost" onClick={() => navigate('/settings')}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <circle cx="12" cy="12" r="3"/>
                      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33"/>
                    </svg>
                    Configurações
                  </button>
                </div>
              </div>

              {/* Gastos por categoria */}
              <div className="dsh-panel">
                <div className="dsh-panel-head">
                  <div>
                    <div className="dsh-panel-title">Gastos por categoria</div>
                    <div className="dsh-panel-sub">{MONTHS[now.getMonth()]} {now.getFullYear()}</div>
                  </div>
                  <button className="dsh-panel-link" onClick={() => navigate('/transactions')}>Ver detalhes →</button>
                </div>
                <div className="dsh-panel-body">
                  {byCategory.length === 0 ? (
                    <div className="dsh-cat-empty">Nenhum gasto registrado ainda</div>
                  ) : (
                    byCategory.map(({ cat, val, label }) => {
                      const pctCat = totalExpenses > 0 ? Math.round((val / totalExpenses) * 100) : 0
                      return (
                        <div key={cat} className="dsh-cat-item">
                          <div className="dsh-cat-ico">
                            <CategoryIcon category={cat} size={14} color="rgba(255,255,255,.5)" />
                          </div>
                          <div className="dsh-cat-info">
                            <div className="dsh-cat-row">
                              <span className="dsh-cat-name">{label}</span>
                              <span className="dsh-cat-val">R$ {fmt(val)}</span>
                            </div>
                            <div className="dsh-cat-track">
                              <div className="dsh-cat-fill" style={{ width: `${pctCat}%` }} />
                            </div>
                          </div>
                          <span className="dsh-cat-pct">{pctCat}%</span>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

            </div>

            {/* ── COLUNA DIREITA ── */}
            <div className="dsh-right-col">

              {/* Saldo e orçamento */}
              <div className="dsh-panel">
                <div className="dsh-panel-head">
                  <div>
                    <div className="dsh-panel-title">Saldo e orçamento</div>
                    <div className="dsh-panel-sub">Mês atual</div>
                  </div>
                  <span className="dsh-health-badge" style={{ background: `${healthColor}18`, border: `1px solid ${healthColor}40`, color: healthColor }}>
                    {healthLabel}
                  </span>
                </div>
                <div className="dsh-panel-body">
                  {summary && (
                    <div className="dsh-bal-wrap">
                      {/* Hero saldo */}
                      <div className="dsh-bal-hero">
                        <div className="dsh-bal-glow" />
                        <div className="dsh-bal-hdr">
                          <span className="dsh-bal-lbl">Saldo disponível</span>
                          <span className="dsh-sh-chip" style={{ color: healthColor }}>{pct}% usado</span>
                        </div>
                        <div className="dsh-bal-val" style={{ color: summary.currentBalance < 0 ? '#ff4757' : '#fff' }}>
                          R$ {fmt(Math.abs(summary.currentBalance))}
                        </div>
                        <div className="dsh-bal-track">
                          <div className="dsh-bal-fill" style={{ width: `${Math.min(pct, 100)}%`, background: healthColor }} />
                        </div>
                        <div className="dsh-bal-range">
                          <span>R$ 0</span>
                          <span>R$ {fmt(summary.totalAvailable)}</span>
                        </div>
                      </div>
                      {/* Stats */}
                      <div className="dsh-qs">
                        <div className="dsh-qs-item">
                          <div className="dsh-qs-lbl">Salário</div>
                          <div className="dsh-qs-val">{fmt(summary.salary)}</div>
                        </div>
                        <div className="dsh-qs-sep" />
                        <div className="dsh-qs-item">
                          <div className="dsh-qs-lbl">Gastos</div>
                          <div className="dsh-qs-val" style={{ color: '#ff4757' }}>{fmt(summary.totalExpenses)}</div>
                        </div>
                        <div className="dsh-qs-sep" />
                        <div className="dsh-qs-item">
                          <div className="dsh-qs-lbl">Saldo</div>
                          <div className="dsh-qs-val" style={{ color: summary.currentBalance >= 0 ? '#4ac46e' : '#ff4757' }}>
                            {fmt(Math.abs(summary.currentBalance))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Últimas transações */}
              <div className="dsh-panel">
                <div className="dsh-panel-head">
                  <div>
                    <div className="dsh-panel-title">Últimas transações</div>
                    <div className="dsh-panel-sub">{transactions.length} este mês</div>
                  </div>
                  <button className="dsh-panel-link" onClick={() => navigate('/transactions')}>Ver todas →</button>
                </div>
                <div className="dsh-tx-list">
                  {recentTx.length === 0 ? (
                    <div className="dsh-tx-empty">Nenhuma transação ainda</div>
                  ) : (
                    recentTx.map((t, i) => {
                      const isInc = t.type === 'income'
                      const desc = t.description || CATEGORY_LABELS[t.category] || t.category
                      return (
                        <div key={t.id} className="dsh-tx-row" style={{ animationDelay: `${i * 0.06}s` }}>
                          <div className={`dsh-tx-stripe ${isInc ? 'inc' : 'exp'}`} />
                          <div className={`dsh-tx-ico ${isInc ? 'inc' : 'exp'}`}>
                            <CategoryIcon category={t.category} size={14} color={isInc ? '#4ac46e' : 'rgba(255,255,255,.4)'} />
                          </div>
                          <div className="dsh-tx-info">
                            <div className="dsh-tx-name">{desc}</div>
                            <div className="dsh-tx-meta">
                              {CATEGORY_LABELS[t.category]} · {new Date(t.date).toLocaleDateString('pt-BR', { day:'2-digit', month:'short' })}
                            </div>
                          </div>
                          <div className="dsh-tx-right">
                            <div className={`dsh-tx-val ${isInc ? 'inc' : 'exp'}`}>
                              {isInc ? '+' : '−'}R$ {fmt(t.amount)}
                            </div>
                            <button className="dsh-tx-del" onClick={() => handleDelete(t.id)} title="Remover">
                              <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
                              </svg>
                            </button>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              {/* Upgrade card — apenas free */}
              {!isPro && (
                <div className="dsh-upgrade-card" onClick={() => navigate('/planos')} role="button" tabIndex={0}>
                  <div className="dsh-upg-glow" />
                  <div className="dsh-upg-ico">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                    </svg>
                  </div>
                  <div className="dsh-upg-content">
                    <div className="dsh-upg-title">Upgrade para Pro</div>
                    <div className="dsh-upg-sub">Transações ilimitadas · PDF · CSV · Limites por categoria</div>
                  </div>
                  <div className="dsh-upg-arrow">›</div>
                </div>
              )}

            </div>
          </div>

        </div>
      </div>

      {/* FAB mobile */}
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
