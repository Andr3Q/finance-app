import { useState } from 'react'
import { createPortal } from 'react-dom'
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
  { value: 'fixed',     label: 'Conta Fixa'  },
  { value: 'other',     label: 'Outros'      },
]

// Converte Date/ISO string → "YYYY-MM-DD" para input[type=date]
function toDateInput(val) {
  if (!val) return new Date().toISOString().slice(0, 10)
  try { return new Date(val).toISOString().slice(0, 10) } catch { return '' }
}

export default function TransactionForm({ onClose, onSuccess, initialData, editingId }) {
  const isEdit = !!editingId

  const [type,    setType]    = useState(initialData?.type || 'expense')
  const [form,    setForm]    = useState({
    description: initialData?.description || '',
    amount:      initialData?.amount      || '',
    category:    initialData?.category    || 'food',
    date:        toDateInput(initialData?.date),
  })
  const [loading,            setLoading]            = useState(false)
  const [error,              setError]              = useState('')
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)

  const isDirty = isEdit
    ? String(form.amount)   !== String(initialData?.amount || '') ||
      form.description      !== (initialData?.description  || '') ||
      form.category         !== (initialData?.category     || 'food') ||
      form.date             !== toDateInput(initialData?.date)
    : form.amount !== '' || form.description.trim() !== ''

  const handleClose = () => isDirty ? setShowDiscardConfirm(true) : onClose()

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const handleSubmit = async e => {
    e.preventDefault()
    if (!form.amount || form.amount <= 0) {
      setError('Insira um valor válido.')
      return
    }
    if (parseFloat(form.amount) > 99999999) {
      setError('O valor máximo permitido por transação é de R$ 99.999.999,00.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const payload = {
        description: form.description,
        amount:      form.amount,
        type,
        category: type === 'income' ? 'income' : form.category,
      }
      if (isEdit) {
        payload.date = form.date
        await transactionsAPI.update(editingId, payload)
      } else {
        await transactionsAPI.create(payload)
      }
      onSuccess()
    } catch (err) {
      setError(err.response?.data?.error || (isEdit ? 'Erro ao atualizar.' : 'Erro ao registrar.'))
      setLoading(false)
    }
  }

  const isExp = type === 'expense'

  return (
    <>
    <div
      className="modal-overlay movl"
      style={{ display: 'flex' }}
      onClick={e => e.target === e.currentTarget && handleClose()}
    >
      <div className="modal">
        {/* Header */}
        <div className="mhdr">
          <div className="mtitle">
            {isEdit ? 'Editar Transação' : isExp ? 'Registrar Gasto' : 'Registrar Entrada'}
          </div>
          <button className="mcls" onClick={handleClose}>
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

          {/* Data — só exibida na edição */}
          {isEdit && (
            <div className="fg">
              <label className="lbl">Data</label>
              <input
                className="inp"
                name="date"
                type="date"
                value={form.date}
                onChange={handleChange}
              />
            </div>
          )}

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
                  {isEdit ? 'Salvar alterações' : isExp ? 'Registrar Gasto' : 'Registrar Entrada'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>

    {showDiscardConfirm && createPortal(
      <div className="gls-modal-overlay" onClick={() => setShowDiscardConfirm(false)}>
        <div className="gls-modal" style={{ maxWidth:360 }} onClick={e => e.stopPropagation()}>
          <div className="gls-modal-head">
            <span>Descartar alterações?</span>
            <button className="gls-modal-close" onClick={() => setShowDiscardConfirm(false)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div className="gls-modal-body" style={{ textAlign:'center', paddingTop:8 }}>
            <div style={{ width:48, height:48, borderRadius:12, background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.2)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <div style={{ fontWeight:700, fontSize:15, color:'var(--t1)', marginBottom:8 }}>Os dados preenchidos serão perdidos.</div>
          </div>
          <div className="gls-modal-foot">
            <button className="gls-btn-ghost" onClick={() => setShowDiscardConfirm(false)}>Continuar editando</button>
            <button className="gls-btn-save" style={{ background:'#ef4444' }} onClick={onClose}>Descartar</button>
          </div>
        </div>
      </div>,
      document.body
    )}
    </>
  )
}
