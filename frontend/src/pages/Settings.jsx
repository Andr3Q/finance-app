import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/layout/Navbar.jsx'
import { authAPI } from '../services/api.js'
import UpgradeModal from '../components/ui/UpgradeModal.jsx'
import { useUser } from '../hooks/useUser.js'
import { useTheme } from '../hooks/useTheme.js'
import SettingsHero        from '../components/features/settings/SettingsHero.jsx'
import ProfileCard         from '../components/features/settings/ProfileCard.jsx'
import SalaryCard          from '../components/features/settings/SalaryCard.jsx'
import AppearanceCard      from '../components/features/settings/AppearanceCard.jsx'
import NotificationsCard   from '../components/features/settings/NotificationsCard.jsx'
import CategoryLimitsCard  from '../components/features/settings/CategoryLimitsCard.jsx'
import MonthlyCloseCard    from '../components/features/settings/MonthlyCloseCard.jsx'
import InstallCard         from '../components/features/settings/InstallCard.jsx'
import RemindersCard       from '../components/features/settings/RemindersCard.jsx'

export default function Settings() {
  const navigate = useNavigate()
  const user  = useUser()
  const { theme, toggle: toggleTheme } = useTheme()
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
            <ProfileCard user={user} />

            <div className="cfg-sec-title r4">Financeiro</div>
            <SalaryCard user={user} onMessage={showMsg} />

            <div className="cfg-sec-title r7">Preferências</div>
            <AppearanceCard theme={theme} toggleTheme={toggleTheme} />
            <NotificationsCard isPro={isPro} onMessage={showMsg} onUpgrade={setUpgradeModal} />

            <CategoryLimitsCard isPro={isPro} onMessage={showMsg} onUpgrade={setUpgradeModal} />
            <MonthlyCloseCard   user={user} isPro={isPro} onMessage={showMsg} onUpgrade={setUpgradeModal} />

            <div className="cfg-sec-title r4">Lembretes</div>
            <RemindersCard />
            <InstallCard />

            <div className="cfg-sec-title r10">Conta</div>

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
        <UpgradeModal reason={upgradeModal} onClose={() => { setUpgradeModal(null); navigate('/planos') }} />
      )}

      {deleteModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'var(--s1)', border:'1px solid var(--bd)', borderRadius:16, padding:28, width:'100%', maxWidth:400 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
              <div style={{ width:36, height:36, borderRadius:10, background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.2)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              </div>
              <div>
                <div style={{ fontWeight:700, fontSize:15, color:'var(--t1)' }}>Excluir conta permanentemente</div>
                <div style={{ fontSize:12, color:'var(--t3)' }}>Esta ação não pode ser desfeita</div>
              </div>
            </div>

            <p style={{ fontSize:13, color:'var(--t2)', marginBottom:16, lineHeight:1.6 }}>
              Todos os seus dados serão removidos: transações, metas, contas fixas,
              histórico e configurações. Seu plano será cancelado sem reembolso proporcional.
            </p>

            <label style={{ fontSize:13, color:'var(--t3)', display:'block', marginBottom:6 }}>
              Digite sua senha para confirmar
            </label>
            <input
              type="password"
              placeholder="Sua senha atual"
              value={deletePass}
              onChange={e => { setDeletePass(e.target.value); setDeleteErr('') }}
              onKeyDown={e => e.key === 'Enter' && handleDeleteAccount()}
              style={{ width:'100%', boxSizing:'border-box', padding:'10px 12px', background:'var(--bg)', border:`1px solid ${deleteErr ? '#ef4444' : 'var(--bd)'}`, borderRadius:8, color:'var(--t1)', fontSize:14, outline:'none', marginBottom: deleteErr ? 6 : 16 }}
              autoFocus
            />
            {deleteErr && (
              <div style={{ fontSize:12, color:'#ef4444', marginBottom:14 }}>{deleteErr}</div>
            )}

            <div style={{ display:'flex', gap:10 }}>
              <button
                onClick={() => setDeleteModal(false)}
                style={{ flex:1, padding:'10px 0', borderRadius:8, border:'1px solid var(--bd)', background:'transparent', color:'var(--t2)', fontSize:14, fontWeight:600, cursor:'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteLoading}
                style={{ flex:1, padding:'10px 0', borderRadius:8, border:'none', background:'#ef4444', color:'#fff', fontSize:14, fontWeight:700, cursor: deleteLoading ? 'not-allowed' : 'pointer', opacity: deleteLoading ? 0.7 : 1 }}
              >
                {deleteLoading ? 'Excluindo…' : 'Excluir conta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
