import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'

const FREE_FEATURES = [
  { label: 'Transações por mês', free: 'Até 30', pro: 'Ilimitadas' },
  { label: 'Contas fixas', free: 'Até 3', pro: 'Ilimitadas' },
  { label: 'Limites por categoria', free: false, pro: true },
  { label: 'Relatório PDF mensal', free: false, pro: true },
  { label: 'Histórico de meses', free: false, pro: true },
  { label: 'Exportação CSV', free: false, pro: true },
  { label: 'Suporte prioritário', free: false, pro: true },
]

function Check() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18" style={{ color: '#00ffcc' }}>
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
    </svg>
  )
}

function Cross() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" style={{ color: 'var(--t3)', opacity: 0.4 }}>
      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
    </svg>
  )
}

export default function Planos() {
  const navigate  = useNavigate()
  const [showMsg, setShowMsg] = useState(false)
  let user = {}
  try { user = JSON.parse(localStorage.getItem('user') || '{}') } catch { user = {} }
  const isPro = user.plan === 'pro'

  const handleAssinar = () => {
    setShowMsg(true)
    setTimeout(() => setShowMsg(false), 4000)
  }

  return (
    <>
      <Navbar />
      <div className="page pwnav fade-in" style={{ maxWidth: 780 }}>

        <div className="pgh">
          <div>
            <div className="pgt">Planos</div>
            <div className="pgs">Escolha o plano ideal para o seu controle financeiro</div>
          </div>
        </div>

        {showMsg && (
          <div className="toast tok mb16" style={{ marginBottom: 20 }}>
            <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/>
            </svg>
            Pagamentos em breve! Você será notificado quando o Pro estiver disponível.
          </div>
        )}

        {/* Cards lado a lado */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>

          {/* Plano Free */}
          <div className="card" style={{ opacity: isPro ? 0.6 : 1 }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Gratuito</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: 32, fontWeight: 800, color: 'var(--t1)', fontFamily: 'var(--fd)' }}>R$ 0</span>
                <span style={{ fontSize: 13, color: 'var(--t2)' }}>/mês</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 4 }}>Para começar</div>
            </div>

            {user.plan === 'free' || !user.plan ? (
              <div className="bdg" style={{ background: 'rgba(0,255,204,.1)', color: 'var(--c)', border: '1px solid rgba(0,255,204,.2)', padding: '6px 14px', borderRadius: 20, fontSize: 12, display: 'inline-block', marginBottom: 16 }}>
                Plano atual
              </div>
            ) : null}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {FREE_FEATURES.map(f => (
                <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {f.free ? <Check /> : <Cross />}
                  <span style={{ fontSize: 13, color: f.free ? 'var(--t1)' : 'var(--t2)' }}>
                    {f.label}{typeof f.free === 'string' ? `: ${f.free}` : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Plano Pro */}
          <div className="card" style={{ borderColor: 'rgba(0,255,204,.3)', background: 'linear-gradient(135deg, rgba(0,255,204,.04) 0%, transparent 60%)', position: 'relative', overflow: 'hidden' }}>
            {/* Badge recomendado */}
            <div style={{ position: 'absolute', top: 14, right: 14, background: 'var(--c)', color: '#020d10', fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Recomendado
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="#00ffcc" strokeWidth="1.5" fill="rgba(0,255,204,.2)"/>
                </svg>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c)', textTransform: 'uppercase', letterSpacing: 1 }}>Pro</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: 32, fontWeight: 800, color: 'var(--c)', fontFamily: 'var(--fd)' }}>R$ 14,90</span>
                <span style={{ fontSize: 13, color: 'var(--t2)' }}>/mês</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 4 }}>Cancele quando quiser</div>
            </div>

            {isPro && (
              <div className="bdg" style={{ background: 'rgba(0,255,204,.1)', color: 'var(--c)', border: '1px solid rgba(0,255,204,.2)', padding: '6px 14px', borderRadius: 20, fontSize: 12, display: 'inline-block', marginBottom: 16 }}>
                ✨ Plano atual
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              {FREE_FEATURES.map(f => (
                <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Check />
                  <span style={{ fontSize: 13, color: 'var(--t1)' }}>
                    {f.label}{typeof f.pro === 'string' ? `: ${f.pro}` : ''}
                  </span>
                </div>
              ))}
            </div>

            {!isPro && (
              <button
                className="btn bp"
                style={{ width: '100%', justifyContent: 'center', fontSize: 14, padding: '11px 0' }}
                onClick={handleAssinar}
              >
                <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" strokeWidth="1.5" fill="rgba(255,255,255,.2)"/>
                </svg>
                Assinar Pro — Em breve
              </button>
            )}
          </div>
        </div>

        {/* FAQ */}
        <div className="card">
          <div className="sct" style={{ marginBottom: 16 }}>Perguntas frequentes</div>
          {[
            ['Posso cancelar a qualquer momento?', 'Sim. Sem fidelidade ou multa. Você cancela quando quiser e continua com acesso Pro até o final do período pago.'],
            ['Como funciona o pagamento?', 'O pagamento será processado via Mercado Pago (cartão, Pix ou boleto). Em breve disponível.'],
            ['O que acontece com meus dados se eu cancelar?', 'Seus dados ficam salvos. Você volta para o plano Gratuito com as limitações normais, mas não perde nada.'],
          ].map(([q, a]) => (
            <div key={q} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--brd)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', marginBottom: 6 }}>{q}</div>
              <div style={{ fontSize: 13, color: 'var(--t2)' }}>{a}</div>
            </div>
          ))}
          <div style={{ fontSize: 13, color: 'var(--t2)' }}>
            Dúvidas? Fale com a gente em{' '}
            <span style={{ color: 'var(--c)' }}>suporte@myfinancepro.com.br</span>
          </div>
        </div>

      </div>
    </>
  )
}
