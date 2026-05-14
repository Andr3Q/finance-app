import { useState, useEffect } from 'react'
import { IconCalendar, IconCoin } from './icons.jsx'

function getNthBusinessDay(year, month, n) {
  let count = 0, day = 1
  const daysInMonth = new Date(year, month, 0).getDate()
  while (day <= daysInMonth) {
    const wd = new Date(year, month - 1, day).getDay()
    if (wd !== 0 && wd !== 6) { count++; if (count === n) return day }
    day++
  }
  return null
}

export default function SalaryReminder({ salary }) {
  const [status,    setStatus]    = useState(null)
  const [dayInfo,   setDayInfo]   = useState('')
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const now = new Date()
    const salaryDay = getNthBusinessDay(now.getFullYear(), now.getMonth() + 1, 5)
    if (!salaryDay) return
    const diff = salaryDay - now.getDate()
    const dow  = new Date(now.getFullYear(), now.getMonth(), salaryDay)
      .toLocaleDateString('pt-BR', { weekday: 'long' })
    setDayInfo(`dia ${salaryDay} (${dow})`)
    if (diff === 0) setStatus('today')
    else if (diff === 1) setStatus('tomorrow')
    else if (diff <= 3)  setStatus('soon')
  }, [])

  if (!status || dismissed) return null

  const cfg = {
    today:    { Icon: IconCoin,     color: 'var(--green)',  bg: 'rgba(0,208,132,.07)',   border: 'rgba(0,208,132,.2)',   msg: `Hoje é dia de salário! R$ ${salary?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} entrando.` },
    tomorrow: { Icon: IconCalendar, color: 'var(--blue)',   bg: 'rgba(79,142,247,.07)',  border: 'rgba(79,142,247,.2)',  msg: `Amanhã é dia de salário (${dayInfo}).` },
    soon:     { Icon: IconCalendar, color: 'var(--yellow)', bg: 'rgba(255,193,7,.07)',   border: 'rgba(255,193,7,.18)', msg: `Seu salário cai em breve: ${dayInfo}.` },
  }[status]

  return (
    <div className="alt fu" style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color, marginBottom: 12 }}>
      <cfg.Icon size={15} color={cfg.color} />
      <span style={{ fontWeight: 500, fontSize: 13 }}>{cfg.msg}</span>
      <button className="alx" onClick={() => setDismissed(true)}>
        <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
        </svg>
      </button>
    </div>
  )
}
