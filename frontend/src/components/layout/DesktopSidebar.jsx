import { useNavigate, useLocation } from 'react-router-dom'
import { useUser } from '../../hooks/useUser.js'
import NancyMark from '../ui/NancyMark.jsx'
import ProtoIcon from './ProtoIcon.jsx'
import { visibleDesktopNav, desktopNavState } from '../../utils/desktopNav.js'
import { avatarSrc } from '../../utils/avatarImage.js'

const initialsOf = (name) => (name ? name.split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase() : '?')

// Cartão do plano, no pé do menu. O design só desenha o Elite; os outros planos seguem o mesmo cartão, levando a Planos.
function planCard(user) {
  if (user.plan === 'elite') return { title: 'Plano Elite', text: 'IA ilimitada e Planilha IA ativas' }
  if (user.isOnTrial) {
    const days = Math.max(0, Math.ceil((new Date(user.trialEndsAt) - Date.now()) / 86400000))
    return { title: 'Teste do Pro', text: days === 1 ? 'Falta 1 dia para o teste acabar' : `Faltam ${days} dias para o teste acabar` }
  }
  if (user.plan === 'pro') return { title: 'Plano Pro', text: 'Veja o que o Elite inclui' }
  return { title: 'Plano Grátis', text: 'Conheça o Pro e o Elite' }
}

// Menu lateral do desktop (design "Nancy Desktop": 248 px, azul chapado, brilho menta no canto de baixo).
export default function DesktopSidebar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const user = useUser()
  const { activeNav, inSettings } = desktopNavState(pathname)
  const plan = planCard(user)
  const photo = avatarSrc(user)
  const name = user.name || 'Usuário'

  const go = (item) => {
    if (item.action) window.dispatchEvent(new Event(item.action))
    else navigate(item.to)
  }

  return (
    <aside className="nds-sidebar" aria-label="Menu lateral">
      <div className="nds-glow" aria-hidden="true" />
      <button type="button" className="nds-logo" onClick={() => navigate('/dashboard')} aria-label="Nancy, ir para o Início">
        <NancyMark size={36} />
        <span className="nds-logo-name">nancy</span>
      </button>

      <nav className="nds-nav" aria-label="Menu principal">
        {visibleDesktopNav().map(item => {
          const active = activeNav === item.key
          return (
            <button
              key={item.key}
              type="button"
              className={`nds-item${active ? ' active' : ''}`}
              aria-current={active ? 'page' : undefined}
              onClick={() => go(item)}
            >
              <ProtoIcon name={item.icon} size={19} />
              <span className="nds-item-label">{item.label}</span>
              {item.badge && <span className="nds-badge">{item.badge}</span>}
            </button>
          )
        })}
      </nav>

      <div className="nds-spacer" />

      <button type="button" className="nds-plan" onClick={() => navigate('/planos')}>
        <span className="nds-plan-title"><span className="nds-plan-ico"><ProtoIcon name="zap" /></span>{plan.title}</span>
        <span className="nds-plan-text">{plan.text}</span>
      </button>

      <button
        type="button"
        className={`nds-user${inSettings ? ' active' : ''}`}
        onClick={() => navigate('/settings')}
        aria-label={`${name}, abrir Configurações`}
      >
        <span className="nds-av">
          {photo ? <img src={photo} alt="" /> : initialsOf(user.name)}
        </span>
        <span className="nds-user-info">
          <span className="nds-user-name">{name}</span>
          <span className="nds-user-sub">Configurações</span>
        </span>
        <ProtoIcon name="gear" />
      </button>
    </aside>
  )
}
