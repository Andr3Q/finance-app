import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { isInstalled, getInstallPrompt, clearInstallPrompt } from '../services/installPrompt.js'
import { useUser } from '../hooks/useUser.js'
import { useTheme } from '../hooks/useTheme.js'

const ROUTE_TITLES = {
  '/transactions': 'Transações',
  '/settings':     'Configurações',
  '/planos':       'Planos',
}

function greeting() {
  const h = new Date().getHours()
  if (h >= 5  && h < 12) return 'Bom dia'
  if (h >= 12 && h < 18) return 'Boa tarde'
  return 'Boa noite'
}

const WEEKDAYS = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado']
const MONTHS   = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function BellIcon()  { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg> }
function HomeIcon()  { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> }
function TxIcon()    { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg> }
function GearIcon()  { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg> }
function BoltIcon()  { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> }
function InstIcon()  { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> }
function LogoutIcon(){ return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg> }

function getSalaryNotif() {
  const now = new Date()
  let count = 0, day = 1
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  let salaryDay = null
  while (day <= daysInMonth) {
    const wd = new Date(now.getFullYear(), now.getMonth(), day).getDay()
    if (wd !== 0 && wd !== 6) { count++; if (count === 5) { salaryDay = day; break } }
    day++
  }
  if (!salaryDay) return null
  const diff = salaryDay - now.getDate()
  const dow = new Date(now.getFullYear(), now.getMonth(), salaryDay)
    .toLocaleDateString('pt-BR', { weekday: 'long' })
  const dayInfo = `dia ${salaryDay} (${dow})`
  if (diff === 0)       return { status: 'today',    msg: 'Hoje é dia de salário!' }
  if (diff === 1)       return { status: 'tomorrow', msg: `Amanhã é dia de salário — ${dayInfo}.` }
  if (diff > 0 && diff <= 3) return { status: 'soon', msg: `Seu salário cai em breve: ${dayInfo}.` }
  return null
}

