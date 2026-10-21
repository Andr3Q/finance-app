import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { budgetAPI, transactionsAPI } from '../../../services/api.js'
import { invalidateCache } from '../../../services/cache.js'
import { useUser } from '../../../hooks/useUser.js'
import CurrencyInput from '../../ui/CurrencyInput.jsx'
import { analytics } from '../../../services/analytics.js'
import PlanUsageBanner from '../../ui/PlanUsageBanner.jsx'

function notifyBudgetChanged() {
  invalidateCache('dashboard')
  window.dispatchEvent(new CustomEvent('budget-updated'))
}

export default function FixedExpensesCard({ onMessage, onUpgrade }) {
  const user = useUser()
  const [budgets,    setBudgets]    = useState([])
  const [newBudget,  setNewBudget]  = useState({ name: '', amount: '', dueDay: '', endDate: { dd: '', mm: '', aaaa: '' }, hasEndDate: false })
  const refDD   = useRef(null)
  const refMM   = useRef(null)
  const refAAAA = useRef(null)
  const [submitting, setSubmitting] = useState(false)
  const [launching,  setLaunching]  = useState(false)
  const [payingId,   setPayingId]   = useState(null)
  const [endDateErr,      setEndDateErr]      = useState('')
  const [dueDayErr,       setDueDayErr]       = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)

  const fetchBudgets = async () => {
    try {
      const res = await budgetAPI.list()
      setBudgets(Array.isArray(res.data) ? res.data : [])
    } catch {
      onMessage('Erro ao carregar contas fixas.', 'error')
    }
  }

  useEffect(() => { fetchBudgets() }, [])

  const totalFixed  = budgets.reduce((s, b) => s + b.amount, 0)
  const unpaidCount = budgets.filter(b => !b.paidThisMonth).length

  const handleAdd = async (e) => {
    e.preventDefault()
    if (submitting) return
    if (!newBudget.name || !newBudget.amount) {
      onMessage('Preencha o nome e o valor da conta fixa.', 'error')
      return
    }
    if (newBudget.dueDay !== '') {
      const day = parseInt(newBudget.dueDay, 10)
      if (isNaN(day) || day < 1 || day > 31) {
        setDueDayErr('O dia de vencimento deve ser um número entre 1 e 31.')
        return
      }
    }
    setDueDayErr('')
    const { dd, mm, aaaa } = newBudget.endDate
    let endDateISO = undefined
    if (newBudget.hasEndDate && (dd || mm || aaaa)) {
      if (dd.length !== 2 || mm.length !== 2 || aaaa.length !== 4) {
        setEndDateErr('Por favor, insira uma data válida.')
        return
      }
      const parsed = new Date(`${aaaa}-${mm}-${dd}`)
      if (isNaN(parsed) || parsed.getUTCMonth() + 1 !== parseInt(mm, 10) || parsed.getUTCDate() !== parseInt(dd, 10)) {
        setEndDateErr('Por favor, insira uma data válida.')
        return
      }
      endDateISO = `${aaaa}-${mm}-${dd}`
    }
    setEndDateErr('')

    setSubmitting(true)
    try {
      await budgetAPI.create({
        name:    newBudget.name,
        amount:  newBudget.amount,
        dueDay:  newBudget.dueDay ? parseInt(newBudget.dueDay) : undefined,
        endDate: endDateISO || undefined,
      })

      // A conta nasce "pendente" — usar "Marcar como paga" nela ou o botão de
      // lançar as pendentes, igual a qualquer outra conta fixa.
      setNewBudget({ name: '', amount: '', dueDay: '', endDate: { dd: '', mm: '', aaaa: '' }, hasEndDate: false })
      fetchBudgets()
      notifyBudgetChanged()
      onMessage('Conta fixa adicionada!')
    } catch (err) {
      if (err.response?.data?.limitReached) {
        analytics.track('limit_reached', { feature: 'budgets' })
        onUpgrade?.('Você atingiu o limite de 15 contas fixas do plano Gratuito. Faça upgrade para adicionar contas ilimitadas.')
      } else {
        onMessage(err.response?.data?.error || 'Erro ao adicionar conta fixa.', 'error')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleLaunch = async () => {
    setLaunching(true)
    try {
      const { data } = await transactionsAPI.autoLaunch()
      if (data.alreadyLaunched) {
        onMessage('Todas as contas fixas já foram pagas este mês.', 'success')
      } else {
        onMessage(`✓ ${data.count} ${data.count === 1 ? 'conta fixa lançada' : 'contas fixas lançadas'} como transações!`)
      }
      fetchBudgets()
      notifyBudgetChanged()
    } catch (err) {
      onMessage(err.response?.data?.error || 'Erro ao lançar contas fixas.', 'error')
    } finally {
      setLaunching(false)
    }
  }

  const handlePay = async (budget) => {
    setPayingId(budget.id)
    try {
      await budgetAPI.pay(budget.id)
      onMessage(`${budget.name} marcada como paga!`)
      fetchBudgets()
      notifyBudgetChanged()
    } catch (err) {
      onMessage(err.response?.data?.error || 'Erro ao marcar conta como paga.', 'error')
    } finally {
      setPayingId(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleteConfirmId) return
    try {
      await budgetAPI.remove(deleteConfirmId)
      fetchBudgets()
      notifyBudgetChanged()
    } catch (err) {
      onMessage(err.response?.data?.error || 'Erro ao remover.', 'error')
    } finally {
      setDeleteConfirmId(null)
    }
  }

  return (
    <>
    <div className="cfg-card r6">
      <div className="cfg-card-head">
        <div className="cfg-ch-ico">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ae2ac" strokeWidth="2" strokeLinecap="round">
            <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
        </div>
        <div>
          <div className="cfg-ch-title">Contas fixas</div>
          <div className="cfg-ch-sub">Despesas recorrentes mensais</div>
        </div>
      </div>
      <div className="cfg-card-body">
        <PlanUsageBanner
          plan={user.plan ?? 'free'}
          feature="budgets"
          used={budgets.length}
          label="contas fixas"
        />
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
                  {b.endDate ? (
                    <span className="cfg-fixed-end" title="Data de encerramento">
                      até {new Date(b.endDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </span>
                  ) : null}
                  {b.paidThisMonth ? (
                    <span className="cfg-fixed-paid" title={b.paidDate ? `Pago em ${new Date(b.paidDate).toLocaleDateString('pt-BR')}` : undefined}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      paga
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="cfg-btn-ghost cfg-fixed-pay-btn"
                      onClick={() => handlePay(b)}
                      disabled={payingId === b.id}
                    >
                      {payingId === b.id
                        ? <span className="spinner" style={{ width: 11, height: 11, borderWidth: 2 }} />
                        : 'Marcar como paga'}
                    </button>
                  )}
                  <button className="cfg-del-btn" type="button" onClick={() => setDeleteConfirmId(b.id)} aria-label="Remover">
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
        {budgets.length > 0 && (
          <div className="cfg-launch-row">
            {unpaidCount === 0 ? (
              <div className="cfg-launched-ok">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Todas as contas fixas pagas este mês
              </div>
            ) : (
              <button className="cfg-btn-launch" onClick={handleLaunch} disabled={launching}>
                {launching
                  ? <><span className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} /> Lançando...</>
                  : <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                      </svg>
                      Lançar {unpaidCount === budgets.length ? 'todas como pagas' : `${unpaidCount} ${unpaidCount === 1 ? 'pendente' : 'pendentes'}`}
                    </>
                }
              </button>
            )}
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
            onChange={e => { setNewBudget(p => ({ ...p, dueDay: e.target.value })); setDueDayErr('') }} />
          <button type="button" className="cfg-btn-ghost cfg-enddate-toggle"
            title={newBudget.hasEndDate ? 'Remover data de encerramento' : 'Definir data de encerramento'}
            onClick={() => setNewBudget(p => ({ ...p, hasEndDate: !p.hasEndDate, endDate: { dd: '', mm: '', aaaa: '' } }))}>
            📅
          </button>
          <button type="submit" className="cfg-btn-ghost" disabled={submitting}>
            {submitting ? (
              <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            )}
            {submitting ? 'Adicionando…' : 'Adicionar'}
          </button>
        </form>
        {dueDayErr && (
          <span style={{ fontSize: 12, color: '#ef4444', marginTop: 4, display: 'block' }}>{dueDayErr}</span>
        )}
        {newBudget.hasEndDate && (
          <div className="cfg-enddate-row">
            <label className="cfg-enddate-label">📅 Encerramento</label>
            <div className="cfg-date-fields">
              <input
                ref={refDD}
                className="cfg-inp cfg-date-part"
                type="text" inputMode="numeric" placeholder="DD" maxLength={2}
                value={newBudget.endDate.dd}
                onChange={e => {
                  const v = e.target.value.replace(/\D/g,'').slice(0,2)
                  setNewBudget(p => ({ ...p, endDate: { ...p.endDate, dd: v } }))
                  setEndDateErr('')
                  if (v.length === 2) refMM.current?.focus()
                }}
              />
              <span className="cfg-date-sep">/</span>
              <input
                ref={refMM}
                className="cfg-inp cfg-date-part"
                type="text" inputMode="numeric" placeholder="MM" maxLength={2}
                value={newBudget.endDate.mm}
                onChange={e => {
                  const v = e.target.value.replace(/\D/g,'').slice(0,2)
                  setNewBudget(p => ({ ...p, endDate: { ...p.endDate, mm: v } }))
                  if (v.length === 2) refAAAA.current?.focus()
                }}
                onKeyDown={e => {
                  if (e.key === 'Backspace' && newBudget.endDate.mm === '') {
                    e.preventDefault()
                    refDD.current?.focus()
                  }
                }}
              />
              <span className="cfg-date-sep">/</span>
              <input
                ref={refAAAA}
                className="cfg-inp cfg-date-part cfg-date-year"
                type="text" inputMode="numeric" placeholder="AAAA" maxLength={4}
                value={newBudget.endDate.aaaa}
                onChange={e => {
                  const v = e.target.value.replace(/\D/g,'').slice(0,4)
                  setNewBudget(p => ({ ...p, endDate: { ...p.endDate, aaaa: v } }))
                }}
                onKeyDown={e => {
                  if (e.key === 'Backspace' && newBudget.endDate.aaaa === '')
                    setNewBudget(p => ({ ...p, endDate: { ...p.endDate, mm: p.endDate.mm.slice(0,-1) } }))
                }}
              />
            </div>
            {endDateErr && (
              <span style={{ fontSize: 12, color: '#ef4444', marginTop: 4, display: 'block' }}>{endDateErr}</span>
            )}
          </div>
        )}
      </div>
    </div>

    {deleteConfirmId && createPortal(
      <div className="gls-modal-overlay" onClick={() => setDeleteConfirmId(null)}>
        <div className="gls-modal" style={{ maxWidth:360 }} onClick={e => e.stopPropagation()}>
          <div className="gls-modal-head">
            <span>Excluir conta fixa</span>
            <button className="gls-modal-close" onClick={() => setDeleteConfirmId(null)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div className="gls-modal-body" style={{ textAlign:'center', paddingTop:8 }}>
            <div style={{ width:48, height:48, borderRadius:12, background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.2)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                <path d="M10 11v6"/><path d="M14 11v6"/>
                <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
              </svg>
            </div>
            <div style={{ fontWeight:700, fontSize:15, color:'var(--t1)', marginBottom:8 }}>Tem certeza?</div>
            <div style={{ fontSize:13, color:'var(--t2)', lineHeight:1.6 }}>Esta conta fixa será removida permanentemente.</div>
          </div>
          <div className="gls-modal-foot">
            <button className="gls-btn-ghost" onClick={() => setDeleteConfirmId(null)}>Cancelar</button>
            <button className="gls-btn-save" style={{ background:'#ef4444' }} onClick={confirmDelete}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
              </svg>
              Sim, excluir
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}
    </>
  )
}
