import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Navbar from '../components/layout/Navbar.jsx'
import { useUser } from '../hooks/useUser.js'
import { paymentsAPI } from '../services/api.js'
import { analytics } from '../services/analytics.js'

const FAQ = [
  ['Quando o Pro estará disponível?',   'O plano Pro está em desenvolvimento final. Você será notificado por e-mail assim que for lançado com acesso antecipado.'],
  ['O plano Grátis tem limite de tempo?','Não. O plano Grátis é gratuito para sempre, sem expiração. Use sem pressa.'],
  ['Meus dados ficam seguros?',          'Sim. Seus dados são 100% privados e nunca compartilhados com terceiros. Você é o único dono das suas informações.'],
  ['Posso cancelar sem taxas?',          'Sim. Cancele a qualquer momento, sem multa, diretamente nas configurações da conta.'],
]

const FREE_FEATS = [
  'Dashboard com saldo do mês',
  'Até 20 transações por mês',
  'Categorias de gastos',
  'Relatório mensal em PDF',
  'Contas fixas automáticas',
]

const PRO_FEATS = [
  { text: 'Transações', hi: '35 por mês' },
  { text: 'Contas fixas', hi: 'Até 35' },
  { text: 'Limites por categoria' },
  { text: 'Relatório PDF mensal automático' },
  null,
  { text: 'Histórico completo de meses' },
  { text: 'Suporte prioritário' },
]

const ELITE_FEATS = [
  { text: 'Tudo do Pro', hi: 'incluído' },
  null,
  { text: 'Previsão IA mensal' },
  { text: 'Relatório IA detalhado' },
  null,
  { text: 'Metas financeiras', hi: 'Ilimitadas' },
  { text: 'Lembretes de vencimento' },
  { text: 'Detector de assinaturas' },
  { text: 'Análises avançadas' },
]

