import { useState } from 'react'
import { useUser } from '../hooks/useUser.js'
import SettingsSubPage from '../components/features/settings/SettingsSubPage.jsx'
import EmailVerifyCard from '../components/features/settings/EmailVerifyCard.jsx'
import ProfileCard from '../components/features/settings/ProfileCard.jsx'

export default function SettingsProfile() {
  const user = useUser()
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState('success')

  const showMsg = (text, type = 'success') => {
    setMsg(text); setMsgType(type)
    setTimeout(() => setMsg(''), 4000)
  }

  return (
    <SettingsSubPage title="Perfil">
      {msg && (
        <div className={`toast ${msgType === 'error' ? 'terr' : 'tok'}`} style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 9001, whiteSpace: 'nowrap' }}>
          {msg}
        </div>
      )}
      <EmailVerifyCard onMessage={showMsg} />
      <ProfileCard user={user} />
    </SettingsSubPage>
  )
}
