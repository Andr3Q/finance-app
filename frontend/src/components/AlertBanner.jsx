// ─── src/components/AlertBanner.jsx ────────────────────
// Exibe um alerta colorido baseado no percentual gasto

export default function AlertBanner({ percent, balance }) {
  const getAlert = () => {
    if (percent >= 100) return { color: '#ff4757', bg: 'rgba(255,71,87,0.1)',   border: 'rgba(255,71,87,0.3)',   icon: '🚨', msg: 'Limite ultrapassado! Revise seus gastos urgentemente.' }
    if (percent >= 90)  return { color: '#ff8c42', bg: 'rgba(255,140,66,0.1)',  border: 'rgba(255,140,66,0.3)',  icon: '⚠️', msg: 'Cuidado! Você está com 90% do orçamento utilizado.' }
    if (percent >= 70)  return { color: '#ffc107', bg: 'rgba(255,193,7,0.1)',   border: 'rgba(255,193,7,0.3)',   icon: '💛', msg: 'Atenção! Você está chegando no limite do orçamento.' }
    if (percent >= 50)  return { color: '#4f8ef7', bg: 'rgba(79,142,247,0.1)', border: 'rgba(79,142,247,0.3)', icon: 'ℹ️', msg: 'Você já usou metade do seu orçamento mensal.' }
    return null // Abaixo de 50% não mostra alerta
  }

  const alert = getAlert()
  if (!alert) return null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px',
      background: alert.bg, border: `1px solid ${alert.border}`,
      borderRadius: 12, marginBottom: 20, animation: 'fadeIn 0.3s ease'
    }}>
      <span style={{ fontSize: 20 }}>{alert.icon}</span>
      <p style={{ color: alert.color, fontWeight: 600, fontSize: 14 }}>{alert.msg}</p>
    </div>
  )
}
