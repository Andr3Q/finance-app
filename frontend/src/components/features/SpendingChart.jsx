import { IconEmpty } from './icons.jsx'

const COLORS = ['#4ac46e','#00b4d8','#7b2fff','#ff6b9d','#ffc107','#ff8c42','#4f8ef7','#00d084']

export default function SpendingChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160, flexDirection: 'column', gap: 8, color: 'var(--t2)' }}>
        <IconEmpty size={32} color="var(--t3)" />
        <span style={{ fontSize: 13 }}>Nenhum gasto registrado</span>
      </div>
    )
  }

  const total = data.reduce((s, d) => s + d.value, 0)
  const R     = 15.9
  const CIRC  = 2 * Math.PI * R  // ≈ 99.9

  let offset = 25
  const slices = data.map((d, i) => {
    const dash  = (d.value / total) * CIRC
    const slice = { ...d, dash, offset: -offset, color: COLORS[i % COLORS.length] }
    offset += dash
    return slice
  })

  return (
    <div className="piw">
      <svg width="140" height="140" viewBox="0 0 36 36">
        <circle r={R} cx="18" cy="18" fill="none" stroke="rgba(74,196,110,0.07)" strokeWidth="3.8"/>
        {slices.map((s) => (
          <circle
            key={s.name}
            r={R} cx="18" cy="18"
            fill="none"
            stroke={s.color}
            strokeWidth="3.8"
            strokeDasharray={`${s.dash} ${CIRC - s.dash}`}
            strokeDashoffset={s.offset}
            transform="rotate(-90 18 18)"
          />
        ))}
      </svg>

      <div className="pleg">
        {slices.map((s) => (
          <div key={s.name} className="pli">
            <div className="pld" style={{ background: s.color }} />
            <span>{s.name} — R$ {s.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
