import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useUser, saveUser } from '../../../hooks/useUser.js'
import { useEscapeKey } from '../../../hooks/useEscapeKey.js'
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
  useEscapeKey(closeModal, modal)

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
      // Mantém plan e planExpiresAt — o acesso continua até o fim do período pago.
      // subscriptionCancelled sinaliza que a renovação foi cancelada. Usa o
      // `user` vivo do hook, não uma cópia do sessionStorage — ver mesmo fix
      // em ProfileCard.jsx (apagava salary/reportEmail do estado global).
      saveUser({ ...user, subscriptionCancelled: true, isOnTrial: false })
      closeModal()
      onMessage(
        expiryFormatted
          ? `Pronto: seu plano não será renovado. Seu acesso premium continua até ${expiryFormatted}.`
          : 'Pronto: seu plano não será renovado. Seu acesso premium continua até o fim do período pago.'
      )
    } catch (err) {
      const msg = err.response?.data?.error || 'Erro ao registrar. Tente de novo.'
      // senha errada: o erro aparece EMBAIXO do campo (não numa faixa atrás da janela) e o campo esvazia pra redigitar direto
      if (err.response?.status === 401) { setPwdErr(msg); setConfirmPwd('') }
      else onMessage(msg, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {isCancelledWithAccess ? (
        <div className="pg-cancelled" role="status">
          <strong>Plano não será renovado.</strong> Acesso premium garantido até {expiryFormatted}.
        </div>
      ) : (
        <button type="button" className="pg-cancel" onClick={openModal}>
          Não renovar
        </button>
      )}

      {modal && createPortal(
        <div className="gls-modal-overlay" onClick={closeModal}>
          <div className="gls-modal" style={{ maxWidth:440 }} onClick={e => e.stopPropagation()}>
            <div className="gls-modal-head">
              <span>Não renovar o plano</span>
              <button className="gls-modal-close" onClick={closeModal}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="gls-modal-body">
              <div style={{ textAlign:'center', marginBottom:16 }}>
                <div style={{ width:48, height:48, borderRadius:12, background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.2)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                </div>
                <div style={{ fontSize:13, color:'var(--t2)', lineHeight:1.6 }}>
                  O plano não renova sozinho: ao fim do período pago ele volta para o Grátis. Ao confirmar, registramos que você não vai renovar. Você mantém acesso a todos os recursos premium até o fim do período já pago
                  {expiryFormatted && <> (<strong style={{ color:'var(--t1)' }}>{expiryFormatted}</strong>)</>}.
                </div>
              </div>

              <div style={{ background:'rgba(239,68,68,.06)', border:'1px solid rgba(239,68,68,.15)', borderRadius:10, padding:'12px 14px', marginBottom:16, fontSize:12, color:'var(--t2)', lineHeight:1.6 }}>
                Seus dados ficam salvos. Você pode assinar de novo a qualquer momento em <strong style={{ color:'var(--c)' }}>Planos</strong>.
              </div>

              <div>
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
            </div>
            <div className="gls-modal-foot">
              <button className="gls-btn-ghost" onClick={closeModal}>Voltar</button>
              <button
                className="gls-btn-save"
                style={{ background:'#ef4444', opacity:(loading || !confirmPwd.trim()) ? 0.6 : 1, cursor:(loading || !confirmPwd.trim()) ? 'not-allowed' : 'pointer' }}
                onClick={handleConfirm}
                disabled={loading || !confirmPwd.trim()}
              >
                {loading ? 'Salvando…' : 'Sim, não renovar'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