export default function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useUser()
  const { theme, toggle } = useTheme()

  const [appInstalled, setAppInstalled] = useState(() => isInstalled())
  const [installing,   setInstalling]   = useState(false)
  const [showGuide,    setShowGuide]    = useState(false)
  const [showBell,     setShowBell]     = useState(false)
  const [bellDismissed,setBellDismissed]= useState(false)
  const [clock,        setClock]        = useState(() => new Date())
  const bellRef = useRef(null)

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const salaryNotif = getSalaryNotif()
  const hasNotif    = !!salaryNotif && !bellDismissed

  useEffect(() => {
    const onInstalled = () => setAppInstalled(true)
    window.addEventListener('appinstalled', onInstalled)
    return () => window.removeEventListener('appinstalled', onInstalled)
  }, [])

  useEffect(() => {
    if (!showBell) return
    const handler = (e) => { if (bellRef.current && !bellRef.current.contains(e.target)) setShowBell(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showBell])

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    navigate('/login')
  }

  const handleInstallClick = async () => {
    const prompt = getInstallPrompt()
    if (prompt) {
      setInstalling(true)
      try {
        prompt.prompt()
        const { outcome } = await prompt.userChoice
        clearInstallPrompt()
        if (outcome === 'accepted') setAppInstalled(true)
      } finally {
        setInstalling(false)
      }
    } else {
      setShowGuide(true)
    }
  }

  const initials  = user.name ? user.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase() : '?'
  const isPro     = user.plan === 'pro'
  const isActive  = (path) => location.pathname === path

  const firstName = user.name ? user.name.split(' ')[0] : ''
  const dateStr   = `${WEEKDAYS[clock.getDay()]}, ${clock.getDate()} de ${MONTHS[clock.getMonth()]} de ${clock.getFullYear()}`
  const timeStr   = clock.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const pageTitle = location.pathname === '/dashboard'
    ? `${greeting()}${firstName ? `, ${firstName}` : ''}`
    : ROUTE_TITLES[location.pathname] || 'FinançasPro'

  const navLinks = [
    { path: '/dashboard',    label: 'Dashboard',      Icon: HomeIcon },
    { path: '/transactions', label: 'Transações',     Icon: TxIcon   },
    { path: '/settings',     label: 'Configurações',  Icon: GearIcon },
  ]

  return (
    <>
      {/* ── Sidebar desktop ── */}
      <aside className="dsb-sidebar">
        <div className="dsb-s-ring dsb-s-r1" aria-hidden="true" />
        <div className="dsb-s-ring dsb-s-r2" aria-hidden="true" />

        <div className="dsb-s-particles" aria-hidden="true">
          {[
            { left:  8, bottom:  '5%', size: 5, delay: 0,    dur: 3.2 },
            { left: 22, bottom: '12%', size: 4, delay: 0.6,  dur: 2.8 },
            { left: 38, bottom:  '3%', size: 6, delay: 1.1,  dur: 3.6 },
            { left: 55, bottom: '18%', size: 3, delay: 0.3,  dur: 2.5 },
            { left: 70, bottom:  '8%', size: 5, delay: 1.8,  dur: 3.0 },
            { left: 85, bottom: '25%', size: 4, delay: 0.9,  dur: 2.7 },
            { left: 15, bottom: '40%', size: 5, delay: 1.4,  dur: 3.4 },
            { left: 48, bottom: '35%', size: 6, delay: 0.2,  dur: 2.9 },
            { left: 75, bottom: '45%', size: 4, delay: 2.0,  dur: 3.1 },
            { left: 30, bottom: '55%', size: 5, delay: 0.7,  dur: 3.3 },
            { left: 62, bottom: '60%', size: 3, delay: 1.6,  dur: 2.6 },
            { left: 90, bottom: '50%', size: 5, delay: 0.4,  dur: 3.5 },
            { left: 10, bottom: '70%', size: 4, delay: 1.9,  dur: 2.8 },
            { left: 42, bottom: '75%', size: 6, delay: 0.8,  dur: 3.2 },
            { left: 78, bottom: '68%', size: 4, delay: 1.3,  dur: 3.0 },
          ].map((p, i) => (
            <span key={i} className="dsb-s-particle" style={{
              left: `${p.left}%`,
              bottom: p.bottom,
              width:  p.size,
              height: p.size,
              animationDelay:    `${p.delay}s`,
              animationDuration: `${p.dur}s`,
            }} />
          ))}
        </div>

        <div className="dsb-s-inner">
          {/* Logo */}
          <button className="dsb-s-logo" onClick={() => navigate('/dashboard')}>
            <div className="dsb-s-logo-ico">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <rect x="2"   y="14" width="5" height="8" rx="1.5" fill="#4ac46e" opacity="0.55"/>
                <rect x="9.5" y="9"  width="5" height="13" rx="1.5" fill="#4ac46e" opacity="0.8"/>
                <rect x="17"  y="4"  width="5" height="18" rx="1.5" fill="#4ac46e"/>
              </svg>
            </div>
            <span className="dsb-s-logo-name">Finanças<em>Pro</em></span>
          </button>

          {/* Nav links */}
          <nav className="dsb-s-nav">
            {navLinks.map(({ path, label, Icon }) => (
              <button
                key={path}
                className={`dsb-s-item${isActive(path) ? ' active' : ''}`}
                onClick={() => navigate(path)}
              >
                <Icon />
                {label}
              </button>
            ))}

            <div className="dsb-s-label">Conta</div>

            {!isPro && (
              <button className="dsb-s-item" onClick={() => navigate('/planos')}>
                <BoltIcon />
                Upgrade Pro
              </button>
            )}

            {!appInstalled && (
              <button className="dsb-s-item" onClick={handleInstallClick} disabled={installing}>
                <InstIcon />
                {installing ? 'Instalando…' : 'Instalar App'}
              </button>
            )}
          </nav>

          {/* User area */}
          <div className="dsb-s-user">
            <div className="dsb-s-av">
              {initials}
              <div className="dsb-s-av-dot" />
            </div>
            <div className="dsb-s-user-info">
              <div className="dsb-s-user-name">{user.name || 'Usuário'}</div>
              <div className="dsb-s-user-role">{isPro ? 'Plano Pro ✨' : 'Plano Grátis'}</div>
            </div>
            <button className="dsb-s-logout" onClick={logout} title="Sair">
              <LogoutIcon />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Topbar desktop ── */}
      <header className="dsb-topbar">
        <div className="dsb-topbar-left">
          <div className="dsb-topbar-title">{pageTitle}</div>
          <div className="dsb-topbar-sub">
            <span className="dsb-topbar-date">{dateStr}</span>
            <span className="dsb-topbar-dot">·</span>
            <span className="dsb-topbar-time">{timeStr}</span>
          </div>
        </div>
        <div className="dsb-topbar-right">
          {isPro
            ? <span className="dsb-topbar-pro">PRO ✨</span>
            : <button className="dsb-topbar-upgrade" onClick={() => navigate('/planos')}>⚡ Upgrade</button>
          }

          {/* Toggle dark/light */}
          <button className="dsb-theme-btn" onClick={toggle} title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}>
            {theme === 'dark' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
              </svg>
            )}
          </button>

          {/* Sino de notificações */}
          <div className="dsb-bell-wrap" ref={bellRef}>
            <button className="dsb-bell-btn" onClick={() => setShowBell(b => !b)} title="Notificações">
              <BellIcon />
              {hasNotif && <span className="dsb-bell-dot" />}
            </button>
            {showBell && (
              <div className="dsb-bell-drop">
                <div className="dsb-bell-drop-title">Notificações</div>
                {salaryNotif && !bellDismissed ? (
                  <div className="dsb-bell-item">
                    <div className="dsb-bell-item-ico">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ac46e" strokeWidth="2" strokeLinecap="round">
                        <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                      </svg>
                    </div>
                    <div className="dsb-bell-item-body">
                      <div className="dsb-bell-item-title">Lembrete de salário</div>
                      <div className="dsb-bell-item-msg">{salaryNotif.msg}</div>
                    </div>
                    <button className="dsb-bell-item-close" onClick={() => { setBellDismissed(true); setShowBell(false) }}>
                      <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
                      </svg>
                    </button>
                  </div>
                ) : (
                  <div className="dsb-bell-empty">Sem notificações</div>
                )}
              </div>
            )}
          </div>

          <div className="dsb-topbar-av" title={user.name}>{initials}</div>
        </div>
      </header>

      {/* ── Mobile bottom nav ── */}
      <nav className="dsb-mobile-nav">
        {navLinks.map(({ path, label, Icon }) => {
          const active = isActive(path)
          return (
            <button
              key={path}
              className={`dsb-mn-item${active ? ' active' : ''}`}
              onClick={() => navigate(path)}
            >
              <div className={`dsb-mn-ico${active ? ' active' : ''}`}><Icon /></div>
              <span className="dsb-mn-lbl">{label}</span>
            </button>
          )
        })}

        {!isPro && (
          <button className="dsb-mn-item" onClick={() => navigate('/planos')}>
            <div className="dsb-mn-ico"><BoltIcon /></div>
            <span className="dsb-mn-lbl">Upgrade</span>
          </button>
        )}

        <button className="dsb-mn-item" onClick={logout}>
          <div className="dsb-mn-ico"><LogoutIcon /></div>
          <span className="dsb-mn-lbl">Sair</span>
        </button>
      </nav>

      {showGuide && <InstallGuide onClose={() => setShowGuide(false)} />}
    </>
  )
}

