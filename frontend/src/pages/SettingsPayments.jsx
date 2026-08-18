import { useState } from 'react'
import SettingsSubPage from '../components/features/settings/SettingsSubPage.jsx'
import CancelPlanCard from '../components/features/settings/CancelPlanCard.jsx'
import PaymentHistoryCard from '../components/features/settings/PaymentHistoryCard.jsx'

export default function SettingsPayments() {
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState('success')

  const showMsg = (text, type = 'success') => {
    setMsg(text); setMsgType(type)
    setTimeout(() => setMsg(''), 4000)
  }

  return (
    <SettingsSubPage title="Pagamentos">
      {msg && (
        <div className={`toast ${msgType === 'error' ? 'terr' : 'tok'}`} style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 9001, whiteSpace: 'nowrap' }}>
          {msg}
        </div>
      )}
      <CancelPlanCard onMessage={showMsg} />
      <PaymentHistoryCard />
    </SettingsSubPage>
  )
}
