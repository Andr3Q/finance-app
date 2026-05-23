import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser, saveUser } from '../../../hooks/useUser.js'
import { authAPI } from '../../../services/api.js'
import { analytics } from '../../../services/analytics.js'

const REASONS = [
  { value: 'price',     label: 'Preço muito alto' },
  { value: 'missing',   label: 'Faltam funcionalidades que preciso' },
  { value: 'complex',   label: 'Difícil de usar' },
  { value: 'switched',  label: 'Mudei para outro app' },
  { value: 'temporary', label: 'Pausa temporária — vou voltar' },
  { value: 'other',     label: 'Outro motivo' },
]

export default function CancelPlanCard({ onMessage }) {
  const user     = useUser()
  const navigate = useNavigate()
  const isPaid   = (user.plan === 'pro' || user.plan === 'elite') && !user.isOnTrial

  const [modal,    setModal]    = useState(false)
  const [reason,   setReason]   = useState('')
  const [comment,  setComment]  = useState('')
  const [loading,  setLoading]  = useState(false)
  const [step,     setStep]     = useState(1)  // 1 = motivo, 2 = confirmação

  if (!isPaid) return null

  const planLabel = user.plan === 'elite' ? 'Elite' : 'Pro'

  const handleConfirm = async () => {
    if (!reason) return
    setLoading(true)
    try {
      await authAPI.downgradeFree()
      analytics.track('plan_cancelled', { reason, comment: comment.slice(0, 200), plan: user.plan })
      const cur = JSON.parse(sessionStorage.getItem('user') || '{}')
      saveUser({ ...cur, plan: 'free', planExpiresAt: undefined, isOnTrial: false })
      setModal(false)
      onMessage('Plano cancelado. Você continua no plano Grátis.')
    } catch (err) {
      onMessage(err.response?.data?.error || 'Erro ao cancelar plano.', 'error')
    } finally {
      setLoading(false)
    }
  }

  const close = () => { setModal(false); setReason(''); setComment(''); setStep(1) }

  return (
    <>
      <div className="cfg-card">
        <div className="cfg-card-head">
          <div className="cfg-ch-ico">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div className="cfg-ch-title">Cancelar plano {planLabel}</div>
            <div className="cfg-ch-sub">Sua conta retorna para o plano Grátis imediatamente.</div>
          </div>
          <button
            className="cfg-btn-danger"
            onClick={() => setModal(true)}
            style={{ flexShrink: 0, fontSize: 12, padding: '8px 14px' }}
          >
            Cancelar plano
          </button>
        </div>
      </div>

      {modal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.65)', zIndex:600, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'var(--s1)', border:'1px solid var(--bd)', borderRadius:16, padding:28, width:'100%', maxWidth:440 }}>

            {step === 1 && (
              <>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
                  <div style={{ width:38, height:38, borderRadius:10, background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.2)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontWeight:700, fontSize:15, color:'var(--t1)' }}>Por que está cancelando?</div>
                    <div style={{ fontSize:12, color:'var(--t3)' }}>Nos ajude a melhorar — 1 pergunta só.</div>
                  </div>
                </div>

                <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
                  {REASONS.map(r => (
                    <label
                      key={r.value}
                      style={{
                        display:'flex', alignItems:'center', gap:12, padding:'10px 14px',
                        borderRadius:10, cursor:'pointer', border:'1px solid',
                        borderColor: reason === r.value ? 'rgba(239,68,68,.4)' : 'var(--bd)',
                        background:  reason === r.value ? 'rgba(239,68,68,.06)' : 'var(--s2)',
                        transition: 'all .15s',
                      }}
                    >
                      <input
                        type="radio"
                        name="churn-reason"
                        value={r.value}
                        checked={reason === r.value}
                        onChange={() => setReason(r.value)}
                        style={{ accentColor:'#ef4444', width:15, height:15, flexShrink:0 }}
                      />
                      <span style={{ fontSize:13, color:'var(--t1)' }}>{r.label}</span>
                    </label>
                  ))}
                </div>

                {reason === 'other' || reason === 'missing' ? (
                  <textarea
                    placeholder={reason === 'missing' ? 'Qual funcionalidade?' : 'Conte mais (opcional)'}
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    maxLength={300}
                    rows={2}
                    style={{ width:'100%', boxSizing:'border-box', background:'var(--s2)', border:'1px solid var(--bd)', borderRadius:8, padding:'10px 12px', color:'var(--t1)', fontSize:13, resize:'vertical', outline:'none', marginBottom:16, fontFamily:'inherit' }}
                  />
                ) : <div style={{ marginBottom:16 }} />}

                <div style={{ display:'flex', gap:10 }}>
                  <button onClick={close} style={{ flex:1, padding:'10px 0', borderRadius:8, border:'1px solid var(--bd)', background:'transparent', color:'var(--t2)', fontSize:14, fontWeight:600, cursor:'pointer' }}>
                    Voltar
                  </button>
                  <button
                    onClick={() => reason && setStep(2)}
                    disabled={!reason}
                    style={{ flex:1, padding:'10px 0', borderRadius:8, border:'none', background: reason ? '#ef4444' : 'var(--s3)', color:'#fff', fontSize:14, fontWeight:700, cursor: reason ? 'pointer' : 'not-allowed', opacity: reason ? 1 : 0.5 }}
                  >
                    Continuar
                  </button>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div style={{ textAlign:'center', marginBottom:20 }}>
                  <div style={{ width:52, height:52, borderRadius:14, background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.2)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                  </div>
                  <div style={{ fontWeight:700, fontSize:16, color:'var(--t1)', marginBottom:8 }}>Confirmar cancelamento</div>
                  <div style={{ fontSize:13, color:'var(--t2)', lineHeight:1.6 }}>
                    Ao confirmar, você perde acesso imediato ao assistente IA, fechamentos em PDF avançados e demais recursos premium.
                  </div>
                </div>

                <div style={{ background:'rgba(239,68,68,.06)', border:'1px solid rgba(239,68,68,.15)', borderRadius:10, padding:'12px 14px', marginBottom:20, fontSize:12, color:'var(--t2)', lineHeight:1.6 }}>
                  Seus dados ficam salvos. Você pode reativar o plano a qualquer momento em <strong style={{ color:'var(--cp)' }}>Planos</strong>.
                </div>

                <div style={{ display:'flex', gap:10 }}>
                  <button onClick={() => setStep(1)} style={{ flex:1, padding:'10px 0', borderRadius:8, border:'1px solid var(--bd)', background:'transparent', color:'var(--t2)', fontSize:14, fontWeight:600, cursor:'pointer' }}>
                    Voltar
                  </button>
                  <button
                    onClick={handleConfirm}
                    disabled={loading}
                    style={{ flex:1, padding:'10px 0', borderRadius:8, border:'none', background:'#ef4444', color:'#fff', fontSize:14, fontWeight:700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
                  >
                    {loading ? 'Cancelando…' : 'Sim, cancelar plano'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
