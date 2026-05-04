import { CategoryIcon } from './icons.jsx'
import { IconAlert } from './icons.jsx'

const CATEGORY_LABELS = {
  food:'Alimentação', shopping:'Shopping', transport:'Transporte',
  health:'Saúde', leisure:'Lazer', education:'Educação',
  home:'Casa', other:'Outros',
}

export default function CategoryLimits({ limits, transactions }) {
  if (!limits || limits.length === 0) return null

  const spentByCategory = transactions
    .filter(t => t.type === 'expense')
    .reduce((acc, t) => { acc[t.category] = (acc[t.category] || 0) + t.amount; return acc }, {})

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="sct">Limites por Categoria</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {limits.map(limit => {
          const spent    = spentByCategory[limit.category] || 0
          const pct      = Math.min(Math.round((spent / limit.amount) * 100), 100)
          const over     = spent > limit.amount
          const barColor = pct < 70 ? 'var(--green)' : pct < 90 ? 'var(--yellow)' : 'var(--red)'

          return (
            <div key={limit.category} className="lmi">
              <div className="lmh">
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13, fontFamily: 'var(--fd)', color: 'var(--t1)' }}>
                  <span style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(0,255,204,.06)', border: '1px solid var(--bdbd)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <CategoryIcon category={limit.category} size={14} color="var(--c)" />
                  </span>
                  {CATEGORY_LABELS[limit.category]}
                  {over && <IconAlert size={13} color="var(--red)" />}
                </span>
                <span style={{ fontSize: 12, color: over ? 'var(--red)' : 'var(--t2)', fontFamily: 'var(--fn)', fontVariantNumeric: 'tabular-nums' }}>
                  <strong style={{ color: over ? 'var(--red)' : 'var(--t1)' }}>
                    R$ {spent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </strong>
                  {' / R$ '}{limit.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="pt">
                <div className="pf" style={{ width: `${pct}%`, background: barColor }} />
              </div>
              <div style={{ fontSize: 11, color: over ? 'var(--red)' : 'var(--t2)', marginTop: 4 }}>
                {over ? 'Limite ultrapassado' : `${pct}% do limite usado`}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
