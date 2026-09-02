import { useState } from 'react'
import { useUser } from '../hooks/useUser.js'
import UpgradeModal from '../components/ui/UpgradeModal.jsx'
import SettingsSubPage from '../components/features/settings/SettingsSubPage.jsx'
import MonthlyCloseCard from '../components/features/settings/MonthlyCloseCard.jsx'

export default function SettingsMonthlyClose() {
  const user = useUser()
  const isPro = user.plan === 'pro' || user.plan === 'elite'
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState('success')
  const [upgradeModal, setUpgradeModal] = useState(null)

  const showMsg = (text, type = 'success') => {
    setMsg(text); setMsgType(type)
    setTimeout(() => setMsg(''), 4000)
  }

  return (
    <SettingsSubPage title="Balanço mensal">
      {msg && (
        <div className={`toast ${msgType === 'error' ? 'terr' : 'tok'}`} style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 9001, whiteSpace: 'nowrap' }}>
          {msg}
        </div>
      )}
      <MonthlyCloseCard user={user} isPro={isPro} onMessage={showMsg} onUpgrade={setUpgradeModal} />
      {upgradeModal && <UpgradeModal reason={upgradeModal} onClose={() => setUpgradeModal(null)} />}
    </SettingsSubPage>
  )
}
