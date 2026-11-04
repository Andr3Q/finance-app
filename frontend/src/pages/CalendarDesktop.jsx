import Navbar from '../components/layout/Navbar.jsx'
import ProtoIcon from '../components/layout/ProtoIcon.jsx'
import ProtoCategoryIcon from '../components/layout/ProtoCategoryIcon.jsx'
import { MONTHS, CATEGORY_LABELS } from '../constants/index.js'
import { fmt } from '../utils/format.js'

const DOW = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM']

// nome curto do evento (o que cabe na etiqueta do dia) e a cor da etiqueta: entrada verde, saída azul, conta/parcela a vencer cinza, meta âmbar
const chipOf = (ev) => {
  if (ev.kind === 'income' || ev.kind === 'expense') return { text: ev.tx.description || (ev.kind === 'income' ? 'Entrada' : 'Gasto'), tone: ev.kind === 'income' ? 'in' : 'out' }
  if (ev.kind === 'budget') return { text: ev.budget.name, tone: 'due' }
  if (ev.kind === 'installment') return { text: ev.plan.name, tone: 'due' }
  return { text: ev.goal.title, tone: 'goal' }
}

function DayEvent({ ev, hidden }) {
  const money = (n) => (hidden ? 'R$ ••••' : `R$ ${fmt(n)}`)
  let icon, name, sub, amount, tone = 'out'
  if (ev.kind === 'income' || ev.kind === 'expense') {
    const inc = ev.kind === 'income'
    icon = <ProtoCategoryIcon category={ev.tx.category} size={20} />
    name = ev.tx.description || (inc ? 'Entrada' : 'Gasto')
    sub = CATEGORY_LABELS[ev.tx.category] || ev.tx.category
    amount = hidden ? 'R$ ••••' : `${inc ? '+' : '−'} R$ ${fmt(ev.tx.amount)}`
    tone = inc ? 'in' : 'out'
  } else if (ev.kind === 'budget') {
    icon = <ProtoIcon name="receipt" size={20} />; name = ev.budget.name; sub = 'Vencimento'; amount = money(ev.budget.amount); tone = 'due'
  } else if (ev.kind === 'installment') {
    icon = <ProtoIcon name="layers" size={20} />; name = ev.plan.name; sub = `Parcela ${ev.installmentNum}/${ev.plan.totalInstallments}`; amount = money(ev.plan.amount); tone = 'due'
  } else if (ev.kind === 'goal') {
    icon = <ProtoIcon name="target" size={20} />; name = ev.goal.title; sub = 'Prazo da meta'; amount = money(ev.goal.targetAmount); tone = 'goal'
  } else return null
  return (
    <li className="ndc-ev">
      <span className={`ndc-ev-ico ${tone}`}>{icon}</span>
      <span className="ndc-ev-info"><span className="ndc-ev-name">{name}</span><span className="ndc-ev-sub">{sub}</span></span>
      <span className={`ndc-ev-amt ${tone === 'in' ? 'in' : ''}`}>{amount}</span>
    </li>
  )
}

// Calendário no desktop (design "Nancy Desktop", tela 19): o mês numa grade de 7 colunas (células de 84px com até duas etiquetas) e, ao lado
// (340px), os lançamentos do dia escolhido. Só a apresentação — dados, eventos de cada dia, troca de mês e "Hoje" são do Calendar, que passa
// tudo em `ctx`. O design não desenha a troca de mês: os botões ficam ao lado do título.
export default function CalendarDesktop({ ctx }) {
  const { month, year, cells, evByDay, selectedDay, setSelectedDay, today, isPast, isCurrentMonth, prevMonth, nextMonth, goToday, loading, hasGoalDots, selEvents, hidden } = ctx
  return (
    <>
      <Navbar />
      <div className="pwnav ndh-pwnav fade-in">
        <div className="ndc-page">
          <section className="ndc-card ndc-month">
            <div className="ndc-head">
              <h2 className="ndc-title">{MONTHS[month - 1]} {year}</h2>
              <div className="ndc-nav">
                <button type="button" className="ndc-nav-btn" onClick={prevMonth} aria-label="Mês anterior"><ProtoIcon name="back" size={16} /></button>
                <button type="button" className="ndc-nav-btn ndc-nav-btn--next" onClick={nextMonth} aria-label="Próximo mês"><ProtoIcon name="back" size={16} /></button>
                {!isCurrentMonth && <button type="button" className="ndc-today" onClick={goToday}>Hoje</button>}
              </div>
              <div className="ndc-legend">
                <span><i className="ndc-dot in" />Entrada</span>
                <span><i className="ndc-dot out" />Saída</span>
                {hasGoalDots && <span><i className="ndc-dot goal" />Meta</span>}
              </div>
            </div>

            <div className="ndc-grid">
              {DOW.map(d => <span key={d} className="ndc-dow">{d}</span>)}
              {loading ? (
                <div className="ndc-loading"><span className="spinner" style={{ width: 24, height: 24, borderWidth: 2.5 }} /></div>
              ) : cells.map((day, i) => {
                if (!day) return <span key={`e${i}`} className="ndc-cell empty" />
                const events = evByDay[day] || []
                const sel = day === selectedDay
                return (
                  <button
                    key={day} type="button" className={`ndc-cell${sel ? ' sel' : ''}${day === today ? ' today' : ''}${isPast(day) ? '' : ' future'}`}
                    aria-pressed={sel}
                    aria-label={`${day} de ${MONTHS[month - 1].toLowerCase()}${events.length ? `, ${events.length} ${events.length === 1 ? 'evento' : 'eventos'}` : ''}`}
                    onClick={() => setSelectedDay(sel ? null : day)}
                  >
                    <span className="ndc-num">{day}</span>
                    {events.slice(0, 2).map((ev, k) => { const c = chipOf(ev); return <span key={k} className={`ndc-chip ${c.tone}`}>{c.text}</span> })}
                  </button>
                )
              })}
            </div>
          </section>

          <section className="ndc-card ndc-day" aria-live="polite">
            {selectedDay ? (
              <>
                <h2 className="ndc-day-title">{selectedDay} de {MONTHS[month - 1].toLowerCase()}{selectedDay === today && ' · hoje'}</h2>
                {selEvents.length === 0
                  ? <p className="ndc-day-empty">Nenhum lançamento neste dia.</p>
                  : <ul className="ndc-ev-list">{selEvents.map((ev, i) => <DayEvent key={i} ev={ev} hidden={hidden} />)}</ul>}
              </>
            ) : (
              <p className="ndc-day-empty">Clique em um dia para ver os lançamentos.</p>
            )}
          </section>
        </div>
      </div>
    </>
  )
}
