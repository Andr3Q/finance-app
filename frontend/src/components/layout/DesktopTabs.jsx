import { useNavigate, useLocation } from 'react-router-dom'
import ProtoIcon from './ProtoIcon.jsx'

// Abas que o design desktop coloca no alto das telas de um mesmo assunto (Extrato · Contas do mês · Parceladas · Análise).
// Mesmas rotas do menu do celular; a aba da tela aberta fica azul.
export const TAB_GROUPS = {
  extrato: [
    { to: '/transactions',  label: 'Extrato',       icon: 'list' },
    { to: '/contas-do-mes', label: 'Contas do mês', icon: 'receipt' },
    { to: '/parcelados',    label: 'Parceladas',    icon: 'layers' },
    { to: '/analise',       label: 'Análise',       icon: 'chart' },
  ],
}

export default function DesktopTabs({ group, label }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  return (
    <nav className="nds-tabs" aria-label={label || 'Seções'}>
      {(TAB_GROUPS[group] || []).map(t => {
        const on = pathname === t.to
        return (
          <button key={t.to} type="button" className={`nds-tab${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined} onClick={() => { if (!on) navigate(t.to) }}>
            <ProtoIcon name={t.icon} size={16} />{t.label}
          </button>
        )
      })}
    </nav>
  )
}
