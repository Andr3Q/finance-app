import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/layout/Navbar.jsx'
import { authAPI } from '../services/api.js'
import UpgradeModal from '../components/ui/UpgradeModal.jsx'
import { useUser } from '../hooks/useUser.js'
import SettingsHero        from '../components/features/settings/SettingsHero.jsx'
import ProfileCard         from '../components/features/settings/ProfileCard.jsx'
import SalaryCard          from '../components/features/settings/SalaryCard.jsx'
import NotificationsCard   from '../components/features/settings/NotificationsCard.jsx'
import MonthlyCloseCard    from '../components/features/settings/MonthlyCloseCard.jsx'
import InstallCard         from '../components/features/settings/InstallCard.jsx'
import ReferralCard        from '../components/features/settings/ReferralCard.jsx'
import TwoFactorCard        from '../components/features/settings/TwoFactorCard.jsx'
import ChangePasswordCard   from '../components/features/settings/ChangePasswordCard.jsx'
import CancelPlanCard       from '../components/features/settings/CancelPlanCard.jsx'
import FixedExpensesCard    from '../components/features/settings/FixedExpensesCard.jsx'
import PaymentHistoryCard   from '../components/features/settings/PaymentHistoryCard.jsx'
import EmailVerifyCard      from '../components/features/settings/EmailVerifyCard.jsx'

