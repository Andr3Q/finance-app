import { useNavigate } from 'react-router-dom'
import { getLimit, nextPlanLabel } from '../../config/planLimits.js'

/**
 * Mostra barra de uso do plano + CTA de upgrade.
 * Para Elite ou quando não há próximo plano: renderiza null.
 *
 * Props:
 *   plan    — plano atual do usuário ('free' | 'pro' | 'elite')
 *   feature — chave do limite ('transactions' | 'budgets' | 'goals')
 *   used    — quantidade já utilizada
 *   label   — nome legível do recurso (ex: "transações este mês")
 */
export default function PlanUsageBanner({ plan, feature, used, label }) {
  const navigate  = useNavigate()
  const limit     = getLimit(plan, feature)
  const nextLabel = nextPlanLabel(plan)

  if (!nextLabel || limit === Infinity) return null

  const pct      = Math.min(100, Math.round((used / limit) * 100))
  const atLimit  = used >= limit
  const barColor = atLimit ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#4ae2ac'

  return (
    <div className="pub-wrap">
      <div className="pub-top">
        <div className="pub-info">
          {atLimit ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r=".5" fill="#ef4444"/>
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={barColor} strokeWidth="2.5" strokeLinecap="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          )}
          <span className="pub-text" style={{ color: atLimit ? '#ef4444' : 'var(--t2)' }}>
            {atLimit
              ? `Limite de ${limit} ${label} atingido`
              : `${used} de ${limit} ${label}`}
          </span>
        </div>
        <button className="pub-btn" onClick={() => navigate('/planos')}>
          ⚡ Upgrade {nextLabel}
        </button>
      </div>
      <div className="pub-bar">
        <div className="pub-bar-fill" style={{ width: `${pct}%`, background: barColor }} />
      </div>
    </div>
  )
}
