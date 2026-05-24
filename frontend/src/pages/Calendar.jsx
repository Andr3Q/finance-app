import { useState, useEffect, useCallback } from 'react'
import Navbar from '../components/layout/Navbar.jsx'
import { transactionsAPI, budgetAPI, goalsAPI, installmentsAPI } from '../services/api.js'
import { MONTHS, CATEGORY_LABELS } from '../constants/index.js'
import { fmt } from '../utils/format.js'

const DOW = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

function buildCalendar(year, month) {
  const firstDow    = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  // Mon-first: Sun(0)→6, Mon(1)→0, …
  const offset = firstDow === 0 ? 6 : firstDow - 1
  const cells = Array(offset).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export default function Calendar() {
  const now = new Date()
  const [month,        setMonth]        = useState(now.getMonth() + 1)
  const [year,         setYear]         = useState(now.getFullYear())
  const [selectedDay,  setSelectedDay]  = useState(now.getDate())
  const [transactions,  setTransactions]  = useState([])
  const [budgets,       setBudgets]       = useState([])
  const [goals,         setGoals]         = useState([])
  const [installments,  setInstallments]  = useState([])
  const [loading,       setLoading]       = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [txRes, budgetRes, goalsRes, instRes] = await Promise.all([
        transactionsAPI.list({ month, year, limit: 200 }),
        budgetAPI.list(),
        goalsAPI.list(),
        installmentsAPI.list(),
      ])
      setTransactions(txRes.data?.data || [])
      setBudgets(budgetRes.data || [])
      setGoals(goalsRes.data || [])
      setInstallments(instRes.data || [])
    } catch {
      setTransactions([]); setBudgets([]); setGoals([]); setInstallments([])
    } finally {
      setLoading(false)
    }
  }, [month, year])

  useEffect(() => { fetchData() }, [fetchData])

  const prevMonth = () => {
    setSelectedDay(null)
    if (month === 1) { setMonth(12); setYear(y => y - 1) } else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    setSelectedDay(null)
    if (month === 12) { setMonth(1); setYear(y => y + 1) } else setMonth(m => m + 1)
  }
  const goToday = () => {
    setMonth(now.getMonth() + 1)
    setYear(now.getFullYear())
    setSelectedDay(now.getDate())
  }

  // Build events map: day → [event, ...]
  const evByDay = {}
  const push = (day, ev) => { if (!evByDay[day]) evByDay[day] = []; evByDay[day].push(ev) }

  transactions.forEach(tx => {
    const d = new Date(tx.date)
    if (d.getMonth() + 1 !== month || d.getFullYear() !== year) return
    push(d.getDate(), { kind: tx.type, tx })
  })
  budgets.forEach(b => {
    if (b.dueDay) push(b.dueDay, { kind: 'budget', budget: b })
  })
  goals.forEach(g => {
    if (!g.deadline) return
    const d = new Date(g.deadline)
    if (d.getMonth() + 1 !== month || d.getFullYear() !== year) return
    push(d.getDate(), { kind: 'goal', goal: g })
  })
  installments.forEach(plan => {
    const offset = (year - plan.startYear) * 12 + (month - plan.startMonth)
    if (offset < 0 || offset >= plan.totalInstallments) return
    const installmentNum = offset + 1
    if (installmentNum <= plan.paidInstallments) return
    push(1, { kind: 'installment', plan, installmentNum })
  })

  const cells          = buildCalendar(year, month)
  const isCurrentMonth = now.getMonth() + 1 === month && now.getFullYear() === year
  const today          = isCurrentMonth ? now.getDate() : -1
  const selEvents      = selectedDay ? (evByDay[selectedDay] || []) : []

  return (
    <>
      <Navbar />
      <div className="pwnav fade-in">
        <div className="dsb-content">
          <div className="cal-page">

            {/* ── Header ── */}
            <div className="cal-header">
              <button className="cal-nav-btn" onClick={prevMonth} aria-label="Mês anterior">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
              </button>
              <div className="cal-header-center">
                <span className="cal-month-title">{MONTHS[month - 1]} {year}</span>
                {!isCurrentMonth && (
                  <button className="cal-today-btn" onClick={goToday}>Hoje</button>
                )}
              </div>
              <button className="cal-nav-btn" onClick={nextMonth} aria-label="Próximo mês">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            </div>

            <div className="cal-layout">
              {/* ── Grid ── */}
              <div className="cal-grid-wrap">
                <div className="cal-dow-row">
                  {DOW.map(d => <div key={d} className="cal-dow">{d}</div>)}
                </div>

                {loading ? (
                  <div className="cal-loading">
                    <span className="spinner" style={{ width: 24, height: 24, borderWidth: 2.5 }} />
                  </div>
                ) : (
                  <div className="cal-cells">
                    {cells.map((day, i) => {
                      if (!day) return <div key={`e${i}`} className="cal-cell empty" />
                      const events     = evByDay[day] || []
                      const hasIncome      = events.some(e => e.kind === 'income')
                      const hasExpense     = events.some(e => e.kind === 'expense')
                      const hasBudget      = events.some(e => e.kind === 'budget')
                      const hasGoal        = events.some(e => e.kind === 'goal')
                      const hasInstallment = events.some(e => e.kind === 'installment')
                      const isToday    = day === today
                      const isSel      = day === selectedDay
                      return (
                        <div
                          key={day}
                          className={`cal-cell${isToday ? ' today' : ''}${isSel ? ' sel' : ''}${events.length ? ' has-ev' : ''}`}
                          onClick={() => setSelectedDay(isSel ? null : day)}
                        >
                          <span className="cal-day-num">{day}</span>
                          <div className="cal-dots">
                            {hasExpense     && <span className="cal-dot cal-dot-exp" />}
                            {hasIncome      && <span className="cal-dot cal-dot-inc" />}
                            {hasBudget      && <span className="cal-dot cal-dot-bud" />}
                            {hasGoal        && <span className="cal-dot cal-dot-gol" />}
                            {hasInstallment && <span className="cal-dot cal-dot-ins" />}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                <div className="cal-legend">
                  <span className="cal-leg"><span className="cal-dot cal-dot-exp"/><span>Gasto</span></span>
                  <span className="cal-leg"><span className="cal-dot cal-dot-inc"/><span>Entrada</span></span>
                  <span className="cal-leg"><span className="cal-dot cal-dot-bud"/><span>Conta fixa</span></span>
                  <span className="cal-leg"><span className="cal-dot cal-dot-gol"/><span>Meta</span></span>
                  <span className="cal-leg"><span className="cal-dot cal-dot-ins"/><span>Parcela</span></span>
                </div>
              </div>

              {/* ── Detail panel ── */}
              <div className="cal-detail">
                {selectedDay ? (
                  <>
                    <div className="cal-detail-title">
                      {selectedDay} de {MONTHS[month - 1]}
                      {selectedDay === today && <span className="cal-detail-today-badge">Hoje</span>}
                    </div>
                    {selEvents.length === 0 ? (
                      <div className="cal-detail-empty">Nenhum evento neste dia.</div>
                    ) : (
                      <div className="cal-ev-list">
                        {selEvents.map((ev, i) => <CalEvent key={i} ev={ev} />)}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="cal-detail-empty">
                    Toque em um dia para ver os eventos.
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  )
}

function CalEvent({ ev }) {
  if (ev.kind === 'income') return (
    <div className="cal-ev-item cal-ev-inc">
      <div className="cal-ev-ico cal-ev-ico-inc">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
        </svg>
      </div>
      <div className="cal-ev-info">
        <span className="cal-ev-name">{ev.tx.description || 'Entrada'}</span>
        <span className="cal-ev-sub">{CATEGORY_LABELS[ev.tx.category] || ev.tx.category}</span>
      </div>
      <span className="cal-ev-amt cal-ev-amt-inc">+R$ {fmt(ev.tx.amount)}</span>
    </div>
  )

  if (ev.kind === 'expense') return (
    <div className="cal-ev-item cal-ev-exp">
      <div className="cal-ev-ico cal-ev-ico-exp">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
        </svg>
      </div>
      <div className="cal-ev-info">
        <span className="cal-ev-name">{ev.tx.description || 'Gasto'}</span>
        <span className="cal-ev-sub">{CATEGORY_LABELS[ev.tx.category] || ev.tx.category}</span>
      </div>
      <span className="cal-ev-amt cal-ev-amt-exp">-R$ {fmt(ev.tx.amount)}</span>
    </div>
  )

  if (ev.kind === 'budget') return (
    <div className="cal-ev-item cal-ev-bud">
      <div className="cal-ev-ico cal-ev-ico-bud">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
        </svg>
      </div>
      <div className="cal-ev-info">
        <span className="cal-ev-name">{ev.budget.name}</span>
        <span className="cal-ev-sub">Vencimento</span>
      </div>
      <span className="cal-ev-amt cal-ev-amt-bud">R$ {fmt(ev.budget.amount)}</span>
    </div>
  )

  if (ev.kind === 'installment') return (
    <div className="cal-ev-item cal-ev-ins">
      <div className="cal-ev-ico cal-ev-ico-ins">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
        </svg>
      </div>
      <div className="cal-ev-info">
        <span className="cal-ev-name">{ev.plan.name}</span>
        <span className="cal-ev-sub">Parcela {ev.installmentNum}/{ev.plan.totalInstallments}</span>
      </div>
      <span className="cal-ev-amt cal-ev-amt-ins">R$ {fmt(ev.plan.amount)}</span>
    </div>
  )

  if (ev.kind === 'goal') return (
    <div className="cal-ev-item cal-ev-gol">
      <div className="cal-ev-ico cal-ev-ico-gol">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
        </svg>
      </div>
      <div className="cal-ev-info">
        <span className="cal-ev-name">{ev.goal.title}</span>
        <span className="cal-ev-sub">Prazo da meta</span>
      </div>
      <span className="cal-ev-amt cal-ev-amt-gol">R$ {fmt(ev.goal.targetAmount)}</span>
    </div>
  )

  return null
}
