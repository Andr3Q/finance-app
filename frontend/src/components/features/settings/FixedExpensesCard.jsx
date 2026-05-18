import { useState, useEffect } from 'react'
import { budgetAPI } from '../../../services/api.js'
import CurrencyInput from '../../ui/CurrencyInput.jsx'

export default function FixedExpensesCard({ onMessage }) {
  const [budgets,   setBudgets]   = useState([])
  const [newBudget, setNewBudget] = useState({ name: '', amount: '', dueDay: '' })

  const fetchBudgets = async () => {
    try {
      const res = await budgetAPI.list()
      setBudgets(res.data)
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => { fetchBudgets() }, [])

  const totalFixed = budgets.reduce((s, b) => s + b.amount, 0)

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!newBudget.name || !newBudget.amount) return
    try {
      await budgetAPI.create({ name: newBudget.name, amount: newBudget.amount, dueDay: newBudget.dueDay ? parseInt(newBudget.dueDay) : undefined })
      setNewBudget({ name: '', amount: '', dueDay: '' })
      fetchBudgets()
      onMessage('Conta fixa adicionada!')
    } catch {
      onMessage('Erro ao adicionar conta fixa.', 'error')
    }
  }

  const handleDelete = async (id) => {
    try {
      await budgetAPI.remove(id)
      fetchBudgets()
    } catch (err) {
      onMessage(err.response?.data?.error || 'Erro ao remover.', 'error')
    }
  }

  return (
    <div className="cfg-card r6">
      <div className="cfg-card-head">
        <div className="cfg-ch-ico">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ac46e" strokeWidth="2" strokeLinecap="round">
            <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
        </div>
        <div>
          <div className="cfg-ch-title">Contas fixas</div>
          <div className="cfg-ch-sub">Despesas recorrentes mensais</div>
        </div>
      </div>
      <div className="cfg-card-body">
        {budgets.length === 0 ? (
          <div className="cfg-empty-hint">Nenhuma conta fixa cadastrada.</div>
        ) : (
          <div className="cfg-fixed-list">
            {budgets.map(b => (
              <div key={b.id} className="cfg-fixed-item">
                <span className="cfg-fixed-name">{b.name}</span>
                <div className="cfg-fixed-right">
                  <span className="cfg-fixed-val">R$ {b.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  {b.dueDay ? <span className="cfg-fixed-due">dia {b.dueDay}</span> : null}
                  <button className="cfg-del-btn" type="button" onClick={() => handleDelete(b.id)} aria-label="Remover">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              </div>
            ))}
            <div className="cfg-fixed-total">
              <span>Total mensal</span>
              <span>R$ {totalFixed.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        )}
        <form onSubmit={handleAdd} className="cfg-add-row">
          <input className="cfg-inp" type="text" placeholder="Nome da conta"
            value={newBudget.name} onChange={e => setNewBudget(p => ({ ...p, name: e.target.value }))} />
          <CurrencyInput className="cfg-inp cfg-inp-num" placeholder="Valor"
            value={newBudget.amount}
            onChange={v => setNewBudget(p => ({ ...p, amount: v }))} />
          <input className="cfg-inp cfg-inp-num" type="number" placeholder="Dia venc." min="1" max="31"
            value={newBudget.dueDay}
            onChange={e => setNewBudget(p => ({ ...p, dueDay: e.target.value }))} />
          <button type="submit" className="cfg-btn-ghost">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Adicionar
          </button>
        </form>
      </div>
    </div>
  )
}
