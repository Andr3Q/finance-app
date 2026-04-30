// ─── src/components/Navbar.jsx ─────────────────────────
// Navbar premium: glass top bar (desktop) + floating pill nav (mobile)

import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

export default function Navbar() {
  const navigate   = useNavigate()
  const location   = useLocation()
  const user       = JSON.parse(localStorage.getItem('user') || '{}')
  const [ripple,   setRipple]   = useState(null)
  const [scrolled, setScrolled] = useState(false)

  // Detecta scroll para o efeito de sombra na top navbar
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    navigate('/login')
  }

  const links = [
    { path: '/dashboard',    label: 'Dashboard',  icon: HomeIcon },
    { path: '/transactions', label: 'Transações', icon: WalletIcon },
    { path: '/settings',     label: 'Config.',    icon: GearIcon },
  ]

  const isActive = (path) => location.pathname === path

  // Ripple effect no clique da bottom nav
  const handleNavClick = (path, e) => {
    const btn = e.currentTarget
    const rect = btn.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setRipple({ path, x, y })
    setTimeout(() => setRipple(null), 500)
    navigate(path)
  }

  // Iniciais do usuário para o avatar
  const initials = user.name
    ? user.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
    : '?'

  return (
    <>
      {/* ══════════════════════════════════════════
          TOP NAVBAR — Desktop only
      ══════════════════════════════════════════ */}
      <nav className="top-navbar" data-scrolled={scrolled}>
        {/* Logo */}
        <button className="navbar-logo" onClick={() => navigate('/dashboard')}>
          <span className="navbar-logo-icon">💸</span>
          <span className="navbar-logo-text">
            <span className="navbar-logo-green">Finanças</span>Pro
          </span>
        </button>

        {/* Links centrais */}
        <div className="navbar-links">
          {links.map(({ path, label, icon: Icon }) => (
            <button
              key={path}
              className={`navbar-link ${isActive(path) ? 'navbar-link--active' : ''}`}
              onClick={() => navigate(path)}
            >
              <Icon size={15} />
              {label}
              {isActive(path) && <span className="navbar-link-dot" />}
            </button>
          ))}
        </div>

        {/* Usuário + Sair */}
        <div className="navbar-user">
          <div className="navbar-avatar" title={user.name}>{initials}</div>
          <span className="navbar-username">{user.name?.split(' ')[0]}</span>
          <button className="navbar-logout" onClick={logout}>
            <LogoutIcon size={14} />
            Sair
          </button>
        </div>
      </nav>

      {/* ══════════════════════════════════════════
          BOTTOM NAV — Mobile only (floating pill)
      ══════════════════════════════════════════ */}
      <nav className="bottom-pill-nav">
        <div className="bottom-pill-inner">
          {links.map(({ path, label, icon: Icon }) => {
            const active = isActive(path)
            return (
              <button
                key={path}
                className={`pill-nav-item ${active ? 'pill-nav-item--active' : ''}`}
                onClick={(e) => handleNavClick(path, e)}
              >
                {/* Ripple */}
                {ripple?.path === path && (
                  <span
                    className="pill-ripple"
                    style={{ left: ripple.x, top: ripple.y }}
                  />
                )}
                {/* Indicador ativo (bolha verde por baixo do ícone) */}
                {active && <span className="pill-active-bg" />}
                <Icon size={active ? 22 : 20} />
                <span className="pill-nav-label">{label}</span>
              </button>
            )
          })}

          {/* Botão Sair */}
          <button className="pill-nav-item pill-nav-item--logout" onClick={logout}>
            <LogoutIcon size={20} />
            <span className="pill-nav-label">Sair</span>
          </button>
        </div>
      </nav>
    </>
  )
}

/* ── Ícones SVG inline ──────────────────────────────── */
function HomeIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  )
}

function WalletIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2"/>
      <path d="M16 12h2"/>
      <path d="M2 10h20"/>
    </svg>
  )
}

function GearIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
    </svg>
  )
}

function LogoutIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  )
}
