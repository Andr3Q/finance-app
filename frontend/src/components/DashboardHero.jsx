function IconSun({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  )
}

function IconCloud({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/>
    </svg>
  )
}

function IconMoon({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
    </svg>
  )
}

export default function DashboardHero({ user, summary, onAddTransaction }) {
  const now  = new Date()
  const hour = now.getHours()

  const greeting =
    hour < 12 ? 'Bom dia'   :
    hour < 18 ? 'Boa tarde' : 'Boa noite'

  const GreetingIcon =
    hour < 12 ? IconSun :
    hour < 18 ? IconCloud : IconMoon

  const WEEKDAYS = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado']
  const MONTHS   = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

  const dateStr  = `${WEEKDAYS[now.getDay()]}, ${now.getDate()} de ${MONTHS[now.getMonth()]} de ${now.getFullYear()}`
  const initials = user?.name
    ? user.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
    : '?'
  const firstName = user?.name?.split(' ')[0] || 'Usuário'

  const pct = summary?.percentUsed || 0
  const health =
    pct === 0 ? { label: 'Sem gastos', cls: 'bgreen',  dot: 'var(--green)'  } :
    pct < 50  ? { label: 'Saudável',   cls: 'bgreen',  dot: 'var(--green)'  } :
    pct < 70  ? { label: 'Normal',     cls: 'bblue',   dot: 'var(--blue)'   } :
    pct < 90  ? { label: 'Atenção',    cls: 'byellow', dot: 'var(--yellow)' } :
    pct < 100 ? { label: 'Crítico',    cls: 'borange', dot: 'var(--orange)' } :
                { label: 'No limite',  cls: 'bred',    dot: 'var(--red)'    }

  const statColor = (val) => val >= 0 ? 'var(--green)' : 'var(--red)'

  return (
    <div className="hero fu">
      {/* ── Avatar + saudação + botão ── */}
      <div className="htop">
        <div className="hav">
          <div className="havi">{initials}</div>
          <div className="hdot" />
        </div>

        <div className="hgr">
          <div className="hl1">
            <GreetingIcon size={14} color="var(--t2)" />
            {greeting},
          </div>
          <div className="hname">{firstName}</div>
          <div className="hmeta">
            <span>{dateStr}</span>
            {summary && (
              <span className={`bdg ${health.cls}`}>
                <span style={{ width: 5, height: 5, background: health.dot, borderRadius: '50%', display: 'inline-block', animation: 'pdot 2s infinite' }} />
                {health.label}
              </span>
            )}
          </div>
        </div>

        <button className="btn bp" id="hbtn" onClick={onAddTransaction}>
          <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/>
          </svg>
          Registrar
        </button>
      </div>

      {/* ── Stats ── */}
      {summary && (
        <div className="hstats">
          <div className="hs">
            <div className="hsl">Salário</div>
            <div className="hsv">
              R$ {summary.salary?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="hs">
            <div className="hsl">Gastos</div>
            <div className="hsv" style={{ color: 'var(--red)' }}>
              R$ {summary.totalExpenses?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="hs">
            <div className="hsl">Disponível</div>
            <div className="hsv" style={{ color: statColor(summary.totalAvailable) }}>
              R$ {summary.totalAvailable?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="hs">
            <div className="hsl">Orçamento</div>
            <div className="hsv">{pct}%</div>
            <div className="pt" style={{ marginTop: 5, height: 3 }}>
              <div className="pf" style={{ width: `${Math.min(pct, 100)}%`, background: `linear-gradient(90deg,var(--c),var(--cb))` }} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
