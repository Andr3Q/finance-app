// ═══════════════════════════════════════════════════════
// 🏠 src/pages/Dashboard.jsx — Painel Principal
// ═══════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react'
import { transactionsAPI, budgetAPI } from '../services/api.js'
import Navbar            from '../components/Navbar.jsx'
import AlertBanner       from '../components/AlertBanner.jsx'
import SpendingChart     from '../components/SpendingChart.jsx'
import TransactionForm   from '../components/TransactionForm.jsx'
import SalaryReminder    from '../components/SalaryReminder.jsx'
import AutoLaunchPrompt  from '../components/AutoLaunchPrompt.jsx'
import CategoryLimits    from '../components/CategoryLimits.jsx'

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

const CATEGORY_ICONS = {
  food:'🍔', shopping:'🛍️', transport:'🚗', health:'💊',
  leisure:'🎮', education:'📚', home:'🏠', income:'💰', other:'📦'
}
const CATEGORY_LABELS = {
  food:'Alimentação', shopping:'Shopping', transport:'Transporte',
  health:'Saúde', leisure:'Lazer', education:'Educação',
  home:'Casa', income:'Entrada Extra', other:'Outros'
}

export default function Dashboard() {
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const [summary,      setSummary]      = useState(null)
  const [transactions, setTransactions] = useState([])
  const [limits,       setLimits]       = useState([])
  const [loading,      setLoading]      = useState(true)
  const [showForm,     setShowForm]     = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [sumRes, txRes, limRes] = await Promise.all([
        transactionsAPI.summary(),
        transactionsAPI.list(),
        budgetAPI.getLimits()
      ])
      setSummary(sumRes.data)
      setTransactions(txRes.data)
      setLimits(limRes.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleTransactionAdded = () => { setShowForm(false); fetchData() }

  const handleDelete = async (id) => {
    if (!window.confirm('Remover esta transação?')) return
    try {
      await transactionsAPI.remove(id)
      fetchData()
    } catch (err) { alert('Erro ao remover transação.') }
  }

  // Agrupa transações por categoria para o gráfico
  const chartData = Object.entries(
    transactions
      .filter(t => t.type === 'expense')
      .reduce((acc, t) => {
        acc[t.category] = (acc[t.category] || 0) + t.amount
        return acc
      }, {})
  ).map(([name, value]) => ({
    name:  CATEGORY_LABELS[name] || name,
    value: parseFloat(value.toFixed(2))
  }))

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div className="spinner" style={{ margin: '0 auto 16px' }} />
        <p className="text-muted">Carregando suas finanças...</p>
      </div>
    </div>
  )

  const now = new Date()
  const pct = summary?.percentUsed || 0
  const statusColor = pct < 50 ? '#00d084' : pct < 70 ? '#4f8ef7' : pct < 90 ? '#ffc107' : pct < 100 ? '#ff8c42' : '#ff4757'

  return (
    <>
      <Navbar />
      <div className="page page-with-nav fade-in">

        {/* Cabeçalho */}
        <div className="flex-between mb-24">
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800 }}>
              Olá, {user.name?.split(' ')[0]} 👋
            </h1>
            <p className="text-muted" style={{ fontSize: 13, marginTop: 4 }}>
              {MONTHS[now.getMonth()]} de {now.getFullYear()}
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            ＋ Registrar Gasto
          </button>
        </div>

        {/* Lembrete de salário (5° dia útil) */}
        <SalaryReminder salary={summary?.salary} />

        {/* Prompt de lançamento automático de contas fixas */}
        <AutoLaunchPrompt
          autoLaunched={summary?.autoLaunched}
          onLaunched={(msg) => { fetchData() }}
        />

        {/* Alerta de status */}
        {summary && <AlertBanner percent={pct} balance={summary.currentBalance} />}

        {/* Card principal de saldo */}
        {summary && (
          <div className="card mb-16" style={{
            background: 'linear-gradient(135deg, rgba(0,208,132,0.08), rgba(79,142,247,0.05))',
            border: '1px solid rgba(0,208,132,0.2)', padding: 32, marginBottom: 20
          }}>
            <p className="label">Saldo Disponível</p>
            <div className="flex-between" style={{ marginTop: 8, flexWrap: 'wrap', gap: 12 }}>
              <span style={{
                fontSize: 48, fontWeight: 800,
                color: summary.currentBalance >= 0 ? 'var(--color-green)' : 'var(--color-red)'
              }}>
                R$ {Math.abs(summary.currentBalance).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                {summary.currentBalance < 0 && <span style={{ fontSize: 20, marginLeft: 8, color: 'var(--color-red)' }}>negativo</span>}
              </span>
              <span className={`badge badge-${pct < 50 ? 'green' : pct < 70 ? 'blue' : pct < 90 ? 'yellow' : pct < 100 ? 'orange' : 'red'}`}
                style={{ fontSize: 13, padding: '6px 14px' }}>
                {pct}% usado
              </span>
            </div>

            {/* Barra de progresso */}
            <div style={{
              marginTop: 20, height: 8, background: 'rgba(255,255,255,0.08)',
              borderRadius: 4, overflow: 'hidden'
            }}>
              <div style={{
                height: '100%', width: `${Math.min(pct, 100)}%`,
                background: statusColor, borderRadius: 4,
                transition: 'width 0.8s ease, background 0.3s'
              }} />
            </div>
            <div className="flex-between mt-8">
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>R$ 0</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                R$ {summary.totalAvailable.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        )}

        {/* Cards de resumo */}
        {summary && (
          <div className="grid-4 mb-24" style={{ marginBottom: 24 }}>
            {[
              { label: 'Salário',       value: summary.salary,         icon: '💰', color: '#4f8ef7' },
              { label: 'Contas Fixas',  value: summary.totalFixedCosts, icon: '📋', color: '#ff8c42' },
              { label: 'Gasto no Mês',  value: summary.totalExpenses,   icon: '🛍️', color: '#ff4757' },
              { label: 'Disponível',    value: summary.totalAvailable,  icon: '✅', color: '#00d084' }
            ].map(({ label, value, icon, color }) => (
              <div key={label} className="card" style={{ padding: '20px 24px' }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
                <p className="label">{label}</p>
                <p style={{ fontSize: 20, fontWeight: 700, color, marginTop: 4 }}>
                  R$ {value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Gráfico + Transações recentes */}
        <div className="grid-2">
          {/* Gráfico de categorias */}
          <div className="card">
            <h3 style={{ fontWeight: 700, marginBottom: 20 }}>📊 Gastos por Categoria</h3>
            {chartData.length > 0
              ? <SpendingChart data={chartData} />
              : <div className="flex-center" style={{ height: 200, color: 'var(--text-muted)', flexDirection: 'column', gap: 8 }}>
                  <span style={{ fontSize: 32 }}>📭</span>
                  <span>Nenhum gasto registrado ainda</span>
                </div>
            }
          </div>

          {/* Últimas transações */}
          <div className="card">
            <div className="flex-between mb-16">
              <h3 style={{ fontWeight: 700 }}>🕐 Últimas Transações</h3>
              <a href="/transactions" style={{ fontSize: 13, color: 'var(--color-green)', textDecoration: 'none' }}>
                Ver todas →
              </a>
            </div>

            {transactions.length === 0 ? (
              <div className="flex-center" style={{ height: 160, color: 'var(--text-muted)', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 32 }}>💳</span>
                <span>Nenhuma transação ainda</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {transactions.slice(0, 6).map(t => (
                  <div key={t.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                    background: 'rgba(255,255,255,0.03)', borderRadius: 10,
                    border: '1px solid var(--border)'
                  }}>
                    <span style={{ fontSize: 20 }}>{CATEGORY_ICONS[t.category] || '📦'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.description || CATEGORY_LABELS[t.category]}
                      </p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {new Date(t.date).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontWeight: 700, color: t.type === 'income' ? 'var(--color-green)' : 'var(--color-red)', fontSize: 14 }}>
                        {t.type === 'income' ? '+' : '-'} R$ {t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                      <button onClick={() => handleDelete(t.id)} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-muted)', fontSize: 11, padding: 0, marginTop: 2
                      }}>✕ remover</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Limites por Categoria */}
        <CategoryLimits limits={limits} transactions={transactions} />

      </div>

      {/* Modal de registrar transação */}
      {showForm && (
        <TransactionForm
          onClose={() => setShowForm(false)}
          onSuccess={handleTransactionAdded}
        />
      )}
    </>
  )
}