/* ── Install Guide ── */
function InstallGuide({ onClose }) {
  const ua    = navigator.userAgent
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua))

  return (
    <div className="ig-overlay" onClick={onClose}>
      <div className="ig-card" onClick={e => e.stopPropagation()}>
        <div className="ig-header">
          <img src="/icon-192.png" alt="" className="ig-icon" />
          <div>
            <div className="ig-title">Instalar FinançasPro</div>
            <div className="ig-sub">Siga os passos abaixo</div>
          </div>
        </div>

        <div className="ig-steps">
          {isIOS ? (
            <>
              <Step n="1" text={<>Toque no botão <strong className="ig-hl">Compartilhar</strong> na barra do Safari</>} />
              <Step n="2" text={<>Role para baixo e toque em <strong className="ig-hl">"Adicionar à Tela de Início"</strong></>} />
              <Step n="3" text={<>Toque em <strong className="ig-hl">"Adicionar"</strong> no canto superior direito</>} />
            </>
          ) : (
            <>
              <Step n="1" text={<>Toque no menu <strong className="ig-hl">⋮</strong> no canto superior direito do Chrome</>} />
              <Step n="2" text={<>Toque em <strong className="ig-hl">"Instalar app"</strong> ou <strong className="ig-hl">"Adicionar à tela inicial"</strong></>} />
            </>
          )}
        </div>

        <button className="ig-btn" onClick={onClose}>Entendi</button>
      </div>
    </div>
  )
}

function Step({ n, text }) {
  return (
    <div className="ig-step">
      <div className="ig-step-n">{n}</div>
      <div className="ig-step-text">{text}</div>
    </div>
  )
}
