// ═══════════════════════════════════════════════════════
// 📋 src/pages/Transactions.jsx — Histórico de Transações
// ═══════════════════════════════════════════════════════

import { useState, useEffect, useRef } from 'react'
import { transactionsAPI }     from '../services/api.js'
import Navbar          from '../components/Navbar.jsx'
import TransactionForm from '../components/TransactionForm.jsx'

const CATEGORY_ICONS  = { food:'🍔', shopping:'🛍️', transport:'🚗', health:'💊', leisure:'🎮', education:'📚', home:'🏠', income:'💰', other:'📦' }
const CATEGORY_LABELS = { food:'Alimentação', shopping:'Shopping', transport:'Transporte', health:'Saúde', leisure:'Lazer', education:'Educação', home:'Casa', income:'Entrada Extra', other:'Outros' }

export default function Transactions() {
  const [transactions, setTransactions] = useState([])
  const [loading,      setLoading]      = useState(true)
  const [showForm,     setShowForm]     = useState(false)
  const [filter,       setFilter]       = useState('all') // all | expense | income
  const fileInputRef                    = useRef(null)

  const handleImportCSV = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    const formData = new FormData()
    formData.append('file', file)

    try {
      setLoading(true)
      const res = await transactionsAPI.importCSV(formData)
      alert(res.data.message)
      fetchTransactions()
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao importar arquivo CSV.')
      setLoading(false)
    }
    e.target.value = null
  }

  const fetchTransactions = async () => {
    try {
      const res = await transactionsAPI.list()
      setTransactions(res.data)
    } catch (err) { console.error(err) }
    finally      { setLoading(false) }
  }

  useEffect(() => { fetchTransactions() }, [])

  const handleDelete = async (id) => {
    if (!window.confirm('Remover esta transação?')) return
    try {
      await transactionsAPI.remove(id)
      fetchTransactions()
    } catch (err) { alert('Erro ao remover.') }
  }

  const filtered = transactions.filter(t => filter === 'all' || t.type === filter)
  const totalExpenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const totalIncome   = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)

  return (
    <>
      <Navbar />
      <div className="page page-with-nav fade-in">
        <div className="flex-between mb-24">
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800 }}>💳 Transações do Mês</h1>
            <p className="text-muted" style={{ fontSize: 13, marginTop: 4 }}>
              {transactions.length} transação(ões) registrada(s)
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <input 
              type="file" 
              accept=".csv" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              onChange={handleImportCSV} 
            />
            <button className="btn" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} onClick={() => fileInputRef.current?.click()}>
              🏦 Importar CSV
            </button>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              ＋ Nova Transação
            </button>
          </div>
        </div>

        {/* Totais rápidos */}
        <div className="grid-2 mb-24" style={{ marginBottom: 24 }}>
          <div className="card" style={{ padding: '20px 24px', borderColor: 'rgba(255,71,87,0.2)' }}>
            <p className="label">Total de Gastos</p>
            <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--color-red)', marginTop: 4 }}>
              - R$ {totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="card" style={{ padding: '20px 24px', borderColor: 'rgba(0,208,132,0.2)' }}>
            <p className="label">Total de Entradas</p>
            <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--color-green)', marginTop: 4 }}>
              + R$ {totalIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
          {[
            { value: 'all',     label: '📋 Todas' },
            { value: 'expense', label: '🛍️ Gastos' },
            { value: 'income',  label: '💰 Entradas' }
          ].map(f => (
            <button key={f.value} onClick={() => setFilter(f.value)} style={{
              padding: '8px 18px', border: '1px solid',
              borderColor: filter === f.value ? 'var(--color-green)' : 'var(--border)',
              borderRadius: 20, background: filter === f.value ? 'rgba(0,208,132,0.1)' : 'var(--bg-card)',
              color: filter === f.value ? 'var(--color-green)' : 'var(--text-secondary)',
              cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, transition: 'all 0.2s'
            }}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Lista de transações */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div className="flex-center" style={{ padding: 60 }}>
              <div className="spinner" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex-center" style={{ padding: 60, flexDirection: 'column', gap: 12 }}>
              <span style={{ fontSize: 40 }}>📭</span>
              <p className="text-muted">Nenhuma transação encontrada</p>
            </div>
          ) : filtered.map((t, i) => (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', gap: 16, padding: '16px 24px',
              borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
              transition: 'background 0.2s'
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {/* Ícone da categoria */}
              <div style={{
                width: 44, height: 44, borderRadius: 12, fontSize: 20,
                background: t.type === 'income' ? 'rgba(0,208,132,0.12)' : 'rgba(255,71,87,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                {CATEGORY_ICONS[t.category] || '📦'}
              </div>

              {/* Info */}
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 600, fontSize: 14 }}>
                  {t.description || CATEGORY_LABELS[t.category] || t.category}
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {CATEGORY_LABELS[t.category]} • {new Date(t.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>

              {/* Valor */}
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontWeight: 800, fontSize: 16, color: t.type === 'income' ? 'var(--color-green)' : 'var(--color-red)' }}>
                  {t.type === 'income' ? '+' : '-'} R$ {t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
                <button onClick={() => handleDelete(t.id)} style={{
                  background: 'none', border: 'none', color: 'var(--text-muted)',
                  cursor: 'pointer', fontSize: 12, padding: '2px 0', marginTop: 2,
                  fontFamily: 'inherit', transition: 'color 0.2s'
                }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--color-red)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                >
                  ✕ remover
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showForm && (
        <TransactionForm
          onClose={() => setShowForm(false)}
          onSuccess={() => { setShowForm(false); fetchTransactions() }}
        />
      )}
    </>
  )
}
