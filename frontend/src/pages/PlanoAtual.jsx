import { useNavigate, useLocation } from 'react-router-dom'
import Navbar from '../components/layout/Navbar.jsx'
import SettingsDesktopLayout from '../components/layout/SettingsDesktopLayout.jsx'
import ProtoIcon from '../components/layout/ProtoIcon.jsx'
import { useUser } from '../hooks/useUser.js'
import { useIsDesktop } from '../hooks/useIsDesktop.js'
import { useForcedLightTheme } from '../hooks/useTheme.js'
import { MONTHS } from '../constants/index.js'

const PLAN_LABEL = { free: 'Grátis', pro: 'Pro', elite: 'Elite' }
const dateShort = (d) => {
  const x = new Date(d)
  return `${String(x.getDate()).padStart(2, '0')} ${MONTHS[x.getMonth()].slice(0, 3).toLowerCase()} ${x.getFullYear()}`
}

// "Seu plano" (só no app Android da Play Store): mostra o plano da conta e até quando vale. Sem preços, sem comparativo, sem botão de compra
// e sem apontar para onde assinar: a política de pagamentos do Google não deixa o app vender plano por fora da Play (ver utils/androidApp.js).
export default function PlanoAtual() {
  const user = useUser()
  const navigate = useNavigate()
  const location = useLocation()
  const isDesktop = useIsDesktop()
  useForcedLightTheme()

  const plan = user.plan || 'free'
  const paid = plan === 'pro' || plan === 'elite'
  const trial = paid && !!user.isOnTrial
  const name = trial ? `Teste do ${PLAN_LABEL[plan]}` : `Plano ${PLAN_LABEL[plan]}`
  const sub = trial
    ? (user.trialEndsAt ? `Termina em ${dateShort(user.trialEndsAt)}` : 'Período de teste')
    : paid
      ? (user.subscriptionCancelled
          ? `Não será renovado · acesso até ${user.planExpiresAt ? dateShort(user.planExpiresAt) : 'o fim do período pago'}`
          : user.planExpiresAt ? `Válido até ${dateShort(user.planExpiresAt)}` : 'Plano ativo')
      : 'Sem cobrança'

  const card = (
    <section className={isDesktop ? 'pgd-plan' : 'fin-card pg-plan'} aria-label="Seu plano">
      <span className={isDesktop ? `pgd-plan-ico${paid ? ' paid' : ''}` : `pg-plan-ico${paid ? ' paid' : ''}`}><ProtoIcon name="zap" size={20} /></span>
      <div className={isDesktop ? 'pgd-plan-text' : 'pg-plan-text'}>
        <h2 className={isDesktop ? 'pgd-plan-title' : 'pg-plan-title'}>{name}</h2>
        <p className={isDesktop ? 'pgd-plan-sub' : 'pg-plan-sub'}>{sub}</p>
      </div>
    </section>
  )

  if (isDesktop) return <SettingsDesktopLayout>{card}</SettingsDesktopLayout>

  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate('/settings'))
  return (
    <>
      <Navbar />
      <div className="pwnav fin-pwnav fade-in">
        <div className="fin-page">
          <header className="fin-hero">
            <button type="button" className="fin-back" onClick={goBack} aria-label="Voltar">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <div className="fin-hero-text">
              <h1 className="fin-hero-title">Seu plano</h1>
              <p className="fin-hero-sub">Plano da sua conta</p>
            </div>
          </header>
          <div className="fin-body">{card}</div>
        </div>
      </div>
    </>
  )
}
