import { useState, useEffect, useCallback } from 'react'
import { transactionsAPI, budgetAPI } from '../services/api.js'
import Navbar           from '../components/Navbar.jsx'
import DashboardHero    from '../components/DashboardHero.jsx'
import AlertBanner      from '../components/AlertBanner.jsx'
import SpendingChart    from '../components/SpendingChart.jsx'
import TransactionForm  from '../components/TransactionForm.jsx'
import SalaryReminder   from '../components/SalaryReminder.jsx'
import AutoLaunchPrompt from '../components/AutoLaunchPrompt.jsx'
import CategoryLimits   from '../components/CategoryLimits.jsx'
import { CategoryIcon, IconWallet } from '../components/icons.jsx'

const CATEGORY_LABELS = {
  food:'Alimentação', shopping:'Shopping', transport:'Transporte',
  health:'Saúde', leisure:'Lazer', education:'Educação',
  home:'Casa', income:'Entrada Extra', other:'Outros',
}

export default function Dashboard() {
  let user = {}
  try { user = JSON.parse(localStorage.getItem('user') || '{}') } catch { user = {} }
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
        budgetAPI.getLimits(),
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

  const handleDelete = async (id) => {
    if (!window.confirm('Remover esta transação?')) return
    try {
      await transactionsAPI.remove(id)
      fetchData()
    } catch {
      alert('Erro ao remover transação.')
    }
  }

  const chartData = Object.entries(
    transactions
      .filter(t => t.type === 'expense')
      .reduce((acc, t) => {
        acc[t.category] = (acc[t.category] || 0) + t.amount
        return acc
      }, {})
  ).map(([name, value]) => ({
    name:  CATEGORY_LABELS[name] || name,
    value: parseFloat(value.toFixed(2)),
  }))

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh' }}>
      <div style={{ textAlign:'center' }}>
        <div className="spinner" style={{ margin:'0 auto 16px' }} />
        <p style={{ color:'var(--t2)', fontSize:14 }}>Carregando suas finanças...</p>
      </div>
    </div>
  )

  const pct = summary?.percentUsed || 0

  return (
    <>
      <Navbar />

      <div className="page pwnav fade-in">
        {/* Hero */}
        <DashboardHero user={user} summary={summary} onAddTransaction={() => setShowForm(true)} />

        {/* Lembrete salário + auto-launch */}
        <SalaryReminder salary={summary?.salary} />
        <AutoLaunchPrompt autoLaunched={summary?.autoLaunched} onLaunched={() => fetchData()} />

        {/* Alerta de status */}
        {summary && <AlertBanner percent={pct} balance={summary.currentBalance} />}

        {/* Card de saldo */}
        {summary && (
          <div className="bal fu d2">
            <div className="fxb" style={{ marginBottom: 4 }}>
              <div className="ball">Saldo Disponível</div>
              <span className={`bdg baurora`}>{pct}% usado</span>
            </div>
            <div className="balv" style={{ color: summary.currentBalance >= 0 ? 'var(--c)' : 'var(--red)' }}>
              {summary.currentBalance < 0 && '−'}
              R$ {Math.abs(summary.currentBalance).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            <div className="balt">
              <div className="balf" style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
            <div className="balg">
              <span>R$ 0</span>
              <span>R$ {summary.totalAvailable?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        )}

        {/* Gráfico + Transações recentes */}
        <div className="g2 mb16">
          <div className="card fu d3">
            <div className="sct">Gastos por Categoria</div>
            <SpendingChart data={chartData} />
          </div>

          <div className="card fu d4">
            <div className="sct">
              Últimas Transações
              <a href="/transactions" className="scl">Ver todas</a>
            </div>

            {transactions.length === 0 ? (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:160, flexDirection:'column', gap:8, color:'var(--t2)' }}>
                <IconWallet size={32} color="var(--t2)" />
                <span style={{ fontSize:13 }}>Nenhuma transação ainda</span>
              </div>
            ) : (
              <div className="txl">
                {transactions.slice(0, 6).map(t => (
                  <div key={t.id} className="txi">
                    <div className={`txic ${t.type === 'income' ? 'inc' : 'exp'}`}>
                      <CategoryIcon category={t.category} size={16} color={t.type === 'income' ? 'var(--green)' : 'var(--red)'} />
                    </div>
                    <div className="txin">
                      <div className="txd">{t.description || CATEGORY_LABELS[t.category]}</div>
                      <div className="txm">
                        {CATEGORY_LABELS[t.category]} · {new Date(t.date).toLocaleDateString('pt-BR')}
                      </div>
                    </div>
                    <div className={`txv ${t.type === 'income' ? 'inc' : 'exp'}`}>
                      {t.type === 'income' ? '+' : '−'}R$ {t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                    <button className="txrm" onClick={() => handleDelete(t.id)}>
                      <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Limites por categoria */}
        <CategoryLimits limits={limits} transactions={transactions} />
      </div>

      {/* FAB mobile */}
      <button className="fab" onClick={() => setShowForm(true)} aria-label="Registrar transação">
        <svg viewBox="0 0 20 20" fill="currentColor" width="22" height="22">
          <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/>
        </svg>
      </button>

      {showForm && (
        <TransactionForm onClose={() => setShowForm(false)} onSuccess={() => { setShowForm(false); fetchData() }} />
      )}
    </>
  )
}
