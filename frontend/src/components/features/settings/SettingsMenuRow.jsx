// Linha de menu clicável da tela "Mais" — ícone + título + subtítulo opcional
// + seta (mesmo padrão visual do card "Aviso Finanças" que já existia em
// Settings.jsx antes dessa reorganização).
function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="2" strokeLinecap="round">
      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
    </svg>
  )
}

export default function SettingsMenuRow({ icon, title, subtitle, onClick, danger = false, chevron = true }) {
  return (
    <div
      className="cfg-card"
      style={{ cursor: 'pointer' }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick()}
    >
      <div className="cfg-card-body" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="cfg-ch-ico" style={danger ? { borderColor: 'rgba(239,68,68,.2)', color: '#ef4444' } : undefined}>
          {icon}
        </div>
        <div style={{ flex: 1 }}>
          <div className="cfg-ch-title" style={danger ? { color: '#ef4444' } : undefined}>{title}</div>
          {subtitle && <div className="cfg-ch-sub">{subtitle}</div>}
        </div>
        {chevron && <ChevronIcon />}
      </div>
    </div>
  )
}
