import { useState, useEffect, useCallback } from 'react'
import { useHideBalance } from '../hooks/useHideBalance.js'
import { useNavigate, useLocation } from 'react-router-dom'
import Navbar from '../components/layout/Navbar.jsx'
import { transactionsAPI, budgetAPI, goalsAPI, installmentsAPI } from '../services/api.js'
import { useForcedLightTheme } from '../hooks/useTheme.js'
import { MONTHS, CATEGORY_LABELS } from '../constants/index.js'
import { CategoryIcon } from '../components/ui/icons.jsx'
import { ReceiptGlyph, LayersGlyph } from '../components/ui/NancyGlyphs.jsx'
import { fmt } from '../utils/format.js'

const DOW = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM']
const HIDDEN = 'R$ ••••'

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

const BackIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
)
const Chevron = ({ dir }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points={dir === 'left' ? '15 18 9 12 15 6' : '9 18 15 12 9 6'}/>
  </svg>
)
const TargetGlyph = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>
  </svg>
)

// Qual bolinha cada tipo de evento acende: entrada (verde), saída (azul — gasto, conta fixa que vence
// e parcela) e meta (âmbar, só quando o mês tem prazo de meta).
const dotKind = (kind) => (kind === 'income' ? 'in' : kind === 'goal' ? 'goal' : 'out')

