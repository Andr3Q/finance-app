export function playSoftChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const t = ctx.currentTime
    ;[523.25, 659.25].forEach((freq, i) => {
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      const start = t + i * 0.15
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.07, start + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 1.0)
      osc.start(start)
      osc.stop(start + 1.0)
    })
  } catch { /* silencia se Web Audio não disponível */ }
}

export function getTrialNotif(user) {
  if (!user.isOnTrial || !user.trialEndsAt) return null
  const daysLeft = Math.ceil((new Date(user.trialEndsAt) - Date.now()) / (1000 * 60 * 60 * 24))
  if (daysLeft <= 0) return { msg: 'Seu período de trial Pro encerrou.' }
  if (daysLeft === 1) return { msg: 'Último dia do trial Pro! Assine agora.' }
  return { msg: `Trial Pro — ${daysLeft} dias restantes.` }
}

export function getSalaryNotif() {
  const now = new Date()
  let count = 0, day = 1
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  let salaryDay = null
  while (day <= daysInMonth) {
    const wd = new Date(now.getFullYear(), now.getMonth(), day).getDay()
    if (wd !== 0 && wd !== 6) { count++; if (count === 5) { salaryDay = day; break } }
    day++
  }
  if (!salaryDay) return null
  const diff = salaryDay - now.getDate()
  const dow = new Date(now.getFullYear(), now.getMonth(), salaryDay)
    .toLocaleDateString('pt-BR', { weekday: 'long' })
  const dayInfo = `dia ${salaryDay} (${dow})`
  if (diff === 0)             return { status: 'today',    msg: 'Hoje é dia de salário!' }
  if (diff === 1)             return { status: 'tomorrow', msg: `Amanhã é dia de salário — ${dayInfo}.` }
  if (diff > 0 && diff <= 3) return { status: 'soon',     msg: `Seu salário cai em breve: ${dayInfo}.` }
  return null
}
