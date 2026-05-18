import { useState, useEffect } from 'react'
import { budgetAPI } from '../../../services/api.js'

export default function RemindersCard() {
  const [budgets, setBudgets] = useState([])

  useEffect(() => {
    budgetAPI.list().then(r => setBudgets(r.data)).catch(() => {})
  }, [])

  const today    = new Date().getDate()
  const upcoming = budgets
    .filter(b => b.dueDay)
    .map(b => {
      const daysLeft = b.dueDay >= today ? b.dueDay - today : 31 - today + b.dueDay
      return { ...b, daysLeft }
    })
    .sort((a, b) => a.daysLeft - b.daysLeft)

  if (!upcoming.length) return null

  const urgencyColor = (d) => d <= 2 ? '#ff4757' : d <= 5 ? '#ff8c42' : '#4ac46e'

  return (
    <div className="cfg-card">
      <div className="cfg-card-head">
        <div className="cfg-ch-ico">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ffc107" strokeWidth="2" strokeLinecap="round">
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
          </svg>
        </div>
        <div>
          <div className="cfg-ch-title">Próximos vencimentos</div>
          <div className="cfg-ch-sub">Contas com dia de vencimento cadastrado</div>
        </div>
      </div>
      <div className="cfg-card-body">
        <div className="rmdr-list">
          {upcoming.map(b => (
            <div key={b.id} className="rmdr-item">
              <div className="rmdr-dot" style={{ background: urgencyColor(b.daysLeft) }} />
              <span className="rmdr-name">{b.name}</span>
              <span className="rmdr-val">R$ {b.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              <span className="rmdr-day" style={{ color: urgencyColor(b.daysLeft) }}>
                {b.daysLeft === 0 ? 'Hoje' : b.daysLeft === 1 ? 'Amanhã' : `Dia ${b.dueDay}`}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
