import { useState } from 'react'
import Navbar from '../components/layout/Navbar.jsx'
import { useUser } from '../hooks/useUser.js'
import UpgradeModal from '../components/ui/UpgradeModal.jsx'
import SalaryCard       from '../components/features/settings/SalaryCard.jsx'
import FixedExpensesCard from '../components/features/settings/FixedExpensesCard.jsx'

export default function Finance() {
  const user  = useUser()
  const [msg,          setMsg]         = useState('')
  const [msgType,      setMsgType]     = useState('success')
  const [upgradeModal, setUpgradeModal] = useState(null)

  const showMsg = (text, type = 'success') => {
    setMsg(text); setMsgType(type)
    setTimeout(() => setMsg(''), 4000)
  }

  return (
    <>
      <Navbar />

      {msg && (
        <div className={`toast ${msgType === 'error' ? 'terr' : 'tok'}`} style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 9001, whiteSpace: 'nowrap' }}>
          {msg}
        </div>
      )}

      <div className="pwnav fade-in">
        <div className="dsb-content">
          <div className="cfg-wrap">

            <div className="cfg-sec-title r2">Financeiro</div>
            <SalaryCard user={user} onMessage={showMsg} />
            <FixedExpensesCard onMessage={showMsg} onUpgrade={setUpgradeModal} />

          </div>
        </div>
      </div>

      {upgradeModal && (
        <UpgradeModal message={upgradeModal} onClose={() => setUpgradeModal(null)} />
      )}
    </>
  )
}
