import { useState, useEffect } from 'react'
import { budgetAPI } from '../../../services/api.js'
import { invalidateCache } from '../../../services/cache.js'
import CurrencyInput from '../../ui/CurrencyInput.jsx'

function notifyBudgetChanged() {
  invalidateCache('dashboard')
  window.dispatchEvent(new CustomEvent('budget-updated'))
}

const CATEGORIES = [
  { key: 'food',      label: 'Alimentação' },
  { key: 'shopping',  label: 'Shopping'    },
  { key: 'transport', label: 'Transporte'  },
  { key: 'health',    label: 'Saúde'       },
  { key: 'leisure',   label: 'Lazer'       },
  { key: 'education', label: 'Educação'    },
  { key: 'home',      label: 'Casa'        },
  { key: 'other',     label: 'Outros'      },
]

export default function CategoryLimitsCard({ isPro, onMessage, onUpgrade }) {
  const [limits,    setLimits]    = useState([])
  const [newLimit,  setNewLimit]  = useState({ category: 'food', amount: '' })

  const fetchLimits = async () => {
    try {
      const res = await budgetAPI.getLimits()
      setLimits(Array.isArray(res.data) ? res.data : [])
    } catch {
      onMessage('Erro ao carregar limites por categoria.', 'error')
    }
  }

  useEffect(() => { fetchLimits() }, [])

  const handleSave = async (e) => {
    e.preventDefault()
    if (!newLimit.amount) return
    try {
      await budgetAPI.setLimit({ category: newLimit.category, amount: newLimit.amount })
      setNewLimit(p => ({ ...p, amount: '' }))
      fetchLimits()
      notifyBudgetChanged()
      onMessage('Limite salvo!')
    } catch (err) {
      onMessage(err.response?.data?.error || 'Erro ao salvar limite.', 'error')
    }
  }

  const handleRemove = async (category) => {
    try {
      await budgetAPI.removeLimit(category)
      fetchLimits()
      notifyBudgetChanged()
    } catch {
      onMessage('Erro ao remover limite.', 'error')
    }
  }

  return (
    <div className="cfg-card r9">
      <div className="cfg-card-head">
        <div className="cfg-ch-ico">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ac46e" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
          </svg>
        </div>
        <div>
          <div className="cfg-ch-title">
            Limites por categoria
            {!isPro && <span className="cfg-pro-badge">PRO</span>}
          </div>
          <div className="cfg-ch-sub">Defina teto de gasto por categoria</div>
        </div>
      </div>
      <div className="cfg-card-body">
        {!isPro ? (
          <div className="cfg-pro-lock" onClick={() => onUpgrade('Limites por categoria são exclusivos do plano Pro.')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4ac46e" strokeWidth="1.5" strokeLinecap="round">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
            <div className="cfg-pro-lock-title">Recurso Pro</div>
            <div className="cfg-pro-lock-sub">Clique para fazer upgrade e desbloquear</div>
          </div>
        ) : (
          <>
            {limits.length === 0 ? (
              <div className="cfg-empty-hint">Nenhum limite definido.</div>
            ) : (
              <div className="cfg-fixed-list">
                {limits.map(l => {
                  const cat = CATEGORIES.find(c => c.key === l.category)
                  return (
                    <div key={l.category} className="cfg-fixed-item">
                      <span className="cfg-fixed-name">{cat?.label || l.category}</span>
                      <div className="cfg-fixed-right">
                        <span className="cfg-fixed-val">R$ {l.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        <button className="cfg-del-btn" type="button" onClick={() => handleRemove(l.category)} aria-label="Remover">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <form onSubmit={handleSave} className="cfg-add-row">
              <select className="cfg-inp" value={newLimit.category}
                onChange={e => setNewLimit(p => ({ ...p, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
              <CurrencyInput className="cfg-inp cfg-inp-num" placeholder="R$ limite"
                value={newLimit.amount}
                onChange={v => setNewLimit(p => ({ ...p, amount: v }))} />
              <button type="submit" className="cfg-btn-ghost">Salvar</button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
