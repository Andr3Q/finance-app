import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Navbar from '../components/layout/Navbar.jsx'
import CancelPlanCard from '../components/features/settings/CancelPlanCard.jsx'
import { paymentsAPI } from '../services/api.js'
import { useUser } from '../hooks/useUser.js'
import { useForcedLightTheme } from '../hooks/useTheme.js'
import { MONTHS } from '../constants/index.js'
import { fmt } from '../utils/format.js'

const PLAN_LABEL   = { pro: 'Pro', elite: 'Elite' }
const PERIOD_LABEL = { monthly: 'mensal', annual: 'anual' }
const METHOD_LABEL = { card: 'cartão', pix: 'PIX' }

const Svg = ({ size = 18, sw = 1.9, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
)
const BackIcon = () => <Svg size={17} sw={2.4}><polyline points="15 18 9 12 15 6"/></Svg>
const BoltIcon = () => <Svg size={20} sw={2}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></Svg>
const CardIcon = () => <Svg size={18}><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></Svg>

// "20 out 2026"
const dateShort = (d) => {
  const x = new Date(d)
  return `${String(x.getDate()).padStart(2, '0')} ${MONTHS[x.getMonth()].slice(0, 3).toLowerCase()} ${x.getFullYear()}`
}
const money = (n) => `R$ ${fmt(n)}`
// "Elite · cartão" (a forma só aparece quando o pagamento a guardou)
const paymentSub = (p) => [PLAN_LABEL[p.plan] || p.plan, METHOD_LABEL[p.method] || PERIOD_LABEL[p.period] || p.period].filter(Boolean).join(' · ')

// Pagamentos (Nancy 2, tela 30): o plano atual com o último valor cobrado, o histórico de cobranças e o cancelamento
// (o mesmo fluxo de antes, com a senha). O app não renova sozinho: cada pagamento libera 31 ou 366 dias, por isso a frase
// é "Válido até" e não "Renova em". Forma de pagamento e final do cartão só aparecem nos pagamentos que as guardaram.
export default function SettingsPayments() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useUser()
  useForcedLightTheme() // tela desenhada só no claro (design Nancy 2)
  const isPaid  = (user.plan === 'pro' || user.plan === 'elite') && !user.isOnTrial
  const isTrial = (user.plan === 'pro' || user.plan === 'elite') && !!user.isOnTrial

  const [payments, setPayments] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [failed,   setFailed]   = useState(false)
  const [msg,      setMsg]      = useState('')
  const [msgType,  setMsgType]  = useState('success')
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  useEffect(() => {
    paymentsAPI.history()
      .then(r => setPayments(Array.isArray(r.data) ? r.data : []))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false))
  }, [])

  const showMsg = (text, type = 'success') => {
    setMsg(text); setMsgType(type)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMsg(''), 5000)
  }
  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate('/settings'))

  const latest = payments[0]
  const cancelled = !!user.subscriptionCancelled
  const until = user.planExpiresAt ? dateShort(user.planExpiresAt) : null
  const how = latest?.method === 'card' && latest.cardLast4 ? `cartão •••• ${latest.cardLast4}` : latest?.method === 'pix' ? 'PIX' : null

  let title = 'Plano Grátis'
  let sub   = 'Sem cobrança'
  if (isPaid) {
    title = `Plano ${PLAN_LABEL[user.plan]}`
    sub = [cancelled ? `Não será renovado · acesso até ${until || 'o fim do período pago'}` : until ? `Válido até ${until}` : null, how].filter(Boolean).join(' · ') || 'Plano ativo'
  } else if (isTrial) {
    title = `Teste do ${PLAN_LABEL[user.plan]}`
    sub = user.trialEndsAt ? `Termina em ${dateShort(user.trialEndsAt)}` : 'Período de teste'
  }
  const showHistory = payments.length > 0 || isPaid || failed

  return (
    <>
      <Navbar />
      {msg && (
        <div className={`toast toast-top ${msgType === 'error' ? 'terr' : 'tok'}`} role={msgType === 'error' ? 'alert' : 'status'}>
          {msg}
        </div>
      )}
      <div className="pwnav fin-pwnav fade-in">
        <div className="fin-page">
          <header className="fin-hero">
            <button type="button" className="fin-back" onClick={goBack} aria-label="Voltar"><BackIcon /></button>
            <div className="fin-hero-text">
              <h1 className="fin-hero-title">Pagamentos</h1>
              <p className="fin-hero-sub">Histórico e renovação</p>
            </div>
          </header>

          <div className="fin-body">
            <section className="fin-card pg-plan" aria-label="Plano atual">
              <span className={`pg-plan-ico${isPaid || isTrial ? ' paid' : ''}`}><BoltIcon /></span>
              <div className="pg-plan-text">
                <h2 className="pg-plan-title">{title}</h2>
                <p className={`pg-plan-sub${isPaid && cancelled ? ' warn' : ''}`}>{sub}</p>
              </div>
              {isPaid && latest?.amount != null && <span className="pg-plan-amt">{money(latest.amount)}</span>}
              {!isPaid && !isTrial && <button type="button" className="pg-plans-link" onClick={() => navigate('/planos')}>Ver planos</button>}
            </section>

            {showHistory && (
              <section className="fin-card pg-hist" aria-label="Histórico de pagamentos">
                <h2 className="pg-hist-title">Histórico</h2>
                {loading ? (
                  <div className="pg-state"><span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} /></div>
                ) : failed ? (
                  <p className="pg-state">Não foi possível carregar o histórico agora.</p>
                ) : payments.length === 0 ? (
                  <p className="pg-state">Nenhum pagamento registrado ainda.</p>
                ) : (
                  <ul className="pg-list">
                    {payments.map(p => (
                      <li key={p.paymentId} className="pg-row">
                        <span className="pg-row-ico"><CardIcon /></span>
                        <span className="pg-row-text">
                          <span className="pg-row-date">{dateShort(p.processedAt)}</span>
                          <span className="pg-row-sub">{paymentSub(p)}</span>
                        </span>
                        <span className="pg-row-right">
                          {p.amount != null && <span className="pg-row-amt">{money(p.amount)}</span>}
                          <span className="pg-row-ok">Pago</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            <CancelPlanCard onMessage={showMsg} />
          </div>
        </div>
      </div>
    </>
  )
}
