import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTheme } from '../../hooks/useTheme.js'
import DesktopSidebar from './DesktopSidebar.jsx'
import DesktopTopbar from './DesktopTopbar.jsx'

function HomeIcon()   { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> }
function TargetIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg> }
function SwapIcon()   { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 4v16"/><path d="M3 8l4-4 4 4"/><path d="M17 20V4"/><path d="M13 16l4 4 4-4"/></svg> }
function UserIcon()   { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 016-6h4a6 6 0 016 6v1"/></svg> }
function InstIcon()   { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> }
function PlusIcon()   { return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> }
function ArrowUpIcon()   { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg> }
function ArrowDownIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg> }
function MicIcon()    { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg> }


// Casca das telas logadas: menu lateral + barra de cima no desktop (DesktopSidebar/DesktopTopbar, design "Nancy Desktop"),
// barra de baixo e menu do "+" no celular. Cada tela monta a sua própria Navbar.
export default function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()
  // useTheme é quem aplica o tema salvo no <html> (único ponto que escreve data-theme; ver hooks/useTheme.js)
  useTheme()

  // "/settings" fica ativo em qualquer subtela dele (ex: /settings/seguranca)
  const isActive  = (path) => path === '/settings'
    ? location.pathname.startsWith('/settings') || ['/termos', '/privacidade'].includes(location.pathname) // Termos/Privacidade abrem pelo Perfil
    : location.pathname === path
  // No design, Notificações e Finanças (aberta pelo "Contas do mês" do Extrato) aparecem com
  // "Extrato" aceso na barra de baixo (mobile).
  const isMobileActive = (path) => isActive(path)
    || (path === '/transactions' && ['/notificacoes', '/financas', '/parcelados', '/contas-do-mes', '/calendar', '/analise'].includes(location.pathname))
    || (path === '/goals' && ['/historico', '/assinaturas', '/lembretes', '/limites'].includes(location.pathname)) // sub-telas das Metas

  // Barra inferior mobile (design Nancy 2): Início · Extrato · "+" · Metas · Perfil.
  // "Finanças" saiu da barra — continua acessível pelo atalho "Contas do mês" do
  // Extrato e pelo menu lateral do desktop. "Perfil" leva às configurações.
  const mobileNavLinksLeft  = [
    { path: '/dashboard',    label: 'Início',  Icon: HomeIcon },
    { path: '/transactions', label: 'Extrato', Icon: SwapIcon },
  ]
  const mobileNavLinksRight = [
    { path: '/goals',    label: 'Metas',  Icon: TargetIcon },
    { path: '/settings', label: 'Perfil', Icon: UserIcon   },
  ]

  const [showQuickMenu, setShowQuickMenu] = useState(false)

  // Fecha o menu rápido ao trocar de página (ex: depois de navegar pra
  // /goals) — evita ele ficar aberto por cima de uma tela diferente.
  useEffect(() => { setShowQuickMenu(false) }, [location.pathname])

  // Bolhas brancas com o ícone colorido (design Nancy 2): verde = entrada, vermelho =
  // saída, azul = ações da marca. Receita/Despesa abrem a folha "Nova transação" por
  // cima da tela atual (NewTransactionSheet, montado em App.jsx).
  const quickMenuActions = [
    { key: 'income',      label: 'Receita',          Icon: ArrowUpIcon,   iconColor: '#19C884',
      onSelect: () => window.dispatchEvent(new CustomEvent('nancy:new-transaction', { detail: { type: 'income' } })) },
    { key: 'installment', label: 'Compra Parcelada', Icon: InstIcon,      iconColor: '#1C48FF',
      onSelect: () => navigate('/parcelados', { state: { focusForm: true } }) },
    { key: 'voice',       label: 'Falar com IA',     Icon: MicIcon,       iconColor: '#1C48FF',
      onSelect: () => window.dispatchEvent(new Event('nancy:open-agent-chat')) },
    { key: 'expense',     label: 'Despesa',          Icon: ArrowDownIcon, iconColor: '#E5484D',
      onSelect: () => window.dispatchEvent(new CustomEvent('nancy:new-transaction', { detail: { type: 'expense' } })) },
    { key: 'goals',       label: 'Metas',            Icon: TargetIcon,    iconColor: '#12A06E',
      onSelect: () => navigate('/goals') },
  ]

  const handleQuickAction = (action) => {
    setShowQuickMenu(false)
    action.onSelect()
  }

  return (
    <>
      {/* ── Desktop: menu lateral e barra de cima ── */}
      <DesktopSidebar />
      <DesktopTopbar />

      {/* ── Menu rápido do "+" central (mobile) — bolhas flutuantes sobre um
          fundo escurecido, sem trocar de tela, estilo Mobills ── */}
      {showQuickMenu && (
        <>
          <div className="dsb-qm-backdrop" onClick={() => setShowQuickMenu(false)} />
          <div className="dsb-qm-grid">
            {quickMenuActions.map(({ key, label, Icon, iconColor }, i) => (
              <button
                key={key}
                className="dsb-qm-bubble"
                style={{ '--qm-delay': `${i * 30}ms`, '--qm-icon': iconColor }}
                onClick={() => handleQuickAction(quickMenuActions[i])}
              >
                <div className="dsb-qm-circle"><Icon /></div>
                <span className="dsb-qm-lbl">{label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── Mobile bottom nav ── */}
      <nav className={`dsb-mobile-nav${showQuickMenu ? ' menu-open' : ''}`}>
        {mobileNavLinksLeft.map(({ path, label, Icon }) => {
          const active = isMobileActive(path)
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

        <button
          className={`dsb-mn-fab${showQuickMenu ? ' active' : ''}`}
          onClick={() => setShowQuickMenu(v => !v)}
          aria-label="Ações rápidas"
        >
          <PlusIcon />
        </button>

        {mobileNavLinksRight.map(({ path, label, Icon }) => {
          const active = isMobileActive(path)
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
      </nav>
    </>
  )
}
