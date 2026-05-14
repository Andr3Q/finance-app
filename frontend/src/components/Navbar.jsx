import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { isInstalled, getInstallPrompt, clearInstallPrompt } from '../services/installPrompt.js'
import { useUser } from '../hooks/useUser.js'

const ROUTE_TITLES = {
  '/dashboard':    'Dashboard',
  '/transactions': 'Transações',
  '/settings':     'Configurações',
  '/planos':       'Upgrade Pro',
}

const WEEKDAYS = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado']
const MONTHS   = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function HomeIcon()  { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> }
function TxIcon()    { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg> }
function GearIcon()  { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg> }
function BoltIcon()  { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> }
function InstIcon()  { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> }
function LogoutIcon(){ return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg> }

export default function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useUser()

  const [appInstalled, setAppInstalled] = useState(() => isInstalled())
  const [installing,   setInstalling]   = useState(false)
  const [showGuide,    setShowGuide]    = useState(false)

  useEffect(() => {
    const onInstalled = () => setAppInstalled(true)
    window.addEventListener('appinstalled', onInstalled)
    return () => window.removeEventListener('appinstalled', onInstalled)
  }, [])

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

  const now       = new Date()
  const dateStr   = `${WEEKDAYS[now.getDay()]}, ${now.getDate()} de ${MONTHS[now.getMonth()]} de ${now.getFullYear()}`
  const pageTitle = ROUTE_TITLES[location.pathname] || 'FinançasPro'

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

        <div className="dsb-s-inner">
          {/* Logo */}
          <button className="dsb-s-logo" onClick={() => navigate('/dashboard')}>
            <div className="dsb-s-logo-ico">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ac46e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
                <polyline points="16 7 22 7 22 13"/>
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
          <div className="dsb-topbar-sub">{dateStr}</div>
        </div>
        <div className="dsb-topbar-right">
          {isPro
            ? <span className="dsb-topbar-pro">PRO ✨</span>
            : <button className="dsb-topbar-upgrade" onClick={() => navigate('/planos')}>⚡ Upgrade</button>
          }
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
    <div
      onClick={onClose}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:300,
               display:'flex', alignItems:'flex-end', justifyContent:'center', padding:'0 16px 24px' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background:'#1a1a1a', border:'1px solid rgba(255,255,255,.08)',
                 borderRadius:20, padding:'24px 20px', width:'100%', maxWidth:420,
                 animation:'bannerIn .3s cubic-bezier(.34,1.56,.64,1) forwards' }}
      >
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
          <img src="/icon-192.png" alt="" style={{ width:48, height:48, borderRadius:12 }} />
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:'var(--t1)', fontFamily:'var(--fd)' }}>Instalar FinançasPro</div>
            <div style={{ fontSize:12, color:'var(--t2)', marginTop:2 }}>Siga os passos abaixo</div>
          </div>
        </div>

        {isIOS ? (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <Step n="1" text={<>Toque no botão <strong style={{ color:'var(--c)' }}>Compartilhar</strong> na barra do Safari</>} />
            <Step n="2" text={<>Role para baixo e toque em <strong style={{ color:'var(--c)' }}>"Adicionar à Tela de Início"</strong></>} />
            <Step n="3" text={<>Toque em <strong style={{ color:'var(--c)' }}>"Adicionar"</strong> no canto superior direito</>} />
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <Step n="1" text={<>Toque no menu <strong style={{ color:'var(--c)' }}>⋮</strong> no canto superior direito do Chrome</>} />
            <Step n="2" text={<>Toque em <strong style={{ color:'var(--c)' }}>"Instalar app"</strong> ou <strong style={{ color:'var(--c)' }}>"Adicionar à tela inicial"</strong></>} />
          </div>
        )}

        <button
          onClick={onClose}
          style={{ marginTop:24, width:'100%', padding:'12px 0',
                   background:'rgba(74,196,110,.1)', border:'1px solid rgba(74,196,110,.2)',
                   borderRadius:12, color:'var(--c)', fontSize:14, fontWeight:700,
                   fontFamily:'var(--fd)', cursor:'pointer' }}
        >
          Entendi
        </button>
      </div>
    </div>
  )
}

function Step({ n, text }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:14 }}>
      <div style={{ width:32, height:32, borderRadius:'50%', flexShrink:0,
                    background:'rgba(74,196,110,.1)', border:'1px solid rgba(74,196,110,.2)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:13, fontWeight:700, color:'var(--c)', fontFamily:'var(--fd)' }}>{n}</div>
      <div style={{ fontSize:13, color:'var(--t2)', lineHeight:1.5 }}>{text}</div>
    </div>
  )
}
