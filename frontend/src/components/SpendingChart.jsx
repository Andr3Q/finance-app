// ─── src/components/SpendingChart.jsx ──────────────────
// Gráfico de pizza (Recharts) mostrando gastos por categoria

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'

const COLORS = ['#00d084','#4f8ef7','#ffc107','#ff8c42','#ff4757','#a855f7','#06b6d4','#84cc16']

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#1a1a3e', border: '1px solid rgba(255,255,255,0.15)',
      borderRadius: 10, padding: '10px 14px'
    }}>
      <p style={{ fontWeight: 700, fontSize: 13 }}>{payload[0].name}</p>
      <p style={{ color: 'var(--color-green)', fontSize: 13 }}>
        R$ {payload[0].value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
      </p>
    </div>
  )
}

export default function SpendingChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
          paddingAngle={3} dataKey="value" stroke="none">
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          iconType="circle" iconSize={8}
          formatter={(value) => <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