// Calendário (Nancy 2, tela 18): vencimentos e lançamentos do mês. Os dados e a lógica são os mesmos
// de antes (transações, contas fixas, prazos de metas e parcelas em aberto); mudou o visual.
export default function Calendar() {
  const navigate = useNavigate()
  const location = useLocation()
  useForcedLightTheme() // tela desenhada só no claro (design Nancy 2)

  const now = new Date()
  const [month,        setMonth]        = useState(now.getMonth() + 1)
  const [year,         setYear]         = useState(now.getFullYear())
  const [selectedDay,  setSelectedDay]  = useState(now.getDate())
  const [transactions,  setTransactions]  = useState([])
  const [budgets,       setBudgets]       = useState([])
  const [goals,         setGoals]         = useState([])
  const [installments,  setInstallments]  = useState([])
  const [loading,       setLoading]       = useState(true)
  const [fetchError,    setFetchError]    = useState(false)
  const [hidden]                          = useHideBalance()

  const fetchData = useCallback(async () => {
    setLoading(true)
    setFetchError(false)
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
      setFetchError(true)
    } finally {
      setLoading(false)
    }
  }, [month, year])

  useEffect(() => { fetchData() }, [fetchData])

  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate('/transactions'))

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

  // dia → eventos
  const evByDay = {}
  const push = (day, ev) => { if (!evByDay[day]) evByDay[day] = []; evByDay[day].push(ev) }

  transactions.forEach(tx => {
    const d = new Date(tx.date)
    if (d.getMonth() + 1 !== month || d.getFullYear() !== year) return
    push(d.getDate(), { kind: tx.type, tx })
  })
  // Conta fixa JÁ paga no mês deixa de ser "vencimento": o pagamento já aparece como saída, e os dois juntos contavam a mesma
  // despesa em dobro no dia (achado Passada 2). Mês atual: o servidor diz (paidThisMonth, vale também para mês fechado);
  // qualquer mês: um lançamento ligado à conta (budgetId).
  const isCurrentMonth = now.getMonth() + 1 === month && now.getFullYear() === year
  const paidBudgetIds  = new Set(transactions.filter(t => t.budgetId).map(t => t.budgetId))
  budgets.forEach(b => {
    const paid = paidBudgetIds.has(b.id) || (isCurrentMonth && b.paidThisMonth)
    if (b.dueDay && !paid) push(b.dueDay, { kind: 'budget', budget: b })
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
  const today          = isCurrentMonth ? now.getDate() : -1
  const selEvents      = selectedDay ? (evByDay[selectedDay] || []) : []
  const hasGoalDots    = Object.values(evByDay).some(evs => evs.some(e => e.kind === 'goal'))
  const money = (n) => (hidden ? HIDDEN : `R$ ${fmt(n)}`)
  // dia já passou (ou é hoje) no mês exibido; mês passado inteiro conta como passado
  const isPast = (day) => year < now.getFullYear() || (year === now.getFullYear() && (month < now.getMonth() + 1 || (month === now.getMonth() + 1 && day <= now.getDate())))

  return (
    <>
      <Navbar />
      {fetchError && (
        <div className="toast toast-top terr">
          Erro ao carregar dados do calendário.
        </div>
      )}
      <div className="pwnav fin-pwnav fade-in">
        <div className="fin-page">
          <header className="fin-hero">
            <button type="button" className="fin-back" onClick={goBack} aria-label="Voltar"><BackIcon /></button>
            <div className="fin-hero-text">
              <h1 className="fin-hero-title">Calendário</h1>
              <p className="fin-hero-sub">Vencimentos e lançamentos</p>
            </div>
          </header>

          <div className="fin-body">
            <section className="fin-card cl-card">
              <div className="cl-head">
                <h2 className="cl-month">{MONTHS[month - 1]} {year}</h2>
                <div className="cl-nav">
                  <button type="button" className="cl-nav-btn" onClick={prevMonth} aria-label="Mês anterior"><Chevron dir="left" /></button>
                  <button type="button" className="cl-nav-btn" onClick={nextMonth} aria-label="Próximo mês"><Chevron dir="right" /></button>
                  {!isCurrentMonth && <button type="button" className="cl-today-btn" onClick={goToday}>Hoje</button>}
                </div>
                <div className="cl-legend">
                  <span className="cl-leg"><i className="cl-dot cl-dot-in" />Entrada</span>
                  <span className="cl-leg"><i className="cl-dot cl-dot-out" />Saída</span>
                  {hasGoalDots && <span className="cl-leg"><i className="cl-dot cl-dot-goal" />Meta</span>}
                </div>
              </div>

              <div className="cl-dow-row">
                {DOW.map(d => <span key={d} className="cl-dow">{d}</span>)}
              </div>

              {loading ? (
                <div className="cl-loading"><span className="spinner" style={{ width: 24, height: 24, borderWidth: 2.5 }} /></div>
              ) : (
                <div className="cl-cells">
                  {cells.map((day, i) => {
                    if (!day) return <span key={`e${i}`} className="cl-cell empty" />
                    const events = evByDay[day] || []
                    const kinds  = [...new Set(events.map(e => dotKind(e.kind)))]
                    const isSel  = day === selectedDay
                    return (
                      <button
                        key={day} type="button"
                        className={`cl-cell${day === today ? ' today' : ''}${isSel ? ' sel' : ''}${isPast(day) ? '' : ' future'}`}
                        aria-pressed={isSel}
                        aria-label={`${day} de ${MONTHS[month - 1].toLowerCase()}${events.length ? `, ${events.length} ${events.length === 1 ? 'evento' : 'eventos'}` : ''}`}
                        onClick={() => setSelectedDay(isSel ? null : day)}
                      >
                        <span className="cl-num">{day}</span>
                        <span className="cl-dots">{kinds.map(k => <i key={k} className={`cl-dot cl-dot-${k}`} />)}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </section>

            <section className="fin-card cl-day-card" aria-live="polite">
              {selectedDay ? (
                <>
                  <h2 className="cl-day-title">
                    {selectedDay} de {MONTHS[month - 1].toLowerCase()}{selectedDay === today && ' · hoje'}
                  </h2>
                  {selEvents.length === 0 ? (
                    <p className="cl-day-empty">Nenhum evento neste dia.</p>
                  ) : (
                    <ul className="cl-ev-list">
                      {selEvents.map((ev, i) => <CalEvent key={i} ev={ev} money={money} />)}
                    </ul>
                  )}
                </>
              ) : (
                <p className="cl-day-empty">Toque em um dia para ver os eventos.</p>
              )}
            </section>
          </div>
        </div>
      </div>
    </>
  )
}

function CalEvent({ ev, money }) {
  let icon, name, sub, amount, cls = ''
  if (ev.kind === 'income' || ev.kind === 'expense') {
    const isInc = ev.kind === 'income'
    icon   = <CategoryIcon category={ev.tx.category} size={20} />
    name   = ev.tx.description || (isInc ? 'Entrada' : 'Gasto')
    sub    = CATEGORY_LABELS[ev.tx.category] || ev.tx.category
    amount = `${isInc ? '+' : '−'}${money(ev.tx.amount)}` // sinal de menos tipográfico, igual ao Extrato e ao Início
    cls    = isInc ? 'in' : ''
  } else if (ev.kind === 'budget') {
    icon = <ReceiptGlyph />; name = ev.budget.name; sub = 'Vencimento'; amount = money(ev.budget.amount)
  } else if (ev.kind === 'installment') {
    icon = <LayersGlyph />; name = ev.plan.name; sub = `Parcela ${ev.installmentNum}/${ev.plan.totalInstallments}`; amount = money(ev.plan.amount)
  } else if (ev.kind === 'goal') {
    icon = <TargetGlyph />; name = ev.goal.title; sub = 'Prazo da meta'; amount = money(ev.goal.targetAmount)
  } else return null
  return (
    <li className="cl-ev">
      <span className="cl-ev-ico">{icon}</span>
      <span className="cl-ev-info"><span className="cl-ev-name">{name}</span><span className="cl-ev-sub">{sub}</span></span>
      <span className={`cl-ev-amt ${cls}`}>{amount}</span>
    </li>
  )
}
