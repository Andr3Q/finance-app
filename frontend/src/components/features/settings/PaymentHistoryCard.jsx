import { useState, useEffect } from 'react'
import { paymentsAPI } from '../../../services/api.js'
import { useUser } from '../../../hooks/useUser.js'

const PLAN_LABEL  = { pro: 'Pro', elite: 'Elite' }
const PERIOD_LABEL = { monthly: 'Mensal', annual: 'Anual' }

export default function PaymentHistoryCard() {
  const user = useUser()
  const isPaid = user.plan === 'pro' || user.plan === 'elite'

  const [payments, setPayments] = useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    paymentsAPI.history()
      .then(r => setPayments(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (!isPaid && payments.length === 0 && !loading) return null

  return (
    <div className="cfg-card">
      <div className="cfg-card-head">
        <div className="cfg-ch-ico">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
            <line x1="1" y1="10" x2="23" y2="10"/>
          </svg>
        </div>
        <div>
          <div className="cfg-ch-title">Histórico de pagamentos</div>
          <div className="cfg-ch-sub">Suas últimas assinaturas processadas</div>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0' }}>
            <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
          </div>
        )}
        {!loading && payments.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--t3)', textAlign: 'center', padding: '8px 0' }}>
            Nenhum pagamento registrado ainda.
          </p>
        )}
        {!loading && payments.map((p, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < payments.length - 1 ? '1px solid var(--bd)' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: p.plan === 'elite' ? 'rgba(168,85,247,.12)' : 'rgba(74,196,110,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={p.plan === 'elite' ? '#a855f7' : '#4ac46e'} strokeWidth="2" strokeLinecap="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>
                  Plano {PLAN_LABEL[p.plan] || p.plan} — {PERIOD_LABEL[p.period] || p.period}
                </div>
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>
                  {new Date(p.processedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                </div>
              </div>
            </div>
            <span style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'monospace' }}>#{String(p.paymentId).slice(-6)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
