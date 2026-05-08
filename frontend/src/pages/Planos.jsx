import { useState } from 'react'
import Navbar from '../components/Navbar.jsx'

const FEATURES = [
  { label: 'Transações por mês',    free: 'Até 30',     pro: 'Ilimitadas' },
  { label: 'Contas fixas',          free: 'Até 3',       pro: 'Ilimitadas' },
  { label: 'Limites por categoria', free: false,         pro: true },
  { label: 'Relatório PDF mensal',  free: false,         pro: true },
  { label: 'Histórico de meses',    free: false,         pro: true },
  { label: 'Exportação CSV',        free: false,         pro: true },
  { label: 'Suporte prioritário',   free: false,         pro: true },
]

const FAQ = [
  ['Posso cancelar quando quiser?', 'Sim. Sem fidelidade ou multa. Você cancela quando quiser e continua com acesso Pro até o final do período pago.'],
  ['Como funciona o pagamento?', 'Via Mercado Pago — cartão de crédito, Pix ou boleto. Em breve disponível.'],
  ['Meus dados ficam seguros se eu cancelar?', 'Sim. Você volta para o Free mas não perde nenhum dado histórico.'],
]

function Check() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" style={{ color: '#00ffcc', flexShrink: 0 }}>
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
    </svg>
  )
}

function Cross() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14" style={{ color: 'var(--t3)', flexShrink: 0 }}>
      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
    </svg>
  )
}

