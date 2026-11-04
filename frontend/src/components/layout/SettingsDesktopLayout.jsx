import { useNavigate, useLocation } from 'react-router-dom'
import Navbar from './Navbar.jsx'
import ProtoIcon from './ProtoIcon.jsx'
import { isInstalled } from '../../services/installPrompt.js'

// Menu das telas da conta no desktop (design "Nancy Desktop", telas 25 a 36): a coluna de 240px com as 12 telas e, ao lado, o conteúdo de cada uma.
// A tela aberta fica azul-clara. "Instalar app" some quando o app já está instalado (como no celular).
export const SETTINGS_NAV = [
  { to: '/settings',             label: 'Visão geral',      icon: 'user' },
  { to: '/settings/perfil',      label: 'Dados pessoais',   icon: 'user' },
  { to: '/settings/seguranca',   label: 'Segurança',        icon: 'lock' },
  { to: '/settings/notificacoes', label: 'Preferências',    icon: 'bell' },
  { to: '/settings/fechamento',  label: 'Balanço mensal',   icon: 'scale' },
  { to: '/planos',               label: 'Planos',           icon: 'zap' },
  { to: '/settings/pagamentos',  label: 'Pagamentos',       icon: 'card' },
  { to: '/settings/indique',     label: 'Indique e ganhe',  icon: 'gift' },
  { to: '/settings/dados',       label: 'Meus dados',       icon: 'folder' },
  { to: '/settings/instalar',    label: 'Instalar app',     icon: 'download' },
  { to: '/termos',               label: 'Termos de Uso',    icon: 'shield' },
  { to: '/privacidade',          label: 'Privacidade',      icon: 'shield' },
]

export const visibleSettingsNav = () => SETTINGS_NAV.filter(i => i.to !== '/settings/instalar' || !isInstalled())

export default function SettingsDesktopLayout({ children, wide = false }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const here = pathname.replace(/\/+$/, '') || '/'
  return (
    <>
      <Navbar />
      <div className="pwnav ndh-pwnav fade-in">
        <div className="nst-page">
          <nav className="nst-nav" aria-label="Conta">
            {visibleSettingsNav().map(i => (
              <button key={i.to} type="button" className={`nst-item${here === i.to ? ' on' : ''}`} aria-current={here === i.to ? 'page' : undefined} onClick={() => { if (here !== i.to) navigate(i.to) }}>
                <ProtoIcon name={i.icon} size={17} />{i.label}
              </button>
            ))}
          </nav>
          <div className={`nst-content${wide ? ' wide' : ''}`}>{children}</div>
        </div>
      </div>
    </>
  )
}
