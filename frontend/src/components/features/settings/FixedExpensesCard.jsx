import { useState, useEffect, useRef } from 'react'
import { budgetAPI, transactionsAPI } from '../../../services/api.js'
import { invalidateCache } from '../../../services/cache.js'
import { useUser } from '../../../hooks/useUser.js'
import CurrencyInput from '../../ui/CurrencyInput.jsx'
import { analytics } from '../../../services/analytics.js'

function notifyBudgetChanged() {
  invalidateCache('dashboard')
  window.dispatchEvent(new CustomEvent('budget-updated'))
}

function isLaunchedThisMonth(user) {
  const now = new Date()
  return user?.autoLaunchMonth === now.getMonth() + 1 &&
         user?.autoLaunchYear  === now.getFullYear()
}

export default function FixedExpensesCard({ onMessage, onUpgrade }) {
  const user = useUser()
  const [budgets,    setBudgets]    = useState([])
  const [newBudget,  setNewBudget]  = useState({ name: '', amount: '', dueDay: '', endDate: { dd: '', mm: '', aaaa: '' }, hasEndDate: false })
  const refMM   = useRef(null)
  const refAAAA = useRef(null)
  const [launching,  setLaunching]  = useState(false)
  const [launched,   setLaunched]   = useState(() => isLaunchedThisMonth(user))

  const fetchBudgets = async () => {
    try {
      const res = await budgetAPI.list()
      setBudgets(res.data)
    } catch {
      onMessage('Erro ao carregar contas fixas.', 'error')
    }
  }

  useEffect(() => { fetchBudgets() }, [])

  const totalFixed = budgets.reduce((s, b) => s + b.amount, 0)

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!newBudget.name || !newBudget.amount) return
    const { dd, mm, aaaa } = newBudget.endDate
    const endDateISO = newBudget.hasEndDate && dd.length === 2 && mm.length === 2 && aaaa.length === 4
      ? `${aaaa}-${mm}-${dd}`
      : undefined

    try {
      await budgetAPI.create({
        name:    newBudget.name,
        amount:  newBudget.amount,
        dueDay:  newBudget.dueDay ? parseInt(newBudget.dueDay) : undefined,
        endDate: endDateISO || undefined,
      })
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
    }
  }

  const handleLaunch = async () => {
    setLaunching(true)
    try {
      const { data } = await transactionsAPI.autoLaunch()
      if (data.alreadyLaunched) {
        onMessage('As contas fixas já foram lançadas este mês.', 'success')
      } else {
        onMessage(`✓ ${data.count} contas fixas lançadas como transações!`)
        notifyBudgetChanged()
      }
      setLaunched(true)
    } catch (err) {
      onMessage(err.response?.data?.error || 'Erro ao lançar contas fixas.', 'error')
    } finally {
      setLaunching(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      await budgetAPI.remove(id)
      fetchBudgets()
      notifyBudgetChanged()
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
                  {b.endDate ? (
                    <span className="cfg-fixed-end" title="Data de encerramento">
                      até {new Date(b.endDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </span>
                  ) : null}
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
        {budgets.length > 0 && (
          <div className="cfg-launch-row">
            {launched ? (
              <div className="cfg-launched-ok">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Contas fixas lançadas este mês
              </div>
            ) : (
              <button className="cfg-btn-launch" onClick={handleLaunch} disabled={launching}>
                {launching
                  ? <><span className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} /> Lançando...</>
                  : <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                      </svg>
                      Lançar como transações deste mês
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
            onChange={e => setNewBudget(p => ({ ...p, dueDay: e.target.value }))} />
          <button type="button" className="cfg-btn-ghost cfg-enddate-toggle"
            title={newBudget.hasEndDate ? 'Remover data de encerramento' : 'Definir data de encerramento'}
            onClick={() => setNewBudget(p => ({ ...p, hasEndDate: !p.hasEndDate, endDate: { dd: '', mm: '', aaaa: '' } }))}>
            📅
          </button>
          <button type="submit" className="cfg-btn-ghost">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Adicionar
          </button>
        </form>
        {newBudget.hasEndDate && (
          <div className="cfg-enddate-row">
            <label className="cfg-enddate-label">📅 Encerramento</label>
            <div className="cfg-date-fields">
              <input
                className="cfg-inp cfg-date-part"
                type="text" inputMode="numeric" placeholder="DD" maxLength={2}
                value={newBudget.endDate.dd}
                onChange={e => {
                  const v = e.target.value.replace(/\D/g,'').slice(0,2)
                  setNewBudget(p => ({ ...p, endDate: { ...p.endDate, dd: v } }))
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
                  if (e.key === 'Backspace' && newBudget.endDate.mm === '')
                    setNewBudget(p => ({ ...p, endDate: { ...p.endDate, dd: p.endDate.dd.slice(0,-1) } }))
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
          </div>
        )}
      </div>
    </div>
  )
}
