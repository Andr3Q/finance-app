import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../../hooks/useUser.js'
import { analytics } from '../../services/analytics.js'
import EliteConversionModal from './EliteConversionModal.jsx'

const DISMISS_KEY       = 'expiry-banner-dismissed'
const TRIAL_DISMISS_KEY = 'trial-banner-dismissed'
const SURVEY_KEY        = 'churn-survey-shown'

const REASONS = [
  { value: 'price',     label: 'Preço muito alto' },
  { value: 'missing',   label: 'Faltam funcionalidades que preciso' },
  { value: 'complex',   label: 'Difícil de usar' },
  { value: 'switched',  label: 'Mudei para outro app' },
  { value: 'temporary', label: 'Pausa temporária — vou voltar' },
  { value: 'other',     label: 'Outro motivo' },
]

export default function PlanExpiryBanner() {
  const user     = useUser()
  const navigate = useNavigate()
  const [dismissedExpiry,  setDismissedExpiry]  = useState(() => { try { return !!sessionStorage.getItem(DISMISS_KEY) } catch { return false } })
  const [dismissedTrial,   setDismissedTrial]   = useState(() => { try { return !!sessionStorage.getItem(TRIAL_DISMISS_KEY) } catch { return false } })
  const [trialJustExpired, setTrialJustExpired] = useState(() => { try { return !!sessionStorage.getItem('trial_just_expired') } catch { return false } })

  const [showSurvey,    setShowSurvey]    = useState(false)
  const [surveyReason,  setSurveyReason]  = useState('')
  const [surveyComment, setSurveyComment] = useState('')
  const [surveySent,    setSurveySent]    = useState(false)

  useEffect(() => {
    if (!user.id) return
    if (user.isOnTrial && user.trialEndsAt) {
      const daysLeft = Math.ceil((new Date(user.trialEndsAt) - Date.now()) / (1000 * 60 * 60 * 24))
      if (daysLeft <= 3) analytics.track('trial_expiring', { daysLeft })
    }
  }, [user.id])

  // Auto-show churn survey once per session when paid plan has expired
  useEffect(() => {
    if (!user.id || user.plan === 'free' || !user.planExpiresAt) return
    const daysLeft = Math.ceil((new Date(user.planExpiresAt) - Date.now()) / (1000 * 60 * 60 * 24))
    if (daysLeft <= 0 && !sessionStorage.getItem(SURVEY_KEY)) {
      sessionStorage.setItem(SURVEY_KEY, '1')
      setShowSurvey(true)
    }
  }, [user.id, user.plan, user.planExpiresAt])

  const submitSurvey = () => {
    if (!surveyReason) return
    analytics.track('churn_survey', { reason: surveyReason, comment: surveyComment.slice(0, 200), plan: user.plan })
    setSurveySent(true)
    setTimeout(() => setShowSurvey(false), 2000)
  }

  if (!user.id) return null

  // ── Churn survey modal (auto-shown on plan expiry) ────
  const surveyModal = showSurvey && (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.65)', zIndex:600, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'var(--s1)', border:'1px solid var(--bd)', borderRadius:16, padding:28, width:'100%', maxWidth:440 }}>

        {surveySent ? (
          <div style={{ textAlign:'center', padding:'20px 0' }}>
            <div style={{ fontSize:32, marginBottom:12 }}>🙏</div>
            <div style={{ fontWeight:700, fontSize:16, color:'var(--t1)', marginBottom:8 }}>Obrigado pelo feedback!</div>
            <div style={{ fontSize:13, color:'var(--t2)' }}>Isso nos ajuda a melhorar o FinançasPro.</div>
          </div>
        ) : (
          <>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
              <div style={{ width:38, height:38, borderRadius:10, background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.2)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
              <div>
                <div style={{ fontWeight:700, fontSize:15, color:'var(--t1)' }}>Sentimos sua falta!</div>
                <div style={{ fontSize:12, color:'var(--t3)' }}>Seu plano expirou. Por que você não renovou?</div>
              </div>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
              {REASONS.map(r => (
                <label
                  key={r.value}
                  style={{
                    display:'flex', alignItems:'center', gap:12, padding:'10px 14px',
                    borderRadius:10, cursor:'pointer', border:'1px solid',
                    borderColor: surveyReason === r.value ? 'rgba(239,68,68,.4)' : 'var(--bd)',
                    background:  surveyReason === r.value ? 'rgba(239,68,68,.06)' : 'var(--s2)',
                    transition: 'all .15s',
                  }}
                >
                  <input
                    type="radio"
                    name="churn-reason"
                    value={r.value}
                    checked={surveyReason === r.value}
                    onChange={() => setSurveyReason(r.value)}
                    style={{ accentColor:'#ef4444', width:15, height:15, flexShrink:0 }}
                  />
                  <span style={{ fontSize:13, color:'var(--t1)' }}>{r.label}</span>
                </label>
              ))}
            </div>

            {(surveyReason === 'other' || surveyReason === 'missing') && (
              <textarea
                placeholder={surveyReason === 'missing' ? 'Qual funcionalidade?' : 'Conte mais (opcional)'}
                value={surveyComment}
                onChange={e => setSurveyComment(e.target.value)}
                maxLength={300}
                rows={2}
                style={{ width:'100%', boxSizing:'border-box', background:'var(--s2)', border:'1px solid var(--bd)', borderRadius:8, padding:'10px 12px', color:'var(--t1)', fontSize:13, resize:'vertical', outline:'none', marginBottom:16, fontFamily:'inherit' }}
              />
            )}

            <div style={{ display:'flex', gap:10, marginTop: surveyReason === 'other' || surveyReason === 'missing' ? 0 : 16 }}>
              <button
                onClick={() => { setShowSurvey(false) }}
                style={{ flex:1, padding:'10px 0', borderRadius:8, border:'1px solid var(--bd)', background:'transparent', color:'var(--t2)', fontSize:14, fontWeight:600, cursor:'pointer' }}
              >
                Pular
              </button>
              <button
                onClick={submitSurvey}
                disabled={!surveyReason}
                style={{ flex:1, padding:'10px 0', borderRadius:8, border:'none', background: surveyReason ? '#4ac46e' : 'var(--s3)', color:'#fff', fontSize:14, fontWeight:700, cursor: surveyReason ? 'pointer' : 'not-allowed', opacity: surveyReason ? 1 : 0.5 }}
              >
                Enviar feedback
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )

  // ── Modal de conversão quando trial expirou ───────────
  const [conversionModalShown] = useState(() => { try { return !!sessionStorage.getItem('conversion_modal_shown') } catch { return false } })
  if (user.plan === 'free' && trialJustExpired && !conversionModalShown) {
    return (
      <EliteConversionModal onClose={() => setTrialJustExpired(false)} />
    )
  }

  // ── Banner de trial ────────────────────────────────────
  if (user.isOnTrial && user.trialEndsAt) {
    const daysLeft = Math.ceil((new Date(user.trialEndsAt) - Date.now()) / (1000 * 60 * 60 * 24))
    const urgent   = daysLeft <= 2

    if (!dismissedTrial) {
      const msg = daysLeft <= 0
        ? 'Seu período de trial Pro encerrou. Assine agora para manter os recursos premium.'
        : daysLeft === 1
          ? 'Último dia do trial Pro! Assine agora e não perca o acesso.'
          : `Você está no trial Pro — ${daysLeft} dias restantes.`

      const dismiss = () => {
        sessionStorage.setItem(TRIAL_DISMISS_KEY, '1')
        setDismissedTrial(true)
      }

      return (
        <div className={`expiry-banner trial${urgent ? ' expired' : ''}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="expiry-banner-ico">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span className="expiry-banner-msg">{msg}</span>
          <button className="expiry-banner-cta" onClick={() => navigate('/planos')}>
            Assinar Pro
          </button>
          {!urgent && (
            <button className="expiry-banner-close" onClick={dismiss} aria-label="Fechar">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>
      )
    }
    return null
  }

  // ── Banner de expiração de plano pago ─────────────────
  if (dismissedExpiry || user.plan === 'free' || !user.planExpiresAt) return <>{surveyModal}</>

  const daysLeft = Math.ceil((new Date(user.planExpiresAt) - Date.now()) / (1000 * 60 * 60 * 24))
  if (daysLeft > 7) return <>{surveyModal}</>

  const expired   = daysLeft <= 0
  const planLabel = user.plan === 'elite' ? 'Elite' : 'Pro'
  const msg = expired
    ? `Seu plano ${planLabel} expirou. Renove para manter o acesso aos recursos premium.`
    : daysLeft === 1
      ? `Seu plano ${planLabel} expira hoje!`
      : `Seu plano ${planLabel} expira em ${daysLeft} dias.`

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, '1')
    setDismissedExpiry(true)
  }

  return (
    <>
      {surveyModal}
      <div className={`expiry-banner${expired ? ' expired' : ''}`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="expiry-banner-ico">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span className="expiry-banner-msg">{msg}</span>
        <button className="expiry-banner-cta" onClick={() => navigate('/planos')}>
          Renovar
        </button>
        <button className="expiry-banner-close" onClick={dismiss} aria-label="Fechar">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </>
  )
}
