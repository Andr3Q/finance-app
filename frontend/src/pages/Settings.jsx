import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/layout/Navbar.jsx'
import UpgradeModal from '../components/ui/UpgradeModal.jsx'
import { useUser } from '../hooks/useUser.js'
import { useTheme } from '../hooks/useTheme.js'
import SettingsHero        from '../components/features/settings/SettingsHero.jsx'
import ProfileCard         from '../components/features/settings/ProfileCard.jsx'
import SalaryCard          from '../components/features/settings/SalaryCard.jsx'
import FixedExpensesCard   from '../components/features/settings/FixedExpensesCard.jsx'
import AppearanceCard      from '../components/features/settings/AppearanceCard.jsx'
import NotificationsCard   from '../components/features/settings/NotificationsCard.jsx'
import CategoryLimitsCard  from '../components/features/settings/CategoryLimitsCard.jsx'
import MonthlyCloseCard    from '../components/features/settings/MonthlyCloseCard.jsx'
import InstallCard         from '../components/features/settings/InstallCard.jsx'

export default function Settings() {
  const navigate = useNavigate()
  const user  = useUser()
  const { theme, toggle: toggleTheme } = useTheme()
  const isPro = user.plan === 'pro'

  const [msg,          setMsg]          = useState('')
  const [msgType,      setMsgType]      = useState('success')
  const [upgradeModal, setUpgradeModal] = useState(null)

  const showMsg = (text, type = 'success') => {
    setMsg(text); setMsgType(type)
    setTimeout(() => setMsg(''), 4000)
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
            <FixedExpensesCard onMessage={showMsg} />

            <div className="cfg-sec-title r7">Preferências</div>
            <AppearanceCard theme={theme} toggleTheme={toggleTheme} />
            <NotificationsCard isPro={isPro} onMessage={showMsg} onUpgrade={setUpgradeModal} />

            <CategoryLimitsCard isPro={isPro} onMessage={showMsg} onUpgrade={setUpgradeModal} />
            <MonthlyCloseCard   user={user} isPro={isPro} onMessage={showMsg} onUpgrade={setUpgradeModal} />
            <InstallCard />

          </div>
        </div>
      </div>

      {upgradeModal && (
        <UpgradeModal reason={upgradeModal} onClose={() => { setUpgradeModal(null); navigate('/planos') }} />
      )}
    </>
  )
}
