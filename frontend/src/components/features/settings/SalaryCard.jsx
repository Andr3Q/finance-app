import { useState } from 'react'
import { budgetAPI } from '../../services/api.js'
import { saveUser } from '../../hooks/useUser.js'

export default function SalaryCard({ user, onMessage }) {
  const [salary,        setSalary]        = useState(user.salary || 0)
  const [salaryDisplay, setSalaryDisplay] = useState(
    user.salary > 0 ? user.salary.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : ''
  )
  const [saving, setSaving] = useState(false)

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await budgetAPI.updateSalary(salary)
      const stored = JSON.parse(localStorage.getItem('user') || '{}')
      saveUser({ ...stored, salary })
      onMessage('Salário atualizado com sucesso!')
    } catch {
      onMessage('Erro ao salvar salário.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="cfg-card r5">
      <div className="cfg-card-head">
        <div className="cfg-ch-ico">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ac46e" strokeWidth="2" strokeLinecap="round">
            <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
          </svg>
        </div>
        <div>
          <div className="cfg-ch-title">Salário mensal</div>
          <div className="cfg-ch-sub">Usado para calcular seu saldo disponível</div>
        </div>
      </div>
      <form onSubmit={handleSave} className="cfg-card-body">
        <div className="cfg-inp-group">
          <span className="cfg-inp-prefix">R$</span>
          <input
            className="cfg-inp cfg-inp-prefixed"
            type="text"
            inputMode="decimal"
            value={salaryDisplay}
            placeholder="0,00"
            onChange={e => {
              const raw = e.target.value.replace(/[^0-9,]/g, '')
              setSalaryDisplay(raw)
              setSalary(parseFloat(raw.replace(',', '.')) || 0)
            }}
            onBlur={() => {
              if (salary > 0) setSalaryDisplay(salary.toLocaleString('pt-BR', { minimumFractionDigits: 2 }))
              else setSalaryDisplay('')
            }}
          />
          <button type="submit" className="cfg-btn-primary" disabled={saving} style={{ flexShrink: 0 }}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  )
}
