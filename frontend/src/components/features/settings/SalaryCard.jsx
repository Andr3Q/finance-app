import { useState, useEffect } from 'react'
import { budgetAPI } from '../../../services/api.js'
import { saveUser } from '../../../hooks/useUser.js'
import { invalidateCache } from '../../../services/cache.js'
import CurrencyInput from '../../ui/CurrencyInput.jsx'
import { WalletGlyph } from '../../ui/NancyGlyphs.jsx'

export default function SalaryCard({ user, onMessage }) {
  const [salary, setSalary] = useState(user.salary || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (user.salary != null) setSalary(user.salary)
  }, [user.salary])

  const handleSave = async (e) => {
    e.preventDefault()
    // Campo vazio não é "salário zero": sem valor não salva (antes zerava o salário calado e ainda dizia "sucesso").
    if (!(Number(salary) > 0)) {
      onMessage('Informe o valor do salário para salvar.', 'error')
      return
    }
    setSaving(true)
    try {
      await budgetAPI.updateSalary(salary)
      const stored = JSON.parse(sessionStorage.getItem('user') || '{}')
      saveUser({ ...stored, salary })
      invalidateCache('dashboard')
      window.dispatchEvent(new CustomEvent('budget-updated'))
      onMessage('Salário atualizado com sucesso!')
    } catch (err) {
      onMessage(err.response?.data?.error || 'Erro ao salvar salário.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="fin-card">
      <div className="fin-head">
        <span className="fin-ico">
          <WalletGlyph />
        </span>
        <div className="fin-head-text">
          <h2 className="fin-title">Salário mensal</h2>
          <p className="fin-sub">Usado para calcular seu saldo disponível</p>
        </div>
      </div>
      <form onSubmit={handleSave} className="fin-salary-row">
        <div className="fin-field">
          <span className="fin-prefix">R$</span>
          <CurrencyInput className="fin-inp" value={salary} onChange={setSalary} placeholder="0,00" ariaLabel="Salário mensal" />
        </div>
        <button type="submit" className="fin-btn" disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </form>
    </section>
  )
}
