// ─── src/components/TransactionForm.jsx ────────────────
// Modal para registrar novo gasto ou entrada de dinheiro

import { useState } from 'react'
import { transactionsAPI } from '../services/api.js'

const CATEGORIES = [
  { value: 'food',      label: '🍔 Alimentação' },
  { value: 'shopping',  label: '🛍️ Shopping'    },
  { value: 'transport', label: '🚗 Transporte'   },
  { value: 'health',    label: '💊 Saúde'        },
  { value: 'leisure',   label: '🎮 Lazer'        },
  { value: 'education', label: '📚 Educação'     },
  { value: 'home',      label: '🏠 Casa'         },
  { value: 'other',     label: '📦 Outros'       }
]

export default function TransactionForm({ onClose, onSuccess }) {
  const [form,    setForm]    = useState({ description: '', amount: '', type: 'expense', category: 'food' })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const handleSubmit = async e => {
    e.preventDefault()
    if (!form.amount || parseFloat(form.amount) <= 0) {
      setError('Insira um valor válido.')
      return
    }
    setLoading(true)
    try {
      await transactionsAPI.create({
        ...form,
        amount: parseFloat(form.amount),
        // Entrada de dinheiro usa categoria "income", gastos usam a selecionada
        category: form.type === 'income' ? 'income' : form.category
      })
      onSuccess()
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao registrar.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="flex-between mb-24">
          <h2 style={{ fontWeight: 800, fontSize: 20 }}>
            {form.type === 'expense' ? '🛍️ Registrar Gasto' : '💰 Registrar Entrada'}
          </h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--text-muted)',
            fontSize: 20, cursor: 'pointer', lineHeight: 1
          }}>✕</button>
        </div>

        {/* Tipo: Gasto ou Entrada */}
        <div style={{
          display: 'flex', gap: 4, background: 'rgba(255,255,255,0.04)',
          borderRadius: 12, padding: 4, marginBottom: 20
        }}>
          {[
            { value: 'expense', label: '🛍️ Gasto'   },
            { value: 'income',  label: '💰 Entrada'  }
          ].map(t => (
            <button key={t.value} onClick={() => setForm(f => ({ ...f, type: t.value }))} style={{
              flex: 1, padding: '10px', border: 'none', borderRadius: 10, cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 14, fontWeight: 600, transition: 'all 0.2s',
              background: form.type === t.value
                ? (t.value === 'expense' ? 'rgba(255,71,87,0.15)' : 'rgba(0,208,132,0.15)')
                : 'transparent',
              color: form.type === t.value
                ? (t.value === 'expense' ? 'var(--color-red)' : 'var(--color-green)')
                : 'var(--text-secondary)'
            }}>
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Valor */}
          <div>
            <label className="label">Valor (R$)</label>
            <input className="input" name="amount" type="number" placeholder="0,00"
              min="0.01" step="0.01" value={form.amount} onChange={handleChange}
              autoFocus required style={{ fontSize: 20, fontWeight: 700 }} />
          </div>

          {/* Categoria (só para gastos) */}
          {form.type === 'expense' && (
            <div>
              <label className="label">Categoria</label>
              <select className="input" name="category" value={form.category} onChange={handleChange}>
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Descrição */}
          <div>
            <label className="label">Descrição <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none' }}>(opcional)</span></label>
            <input className="input" name="description" placeholder={
              form.type === 'expense' ? 'Ex: Almoço no shopping, Uber...' : 'Ex: Freelance, 13° salário...'
            } value={form.description} onChange={handleChange} />
          </div>

          {error && (
            <p style={{ color: 'var(--color-red)', fontSize: 13 }}>⚠️ {error}</p>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ flex: 2, justifyContent: 'center' }}>
              {loading
                ? <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Salvando...</>
                : form.type === 'expense' ? '✅ Registrar Gasto' : '✅ Registrar Entrada'
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
