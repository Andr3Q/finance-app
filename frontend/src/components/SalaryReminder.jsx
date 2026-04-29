// ─── src/components/SalaryReminder.jsx ─────────────────
// Calcula o 5° dia útil do mês e exibe um banner
// quando o salário está para cair ou já caiu hoje.

import { useState, useEffect } from 'react'

// Retorna o dia do mês que é o N-ésimo dia útil
function getNthBusinessDay(year, month, n) {
  let count = 0
  let day = 1
  const daysInMonth = new Date(year, month, 0).getDate()
  while (day <= daysInMonth) {
    const date    = new Date(year, month - 1, day)
    const weekDay = date.getDay() // 0=Dom, 6=Sáb
    if (weekDay !== 0 && weekDay !== 6) {
      count++
      if (count === n) return day
    }
    day++
  }
  return null
}

export default function SalaryReminder({ salary }) {
  const [status, setStatus] = useState(null) // 'today' | 'tomorrow' | 'soon' | null
  const [dayInfo, setDayInfo] = useState('')
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const now      = new Date()
    const year     = now.getFullYear()
    const month    = now.getMonth() + 1
    const today    = now.getDate()

    const salaryDay = getNthBusinessDay(year, month, 5)
    if (!salaryDay) return

    const diff = salaryDay - today

    const dayOfWeek = new Date(year, month - 1, salaryDay)
      .toLocaleDateString('pt-BR', { weekday: 'long' })

    setDayInfo(`dia ${salaryDay} (${dayOfWeek})`)

    if (diff === 0)       setStatus('today')
    else if (diff === 1)  setStatus('tomorrow')
    else if (diff <= 3)   setStatus('soon')
    else                  setStatus(null)
  }, [])

  if (!status || dismissed) return null

  const configs = {
    today: {
      icon: '🎉',
      msg: `Hoje é dia de salário! R$ ${salary?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} deve cair na sua conta.`,
      color: '#00d084', bg: 'rgba(0,208,132,0.1)', border: 'rgba(0,208,132,0.3)'
    },
    tomorrow: {
      icon: '💰',
      msg: `Amanhã é dia de salário (${dayInfo}). Prepare-se para as contas!`,
      color: '#4f8ef7', bg: 'rgba(79,142,247,0.1)', border: 'rgba(79,142,247,0.3)'
    },
    soon: {
      icon: '📅',
      msg: `Seu salário cai em breve: ${dayInfo}.`,
      color: '#ffc107', bg: 'rgba(255,193,7,0.08)', border: 'rgba(255,193,7,0.25)'
    }
  }

  const { icon, msg, color, bg, border } = configs[status]

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12, padding: '14px 20px', borderRadius: 12, marginBottom: 16,
      background: bg, border: `1px solid ${border}`, animation: 'fadeIn 0.3s ease'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 22 }}>{icon}</span>
        <p style={{ color, fontWeight: 600, fontSize: 14 }}>{msg}</p>
      </div>
      <button onClick={() => setDismissed(true)} style={{
        background: 'none', border: 'none', color, cursor: 'pointer',
        fontSize: 18, opacity: 0.6, flexShrink: 0, lineHeight: 1
      }}>✕</button>
    </div>
  )
}
