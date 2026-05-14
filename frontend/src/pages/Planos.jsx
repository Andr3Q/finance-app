import { useState } from 'react'
import Navbar from '../components/Navbar.jsx'

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

  let user = {}
  try { user = JSON.parse(localStorage.getItem('user') || '{}') } catch { user = {} }
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
        <div className="toast tok" style={{ left: 'calc(50% + 120px)' }}>
          Em breve! Você será notificado quando o Pro estiver disponível.
        </div>
      )}

      <div className="pwnav fade-in">
        <div className="dsb-content">

          {/* ── Hero ── */}
          <div className="plp-hero r1">
            <div className="plp-eyebrow">
              <span className="plp-hero-dot" />
              Escolha seu plano
            </div>
            <h1 className="plp-title">
              Controle total do<br />
              <em>seu dinheiro.</em>
            </h1>
            <p className="plp-sub">Comece grátis e faça upgrade quando precisar de mais poder.</p>

            <div className="plp-billing-row">
              <div className="plp-billing-toggle">
                <button
                  className={`plp-bt-btn${billing === 'mensal' ? ' on' : ''}`}
                  onClick={() => setBilling('mensal')}
                >Mensal</button>
                <button
                  className={`plp-bt-btn${billing === 'anual' ? ' on' : ''}`}
                  onClick={() => setBilling('anual')}
                >Anual</button>
              </div>
              {billing === 'anual' && (
                <span className="plp-bt-save">Economize 20%</span>
              )}
            </div>
          </div>

          {/* ── Cards ── */}
          <div className="plp-grid r2">

            {/* FREE */}
            <div className="plp-card plp-free">
              <div className="plp-plan-top">
                <div>
                  <div className="plp-plan-name plp-name-free">Grátis</div>
                  <div className="plp-plan-desc">Ideal para começar</div>
                </div>
                {!isPro && <div className="plp-badge plp-badge-free">Atual</div>}
              </div>

              <div className="plp-price-wrap">
                <div className="plp-price">
                  <span className="plp-price-cur plp-cur-free">R$</span>
                  <span className="plp-price-num">0</span>
                </div>
                <div className="plp-price-period">Para sempre grátis</div>
              </div>

              <div className="plp-feats">
                {FREE_FEATS.map(f => (
                  <div key={f} className="plp-feat">
                    <div className="plp-feat-check plp-feat-check-free">
                      <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="2" strokeLinecap="round">
                        <path d="M2 6l3 3 5-5"/>
                      </svg>
                    </div>
                    <span className="plp-feat-text plp-feat-text-free">{f}</span>
                  </div>
                ))}
              </div>

              <div className="plp-cta">
                <button className="plp-btn-cta plp-cta-ghost" disabled>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  Plano atual
                </button>
              </div>
            </div>

            {/* PRO */}
            <div className="plp-card plp-pro">
              <div className="plp-pro-grid" />

              <div className="plp-plan-top">
                <div>
                  <div className="plp-plan-name plp-name-pro">Pro</div>
                  <div className="plp-plan-desc plp-desc-pro">Para quem quer controle total</div>
                </div>
                <div className="plp-badge plp-badge-rec">
                  <svg width="9" height="9" viewBox="0 0 12 12" fill="currentColor" stroke="currentColor" strokeWidth="1">
                    <polygon points="6 1 7.5 4.5 11 5 8.5 7.5 9 11 6 9.5 3 11 3.5 7.5 1 5 4.5 4.5"/>
                  </svg>
                  Recomendado
                </div>
              </div>

              <div className="plp-price-wrap">
                <div className="plp-price">
                  <span className="plp-price-cur">R$</span>
                  <span className="plp-price-num">{proPrice}</span>
                  <span className="plp-price-dec">,90</span>
                </div>
                <div className="plp-price-period plp-period-pro">{properiod}</div>
                <div className="plp-price-cancel">Sem fidelidade · Sem cartão para testar</div>
              </div>

              <div className="plp-feats">
                {PRO_FEATS.map((f, i) =>
                  f === null
                    ? <div key={i} className="plp-feat-sep" />
                    : (
                      <div key={i} className="plp-feat">
                        <div className="plp-feat-check plp-feat-check-pro">
                          <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="#4ac46e" strokeWidth="2" strokeLinecap="round">
                            <path d="M2 6l3 3 5-5"/>
                          </svg>
                        </div>
                        <span className="plp-feat-text">
                          {f.text}
                          {f.hi && <> — <span className="plp-feat-hi">{f.hi}</span></>}
                        </span>
                      </div>
                    )
                )}
              </div>

              <div className="plp-cta">
                {isPro ? (
                  <div className="plp-btn-cta plp-cta-is-pro">✨ Você já é Pro!</div>
                ) : (
                  <button className="plp-btn-cta plp-cta-soon" onClick={handleAssinar}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                    </svg>
                    Assinar Pro — Em breve
                  </button>
                )}
                <div className="plp-plan-note">Para começar, sem cartão de crédito</div>
              </div>
            </div>

          </div>

          {/* ── Comparison Table ── */}
          <div className="plp-compare r3">
            <div className="plp-compare-label">Comparativo detalhado</div>

            <div className="plp-table">
              <div className="plp-th-row">
                <div className="plp-th plp-th-feat">Funcionalidade</div>
                <div className="plp-th">Grátis</div>
                <div className="plp-th plp-th-pro">Pro</div>
              </div>

              {COMPARE_GROUPS.map(group => (
                <div key={group.label}>
                  <div className="plp-tr plp-tr-group">
                    <div className="plp-group-label">{group.label}</div>
                  </div>
                  {group.rows.map(row => (
                    <div key={row.feat} className="plp-tr">
                      <div className="plp-td-feat">{row.feat}</div>
                      <div className="plp-td-cell">
                        {row.free === true  ? <CheckYes /> :
                         row.free === false ? <CheckNo  /> :
                         <span className="plp-ct-val">{row.free}</span>}
                      </div>
                      <div className="plp-td-cell">
                        {row.pro === true  ? <CheckYes /> :
                         row.pro === false ? <CheckNo  /> :
                         <span className="plp-ct-val plp-ct-val-g">{row.pro}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* ── Bottom row ── */}
          <div className="plp-bottom r4">

            {/* Guarantee */}
            <div className="plp-guarantee">
              <div className="plp-guar-ico">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4ac46e" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <div className="plp-guar-title">Cancele quando quiser</div>
              <div className="plp-guar-sub">
                Sem contratos, sem fidelidade. Você pode cancelar sua assinatura Pro a qualquer momento, sem taxas ou complicações.
              </div>
              <div className="plp-guar-tags">
                <span className="plp-guar-tag">Sem contrato</span>
                <span className="plp-guar-tag">100% privado</span>
                <span className="plp-guar-tag">Sem cartão agora</span>
              </div>
            </div>

            {/* FAQ */}
            <div className="plp-faq">
              <div className="plp-faq-head">
                <div className="plp-faq-head-ico">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4ac46e" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                </div>
                <div className="plp-faq-head-title">Perguntas frequentes</div>
              </div>
              <div className="plp-faq-list">
                {FAQ.map(([q, a], i) => (
                  <div
                    key={q}
                    className={`plp-faq-item${openFaq === i ? ' open' : ''}`}
                    onClick={() => toggleFaq(i)}
                  >
                    <div className="plp-faq-q">
                      <span className="plp-faq-question">{q}</span>
                      <span className={`plp-faq-arrow${openFaq === i ? ' open' : ''}`}>↓</span>
                    </div>
                    <div className="plp-faq-answer">{a}</div>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>
      </div>
    </>
  )
}
