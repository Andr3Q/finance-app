import CfgToggle from './CfgToggle.jsx'

export default function AppearanceCard({ theme, toggleTheme }) {
  return (
    <div className="cfg-card" style={{ marginBottom: 12 }}>
      <div className="cfg-card-head">
        <div className="cfg-ch-ico">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ac46e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5"/>
            <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
        </div>
        <div>
          <div className="cfg-ch-title">Aparência</div>
          <div className="cfg-ch-sub">Escolha entre modo claro e escuro</div>
        </div>
      </div>
      <div className="cfg-notif-list">
        <div className="cfg-notif-row">
          <div className="cfg-notif-info">
            <div className="cfg-notif-label">{theme === 'dark' ? 'Modo escuro' : 'Modo claro'}</div>
            <div className="cfg-notif-desc">{theme === 'dark' ? 'Interface em fundo escuro' : 'Interface em fundo claro'}</div>
          </div>
          <CfgToggle on={theme === 'dark'} onChange={toggleTheme} />
        </div>
      </div>
    </div>
  )
}