export default function Planos() {
  const [toast, setToast] = useState(false)
  const [openFaq, setOpenFaq] = useState(null)
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
      <div className="page pwnav fade-in" style={{ maxWidth: 520, paddingBottom: 120 }}>

        {/* ── Header ── */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            background: 'rgba(0,255,204,.07)', border: '1px solid rgba(0,255,204,.18)',
            borderRadius: 100, padding: '5px 14px', fontSize: 12,
            color: 'var(--c)', fontFamily: 'var(--fd)', fontWeight: 700,
            marginBottom: 14, letterSpacing: 0.5,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--c)', animation: 'pdot 2s infinite' }} />
            Escolha seu plano
          </div>
          <div className="pgt" style={{ marginBottom: 6 }}>Planos & Preços</div>
          <div className="pgs">Controle total do seu dinheiro, no seu ritmo</div>
        </div>

        {/* ── Toast ── */}
        {toast && (
          <div className="toast tok" style={{ marginBottom: 20 }}>
            <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/>
            </svg>
            Em breve! Você será notificado quando o Pro estiver disponível.
          </div>
        )}

        {/* ── Card PRO ── */}
        <div className="plan-pro-card fu d1">
          {/* Glow decorativo */}
          <div style={{
            position: 'absolute', top: -60, right: -60,
            width: 200, height: 200, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(0,255,204,.12), transparent 70%)',
            pointerEvents: 'none',
          }} />

          {/* Topo: badge + nome */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'rgba(0,255,204,.12)', border: '1px solid rgba(0,255,204,.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" style={{ color: 'var(--c)' }}>
                  <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c)', textTransform: 'uppercase', letterSpacing: 1.5, fontFamily: 'var(--fd)' }}>Pro</div>
                <div style={{ fontSize: 10, color: 'var(--t2)', marginTop: 1 }}>Acesso completo</div>
              </div>
            </div>

            <span style={{
              background: 'linear-gradient(135deg, var(--c), #00a89a)',
              color: '#021a14', fontSize: 10, fontWeight: 800,
              padding: '4px 12px', borderRadius: 20,
              letterSpacing: 0.5, fontFamily: 'var(--fd)',
              boxShadow: '0 4px 16px rgba(0,255,204,.3)',
            }}>⭐ RECOMENDADO</span>
          </div>

          {/* Preço */}
          <div style={{ marginBottom: 6, display: 'flex', alignItems: 'flex-end', gap: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--t2)', paddingBottom: 4 }}>R$</span>
            <span style={{ fontSize: 52, fontWeight: 800, color: 'var(--c)', lineHeight: 1, fontFamily: 'var(--fn)', letterSpacing: -2 }}>19</span>
            <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--c)', paddingBottom: 2, fontFamily: 'var(--fn)' }}>,90</span>
            <span style={{ fontSize: 13, color: 'var(--t2)', paddingBottom: 6 }}>/mês</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 24 }}>Cancele quando quiser · Sem fidelidade</div>

          {/* Features */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginBottom: 26 }}>
            {FEATURES.map(f => (
              <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Check />
                <span style={{ fontSize: 13.5, color: 'var(--t1)' }}>
                  {f.label}{typeof f.pro === 'string' ? <span style={{ color: 'var(--c)', fontWeight: 700 }}> — {f.pro}</span> : ''}
                </span>
              </div>
            ))}
          </div>

          {/* CTA */}
          {isPro ? (
            <div style={{
              textAlign: 'center', padding: 14,
              background: 'rgba(0,255,204,.08)', borderRadius: 14,
              fontSize: 14, fontWeight: 700, color: 'var(--c)',
              border: '1px solid rgba(0,255,204,.18)',
            }}>✨ Você já é Pro!</div>
          ) : (
            <button
              className="btn bp"
              style={{ width: '100%', justifyContent: 'center', fontSize: 15, padding: '14px 0', borderRadius: 14, fontWeight: 800 }}
              onClick={handleAssinar}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd"/>
              </svg>
              Assinar Pro — Em breve
            </button>
          )}
        </div>

        {/* ── Card Gratuito ── */}
        <div className="plan-free-card fu d2">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: 1.5, fontFamily: 'var(--fd)' }}>Gratuito</div>
            {!isPro && <span className="bdg baurora">Plano atual</span>}
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t2)', paddingBottom: 3 }}>R$</span>
            <span style={{ fontSize: 38, fontWeight: 800, color: 'var(--t1)', fontFamily: 'var(--fn)', lineHeight: 1 }}>0</span>
            <span style={{ fontSize: 12, color: 'var(--t2)', paddingBottom: 4 }}>/mês</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 20 }}>Para começar, sem cartão</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {FEATURES.map(f => (
              <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {f.free ? <Check /> : <Cross />}
                <span style={{ fontSize: 13, color: f.free ? 'var(--t1)' : 'var(--t2)' }}>
                  {f.label}{typeof f.free === 'string' ? <span style={{ color: 'var(--t2)', fontWeight: 600 }}> — {f.free}</span> : ''}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── FAQ ── */}
        <div className="card fu d3" style={{ marginBottom: 0 }}>
          <div className="sct" style={{ marginBottom: 18 }}>Dúvidas frequentes</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {FAQ.map(([q, a], i) => (
              <div
                key={q}
                style={{ borderBottom: i < FAQ.length - 1 ? '1px solid rgba(0,255,204,.07)' : 'none' }}
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  style={{
                    width: '100%', background: 'none', border: 'none',
                    cursor: 'pointer', padding: '14px 0',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', fontFamily: 'var(--fd)' }}>{q}</span>
                  <svg
                    viewBox="0 0 20 20" fill="currentColor" width="16" height="16"
                    style={{ color: 'var(--t2)', flexShrink: 0, transition: 'transform .2s', transform: openFaq === i ? 'rotate(180deg)' : 'none' }}
                  >
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd"/>
                  </svg>
                </button>
                {openFaq === i && (
                  <div style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.6, paddingBottom: 14 }}>
                    {a}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ marginTop: 16, fontSize: 12, color: 'var(--t2)', paddingTop: 16, borderTop: '1px solid rgba(0,255,204,.07)' }}>
            Dúvidas? <span style={{ color: 'var(--c)', fontWeight: 600 }}>suporte@myfinancepro.com.br</span>
          </div>
        </div>

      </div>
    </>
  )
}
