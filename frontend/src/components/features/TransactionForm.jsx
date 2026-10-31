import { useState } from 'react'
import { createPortal } from 'react-dom'
import { transactionsAPI } from '../../services/api.js'
import { CATEGORY_LABELS } from '../../constants/index.js'
import CurrencyInput from '../ui/CurrencyInput.jsx'
import { CategoryIcon } from '../ui/icons.jsx'
import { useEscapeKey } from '../../hooks/useEscapeKey.js'

// Ordem do design (Alimentação, Transporte, Shopping, Saúde, Contas fixas) e, depois,
// as categorias que o app tem e o design não mostra — nenhuma delas pode sumir da
// escolha, senão não dá mais pra classificar um gasto como Lazer, Educação, Casa ou Outros.
const EXPENSE_CATEGORIES = ['food', 'transport', 'shopping', 'health', 'fixed', 'leisure', 'education', 'home', 'other']

// Converte Date/ISO string → "YYYY-MM-DD" para input[type=date], no fuso de
// Brasília — igual ao nowBrasilia() do backend. .toISOString() usaria UTC,
// que pode ser um dia à frente do dia real em Brasília (ex: 23h58 local já é
// 02h58 UTC do dia seguinte) — ao reabrir pra editar, o campo de data vinha
// errado, e salvar (mesmo só mudando outro campo) movia a transação de mês
// silenciosamente, porque o backend recalcula month/year a partir dessa data.
function toDateInput(val) {
  const d = val ? new Date(val) : new Date()
  if (isNaN(d.getTime())) return ''
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d)
  const get = (type) => parts.find(p => p.type === type).value
  return `${get('year')}-${get('month')}-${get('day')}`
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

  // Esc: com a pergunta "Descartar alterações?" aberta ela é que fecha (continua editando); senão fecha a folha.
  useEscapeKey(() => (showDiscardConfirm ? setShowDiscardConfirm(false) : handleClose()))

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
    // Campo de data vazio/incompleto (o navegador entrega ''): avisa aqui em vez de mandar pro servidor,
    // que responderia com o texto técnico "Use o formato YYYY-MM-DD".
    if (isEdit && !/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
      setError('Informe uma data válida (dd/mm/aaaa).')
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
      className="modal-overlay movl ntx-overlay"
      style={{ display: 'flex' }}
      onClick={e => e.target === e.currentTarget && handleClose()}
    >
      <div className="modal ntx-sheet" role="dialog" aria-modal="true" aria-label={isEdit ? 'Editar transação' : 'Nova transação'}>
        <div className="ntx-handle" aria-hidden="true" />

        <div className="ntx-head">
          <h2 className="ntx-title">{isEdit ? 'Editar transação' : 'Nova transação'}</h2>
          <button type="button" className="ntx-close" onClick={handleClose} aria-label="Fechar">
            <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
            </svg>
          </button>
        </div>

        {/* Saída / Entrada */}
        <div className="ntx-seg" role="group" aria-label="Tipo da transação">
          <button type="button" className={`ntx-seg-btn${isExp ? ' on' : ''}`} aria-pressed={isExp}
            onClick={() => { setType('expense'); setError('') }}>
            Saída
          </button>
          <button type="button" className={`ntx-seg-btn${!isExp ? ' on' : ''}`} aria-pressed={!isExp}
            onClick={() => { setType('income'); setError('') }}>
            Entrada
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Valor em destaque */}
          <div className="ntx-amount-row">
            <span className="ntx-currency">R$</span>
            <CurrencyInput
              className="ntx-amount"
              value={form.amount}
              onChange={v => setForm(f => ({ ...f, amount: v }))}
              autoFocus
            />
          </div>

          <input
            className="ntx-field"
            name="description"
            type="text"
            placeholder={isExp ? 'Descrição (ex.: Mercado)' : 'Descrição (ex.: Salário)'}
            aria-label="Descrição"
            value={form.description}
            onChange={handleChange}
            maxLength={255}
          />

          {/* Categoria (só saídas) */}
          {isExp && (
            <div className="ntx-chips" role="group" aria-label="Categoria">
              {EXPENSE_CATEGORIES.map(value => (
                <button
                  key={value}
                  type="button"
                  className={`ntx-chip${form.category === value ? ' on' : ''}`}
                  aria-pressed={form.category === value}
                  onClick={() => setForm(f => ({ ...f, category: value }))}
                >
                  <CategoryIcon category={value} size={14} color="currentColor" />
                  {CATEGORY_LABELS[value]}
                </button>
              ))}
            </div>
          )}

          {/* Data — só exibida na edição (nova transação é sempre de hoje) */}
          {isEdit && (
            <input
              className="ntx-field"
              name="date"
              type="date"
              aria-label="Data"
              value={form.date}
              onChange={handleChange}
            />
          )}

          {error && <div className="ntx-error" role="alert">{error}</div>}

          <button type="submit" className="ntx-save" disabled={loading}>
            {loading ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Salvar'}
          </button>
        </form>
      </div>
    </div>

    {showDiscardConfirm && createPortal(
      <div className="gls-modal-overlay" onClick={() => setShowDiscardConfirm(false)}>
        <div className="gls-modal" style={{ maxWidth:360 }} role="dialog" aria-modal="true" aria-labelledby="ntx-discard-title" onClick={e => e.stopPropagation()}>
          <div className="gls-modal-head">
            <span id="ntx-discard-title">Descartar alterações?</span>
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
