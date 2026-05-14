import { useState } from 'react'
import Navbar from '../components/Navbar.jsx'
import { useUser } from '../hooks/useUser.js'

const FAQ = [
  ['Quando o Pro estará disponível?',   'O plano Pro está em desenvolvimento final. Você será notificado por e-mail assim que for lançado com acesso antecipado.'],
  ['O plano Grátis tem limite de tempo?','Não. O plano Grátis é gratuito para sempre, sem expiração. Use sem pressa.'],
  ['Meus dados ficam seguros?',          'Sim. Seus dados são 100% privados e nunca compartilhados com terceiros. Você é o único dono das suas informações.'],
  ['Posso cancelar sem taxas?',          'Sim. Cancele a qualquer momento, sem multa, diretamente nas configurações da conta.'],
]

const FREE_FEATS = [
  'Dashboard com saldo do mês',
  'Até 30 transações por mês',
  'Categorias de gastos',
  'Relatório mensal em PDF',
  'Contas fixas automáticas',
]

const PRO_FEATS = [
  { text: 'Transações', hi: 'Ilimitadas' },
  { text: 'Contas fixas', hi: 'Ilimitadas' },
  { text: 'Limites por categoria' },
  { text: 'Relatório PDF mensal automático' },
  null,
  { text: 'Histórico completo de meses' },
  { text: 'Exportação CSV' },
  { text: 'Suporte prioritário' },
]

const COMPARE_GROUPS = [
  {
    label: 'Dashboard & Relatórios',
    rows: [
      { feat: 'Saldo do mês em tempo real',     free: true,  pro: true  },
      { feat: 'Relatório PDF mensal',            free: true,  pro: true  },
      { feat: 'Histórico de meses anteriores',   free: false, pro: true  },
      { feat: 'Exportação CSV',                  free: false, pro: true  },
    ],
  },
  {
    label: 'Transações',
    rows: [
      { feat: 'Transações por mês',              free: '30',  pro: 'Ilimitadas' },
      { feat: 'Categorias de gastos',            free: true,  pro: true  },
      { feat: 'Limites por categoria',           free: false, pro: true  },
      { feat: 'Contas fixas automáticas',        free: true,  pro: true  },
      { feat: 'Contas fixas ilimitadas',         free: false, pro: true  },
    ],
  },
  {
    label: 'Suporte',
    rows: [
      { feat: 'Suporte por e-mail',              free: true,  pro: true  },
      { feat: 'Suporte prioritário',             free: false, pro: true  },
    ],
  },
]

const CheckYes = () => (
  <div className="plp-check-yes">
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#4ac46e" strokeWidth="2" strokeLinecap="round">
      <path d="M2 6l3 3 5-5"/>
    </svg>
  </div>
)
const CheckNo = () => (
  <div className="plp-check-no">
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="3" x2="9" y2="9"/><line x1="9" y1="3" x2="3" y2="9"/>
    </svg>
  </div>
)

