import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { nextPlanLabel } from '../config/planLimits.js'
import Navbar from '../components/layout/Navbar.jsx'
import { authAPI } from '../services/api.js'
import { useUser } from '../hooks/useUser.js'
import { isInstalled } from '../services/installPrompt.js'
import SettingsHero from '../components/features/settings/SettingsHero.jsx'
import SettingsMenuRow from '../components/features/settings/SettingsMenuRow.jsx'

function UserIcon()     { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ae2ac" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> }
function WalletIcon()   { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ae2ac" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2v-5"/><path d="M16 12h5v4h-5a2 2 0 010-4z"/></svg> }
function TargetIcon()   { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ae2ac" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg> }
function LockIcon()     { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ae2ac" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> }
function BellIcon()     { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ae2ac" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg> }
function CalIcon()      { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ae2ac" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> }
function ScaleIcon()    { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ae2ac" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="3" x2="12" y2="21"/><path d="M5 7l-3 6a3 3 0 006 0z"/><path d="M19 7l-3 6a3 3 0 006 0z"/><path d="M5 7h14"/></svg> }
function BoltIcon()     { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ae2ac" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> }
function ShareIcon()    { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ae2ac" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/></svg> }
function ReceiptIcon()  { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ae2ac" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 3h16v18l-3-2-3 2-3-2-3 2-3-2-1 2z"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/></svg> }
function ShieldIcon()   { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ae2ac" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> }
function DownloadIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ae2ac" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> }
function FolderIcon()   { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ae2ac" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg> }
function LogoutIcon()   { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg> }

const TABS = [
  { key: 'gerenciar',  label: 'Gerenciar' },
  { key: 'acompanhar', label: 'Acompanhar' },
  { key: 'sobre',      label: 'Sobre' },
]

export default function Settings() {
  const navigate = useNavigate()
  const user = useUser()
  const isPro = user.plan === 'pro' || user.plan === 'elite'
  const [activeTab, setActiveTab] = useState('gerenciar')

  const handleLogout = async () => {
    try { await authAPI.logout() } catch { /* ignora erros de rede */ }
    sessionStorage.removeItem('user')
    sessionStorage.removeItem('token')
    navigate('/login')
  }

  return (
    <>
      <Navbar />

      <div className="pwnav fade-in">
        <div className="dsb-content">
          <div className="cfg-wrap">

            <SettingsHero user={user} isPro={isPro} />

            {nextPlanLabel(user.plan) && (
              <div className="cfg-plan-card-mobile">
                <div
                  className="cfg-plan-upgrade-card"
                  onClick={() => navigate('/planos')}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && navigate('/planos')}
                >
                  <span className={`cfg-plan-badge cfg-plan-badge-${user.plan ?? 'free'}`}>
                    {(user.plan ?? 'free').toUpperCase()}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div className="cfg-plan-upgrade-text">
                      ⚡ Upgrade para {nextPlanLabel(user.plan)}
                      <span className="cfg-plan-upgrade-sub">Desbloqueie mais recursos e limites maiores</span>
                    </div>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="2" strokeLinecap="round">
                    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                  </svg>
                </div>
              </div>
            )}

            <div className="cfg-seg">
              {TABS.map(t => (
                <button
                  key={t.key}
                  className={`cfg-seg-btn ${activeTab === t.key ? 'active' : ''}`}
                  onClick={() => setActiveTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {activeTab === 'gerenciar' && (
              <>
                <SettingsMenuRow icon={<UserIcon />} title="Perfil" subtitle="Nome, e-mail, verificação" onClick={() => navigate('/settings/perfil')} />
                <SettingsMenuRow icon={<WalletIcon />} title="Finanças" subtitle="Salário e contas fixas" onClick={() => navigate('/financas')} />
                <SettingsMenuRow icon={<TargetIcon />} title="Metas" subtitle="Objetivos financeiros" onClick={() => navigate('/goals')} />
                <SettingsMenuRow icon={<LockIcon />} title="Segurança" subtitle="Senha e autenticação em duas etapas" onClick={() => navigate('/settings/seguranca')} />
                <SettingsMenuRow icon={<BellIcon />} title="Notificações" subtitle="Alertas e lembretes" onClick={() => navigate('/settings/notificacoes')} />
              </>
            )}

            {activeTab === 'acompanhar' && (
              <>
                <SettingsMenuRow icon={<CalIcon />} title="Calendário" subtitle="Vencimentos e lançamentos" onClick={() => navigate('/calendar')} />
                <SettingsMenuRow icon={<ScaleIcon />} title="Balanço mensal" subtitle="Fechar o mês e gerar relatório" onClick={() => navigate('/settings/fechamento')} />
              </>
            )}

            {activeTab === 'sobre' && (
              <>
                <SettingsMenuRow icon={<BoltIcon />} title="Planos" subtitle="Assinatura e recursos Pro/Elite" onClick={() => navigate('/planos')} />
                <SettingsMenuRow icon={<ShareIcon />} title="Indique e Ganhe" subtitle="Convide amigos, ganhe dias de Pro" onClick={() => navigate('/settings/indique')} />
                <SettingsMenuRow icon={<ReceiptIcon />} title="Pagamentos" subtitle="Histórico e cancelamento" onClick={() => navigate('/settings/pagamentos')} />
                <SettingsMenuRow icon={<ShieldIcon />} title="Termos de Uso" onClick={() => navigate('/termos')} />
                <SettingsMenuRow icon={<ShieldIcon />} title="Política de Privacidade" onClick={() => navigate('/privacidade')} />
                <SettingsMenuRow icon={<FolderIcon />} title="Meus dados" subtitle="Exportar ou excluir sua conta" onClick={() => navigate('/settings/dados')} />
                {!isInstalled() && (
                  <SettingsMenuRow icon={<DownloadIcon />} title="Instalar app" subtitle="Acesso rápido pela tela inicial" onClick={() => navigate('/settings/instalar')} />
                )}
                <SettingsMenuRow icon={<LogoutIcon />} title="Sair da conta" onClick={handleLogout} danger chevron={false} />
              </>
            )}

          </div>
        </div>
      </div>
    </>
  )
}
