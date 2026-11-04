import SettingsDesktopLayout from '../components/layout/SettingsDesktopLayout.jsx'
import ProtoIcon from '../components/layout/ProtoIcon.jsx'
import { avatarSrc } from '../utils/avatarImage.js'
import { isInstalled } from '../services/installPrompt.js'

const initialsOf = (name) => (name ? name.trim().split(/\s+/).slice(0, 2).map(n => n[0]).join('').toUpperCase() : '?')
const PLAN_LABELS = { elite: 'Elite', pro: 'Pro' }

// os nove atalhos do design, na ordem e com as descrições do protótipo (o texto do "Indique e ganhe" é o real: dias de Pro por amigo, não "30 dias")
const CARDS = [
  { to: '/settings/perfil',       label: 'Dados pessoais',  desc: 'Nome, e-mail e foto',        icon: 'user' },
  { to: '/settings/seguranca',    label: 'Segurança',       desc: 'Senha e duas etapas',        icon: 'lock' },
  { to: '/settings/notificacoes', label: 'Preferências',    desc: 'Alertas e lembretes',        icon: 'bell' },
  { to: '/settings/fechamento',   label: 'Balanço mensal',  desc: 'Feche o mês em PDF',         icon: 'scale' },
  { to: '/planos',                label: 'Planos',          desc: 'Grátis, Pro e Elite',        icon: 'zap' },
  { to: '/settings/pagamentos',   label: 'Pagamentos',      desc: 'Faturas e cancelamento',     icon: 'card' },
  { to: '/settings/indique',      label: 'Indique e ganhe', desc: 'Ganhe dias de Pro',          icon: 'gift' },
  { to: '/settings/dados',        label: 'Meus dados',      desc: 'Exportar ou excluir',        icon: 'folder' },
  { to: '/settings/instalar',     label: 'Instalar app',    desc: 'App no computador',          icon: 'download' },
]

// Configurações no desktop (design "Nancy Desktop", tela 25): o menu da conta, o cartão azul com a pessoa e o plano e os atalhos em três colunas, mais "Sair da
// conta". Só a apresentação — nome, foto, plano e a saída são do Settings, que passa tudo em `ctx`. O design diz "membro desde jan 2026"; o app não guarda
// essa data na sessão, então o cartão mostra só o e-mail.
export default function SettingsDesktop({ ctx }) {
  const { user, onLogout, go } = ctx
  const paid = user.plan === 'elite' || user.plan === 'pro'
  return (
    <SettingsDesktopLayout>
      <section className="nst-hero">
        <span className="nst-av" aria-hidden="true">{avatarSrc(user) ? <img src={avatarSrc(user)} alt="" /> : initialsOf(user.name)}</span>
        <div className="nst-who"><h1>{user.name || 'Usuário'}</h1>{user.email && <span>{user.email}</span>}</div>
        <button type="button" className={`nst-plan${paid ? '' : ' free'}`} onClick={() => go('/planos')} aria-label={`${PLAN_LABELS[user.plan] ? `Plano ${PLAN_LABELS[user.plan]}` : 'Plano Grátis'}: gerenciar plano`}>
          {paid && <ProtoIcon name="spark" size={14} />}{PLAN_LABELS[user.plan] || 'Grátis'}
        </button>
      </section>
      <div className="nst-cards">
        {CARDS.filter(c => c.to !== '/settings/instalar' || !isInstalled()).map(c => (
          <button key={c.to} type="button" className="nst-card" onClick={() => go(c.to)}>
            <span className="nst-card-ico"><ProtoIcon name={c.icon} size={19} /></span>
            <span className="nst-card-text"><strong>{c.label}</strong><span>{c.desc}</span></span>
          </button>
        ))}
      </div>
      <button type="button" className="nst-out" onClick={onLogout}><ProtoIcon name="logout" size={18} />Sair da conta</button>
    </SettingsDesktopLayout>
  )
}
