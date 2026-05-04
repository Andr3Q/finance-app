import { useState } from 'react'
import Navbar from '../components/Navbar.jsx'

const FEATURES = [
  { label: 'Transações por mês', free: 'Até 30',     pro: 'Ilimitadas' },
  { label: 'Contas fixas',        free: 'Até 3',      pro: 'Ilimitadas' },
  { label: 'Limites por categoria', free: false,      pro: true },
  { label: 'Relatório PDF mensal',  free: false,      pro: true },
  { label: 'Histórico de meses',    free: false,      pro: true },
  { label: 'Exportação CSV',        free: false,      pro: true },
  { label: 'Suporte prioritário',   free: false,      pro: true },
]

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" style={{ color: '#00ffcc', flexShrink: 0 }}>
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
    </svg>
  )
}

function CrossIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14" style={{ color: 'var(--t2)', opacity: 0.35, flexShrink: 0 }}>
      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
    </svg>
  )
}

export default function Planos() {
  const [toast, setToast] = useState(false)
  let user = {}
  try { user = JSON.parse(localStorage.getItem('user') || '{}') } catch { user = {} }
  const isPro = user.plan === 'pro'

  const handleAssinar = () => {
    setToast(true)
    setTimeout(() => setToast(false), 4000)
  }

  return (
    <>
      <Navbar />
      <div className="page pwnav fade-in" style={{ maxWidth: 480 }}>

        {/* Header */}
        <div className="pgh">
          <div>
            <div className="pgt">Planos</div>
            <div className="pgs">Escolha o plano ideal para você</div>
          </div>
        </div>

        {toast && (
          <div className="toast tok mb16">
            <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/>
            </svg>
            Em breve! Você será notificado quando o Pro estiver disponível.
          </div>
        )}

        {/* Card PRO — destaque */}
        <div className="card mb16" style={{
          border: '1.5px solid rgba(0,255,204,.35)',
          background: 'linear-gradient(160deg, rgba(0,255,204,.06) 0%, transparent 55%)',
          position: 'relative'
        }}>
          {/* Badge recomendado */}
          <div style={{
            position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
            background: 'var(--c)', color: '#020d10',
            fontSize: 11, fontWeight: 800, padding: '4px 16px',
            borderRadius: 20, letterSpacing: 0.5, textTransform: 'uppercase', whiteSpace: 'nowrap'
          }}>
            ⭐ Recomendado
          </div>

          <div style={{ paddingTop: 8 }}>
            {/* Título e preço */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                  stroke="#00ffcc" strokeWidth="1.5" fill="rgba(0,255,204,.15)"/>
              </svg>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c)', textTransform: 'uppercase', letterSpacing: 1 }}>Pro</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginBottom: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t2)', alignSelf: 'flex-start', marginTop: 8 }}>R$</span>
              <span style={{ fontSize: 44, fontWeight: 800, color: 'var(--c)', fontFamily: 'var(--fd)', lineHeight: 1 }}>14,90</span>
              <span style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 6 }}>/mês</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 20 }}>Cancele quando quiser</div>

            {/* Features */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginBottom: 24 }}>
              {FEATURES.map(f => (
                <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <CheckIcon />
                  <span style={{ fontSize: 14, color: 'var(--t1)' }}>
                    {f.label}{typeof f.pro === 'string' ? `: ${f.pro}` : ''}
                  </span>
                </div>
              ))}
            </div>

            {isPro ? (
              <div style={{ textAlign: 'center', padding: '10px', background: 'rgba(0,255,204,.08)', borderRadius: 10, fontSize: 13, fontWeight: 600, color: 'var(--c)' }}>
                ✨ Você já é Pro!
              </div>
            ) : (
              <button
                className="btn bp"
                style={{ width: '100%', justifyContent: 'center', fontSize: 15, padding: '13px 0' }}
                onClick={handleAssinar}
              >
                <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                    stroke="currentColor" strokeWidth="1.5" fill="rgba(255,255,255,.2)"/>
                </svg>
                Assinar Pro — Em breve
              </button>
            )}
          </div>
        </div>

        {/* Card GRATUITO */}
        <div className="card mb24" style={{ opacity: isPro ? 0.5 : 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: 1 }}>Gratuito</span>
            {(!isPro) && (
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--c)', background: 'rgba(0,255,204,.1)', border: '1px solid rgba(0,255,204,.2)', padding: '2px 10px', borderRadius: 20 }}>
                Plano atual
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t2)', alignSelf: 'flex-start', marginTop: 8 }}>R$</span>
            <span style={{ fontSize: 44, fontWeight: 800, color: 'var(--t1)', fontFamily: 'var(--fd)', lineHeight: 1 }}>0</span>
            <span style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 6 }}>/mês</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 20 }}>Para começar</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {FEATURES.map(f => (
              <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {f.free ? <CheckIcon /> : <CrossIcon />}
                <span style={{ fontSize: 14, color: f.free ? 'var(--t1)' : 'var(--t2)' }}>
                  {f.label}{typeof f.free === 'string' ? `: ${f.free}` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div className="card">
          <div className="sct" style={{ marginBottom: 16 }}>Dúvidas frequentes</div>
          {[
            ['Posso cancelar quando quiser?', 'Sim, sem fidelidade ou multa. Você mantém o acesso Pro até o fim do período pago.'],
            ['Como funciona o pagamento?', 'Via Mercado Pago — cartão de crédito, Pix ou boleto. Em breve disponível.'],
            ['Meus dados ficam seguros se eu cancelar?', 'Sim. Você volta para o Free mas não perde nenhum dado.'],
          ].map(([q, a]) => (
            <div key={q} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--brd)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', marginBottom: 5 }}>{q}</div>
              <div style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.5 }}>{a}</div>
            </div>
          ))}
          <div style={{ fontSize: 12, color: 'var(--t2)' }}>
            Dúvidas? <span style={{ color: 'var(--c)' }}>suporte@myfinancepro.com.br</span>
          </div>
        </div>

      </div>
    </>
  )
}