const COMPARE_GROUPS = [
  {
    label: 'Dashboard & Relatórios',
    rows: [
      { feat: 'Saldo do mês em tempo real',     free: true,  pro: true,  elite: true  },
      { feat: 'Relatório PDF mensal',            free: true,  pro: true,  elite: true  },
      { feat: 'Histórico de meses anteriores',   free: false, pro: true,  elite: true  },
      { feat: 'Exportação CSV',                  free: true,  pro: true,  elite: true  },
      { feat: 'Previsão IA mensal',              free: false, pro: false, elite: true  },
      { feat: 'Relatório IA detalhado',          free: false, pro: false, elite: true  },
    ],
  },
  {
    label: 'Transações & Orçamento',
    rows: [
      { feat: 'Transações por mês',              free: '20',  pro: '35',  elite: 'Ilimitadas' },
      { feat: 'Categorias de gastos',            free: true,  pro: true,  elite: true  },
      { feat: 'Limites por categoria',           free: false, pro: true,  elite: true  },
      { feat: 'Contas fixas automáticas',        free: true,  pro: true,  elite: true  },
      { feat: 'Limite de contas fixas',          free: '15',  pro: '35',  elite: 'Ilimitadas' },
      { feat: 'Detector de assinaturas',         free: false, pro: false, elite: true  },
      { feat: 'Lembretes de vencimento',         free: false, pro: false, elite: true  },
    ],
  },
  {
    label: 'IA & Metas',
    rows: [
      { feat: 'Metas financeiras',               free: false, pro: '4',   elite: 'Ilimitadas' },
      { feat: 'Score financeiro avançado',       free: true,  pro: true,  elite: true  },
      { feat: 'Análises avançadas',              free: true,  pro: true,  elite: true  },
    ],
  },
  {
    label: 'Suporte',
    rows: [
      { feat: 'Suporte por e-mail',              free: true,  pro: true,  elite: true  },
      { feat: 'Suporte prioritário',             free: false, pro: true,  elite: true  },
      { feat: 'Suporte dedicado',                free: false, pro: false, elite: true  },
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
const CheckYesElite = () => (
  <div className="plp-check-yes plp-check-elite">
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round">
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
  const [billing,   setBilling]  = useState('mensal')
  const [openFaq,   setOpenFaq]  = useState(null)
  const [toast,     setToast]    = useState(null)
  const [loading,   setLoading]  = useState(null) // 'pro_monthly' | 'pro_annual' | etc.

  const user     = useUser()
  const plan     = user.plan || 'free'
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const status = params.get('payment')
    if (status === 'success') showToast('Pagamento aprovado! Seu plano foi ativado. 🎉', 'success')
    if (status === 'pending') showToast('Pagamento pendente. Você receberá confirmação em breve.', 'warn')
    if (status === 'failure') showToast('Pagamento não aprovado. Tente novamente.', 'error')
  }, [])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 5000)
  }

  const handleCheckout = async (plan, period) => {
    if (!user.id) {
      navigate('/register?from=planos')
      return
    }
    analytics.track('upgrade_clicked', { plan, period })
    const key = `${plan}_${period}`
    setLoading(key)
    // Abre janela imediatamente no clique — evita bloqueio de popup e dá resposta instantânea
    const win = window.open('about:blank', '_blank')
    try {
      const { data } = await paymentsAPI.createPreference(plan, period)
      if (!data.checkoutUrl?.startsWith('https://www.mercadopago.com.br/')) throw new Error('URL inválida')
      win.location.href = data.checkoutUrl
    } catch {
      win.close()
      showToast('Erro ao iniciar pagamento. Tente novamente.', 'error')
    } finally {
      setLoading(null)
    }
  }

  const proPrice    = billing === 'mensal' ? '9' : '8'
  const proCents    = billing === 'mensal' ? ',90' : ',25'
  const properiod   = billing === 'mensal'
    ? 'por mês · Cancele quando quiser'
    : 'por mês · Cobrado anualmente (R$ 99,00/ano)'

  const elitePrice  = billing === 'mensal' ? '34' : '27'
  const elitePeriod = billing === 'mensal'
    ? 'por mês · Cancele quando quiser'
    : 'por mês · Cobrado anualmente (R$ 334,80/ano)'

  const period = billing === 'mensal' ? 'monthly' : 'annual'

  const toggleFaq = (i) => setOpenFaq(openFaq === i ? null : i)

  return (
    <>
      <Navbar />

      {toast && (
        <div className={`toast ${toast.type === 'error' ? 'terr' : toast.type === 'warn' ? 'twarn' : 'tok'}`}
          style={{ position:'fixed', top:16, left:'50%', transform:'translateX(-50%)', zIndex:400, whiteSpace:'nowrap' }}>
          {toast.msg}
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
              {plan === 'free' && <div className="pp1-current-badge">Plano atual</div>}

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

              {plan === 'free' ? (
                <button className="pp1-cta-ghost" disabled>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  Plano atual
                </button>
              ) : (
                <button className="pp1-cta-ghost pp1-cta-cancel" onClick={() => showToast('Para cancelar sua assinatura, acesse o Mercado Pago ou envie um e-mail para suporte@finance.com.br', 'warn')}>
                  Cancelar assinatura
                </button>
              )}
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

              {plan === 'pro' && <div className="pp1-current-badge pp1-current-badge-pro">Plano atual</div>}
              <div className="pp1-card-tier pp1-tier-pro">Pro</div>
              <div className="pp1-card-tagline pp1-tagline-pro">Para quem quer controle total</div>

              <div className="pp1-price-block">
                <div className="pp1-price">
                  <span className="pp1-price-cur pp1-cur-pro">R$</span>
                  <span className="pp1-price-num pp1-num-pro">{proPrice}</span>
                  <span className="pp1-price-dec">{proCents}</span>
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

              {plan === 'pro' ? (
                <div className="pp1-cta-is-pro">✨ Plano atual</div>
              ) : (
                <button className="pp1-cta-pro" onClick={() => handleCheckout('pro', period)} disabled={!!loading}>
                  {loading === `pro_${period}` ? 'Aguarde…' : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                      </svg>
                      {plan === 'elite' ? 'Mudar para Pro' : 'Assinar Pro'}
                    </>
                  )}
                </button>
              )}
              <div className="pp1-cta-note">PIX ou cartão · Cancele quando quiser</div>
            </div>

            {/* ELITE */}
            <div className="pp1-card pp1-elite">
              <div className="pp1-elite-glow" />
              <div className="grad-particles" aria-hidden="true">
                {[5,14,23,34,45,56,65,76,85,94].map((left, i) => (
                  <span key={i} className="grad-particle pp1-elite-particle" style={{
                    left:`${left}%`,
                    width:`${2+(i%3)}px`, height:`${2+(i%3)}px`,
                    animationDelay:`${(i*0.48)%3}s`,
                    animationDuration:`${2+(i%4)*0.65}s`,
                    opacity: 0.25+(i%3)*0.12,
                  }}/>
                ))}
              </div>


              {plan === 'elite' && <div className="pp1-current-badge pp1-current-badge-elite">Plano atual</div>}
              <div className="pp1-card-tier pp1-tier-elite">Elite</div>
              <div className="pp1-card-tagline pp1-tagline-elite">Para quem quer o poder da IA</div>

              <div className="pp1-price-block">
                <div className="pp1-price">
                  <span className="pp1-price-cur pp1-cur-elite">R$</span>
                  <span className="pp1-price-num pp1-num-elite">{elitePrice}</span>
                  <span className="pp1-price-dec pp1-dec-elite">,90</span>
                </div>
                <div className="pp1-price-note pp1-note-elite">{elitePeriod}</div>
                <div className="pp1-price-cancel pp1-cancel-elite">Sem fidelidade · Sem cartão para testar</div>
              </div>

              <div className="pp1-divider pp1-divider-elite" />

              <ul className="pp1-feats">
                {ELITE_FEATS.map((f, i) =>
                  f === null ? <li key={i} className="pp1-feat-sep pp1-feat-sep-elite" /> : (
                    <li key={i} className="pp1-feat">
                      <div className="pp1-feat-ico pp1-feat-ico-elite">
                        <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="#a78bfa" strokeWidth="2.2" strokeLinecap="round"><path d="M2 6l3 3 5-5"/></svg>
                      </div>
                      <span className="pp1-feat-text pp1-feat-text-elite">
                        {f.text}{f.hi && <> — <span className="pp1-feat-hi-elite">{f.hi}</span></>}
                      </span>
                    </li>
                  )
                )}
              </ul>

              {plan === 'elite'
                ? <div className="pp1-cta-is-pro">⚡ Plano atual</div>
                : <>
                    <button className="pp1-cta-elite" onClick={() => handleCheckout('elite', period)} disabled={!!loading}>
                      {loading === `elite_${period}` ? 'Aguarde…' : (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                          </svg>
                          {plan === 'pro' ? 'Fazer upgrade para Elite' : 'Assinar Elite'}
                        </>
                      )}
                    </button>
                    <div className="pp1-cta-note pp1-cta-note-elite">PIX ou cartão · Cancele quando quiser</div>
                  </>
              }
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
                <div className="pp1-th pp1-th-elite">Elite</div>
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
                      <div className="pp1-td pp1-td-elite-col">
                        {row.elite === true  ? <CheckYesElite /> :
                         row.elite === false ? <CheckNo  /> :
                         <span className="pp1-td-val pp1-td-val-e">{row.elite}</span>}
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
