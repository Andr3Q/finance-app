// ─── src/components/Navbar.jsx ─────────────────────────
// Barra de navegação com menu hamburguer para mobile

import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

export default function Navbar() {
  const navigate     = useNavigate()
  const location     = useLocation()
  const user         = JSON.parse(localStorage.getItem('user') || '{}')
  const [open, setOpen] = useState(false)

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    navigate('/login')
  }

  const links = [
    { path: '/dashboard',    label: '🏠 Dashboard'    },
    { path: '/transactions', label: '💳 Transações'   },
    { path: '/settings',     label: '⚙️ Configurações' }
  ]

  const isActive = (path) => location.pathname === path

  return (
    <>
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: 'rgba(8,8,26,0.92)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', height: 64
      }}>
        {/* Logo */}
        <span style={{ fontWeight: 800, fontSize: 18, cursor: 'pointer', flexShrink: 0 }}
          onClick={() => { navigate('/dashboard'); setOpen(false) }}>
          💸 <span style={{ color: 'var(--color-green)' }}>Finanças</span>Pro
        </span>

        {/* Links — desktop */}
        <div className="nav-desktop" style={{ display: 'flex', gap: 4 }}>
          {links.map(l => (
            <button key={l.path} onClick={() => navigate(l.path)} style={{
              background: isActive(l.path) ? 'rgba(0,208,132,0.1)' : 'none',
              border: 'none', padding: '8px 16px', borderRadius: 10,
              color: isActive(l.path) ? 'var(--color-green)' : 'var(--text-secondary)',
              cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
              transition: 'all 0.2s'
            }}>{l.label}</button>
          ))}
        </div>

        {/* Usuário + Sair — desktop */}
        <div className="nav-desktop" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Olá, <strong style={{ color: 'var(--text-primary)' }}>{user.name?.split(' ')[0]}</strong>
          </span>
          <button className="btn btn-ghost" onClick={logout} style={{ padding: '6px 14px', fontSize: 12 }}>
            Sair
          </button>
        </div>

        {/* Hamburguer — mobile */}
        <button className="nav-mobile" onClick={() => setOpen(o => !o)} style={{
          background: 'none', border: 'none', color: 'var(--text-primary)',
          fontSize: 22, cursor: 'pointer', padding: '8px', lineHeight: 1
        }}>
          {open ? '✕' : '☰'}
        </button>
      </nav>

      {/* Menu mobile (dropdown) */}
      {open && (
        <div className="nav-mobile" style={{
          position: 'fixed', top: 64, left: 0, right: 0, zIndex: 99,
          background: 'rgba(8,8,26,0.97)', backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          padding: '12px 16px 20px', display: 'flex', flexDirection: 'column', gap: 4
        }}>
          {links.map(l => (
            <button key={l.path} onClick={() => { navigate(l.path); setOpen(false) }} style={{
              background: isActive(l.path) ? 'rgba(0,208,132,0.1)' : 'none',
              border: 'none', borderRadius: 10, padding: '12px 16px',
              color: isActive(l.path) ? 'var(--color-green)' : 'var(--text-secondary)',
              cursor: 'pointer', fontFamily: 'inherit', fontSize: 15, fontWeight: 600,
              textAlign: 'left', width: '100%', transition: 'all 0.2s'
            }}>{l.label}</button>
          ))}
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              👤 {user.name?.split(' ')[0]}
            </span>
            <button className="btn btn-ghost" onClick={logout} style={{ fontSize: 13 }}>
              Sair
            </button>
          </div>
        </div>
      )}
    </>
  )
}
