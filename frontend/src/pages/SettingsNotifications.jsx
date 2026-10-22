import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Navbar from '../components/layout/Navbar.jsx'
import PushDeviceRow from '../components/features/settings/PushDeviceRow.jsx'
import { authAPI } from '../services/api.js'
import { useUser, saveUser } from '../hooks/useUser.js'
import { useForcedLightTheme } from '../hooks/useTheme.js'
import { prefValue } from '../utils/notifPrefs.js'

const BackIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
)

// Cada interruptor manda num aviso de verdade. Salário, resumo em stories e dicas decidem o que aparece nas
// Notificações e no sino; vencimento de contas e alerta de limite também decidem os avisos por push do servidor;
// o relatório por e-mail liga o resumo semanal de segunda-feira.
const ROWS = [
  { pref: 'notifSalary',         label: 'Lembrete de salário',      desc: 'No 5º dia útil do mês' },
  { pref: 'notifBudgetReminder', label: 'Vencimento de contas',     desc: '2 dias antes de cada conta fixa' },
  { pref: 'notifBudgetAlert',    label: 'Alerta de limite',         desc: 'Quando passar de 80% do teto' },
  { pref: 'notifStories',        label: 'Resumo mensal em stories', desc: 'Todo dia 1º, com o mês anterior' },
  { pref: 'notifTips',           label: 'Dicas da Nancy IA',        desc: 'Até 2 por semana' },
  { pref: 'notifWeeklyEmail',    label: 'Relatório por e-mail',     desc: 'Toda segunda-feira' },
]

// Preferências (Nancy 2, tela 27). A escolha vale na hora (o sino do Início e a lista de Notificações já a
// respeitam) e é gravada na conta; se o servidor recusar, volta ao que era.
export default function SettingsNotifications() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useUser()
  useForcedLightTheme() // tela desenhada só no claro (design Nancy 2)
  const [saving, setSaving] = useState({})
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState('success')
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  const showMsg = (text, type = 'success') => {
    setMsg(text); setMsgType(type)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMsg(''), 4000)
  }
  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate('/settings'))

  const toggle = async (pref) => {
    if (saving[pref]) return
    const next = !prefValue(user, pref)
    setSaving(s => ({ ...s, [pref]: true }))
    saveUser({ ...user, [pref]: next })
    try {
      await authAPI.updateNotifPrefs({ [pref]: next })
    } catch {
      saveUser({ ...user, [pref]: !next })
      showMsg('Erro ao salvar preferência.', 'error')
    } finally {
      setSaving(s => ({ ...s, [pref]: false }))
    }
  }

  const describe = (row) => (
    row.pref === 'notifWeeklyEmail' && prefValue(user, row.pref) && user.emailVerified === false
      ? 'Toda segunda-feira · confirme seu e-mail para receber'
      : row.desc
  )

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
              <h1 className="fin-hero-title">Preferências</h1>
              <p className="fin-hero-sub">Alertas e lembretes</p>
            </div>
          </header>

          <div className="fin-body">
            <section className="fin-card pr-card" aria-label="Preferências de notificação">
              <ul className="pr-list">
                {ROWS.map(r => {
                  const on = prefValue(user, r.pref)
                  return (
                    <li key={r.pref} className="pr-row">
                      <div className="pr-text">
                        <div className="pr-name">{r.label}</div>
                        <div className="pr-desc">{describe(r)}</div>
                      </div>
                      <button type="button" role="switch" aria-checked={on} aria-label={r.label}
                        className={`sb-switch${on ? ' on' : ''}`} onClick={() => toggle(r.pref)} disabled={!!saving[r.pref]}>
                        <span className="sb-knob" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>

            <section className="fin-card pr-card pr-device" aria-label="Avisos neste aparelho">
              <PushDeviceRow onMessage={showMsg} />
            </section>
          </div>
        </div>
      </div>
    </>
  )
}
