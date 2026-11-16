import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Navbar from '../components/layout/Navbar.jsx'
import ProtoIcon from '../components/layout/ProtoIcon.jsx'
import { useUser, saveUser } from '../hooks/useUser.js'
import { useForcedLightTheme } from '../hooks/useTheme.js'
import { usePlayBilling } from '../hooks/usePlayBilling.js'
import { PRO_FEATS, ELITE_FEATS, Check, BackIcon, BoltIcon } from './Planos.jsx'
import { planSummary } from './PlanoAtual.jsx'
import { purchase, formatPlayPrice, manageSubscriptionUrl, PLAY_PRODUCTS } from '../services/playBilling.js'
import { authAPI } from '../services/api.js'
import { analytics } from '../services/analytics.js'

const fmtDate = (d) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

// Planos DENTRO do app Android da Play Store (só aparece quando a cobrança do Google está pronta: ver PlanosRoute e services/playBilling.js).
// A compra é do Google Play (os preços são os do Google, a renovação é automática e o cancelamento é na Play Store). O site tem a sua
// própria tela de planos (Planos.jsx), com o Mercado Pago, e não muda.
export default function PlanosPlay() {
  const user = useUser()
  const { status, details } = usePlayBilling()
  const navigate = useNavigate()
  const location = useLocation()
  useForcedLightTheme()

  const [billing, setBilling] = useState('mensal')
  const [loading, setLoading] = useState(null) // productId em compra
  const [toast, setToast] = useState(null)
  const period = billing === 'mensal' ? 'monthly' : 'annual'

  const { plan, paid, trial, name, sub } = planSummary(user)
  const expires = user.planExpiresAt ? new Date(user.planExpiresAt) : null
  const hasActivePaid = paid && !trial && !!expires && expires > new Date()
  const onPlay = hasActivePaid && user.planSource === 'google_play'
  const fromElsewhere = hasActivePaid && !onPlay
  const ready = status === 'ready'

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 6000)
  }

  const subscribe = async (tier) => {
    if (!user.emailVerified) {
      showToast('Verifique seu e-mail antes de assinar. Acesse Configurações para reenviar o link.', 'warn')
      return
    }
    const productId = PLAY_PRODUCTS[tier][period]
    analytics.track('upgrade_clicked', { plan: tier, period, store: 'google_play' })
    setLoading(productId)
    try {
      const result = await purchase(productId)
      const me = await authAPI.me().catch(() => null)
      const cur = JSON.parse(sessionStorage.getItem('user') || '{}')
      saveUser(me?.data ? { ...cur, ...me.data } : { ...cur, plan: result?.plan ?? cur.plan, planExpiresAt: result?.planExpiresAt ?? cur.planExpiresAt, planSource: 'google_play' })
      analytics.track('payment_completed', { plan: tier, store: 'google_play' })
      showToast(`Assinatura ativada! Seu plano ${tier === 'elite' ? 'Elite' : 'Pro'} já está valendo.`, 'success')
    } catch (err) {
      if (err?.code === 'cancelled') return // a pessoa fechou a tela de compra: sem aviso
      if (err?.code === 'conflict') showToast(err.serverMessage || 'Esta compra não pôde ser ligada à sua conta. Fale com o suporte.', 'error')
      else if (err?.code === 'verify_failed') showToast('Recebemos o seu pagamento, mas não conseguimos confirmar agora. Abra o app de novo em alguns minutos que tentamos outra vez. Se o plano não aparecer, fale com o suporte.', 'warn')
      else showToast('Não foi possível concluir a compra. Tente novamente.', 'error')
    } finally {
      setLoading(null)
    }
  }

  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate('/settings'))
  const priceOf = (tier) => formatPlayPrice(details[PLAY_PRODUCTS[tier][period]])
  const Feats = ({ list }) => (
    <ul className="pl-feats">
      {list.map((f) => (
        <li key={f.text} className="pl-feat"><Check /><span>{f.text}{f.hi && <> — <b>{f.hi}</b></>}</span></li>
      ))}
    </ul>
  )
  const card = (tier, title, tagline, feats, cls) => (
    <section className={`pl-card ${cls}`} aria-label={`Plano ${title}`}>
      <h3 className="pl-tier">{title}</h3>
      <p className="pl-tagline">{tagline}</p>
      <div className="pl-price"><span className="pl-price-num">{priceOf(tier)}</span><span className="pl-price-note">{period === 'monthly' ? 'por mês' : 'por ano'}</span></div>
      <p className="pl-price-sub">Renova sozinho até você cancelar</p>
      <Feats list={feats} />
      <button type="button" className={`pl-cta ${tier === 'elite' ? 'pl-cta-elite' : 'pl-cta-pro'}`} onClick={() => subscribe(tier)} disabled={!!loading}>
        {loading === PLAY_PRODUCTS[tier][period] ? 'Aguarde…' : (<><BoltIcon /> Assinar {title}</>)}
      </button>
    </section>
  )

  return (
    <>
      <Navbar />
      {toast && (
        <div className={`toast toast-top ${toast.type === 'error' ? 'terr' : toast.type === 'warn' ? 'twarn' : 'tok'}`} role="status">{toast.msg}</div>
      )}
      <div className="pwnav fin-pwnav fade-in">
        <div className="fin-page">
          <header className="fin-hero">
            <button type="button" className="fin-back" onClick={goBack} aria-label="Voltar"><BackIcon /></button>
            <div className="fin-hero-text">
              <h1 className="fin-hero-title">Planos</h1>
              <p className="fin-hero-sub">Assinatura Pro e Elite</p>
            </div>
          </header>

          <div className="fin-body pl-body">
            <section className="fin-card pg-plan" aria-label="Seu plano">
              <span className={`pg-plan-ico${paid ? ' paid' : ''}`}><ProtoIcon name="zap" size={20} /></span>
              <div className="pg-plan-text">
                <h2 className="pg-plan-title">{name}</h2>
                <p className="pg-plan-sub">{sub}</p>
              </div>
            </section>

            {fromElsewhere && (
              <p className="pl-cta-note">Você já tem um plano ativo até {fmtDate(expires)}. Quando ele vencer, você poderá assinar por aqui.</p>
            )}

            {onPlay && (
              <section className="pl-card pl-guar" aria-label="Gerenciar assinatura">
                <h3 className="pl-section-title">Gerenciar assinatura</h3>
                <p className="pl-guar-sub">Sua assinatura é cobrada pela Google Play. Para cancelar, trocar a forma de pagamento ou ver as cobranças, abra a Play Store.</p>
                <a className="pl-cta pl-cta-ghost" href={manageSubscriptionUrl(plan, user.planPeriod === 'annual' ? 'annual' : 'monthly')} target="_blank" rel="noopener noreferrer">Gerenciar na Play Store</a>
              </section>
            )}

            {!hasActivePaid && !ready && (
              <p className="pl-cta-note">Não foi possível carregar os planos agora. Tente de novo em instantes.</p>
            )}

            {!hasActivePaid && ready && (
              <>
                <div className="pl-intro">
                  <h2 className="pl-headline">Controle total do <span>seu dinheiro.</span></h2>
                  <p className="pl-lead">Faça upgrade quando quiser.</p>
                  <div className="pl-toggle" role="group" aria-label="Periodicidade">
                    <button type="button" className={billing === 'mensal' ? 'on' : ''} aria-pressed={billing === 'mensal'} onClick={() => setBilling('mensal')}>Mensal</button>
                    <button type="button" className={billing === 'anual' ? 'on' : ''} aria-pressed={billing === 'anual'} onClick={() => setBilling('anual')}>Anual</button>
                  </div>
                </div>
                {card('pro', 'Pro', 'Para quem quer controle total', PRO_FEATS, 'pl-pro')}
                {card('elite', 'Elite', 'Para quem quer o poder da IA', ELITE_FEATS, 'pl-elite')}
                <p className="pl-cta-note">O pagamento é cobrado na sua conta do Google Play e a assinatura renova sozinha até você cancelar (Play Store &gt; Pagamentos e assinaturas &gt; Assinaturas).</p>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
