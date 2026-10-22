import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Navbar from '../components/layout/Navbar.jsx'
import UpgradeModal from '../components/ui/UpgradeModal.jsx'
import ChangePasswordCard from '../components/features/settings/ChangePasswordCard.jsx'
import TwoFactorCard from '../components/features/settings/TwoFactorCard.jsx'
import { useForcedLightTheme } from '../hooks/useTheme.js'

const BackIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
)

// Segurança (Nancy 2, tela 26): troca de senha (formulário aberto) e autenticação em duas etapas
// (interruptor). Toda a lógica de antes — validação de senha, QR code, códigos de recuperação,
// desativar com senha, convite ao Pro — segue nos dois cartões.
export default function SettingsSecurity() {
  const navigate = useNavigate()
  const location = useLocation()
  useForcedLightTheme() // tela desenhada só no claro (design Nancy 2)
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState('success')
  const [upgradeModal, setUpgradeModal] = useState(null)
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  const showMsg = (text, type = 'success') => {
    setMsg(text); setMsgType(type)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMsg(''), 4000)
  }
  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate('/settings'))

  return (
    <>
      <Navbar />
      {msg && (
        <div className={`toast ${msgType === 'error' ? 'terr' : 'tok'}`} role={msgType === 'error' ? 'alert' : 'status'}
          style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 9001, whiteSpace: 'nowrap' }}>
          {msg}
        </div>
      )}
      <div className="pwnav fin-pwnav fade-in">
        <div className="fin-page">
          <header className="fin-hero">
            <button type="button" className="fin-back" onClick={goBack} aria-label="Voltar"><BackIcon /></button>
            <div className="fin-hero-text">
              <h1 className="fin-hero-title">Segurança</h1>
              <p className="fin-hero-sub">Senha e duas etapas</p>
            </div>
          </header>

          <div className="fin-body">
            <ChangePasswordCard onMessage={showMsg} />
            <TwoFactorCard onMessage={showMsg} onUpgrade={setUpgradeModal} />
          </div>
        </div>
      </div>
      {upgradeModal && <UpgradeModal reason={upgradeModal} onClose={() => setUpgradeModal(null)} />}
    </>
  )
}