export default function Planos() {
  const [billing, setBilling] = useState('mensal')
  const [openFaq, setOpenFaq] = useState(null)
  const [toast,   setToast]   = useState(false)

  const user = useUser()
  const isPro = user.plan === 'pro'

  const proPrice  = billing === 'mensal' ? '19' : '15'
  const properiod = billing === 'mensal'
    ? 'por mês · Cancele quando quiser'
    : 'por mês · Cobrado anualmente (R$ 190,80/ano)'

  const handleAssinar = () => {
    setToast(true)
    setTimeout(() => setToast(false), 4000)
  }

  const toggleFaq = (i) => setOpenFaq(openFaq === i ? null : i)

  return (
    <>
      <Navbar />

      {toast && (
        <div className="toast tok" style={{ position:'fixed', top:16, left:'50%', transform:'translateX(-50%)', zIndex:400, whiteSpace:'nowrap' }}>
          Em breve! Você será notificado quando o Pro estiver disponível.
        </div>
      )}

      <div className="pwnav fade-in">
        <div className="pp1-page">

          {/* ── Hero ── */}
          <div className="pp1-hero">
            <div className="pp1-eyebrow">
              <span className="pp1-eyebrow-dot" />
              Escolha seu plano
            </div>
            <h1 className="pp1-title">
              Controle total do<br />
              <span className="pp1-title-green">seu dinheiro.</span>
            </h1>
            <p className="pp1-sub">Comece grátis e faça upgrade quando precisar de mais poder.</p>
            <div className="pp1-toggle-wrap">
              <div className="pp1-toggle">
                <button className={`pp1-toggle-btn${billing === 'mensal' ? ' on' : ''}`} onClick={() => setBilling('mensal')}>Mensal</button>
                <button className={`pp1-toggle-btn${billing === 'anual' ? ' on' : ''}`} onClick={() => setBilling('anual')}>Anual</button>
              </div>
              {billing === 'anual' && <span className="pp1-save-badge">Economize 20%</span>}
            </div>
          </div>

          {/* ── Cards ── */}
          <div className="pp1-cards">

            {/* GRÁTIS */}
            <div className="pp1-card pp1-free">
              <div className="pp1-card-tier">Grátis</div>
              <div className="pp1-card-tagline">Ideal para começar</div>
              {!isPro && <div className="pp1-current-badge">Plano atual</div>}

              <div className="pp1-price-block">
                <div className="pp1-price">
                  <span className="pp1-price-cur">R$</span>
                  <span className="pp1-price-num">0</span>
                </div>
                <div className="pp1-price-note">Para sempre grátis</div>
              </div>

              <div className="pp1-divider" />

              <ul className="pp1-feats">
                {FREE_FEATS.map(f => (
                  <li key={f} className="pp1-feat">
                    <div className="pp1-feat-ico pp1-feat-ico-muted">
                      <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="rgba(255,255,255,.4)" strokeWidth="2.2" strokeLinecap="round"><path d="M2 6l3 3 5-5"/></svg>
                    </div>
                    <span className="pp1-feat-text pp1-feat-muted">{f}</span>
                  </li>
                ))}
              </ul>

              <button className="pp1-cta-ghost" disabled>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                Plano atual
              </button>
            </div>

            {/* PRO */}
            <div className="pp1-card pp1-pro">
              {/* Gradiente + partículas */}
              <div className="pp1-pro-glow" />
              <div className="grad-particles" aria-hidden="true">
                {[5,14,23,34,45,56,65,76,85,94].map((left, i) => (
                  <span key={i} className="grad-particle" style={{
                    left:`${left}%`,
                    width:`${2+(i%3)}px`, height:`${2+(i%3)}px`,
                    animationDelay:`${(i*0.52)%3}s`,
                    animationDuration:`${2.2+(i%4)*0.6}s`,
                    opacity: 0.3+(i%3)*0.15,
                  }}/>
                ))}
              </div>

              <div className="pp1-rec-badge">
                <svg width="9" height="9" viewBox="0 0 12 12" fill="currentColor"><polygon points="6 1 7.5 4.5 11 5 8.5 7.5 9 11 6 9.5 3 11 3.5 7.5 1 5 4.5 4.5"/></svg>
                Recomendado
              </div>

              <div className="pp1-card-tier pp1-tier-pro">Pro</div>
              <div className="pp1-card-tagline pp1-tagline-pro">Para quem quer controle total</div>

              <div className="pp1-price-block">
                <div className="pp1-price">
                  <span className="pp1-price-cur pp1-cur-pro">R$</span>
                  <span className="pp1-price-num pp1-num-pro">{proPrice}</span>
                  <span className="pp1-price-dec">,90</span>
                </div>
                <div className="pp1-price-note pp1-note-pro">{properiod}</div>
                <div className="pp1-price-cancel">Sem fidelidade · Sem cartão para testar</div>
              </div>

              <div className="pp1-divider pp1-divider-pro" />

              <ul className="pp1-feats">
                {PRO_FEATS.map((f, i) =>
                  f === null ? <li key={i} className="pp1-feat-sep" /> : (
                    <li key={i} className="pp1-feat">
                      <div className="pp1-feat-ico pp1-feat-ico-pro">
                        <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="#4ac46e" strokeWidth="2.2" strokeLinecap="round"><path d="M2 6l3 3 5-5"/></svg>
                      </div>
                      <span className="pp1-feat-text">
                        {f.text}{f.hi && <> — <span className="pp1-feat-hi">{f.hi}</span></>}
                      </span>
                    </li>
                  )
                )}
              </ul>

              {isPro ? (
                <div className="pp1-cta-is-pro">✨ Você já é Pro!</div>
              ) : (
                <button className="pp1-cta-pro" onClick={handleAssinar}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                  </svg>
                  Assinar Pro — Em breve
                </button>
              )}
              <div className="pp1-cta-note">Para começar, sem cartão de crédito</div>
            </div>

          </div>

          {/* ── Tabela comparativa ── */}
          <div className="pp1-compare">
            <div className="pp1-compare-title">Comparativo completo</div>
            <div className="pp1-table">
              <div className="pp1-table-head">
                <div className="pp1-th-feat">Funcionalidade</div>
                <div className="pp1-th">Grátis</div>
                <div className="pp1-th pp1-th-pro">Pro</div>
              </div>
              {COMPARE_GROUPS.map(group => (
                <div key={group.label}>
                  <div className="pp1-tr-group">{group.label}</div>
                  {group.rows.map(row => (
                    <div key={row.feat} className="pp1-tr">
                      <div className="pp1-td-feat">{row.feat}</div>
                      <div className="pp1-td">
                        {row.free === true  ? <CheckYes /> :
                         row.free === false ? <CheckNo  /> :
                         <span className="pp1-td-val">{row.free}</span>}
                      </div>
                      <div className="pp1-td pp1-td-pro-col">
                        {row.pro === true  ? <CheckYes /> :
                         row.pro === false ? <CheckNo  /> :
                         <span className="pp1-td-val pp1-td-val-g">{row.pro}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* ── Bottom: garantia + FAQ ── */}
          <div className="pp1-bottom">

            <div className="pp1-guarantee">
              <div className="pp1-guar-glow" />
              <div className="grad-particles" aria-hidden="true">
                {[6,18,30,44,56,68,80,92].map((left, i) => (
                  <span key={i} className="grad-particle" style={{
                    left:`${left}%`,
                    width:`${2+(i%2)}px`, height:`${2+(i%2)}px`,
                    animationDelay:`${(i*0.6)%3}s`,
                    animationDuration:`${2+(i%3)*0.7}s`,
                    opacity: 0.2+(i%3)*0.12,
                  }}/>
                ))}
              </div>
              <div className="pp1-guar-ico">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4ac46e" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <div className="pp1-guar-title">Cancele quando quiser</div>
              <div className="pp1-guar-sub">Sem contratos, sem fidelidade. Cancele a qualquer momento, sem taxas ou complicações.</div>
              <div className="pp1-guar-tags">
                <span className="pp1-guar-tag">Sem contrato</span>
                <span className="pp1-guar-tag">100% privado</span>
                <span className="pp1-guar-tag">Sem cartão agora</span>
              </div>
            </div>

            <div className="pp1-faq">
              <div className="pp1-faq-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ac46e" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                Perguntas frequentes
              </div>
              {FAQ.map(([q, a], i) => (
                <div key={q} className={`pp1-faq-item${openFaq === i ? ' open' : ''}`} onClick={() => toggleFaq(i)}>
                  <div className="pp1-faq-q">
                    <span>{q}</span>
                    <span className={`pp1-faq-arrow${openFaq === i ? ' open' : ''}`}>›</span>
                  </div>
                  <div className="pp1-faq-a">{a}</div>
                </div>
              ))}
            </div>

          </div>

        </div>
      </div>
    </>
  )
}
