import { useNavigate } from 'react-router-dom'
import { getLimit, nextPlan, nextPlanLabel } from '../../config/planLimits.js'

export default function PlanUsageBanner({ plan, feature, used, label }) {
  const navigate  = useNavigate()
  const limit     = getLimit(plan, feature)
  const nextLabel = nextPlanLabel(plan)

  if (!nextLabel || limit === Infinity) return null

  const pct      = Math.min(100, Math.round((used / limit) * 100))
  const atLimit  = used >= limit
  const barColor = atLimit ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#4ae2ac'
  const isEliteUp = nextLabel === 'Elite'

  return (
    <div className={`pub-wrap ${atLimit ? 'pub-wrap-alert' : ''}`}>
      <div className="pub-top">
        <div className="pub-info">
          <div className="pub-icon-wrap" style={{ background: `${barColor}18`, border: `1px solid ${barColor}30` }}>
            {atLimit ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={barColor} strokeWidth="2.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r=".5" fill={barColor}/>
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={barColor} strokeWidth="2.5" strokeLinecap="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            )}
          </div>
          <div className="pub-text-wrap">
            <span className="pub-label" style={{ color: atLimit ? barColor : 'var(--t1)' }}>
              {atLimit ? `Limite de ${label} atingido` : `${used} de ${limit} ${label}`}
            </span>
            {!atLimit && (
              <span className="pub-sublabel">
                Upgrade para {nextLabel} e tenha {nextLabel === 'Elite' ? 'ilimitados' : `até ${getLimit(nextPlan(plan), feature)}`}
              </span>
            )}
          </div>
        </div>

        <button
          className={`pub-btn ${isEliteUp ? 'pub-btn-elite' : 'pub-btn-pro'}`}
          onClick={() => navigate('/planos')}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
          Upgrade {nextLabel}
        </button>
      </div>

      <div className="pub-bar">
        <div className="pub-bar-fill" style={{ width: `${pct}%`, background: barColor }} />
      </div>

      {atLimit && (
        <div className="pub-limit-msg">
          Você atingiu o limite do plano {plan === 'free' ? 'Gratuito' : 'Pro'}. Faça upgrade para continuar adicionando.
        </div>
      )}
    </div>
  )
}
