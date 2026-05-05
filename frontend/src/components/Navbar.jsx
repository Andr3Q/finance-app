import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

export default function Navbar() {
  const navigate  = useNavigate()
  const location  = useLocation()
  let user = {}
  try { user = JSON.parse(localStorage.getItem('user') || '{}') } catch { user = {} }
  const [ripple,  setRipple]  = useState(null)
  const [scrolled,setScrolled]= useState(false)

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
    { path: '/dashboard',    label: 'Dashboard',  Icon: HomeIcon },
    { path: '/transactions', label: 'Transações', Icon: WalletIcon },
    { path: '/settings',     label: 'Config.',    Icon: GearIcon },
  ]

  const isActive = (path) => location.pathname === path

  const handlePillClick = (path, e) => {
    const btn  = e.currentTarget
    const rect = btn.getBoundingClientRect()
    setRipple({ path, x: e.clientX - rect.left, y: e.clientY - rect.top })
    setTimeout(() => setRipple(null), 500)
    navigate(path)
  }

  const initials = user.name
    ? user.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
    : '?'
  const isPro = user.plan === 'pro'

  return (
    <>
      {/* ── Desktop top navbar ─────────────────────────── */}
      <nav className={`nb${scrolled ? ' scrolled' : ''}`}>
        <button className="logow" onClick={() => navigate('/dashboard')}>
          <div className="logom">
            <svg viewBox="0 0 18 18" fill="none" width="18" height="18">
              <circle cx="9" cy="9" r="7.5" stroke="#00ffcc" strokeWidth="1" opacity="0.4"/>
              <polyline points="3,12 6.5,8 9.5,10 14,5" stroke="#00ffcc" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="14" cy="5" r="1.6" fill="#00ffcc"/>
            </svg>
          </div>
          <div className="logt"><span>Finanças</span>Pro</div>
        </button>

        <div className="navlinks">
          {links.map(({ path, label, Icon }) => (
            <button
              key={path}
              className={`nl${isActive(path) ? ' on' : ''}`}
              onClick={() => navigate(path)}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        <div className="nbuser">
          <div className="navav" title={user.name}>{initials}</div>
          <span className="navnm">{user.name?.split(' ')[0]}</span>
          {isPro
            ? <span style={{ fontSize: 11, fontWeight: 700, color: '#020d10', background: 'var(--c)', padding: '2px 8px', borderRadius: 20 }}>PRO ✨</span>
            : <button className="btn bg" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => navigate('/planos')}>⚡ Upgrade</button>
          }
          <button className="btnout" onClick={logout}>Sair</button>
        </div>
      </nav>

      {/* Aurora stripe animada abaixo da navbar */}
      <div className="nbline">
        <div className="nblinei" />
      </div>

      {/* ── Mobile pill nav ────────────────────────────── */}
      <nav className="bottom-pill-nav pillnav">
        <div className="bottom-pill-inner pillrow">
          {links.map(({ path, label, Icon }) => {
            const active = isActive(path)
            return (
              <button
                key={path}
                className={`pit pill-nav-item${active ? ' on pill-nav-item--active' : ''}`}
                onClick={(e) => handlePillClick(path, e)}
              >
                {ripple?.path === path && (
                  <span className="pill-ripple" style={{ left: ripple.x, top: ripple.y }} />
                )}
                {active && <span className="pill-active-bg" />}
                <Icon size={active ? 22 : 20} />
                <span className="pill-nav-label">{label}</span>
              </button>
            )
          })}

          {!isPro && (
            <button
              className="pit pill-nav-item"
              style={{ color: 'var(--c)' }}
              onClick={() => navigate('/planos')}
            >
              <svg width={20} height={20} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd"/>
              </svg>
              <span className="pill-nav-label">Upgrade</span>
            </button>
          )}

          <button className="pit pill-nav-item pout pill-nav-item--logout" onClick={logout}>
            <LogoutIcon size={20} />
            <span className="pill-nav-label">Sair</span>
          </button>
        </div>
      </nav>
    </>
  )
}

function HomeIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="currentColor">
      <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/>
    </svg>
  )
}

function WalletIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="currentColor">
      <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4zM18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z"/>
    </svg>
  )
}

function GearIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/>
    </svg>
  )
}

function LogoutIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd"/>
    </svg>
  )
}
