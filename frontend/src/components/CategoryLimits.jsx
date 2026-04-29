// ─── src/components/CategoryLimits.jsx ─────────────────
// Exibe barras de progresso por categoria comparando
// quanto foi gasto vs o limite definido pelo usuário.

const CATEGORY_ICONS = {
  food:'🍔', shopping:'🛍️', transport:'🚗', health:'💊',
  leisure:'🎮', education:'📚', home:'🏠', other:'📦'
}
const CATEGORY_LABELS = {
  food:'Alimentação', shopping:'Shopping', transport:'Transporte',
  health:'Saúde', leisure:'Lazer', education:'Educação',
  home:'Casa', other:'Outros'
}

export default function CategoryLimits({ limits, transactions }) {
  if (!limits || limits.length === 0) return null

  // Soma gastos por categoria no mês atual
  const spentByCategory = transactions
    .filter(t => t.type === 'expense')
    .reduce((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + t.amount
      return acc
    }, {})

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3 style={{ fontWeight: 700, marginBottom: 20 }}>🏷️ Limites por Categoria</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {limits.map(limit => {
          const spent   = spentByCategory[limit.category] || 0
          const pct     = Math.min(Math.round((spent / limit.amount) * 100), 100)
          const over    = spent > limit.amount
          const barColor = pct < 70 ? '#00d084' : pct < 90 ? '#ffc107' : '#ff4757'

          return (
            <div key={limit.category}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontWeight: 500, fontSize: 14 }}>
                  {CATEGORY_ICONS[limit.category]} {CATEGORY_LABELS[limit.category]}
                </span>
                <span style={{ fontSize: 13, color: over ? 'var(--color-red)' : 'var(--text-secondary)' }}>
                  <strong style={{ color: over ? 'var(--color-red)' : 'var(--text-primary)' }}>
                    R$ {spent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </strong>
                  {' / R$ '}{limit.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  {over && <span style={{ color: 'var(--color-red)', marginLeft: 6 }}>⚠️ Limite!</span>}
                </span>
              </div>
              {/* Barra de progresso */}
              <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${pct}%`,
                  background: barColor, borderRadius: 4,
                  transition: 'width 0.6s ease, background 0.3s'
                }} />
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{pct}% do limite usado</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
