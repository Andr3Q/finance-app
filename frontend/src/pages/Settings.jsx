import { useNavigate } from 'react-router-dom'
import Navbar from '../components/layout/Navbar.jsx'
import { authAPI } from '../services/api.js'
import { useUser } from '../hooks/useUser.js'
import { useForcedLightTheme } from '../hooks/useTheme.js'
import { isInstalled } from '../services/installPrompt.js'
import { avatarSrc } from '../utils/avatarImage.js'

const Ico = ({ size = 18, sw = 1.9, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
)
const ICONS = {
  user:     <><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
  folder:   <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
  scale:    <><path d="M12 3v18.5"/><path d="M3 8.5h18"/><path d="M4.8 9L1.6 14.8a3.3 3.3 0 006.4 0z"/><path d="M19.2 9L16 14.8a3.3 3.3 0 006.4 0z"/></>,
  lock:     <><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></>,
  bell:     <><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></>,
  bolt:     <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>,
  card:     <><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></>,
  share:    <><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/></>,
  data:     <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></>,
  download: <><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
  doc:      <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></>,
  shield:   <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>,
  logout:   <><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
}
const Chevron = () => <Ico size={16} sw={2}><polyline points="9 18 15 12 9 6"/></Ico>

const initialsOf = (name) => (name ? name.trim().split(/\s+/).slice(0, 2).map(n => n[0]).join('').toUpperCase() : '?')
const PLAN_LABELS = { elite: 'Plano Elite', pro: 'Plano Pro' }

// Perfil (Nancy 2, tela 24): avatar, nome e plano no topo, atalho para os resumos em stories e uma
// lista única com as telas da conta. Cada linha leva à tela de antes (nada saiu do app): o que o design
// não mostra (e-mail no topo, subtítulos, cartão de upgrade, abas Gerenciar/Acompanhar/Sobre) saiu daqui,
// mas Planos, Dados pessoais etc. continuam a um toque.
export default function Settings() {
  const navigate = useNavigate()
  const user = useUser()
  useForcedLightTheme() // tela desenhada só no claro (design Nancy 2)

  const rows = [
    { key: 'dados',        label: 'Dados pessoais',          to: '/settings/perfil',       icon: 'user' },
    { key: 'financas',     label: 'Finanças',                to: '/financas',              icon: 'folder' },
    { key: 'calendario',   label: 'Calendário',              to: '/calendar',              icon: 'calendar' },
    { key: 'balanco',      label: 'Balanço mensal',          to: '/settings/fechamento',   icon: 'scale' },
    { key: 'seguranca',    label: 'Segurança',               to: '/settings/seguranca',    icon: 'lock' },
    { key: 'notificacoes', label: 'Notificações',            to: '/settings/notificacoes', icon: 'bell' },
    { key: 'planos',       label: 'Planos',                  to: '/planos',                icon: 'bolt' },
    { key: 'pagamentos',   label: 'Pagamentos',              to: '/settings/pagamentos',   icon: 'card' },
    { key: 'indique',      label: 'Indique e ganhe',         to: '/settings/indique',      icon: 'share' },
    { key: 'meus-dados',   label: 'Meus dados',              to: '/settings/dados',        icon: 'data' },
    ...(isInstalled() ? [] : [{ key: 'instalar', label: 'Instalar app', to: '/settings/instalar', icon: 'download' }]),
    { key: 'termos',       label: 'Termos de uso',           to: '/termos',                icon: 'doc' },
    { key: 'privacidade',  label: 'Política de privacidade', to: '/privacidade',           icon: 'shield' },
  ]

  const handleLogout = async () => {
    try { await authAPI.logout() } catch { /* ignora erros de rede */ }
    sessionStorage.removeItem('user')
    sessionStorage.removeItem('token')
    navigate('/login')
  }

  const planLabel = PLAN_LABELS[user.plan] || 'Plano Grátis'
  const paid = user.plan === 'elite' || user.plan === 'pro'

  return (
    <>
      <Navbar />
      <div className="pwnav pf-pwnav fade-in">
        <div className="pf-page">
          <header className="pf-hero">
            <div className="pf-av" aria-hidden="true">{avatarSrc(user) ? <img src={avatarSrc(user)} alt="" /> : initialsOf(user.name)}</div>
            <h1 className="pf-name">{user.name || 'Usuário'}</h1>
            <button type="button" className={`pf-plan${paid ? '' : ' free'}`} onClick={() => navigate('/planos')} aria-label={`${planLabel}: gerenciar plano`}>
              {planLabel}
            </button>
          </header>

          <button type="button" className="pf-stories" onClick={() => navigate('/resumo-stories', { state: { monthOffset: 0 } })}>
            <span className="pf-stories-ico"><Ico size={20} sw={1.8}><polygon points="8 5 19 12 8 19 8 5"/></Ico></span>
            <span className="pf-stories-text">
              <span className="pf-stories-title">Resumos mensais</span>
              <span className="pf-stories-sub">Reveja seus meses em stories</span>
            </span>
            <Chevron />
          </button>

          <nav className="pf-list" aria-label="Conta">
            {rows.map(r => (
              <button key={r.key} type="button" className="pf-row" onClick={() => navigate(r.to)}>
                <span className="pf-row-ico"><Ico>{ICONS[r.icon]}</Ico></span>
                <span className="pf-row-label">{r.label}</span>
                <Chevron />
              </button>
            ))}
            <button type="button" className="pf-row pf-row-out" onClick={handleLogout}>
              <span className="pf-row-ico"><Ico>{ICONS.logout}</Ico></span>
              <span className="pf-row-label">Sair da conta</span>
            </button>
          </nav>
        </div>
      </div>
    </>
  )
}
