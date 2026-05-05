import { useState, useEffect, useRef } from 'react'
import { transactionsAPI } from '../services/api.js'
import Navbar           from '../components/Navbar.jsx'
import TransactionForm  from '../components/TransactionForm.jsx'
import { CategoryIcon, IconEmpty } from '../components/icons.jsx'

const CATEGORY_LABELS = { food:'Alimentação', shopping:'Shopping', transport:'Transporte', health:'Saúde', leisure:'Lazer', education:'Educação', home:'Casa', income:'Entrada Extra', other:'Outros' }
const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

export default function Transactions() {
  const [transactions, setTransactions] = useState([])
  const [loading,      setLoading]      = useState(true)
  const [showForm,     setShowForm]     = useState(false)
  const [filter,       setFilter]       = useState('all')
  const [toast,        setToast]        = useState(null) // { msg, ok }
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

  const filtered      = transactions.filter(t => filter === 'all' || t.type === filter)
  const totalExpenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const totalIncome   = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)

  return (
    <>
      <Navbar />
      {toast && (
        <div className={`toast ${toast.ok ? 'tok' : 'terr'}`}>
          {toast.msg}
        </div>
      )}
      <div className="page pwnav fade-in">

        {/* Cabeçalho */}
        <div className="pgh">
          <div>
            <div className="pgt">Transações do Mês</div>
            <div className="pgs">{transactions.length} transação(ões) em {MONTHS[now.getMonth()]}</div>
          </div>
          <div className="pgh-acts">
            <input type="file" accept=".csv" ref={fileInputRef} style={{ display: 'none' }} onChange={handleImportCSV} />
            <button className="btn bg" onClick={() => fileInputRef.current?.click()}>
              <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd"/>
              </svg>
              Importar CSV
            </button>
            <button className="btn bp" onClick={() => setShowForm(true)}>
              <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/>
              </svg>
              Nova Transação
            </button>
          </div>
        </div>

        {/* Totais */}
        <div className="g2 mb16">
          <div className="card" style={{ borderColor: 'rgba(255,71,87,.15)' }}>
            <div className="lbl">Total de Gastos</div>
            <div style={{ fontFamily: 'var(--fn)', fontSize: 26, fontWeight: 700, color: 'var(--red)', marginTop: 4, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.5px' }}>
              −R$ {totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="card" style={{ borderColor: 'rgba(0,255,204,.18)' }}>
            <div className="lbl">Total de Entradas</div>
            <div style={{ fontFamily: 'var(--fn)', fontSize: 26, fontWeight: 700, color: 'var(--c)', marginTop: 4, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.5px' }}>
              +R$ {totalIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* Chips filtro */}
        <div className="chips">
          {[
            { value: 'all',     label: 'Todas'    },
            { value: 'expense', label: 'Gastos'   },
            { value: 'income',  label: 'Entradas' },
          ].map(f => (
            <div key={f.value} className={`chip${filter === f.value ? ' on' : ''}`} onClick={() => setFilter(f.value)}>
              {f.label}
            </div>
          ))}
        </div>

        {/* Lista */}
        <div className="card" style={{ padding: 0 }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
              <div className="spinner" />
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, flexDirection: 'column', gap: 12, color: 'var(--t2)' }}>
              <IconEmpty size={40} color="var(--t3)" />
              <span style={{ fontSize: 13 }}>Nenhuma transação encontrada</span>
            </div>
          ) : (
            <div style={{ padding: '0 8px' }}>
              {filtered.map((t) => (
                <div key={t.id} className="txi" style={{ padding: '14px 12px' }}>
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

      {/* FAB mobile */}
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
