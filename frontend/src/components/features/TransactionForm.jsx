import { useState } from 'react'
import { transactionsAPI } from '../../services/api.js'
import CurrencyInput from '../ui/CurrencyInput.jsx'

const CATEGORIES = [
  { value: 'food',      label: 'Alimentação' },
  { value: 'shopping',  label: 'Shopping'    },
  { value: 'transport', label: 'Transporte'  },
  { value: 'health',    label: 'Saúde'       },
  { value: 'leisure',   label: 'Lazer'       },
  { value: 'education', label: 'Educação'    },
  { value: 'home',      label: 'Casa'        },
  { value: 'other',     label: 'Outros'      },
]

export default function TransactionForm({ onClose, onSuccess }) {
  const [type,    setType]    = useState('expense')
  const [form,    setForm]    = useState({ description: '', amount: '', category: 'food' })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const handleSubmit = async e => {
    e.preventDefault()
    if (!form.amount || form.amount <= 0) {
      setError('Insira um valor válido.')
      return
    }
    setLoading(true)
    setError('')
    try {
      await transactionsAPI.create({
        description: form.description,
        amount:      form.amount,
        type,
        category: type === 'income' ? 'income' : form.category,
      })
      onSuccess()
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao registrar.')
      setLoading(false)
    }
  }

  const isExp = type === 'expense'

  return (
    <div
      className="modal-overlay movl"
      style={{ display: 'flex' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="modal">
        {/* Header */}
        <div className="mhdr">
          <div className="mtitle">
            {isExp ? 'Registrar Gasto' : 'Registrar Entrada'}
          </div>
          <button className="mcls" onClick={onClose}>
            <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
            </svg>
          </button>
        </div>

        {/* Tabs Gasto / Entrada */}
        <div className="mtabs">
          <div
            className={`mtab exp${isExp ? ' on' : ''}`}
            onClick={() => { setType('expense'); setError('') }}
          >
            Gasto
          </div>
          <div
            className={`mtab inc${!isExp ? ' on' : ''}`}
            onClick={() => { setType('income'); setError('') }}
          >
            Entrada
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Input de valor em destaque */}
          <CurrencyInput
            className="amtinp"
            value={form.amount}
            onChange={v => setForm(f => ({ ...f, amount: v }))}
            autoFocus
            style={{ color: isExp ? 'var(--red)' : 'var(--c)' }}
          />

          {/* Categoria (só gastos) */}
          {isExp && (
            <div className="fg">
              <label className="lbl">Categoria</label>
              <select className="inp" name="category" value={form.category} onChange={handleChange}>
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Descrição */}
          <div className="fg">
            <label className="lbl">Descrição (opcional)</label>
            <input
              className="inp"
              name="description"
              type="text"
              placeholder={isExp ? 'Ex: Almoço no restaurante' : 'Ex: Freelance, 13° salário'}
              value={form.description}
              onChange={handleChange}
              maxLength={255}
            />
          </div>

          {error && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(255,71,87,.07)', border: '1px solid rgba(255,71,87,.2)',
              borderRadius: 'var(--rmd)', padding: '10px 14px',
              color: 'var(--red)', fontSize: 13, marginBottom: 14,
            }}>
              {error}
            </div>
          )}

          {/* Ações */}
          <div className="macts">
            <button type="button" className="btn bg" onClick={onClose} style={{ flex: 1, justifyContent: 'center' }}>
              Cancelar
            </button>
            <button
              type="submit"
              className={`btn ${isExp ? 'bd' : 'bp'}`}
              disabled={loading}
              style={{ flex: 2, justifyContent: 'center' }}
            >
              {loading ? (
                <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Salvando...</>
              ) : (
                <>
                  <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                  </svg>
                  {isExp ? 'Registrar Gasto' : 'Registrar Entrada'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