export default function Settings() {
  const navigate = useNavigate()
  const user  = useUser()
  const isPro = user.plan === 'pro' || user.plan === 'elite'

  const [msg,           setMsg]          = useState('')
  const [msgType,       setMsgType]      = useState('success')
  const [upgradeModal,  setUpgradeModal] = useState(null)
  const [deleteModal,   setDeleteModal]  = useState(false)
  const [deletePass,    setDeletePass]   = useState('')
  const [deleteErr,     setDeleteErr]    = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)

  const showMsg = (text, type = 'success') => {
    setMsg(text); setMsgType(type)
    setTimeout(() => setMsg(''), 4000)
  }

  const handleLogout = async () => {
    try { await authAPI.logout() } catch { /* ignora erros de rede */ }
    sessionStorage.removeItem('user')
    sessionStorage.removeItem('token')
    navigate('/login')
  }

  const handleDeleteAccount = async () => {
    if (!deletePass) { setDeleteErr('Digite sua senha para confirmar.'); return }
    setDeleteLoading(true); setDeleteErr('')
    try {
      await authAPI.deleteAccount(deletePass)
      sessionStorage.removeItem('user')
      sessionStorage.removeItem('token')
      navigate('/login')
    } catch (err) {
      setDeleteErr(err.response?.data?.error || 'Erro ao excluir conta.')
      setDeleteLoading(false)
    }
  }

  return (
    <>
      <Navbar />

      {msg && (
        <div className={`toast ${msgType === 'error' ? 'terr' : 'tok'}`} style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 400, whiteSpace: 'nowrap' }}>
          {msg}
        </div>
      )}

      <div className="pwnav fade-in">
        <div className="dsb-content">
          <div className="cfg-wrap">

            <SettingsHero user={user} isPro={isPro} />

            <div className="cfg-sec-title r2">Perfil</div>
            <EmailVerifyCard onMessage={showMsg} />
            <ProfileCard user={user} />

            <div className="cfg-sec-title r4">Financeiro</div>
            <SalaryCard user={user} onMessage={showMsg} />
            <FixedExpensesCard onMessage={showMsg} onUpgrade={setUpgradeModal} />

            <div className="cfg-sec-title r7">Preferências</div>
            <NotificationsCard isPro={isPro} onMessage={showMsg} onUpgrade={setUpgradeModal} />

            <MonthlyCloseCard   user={user} isPro={isPro} onMessage={showMsg} onUpgrade={setUpgradeModal} />

            <div className="cfg-sec-title r4">Indique e Ganhe</div>
            <ReferralCard />

            <InstallCard />

            <div className="cfg-sec-title r10">Segurança</div>
            <ChangePasswordCard onMessage={showMsg} />
            <TwoFactorCard isPro={isPro} onMessage={showMsg} onUpgrade={setUpgradeModal} />

            <div className="cfg-sec-title r10">Conta</div>
            <CancelPlanCard onMessage={showMsg} />
            <PaymentHistoryCard />

            {/* Sair — só aparece no mobile (desktop tem o botão na sidebar) */}
            <div className="cfg-card r10 cfg-mobile-only">
              <button className="cfg-btn-danger cfg-logout-btn" onClick={handleLogout}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                Sair da conta
              </button>
            </div>

            {/* Exportar dados — LGPD Art. 15 */}
            <div className="cfg-card">
              <div className="cfg-card-head">
                <div className="cfg-ch-ico">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div className="cfg-ch-title">Exportar meus dados</div>
                  <div className="cfg-ch-sub">Baixe um arquivo JSON com todos os seus dados (LGPD Art. 15).</div>
                </div>
                <button
                  className="cfg-btn-secondary"
                  style={{ flexShrink: 0, fontSize: 12, padding: '8px 14px' }}
                  onClick={async () => {
                    try {
                      const res = await authAPI.exportData()
                      const url = URL.createObjectURL(res.data)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `nancy-dados-${new Date().toISOString().slice(0,10)}.json`
                      a.click()
                      URL.revokeObjectURL(url)
                    } catch {
                      showMsg('Erro ao exportar dados.', 'error')
                    }
                  }}
                >
                  Exportar
                </button>
              </div>
            </div>

            {/* Excluir conta — aparece em todos os dispositivos */}
            <div className="cfg-card">
              <button
                className="cfg-btn-danger cfg-logout-btn"
                onClick={() => { setDeleteModal(true); setDeletePass(''); setDeleteErr('') }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
                Excluir minha conta
              </button>
            </div>

          </div>
        </div>
      </div>

      {upgradeModal && (
        <UpgradeModal reason={upgradeModal} onClose={() => setUpgradeModal(null)} />
      )}

      {deleteModal && (
        <div className="modal-overlay" style={{ zIndex:9000 }}>
          <div className="modal del-modal" style={{ maxWidth:420, padding:0, overflow:'hidden', border:'1px solid rgba(239,68,68,.2)' }}>

            <div className="del-modal-bar" />

            <div className="del-modal-inner">
              {/* Cabeçalho */}
              <div style={{ display:'flex', alignItems:'flex-start', gap:14, marginBottom:20 }}>
                <div style={{ width:44, height:44, borderRadius:12, background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.2)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                    <path d="M10 11v6"/><path d="M14 11v6"/>
                    <path d="M9 6V4h6v2"/>
                  </svg>
                </div>
                <div style={{ paddingTop:2 }}>
                  <div style={{ fontWeight:700, fontSize:16, color:'var(--t1)', marginBottom:4 }}>Excluir conta permanentemente</div>
                  <div style={{ fontSize:12, color:'#ef4444', fontWeight:600, display:'flex', alignItems:'center', gap:5 }}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="#ef4444"><circle cx="12" cy="12" r="10"/></svg>
                    Esta ação não pode ser desfeita
                  </div>
                </div>
              </div>

              {/* Lista do que será excluído */}
              <div className="del-modal-list" style={{ background:'rgba(239,68,68,.05)', border:'1px solid rgba(239,68,68,.12)', borderRadius:10, padding:'12px 14px', marginBottom:20 }}>
                <div className="del-modal-label" style={{ fontSize:11, fontWeight:700, color:'var(--t2)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>O que será excluído:</div>
                {[
                  'Todas as transações e histórico',
                  'Metas e progresso acumulado',
                  'Contas fixas e orçamentos',
                  'Configurações e dados da conta',
                  'Plano cancelado — sem reembolso',
                ].map(item => (
                  <div key={item} className="del-modal-item" style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5, fontSize:13, color:'var(--t2)' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink:0 }}>
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                    {item}
                  </div>
                ))}
              </div>

              {/* Campo de senha */}
              <div style={{ marginBottom:20 }}>
                <label style={{ fontSize:12, fontWeight:600, color:'var(--t2)', display:'block', marginBottom:7 }}>
                  Confirme sua senha para continuar
                </label>
                <input
                  type="password"
                  placeholder="Digite sua senha atual"
                  value={deletePass}
                  onChange={e => { setDeletePass(e.target.value); setDeleteErr('') }}
                  onKeyDown={e => e.key === 'Enter' && handleDeleteAccount()}
                  style={{ width:'100%', boxSizing:'border-box', padding:'11px 14px', background:'var(--bg)', border:`1px solid ${deleteErr ? '#ef4444' : 'var(--bd)'}`, borderRadius:9, color:'var(--t1)', fontSize:14, outline:'none', transition:'border-color .15s' }}
                  autoFocus
                />
                {deleteErr && (
                  <div style={{ fontSize:12, color:'#ef4444', marginTop:6, display:'flex', alignItems:'center', gap:5 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round">
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    {deleteErr}
                  </div>
                )}
              </div>

              {/* Botões */}
              <div className="del-modal-btns">
                <button
                  onClick={() => setDeleteModal(false)}
                  style={{ border:'1px solid var(--bd)', background:'transparent', color:'var(--t2)' }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleteLoading || !deletePass}
                  style={{ border:'none', background: (!deletePass || deleteLoading) ? 'rgba(239,68,68,.35)' : '#ef4444', color:'#fff', cursor: (deleteLoading || !deletePass) ? 'not-allowed' : 'pointer', transition:'background .15s', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}
                >
                  {deleteLoading ? (
                    <><span style={{ width:13, height:13, border:'2px solid rgba(255,255,255,.35)', borderTopColor:'#fff', borderRadius:'50%', display:'inline-block', animation:'spin .7s linear infinite' }} /> Excluindo…</>
                  ) : (
                    <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg> Excluir conta</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
