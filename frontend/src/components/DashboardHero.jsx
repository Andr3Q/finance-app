// ─── src/components/DashboardHero.jsx ──────────────────
// Hero header premium do Dashboard: avatar, saudação,
// data/hora e indicador visual de saúde financeira

export default function DashboardHero({ user, summary, onAddTransaction }) {
  const now  = new Date()
  const hour = now.getHours()

  // Saudação baseada no horário
  const greeting =
    hour < 12 ? 'Bom dia'    :
    hour < 18 ? 'Boa tarde'  : 'Boa noite'

  const greetingIcon =
    hour < 12 ? '☀️' :
    hour < 18 ? '🌤️' : '🌙'

  // Dia da semana
  const WEEKDAYS = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado']
  const MONTHS   = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

  const weekday  = WEEKDAYS[now.getDay()]
  const day      = now.getDate()
  const month    = MONTHS[now.getMonth()]
  const year     = now.getFullYear()

  // Iniciais do avatar
  const initials = user?.name
    ? user.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
    : '?'

  const firstName = user?.name?.split(' ')[0] || 'Usuário'

  // Saúde financeira
  const pct = summary?.percentUsed || 0
  const health =
    pct === 0   ? { label: 'Sem gastos',      color: '#00d084', bg: 'rgba(0,208,132,0.1)',   dot: '#00d084' } :
    pct < 50    ? { label: 'Ótima saúde 💚',  color: '#00d084', bg: 'rgba(0,208,132,0.1)',   dot: '#00d084' } :
    pct < 70    ? { label: 'Saudável 💙',     color: '#4f8ef7', bg: 'rgba(79,142,247,0.1)',  dot: '#4f8ef7' } :
    pct < 90    ? { label: 'Atenção 💛',      color: '#ffc107', bg: 'rgba(255,193,7,0.1)',   dot: '#ffc107' } :
    pct < 100   ? { label: 'Crítico 🟠',      color: '#ff8c42', bg: 'rgba(255,140,66,0.1)',  dot: '#ff8c42' } :
                  { label: 'No limite 🔴',    color: '#ff4757', bg: 'rgba(255,71,87,0.1)',   dot: '#ff4757' }

  return (
    <div className="dashboard-hero fade-in">
      {/* ── Linha principal: avatar + texto + ação ── */}
      <div className="hero-main">

        {/* Avatar */}
        <div className="hero-avatar-wrap">
          <div className="hero-avatar">
            {initials}
          </div>
          {/* Bolinha de status (online/ativo) */}
          <span className="hero-avatar-badge" />
        </div>

        {/* Texto de saudação */}
        <div className="hero-text">
          <div className="hero-greeting">
            <span className="hero-greeting-icon">{greetingIcon}</span>
            <span className="hero-greeting-word">{greeting},</span>
          </div>
          <h1 className="hero-name">{firstName}</h1>
          <div className="hero-meta">
            <span className="hero-date">
              {weekday}, {day} de {month} de {year}
            </span>
            {summary && (
              <span className="hero-health-badge" style={{
                background: health.bg, color: health.color,
                borderColor: health.color + '40',
              }}>
                <span className="hero-health-dot" style={{ background: health.dot }} />
                {health.label}
              </span>
            )}
          </div>
        </div>

        {/* Botão de ação (desktop) */}
        <button
          className="btn btn-primary btn-hide-mobile hero-cta"
          onClick={onAddTransaction}
        >
          <PlusIcon />
          Registrar Gasto
        </button>
      </div>

      {/* ── Linha de stats rápidos ── */}
      {summary && (
        <div className="hero-stats">
          <div className="hero-stat">
            <span className="hero-stat-label">Salário</span>
            <span className="hero-stat-value">
              R$ {summary.salary?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="hero-stat-divider" />
          <div className="hero-stat">
            <span className="hero-stat-label">Gasto no mês</span>
            <span className="hero-stat-value" style={{ color: '#ff4757' }}>
              R$ {summary.totalExpenses?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="hero-stat-divider" />
          <div className="hero-stat">
            <span className="hero-stat-label">Disponível</span>
            <span className="hero-stat-value" style={{
              color: summary.totalAvailable >= 0 ? '#00d084' : '#ff4757'
            }}>
              R$ {summary.totalAvailable?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="hero-stat-divider hero-stat-divider--hide-sm" />
          <div className="hero-stat hero-stat--hide-sm">
            <span className="hero-stat-label">Orçamento usado</span>
            <div className="hero-stat-progress-wrap">
              <div className="hero-stat-progress-bar">
                <div
                  className="hero-stat-progress-fill"
                  style={{
                    width: `${Math.min(pct, 100)}%`,
                    background: health.dot,
                  }}
                />
              </div>
              <span className="hero-stat-value" style={{ color: health.color }}>{pct}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  )
}
