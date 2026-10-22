import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Navbar from '../components/layout/Navbar.jsx'
import { useUser } from '../hooks/useUser.js'
import { useForcedLightTheme } from '../hooks/useTheme.js'
import UpgradeModal from '../components/ui/UpgradeModal.jsx'
import SalaryCard       from '../components/features/settings/SalaryCard.jsx'
import FixedExpensesCard from '../components/features/settings/FixedExpensesCard.jsx'

const BackIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
)

// Finanças (Nancy 2, tela 14): salário e contas fixas. Os dois cartões mantêm toda a lógica
// de antes; mudou o visual e o cabeçalho azul com botão de voltar (como as outras telas novas).
export default function Finance() {
  const user      = useUser()
  const navigate  = useNavigate()
  const location  = useLocation()
  useForcedLightTheme() // tela desenhada só no claro (design Nancy 2)
  const [msg,          setMsg]         = useState('')
  const [msgType,      setMsgType]     = useState('success')
  const [upgradeModal, setUpgradeModal] = useState(null)

  const showMsg = (text, type = 'success') => {
    setMsg(text); setMsgType(type)
    setTimeout(() => setMsg(''), 4000)
  }

  // chega pelo atalho "Contas do mês" do Extrato; aberta direto pela URL, volta pro Extrato
  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate('/transactions'))

  return (
    <>
      <Navbar />

      {msg && (
        <div className={`toast ${msgType === 'error' ? 'terr' : 'tok'}`} style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 9001, whiteSpace: 'nowrap' }}>
          {msg}
        </div>
      )}

      <div className="pwnav fin-pwnav fade-in">
        <div className="fin-page">
          <header className="fin-hero">
            <button type="button" className="fin-back" onClick={goBack} aria-label="Voltar"><BackIcon /></button>
            <div className="fin-hero-text">
              <h1 className="fin-hero-title">Finanças</h1>
              <p className="fin-hero-sub">Salário e contas fixas</p>
            </div>
          </header>

          <div className="fin-body">
            <SalaryCard user={user} onMessage={showMsg} />
            <FixedExpensesCard onMessage={showMsg} onUpgrade={setUpgradeModal} />
          </div>
        </div>
      </div>

      {upgradeModal && (
        <UpgradeModal reason={upgradeModal} onClose={() => setUpgradeModal(null)} />
      )}
    </>
  )
}
