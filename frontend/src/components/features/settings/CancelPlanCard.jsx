import { useState } from 'react'
import { useUser, saveUser } from '../../../hooks/useUser.js'
import { authAPI } from '../../../services/api.js'
import { analytics } from '../../../services/analytics.js'

export default function CancelPlanCard({ onMessage }) {
  const user   = useUser()
  const isPaid = (user.plan === 'pro' || user.plan === 'elite') && !user.isOnTrial

  const isCancelledWithAccess = !!user.subscriptionCancelled &&
    !!user.planExpiresAt && new Date(user.planExpiresAt) > Date.now()

  const [modal,      setModal]      = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [confirmPwd, setConfirmPwd] = useState('')
  const [pwdErr,     setPwdErr]     = useState('')

  const openModal  = () => { setModal(true); setConfirmPwd(''); setPwdErr('') }
  const closeModal = () => { setModal(false); setConfirmPwd(''); setPwdErr('') }

  if (!isPaid) return null

  const planLabel = user.plan === 'elite' ? 'Elite' : 'Pro'

  const expiryFormatted = user.planExpiresAt
    ? new Date(user.planExpiresAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null

  const handleConfirm = async () => {
    if (!confirmPwd.trim()) { setPwdErr('Digite sua senha para confirmar.'); return }
    setLoading(true)
    try {
      await authAPI.downgradeFree({ password: confirmPwd })
      analytics.track('plan_cancelled', { plan: user.plan })
      const cur = JSON.parse(sessionStorage.getItem('user') || '{}')
      // Mantém plan e planExpiresAt — o acesso continua até o fim do período pago.
      // subscriptionCancelled sinaliza que a renovação foi cancelada.
      saveUser({ ...cur, subscriptionCancelled: true, isOnTrial: false })
      closeModal()
      onMessage(
        expiryFormatted
          ? `Assinatura cancelada. Seu acesso premium continua até ${expiryFormatted}.`
          : 'Assinatura cancelada. Seu acesso premium continua até o fim do período pago.'
      )
    } catch (err) {
      onMessage(err.response?.data?.error || 'Erro ao cancelar plano.', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="cfg-card">
        <div className="cfg-card-head">
          <div className="cfg-ch-ico">
            {isCancelledWithAccess ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
            )}
          </div>
          <div style={{ flex:1 }}>
            {isCancelledWithAccess ? (
              <>
                <div className="cfg-ch-title">Assinatura cancelada</div>
                <div className="cfg-ch-sub" style={{ color:'#f59e0b' }}>
                  Acesso premium garantido até {expiryFormatted}
                </div>
              </>
            ) : (
              <>
                <div className="cfg-ch-title">Cancelar plano {planLabel}</div>
                <div className="cfg-ch-sub">Cancela a renovação automática; acesso premium mantido até o fim do período pago.</div>
              </>
            )}
          </div>
        </div>
        {!isCancelledWithAccess && (
          <div className="cfg-card-body" style={{ paddingTop: 0 }}>
            <button
              className="cfg-btn-danger"
              onClick={openModal}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              Cancelar plano
            </button>
          </div>
        )}
      </div>

      {modal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.65)', zIndex:9000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'var(--bg-card)', border:'1px solid var(--bd)', borderRadius:16, padding:28, width:'100%', maxWidth:440 }}>

            <div style={{ textAlign:'center', marginBottom:20 }}>
              <div style={{ width:52, height:52, borderRadius:14, background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.2)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
              <div style={{ fontWeight:700, fontSize:16, color:'var(--t1)', marginBottom:8 }}>Confirmar cancelamento</div>
              <div style={{ fontSize:13, color:'var(--t2)', lineHeight:1.6 }}>
                Ao confirmar, a renovação automática é cancelada. Você mantém acesso a todos os recursos premium até o fim do período já pago
                {expiryFormatted && <> (<strong style={{ color:'var(--t1)' }}>{expiryFormatted}</strong>)</>}.
              </div>
            </div>

            <div style={{ background:'rgba(239,68,68,.06)', border:'1px solid rgba(239,68,68,.15)', borderRadius:10, padding:'12px 14px', marginBottom:16, fontSize:12, color:'var(--t2)', lineHeight:1.6 }}>
              Seus dados ficam salvos. Você pode reativar o plano a qualquer momento em <strong style={{ color:'var(--c)' }}>Planos</strong>.
            </div>

            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:13, color:'var(--t2)', display:'block', marginBottom:6 }}>
                Confirme sua senha para continuar
              </label>
              <input
                type="password"
                placeholder="Sua senha atual"
                value={confirmPwd}
                onChange={e => { setConfirmPwd(e.target.value); setPwdErr('') }}
                autoFocus
                style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:`1px solid ${pwdErr ? '#ef4444' : 'var(--bd)'}`, background:'var(--bg)', color:'var(--t1)', fontSize:14, boxSizing:'border-box', outline:'none' }}
              />
              {pwdErr && <span style={{ fontSize:12, color:'#ef4444', marginTop:4, display:'block' }}>{pwdErr}</span>}
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button onClick={closeModal} style={{ flex:1, padding:'10px 0', borderRadius:8, border:'1px solid var(--bd)', background:'transparent', color:'var(--t2)', fontSize:14, fontWeight:600, cursor:'pointer' }}>
                Voltar
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading || !confirmPwd.trim()}
                style={{ flex:1, padding:'10px 0', borderRadius:8, border:'none', background:'#ef4444', color:'#fff', fontSize:14, fontWeight:700, cursor:(loading || !confirmPwd.trim()) ? 'not-allowed' : 'pointer', opacity:(loading || !confirmPwd.trim()) ? 0.6 : 1 }}
              >
                {loading ? 'Cancelando…' : 'Sim, cancelar plano'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
