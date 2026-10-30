import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Navbar from '../components/layout/Navbar.jsx'
import { useUser, saveUser } from '../hooks/useUser.js'
import { useForcedLightTheme } from '../hooks/useTheme.js'
import { useEscapeKey } from '../hooks/useEscapeKey.js'
import { paymentsAPI, authAPI } from '../services/api.js'
import { analytics } from '../services/analytics.js'

// A pergunta "Quando o Pro estará disponível?" saiu: o Pro já é vendido (a resposta dizia que ainda estava em desenvolvimento).
const FAQ = [
  ['O plano Grátis tem limite de tempo?','Não. O plano Grátis é gratuito para sempre, sem expiração. Use sem pressa.'],
  ['Meus dados ficam seguros?',          'Sim. Seus dados são 100% privados e nunca compartilhados com terceiros. Você é o único dono das suas informações.'],
  ['Posso cancelar sem taxas?',          'Sim. Cancele a qualquer momento, sem multa, diretamente nas configurações da conta.'],
]

const FREE_FEATS = [
  'Dashboard com saldo do mês',
  'Até 20 transações por mês',
  'Categorias de gastos',
  'Exportação CSV',
]

const PRO_FEATS = [
  { text: 'Transações', hi: '35 por mês' },
  { text: 'Contas fixas', hi: 'Até 35' },
  { text: 'Limites por categoria' },
  { text: 'Relatório PDF mensal automático' },
  { text: 'Histórico completo de meses' },
  { text: 'Suporte prioritário' },
]

const ELITE_FEATS = [
  { text: 'Tudo do Pro', hi: 'incluído' },
  { text: 'Previsão IA mensal' },
  { text: 'Relatório IA detalhado' },
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
      { feat: 'Relatório PDF mensal',            free: false, pro: true,  elite: true  },
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
      { feat: 'Metas financeiras',               free: '1 meta', pro: '4 metas', elite: 'Ilimitadas' },
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

const Check = () => (
  <svg className="pl-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
)
const BackIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
)
const BoltIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
)
const Cell = ({ v }) => (v === true ? <Check /> : v === false ? <span className="pl-no" aria-label="não">—</span> : <span className="pl-cell-val">{v}</span>)

// Planos (Nancy 2, tela 29). A lógica de pagamento é a de sempre (checkout pelo Mercado Pago em janela aberta no
// clique, retorno com ?payment=, polling do plano, aviso de rebaixamento de Elite) — só a casca e os textos mudaram.
export default function Planos() {
  const [billing,           setBilling]          = useState('mensal')
  const [openFaq,           setOpenFaq]          = useState(null)
  const [toast,             setToast]            = useState(null)
  const [loading,           setLoading]          = useState(null) // 'pro_monthly' | 'pro_annual' | etc.
  const [showDowngradeModal,setShowDowngradeModal] = useState(false)
  useEscapeKey(() => setShowDowngradeModal(false), showDowngradeModal)

  const user     = useUser()
  const plan     = user.plan || 'free'
  const location = useLocation()
  const navigate = useNavigate()
  useForcedLightTheme() // tela desenhada só no claro (design Nancy 2)

  const pollRef = useRef(null)

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const status = params.get('payment')
    if (status === 'pending') showToast('Pagamento pendente. Você receberá confirmação em breve.', 'warn')
    if (status === 'failure') showToast('Pagamento não aprovado. Tente novamente.', 'error')
    if (status === 'success') {
      showToast('Pagamento aprovado! Seu plano foi ativado.', 'success')
      analytics.track('payment_completed')
      // Polling: verifica se o plano foi atualizado (webhook pode demorar alguns segundos)
      const initialPlan = user.plan
      let attempts = 0
      pollRef.current = setInterval(async () => {
        attempts++
        if (attempts > 10) { clearInterval(pollRef.current); return } // máx 30s
        try {
          const res = await authAPI.me()
          if (res.data.plan !== initialPlan) {
            clearInterval(pollRef.current)
            const cur = JSON.parse(sessionStorage.getItem('user') || '{}')
            saveUser({ ...cur, ...res.data })
          }
        } catch {}
      }, 3000)
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
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
    if (!user.emailVerified) {
      showToast('Verifique seu e-mail antes de assinar. Acesse Configurações para reenviar o link.', 'warn')
      return
    }
    analytics.track('upgrade_clicked', { plan, period })
    const key = `${plan}_${period}`
    setLoading(key)
    // Abre janela imediatamente no clique — evita bloqueio de popup e dá resposta instantânea
    const win = window.open('about:blank', '_blank')
    // Mesmo clique síncrono pode ser bloqueado (navegador/config de privacidade
    // mais restritiva) — window.open então retorna null. Sem essa checagem,
    // win.location.href abaixo lançava, o catch tentava win.close() em cima de
    // null e lançava DE NOVO dali, escapando pro catch e nunca mostrando o
    // toast de erro (silencioso pro usuário, só um erro no console).
    if (!win) {
      setLoading(null)
      showToast('Não consegui abrir a janela de pagamento — seu navegador bloqueou o pop-up. Permita pop-ups para este site e tente novamente.', 'error')
      return
    }
    try {
      const { data } = await paymentsAPI.createPreference(plan, period)
      try {
        const parsed = new URL(data.checkoutUrl ?? '')
        if (parsed.protocol !== 'https:' || parsed.hostname !== 'www.mercadopago.com.br') throw new Error()
      } catch { throw new Error('URL inválida') }
      win.location.href = data.checkoutUrl
    } catch (err) {
      win.close()
      // 503 = pagamentos fora do ar: pedir pra "tentar novamente" não ajuda
      showToast(err?.response?.status === 503
        ? 'Pagamentos indisponíveis no momento. Tente mais tarde ou fale com o suporte.'
        : 'Erro ao iniciar pagamento. Tente novamente.', 'error')
    } finally {
      setLoading(null)
    }
  }

  const PRICES = {
    pro:   { mensal: 9.90,  anual: 8.25  },
    elite: { mensal: 34.90, anual: 27.90 },
  }
  const toCts = v => ',' + String(Math.round((v % 1) * 100)).padStart(2, '0')

  const period = billing === 'mensal' ? 'monthly' : 'annual'

  const toggleFaq = (i) => setOpenFaq(openFaq === i ? null : i)


  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate('/settings'))
  const price = (v) => 'R$ ' + String(Math.floor(v)) + toCts(v)
  const Feats = ({ list }) => (
    <ul className="pl-feats">
      {list.map(f => (
        <li key={f.text} className="pl-feat">
          <Check />
          <span>{f.text}{f.hi && <> — <b>{f.hi}</b></>}</span>
        </li>
      ))}
    </ul>
  )

  return (
    <>
      <Navbar />

      {toast && (
        <div className={`toast toast-top ${toast.type === 'error' ? 'terr' : toast.type === 'warn' ? 'twarn' : 'tok'}`}>
          {toast.msg}
        </div>
      )}

      <div className="pwnav fin-pwnav fade-in">
        <div className="fin-page">
          <header className="fin-hero">
            <button type="button" className="fin-back" onClick={goBack} aria-label="Voltar"><BackIcon /></button>
            <div className="fin-hero-text">
              <h1 className="fin-hero-title">Planos</h1>
              <p className="fin-hero-sub">Assinatura Pro e Elite</p>
            </div>
          </header>

          <div className="fin-body pl-body">
            <div className="pl-intro">
              <h2 className="pl-headline">Controle total do <span>seu dinheiro.</span></h2>
              <p className="pl-lead">Comece grátis e faça upgrade quando quiser.</p>
              <div className="pl-toggle" role="group" aria-label="Periodicidade">
                <button type="button" className={billing === 'mensal' ? 'on' : ''} aria-pressed={billing === 'mensal'} onClick={() => setBilling('mensal')}>Mensal</button>
                <button type="button" className={billing === 'anual' ? 'on' : ''} aria-pressed={billing === 'anual'} onClick={() => setBilling('anual')}>Anual · 2 meses grátis</button>
              </div>
            </div>

            {/* GRÁTIS */}
            <section className="pl-card pl-free" aria-label="Plano Grátis" aria-current={plan === 'free' ? 'true' : undefined}>
              <h3 className="pl-tier">Grátis</h3>
              <p className="pl-tagline">Para começar a se organizar</p>
              <div className="pl-price"><span className="pl-price-num">R$ 0</span><span className="pl-price-note">para sempre</span></div>
              <ul className="pl-feats">
                {FREE_FEATS.map(f => <li key={f} className="pl-feat"><Check /><span>{f}</span></li>)}
              </ul>
              {plan === 'free' ? (
                <button type="button" className="pl-cta pl-cta-ghost" disabled>Plano básico</button>
              ) : (
                <button type="button" className="pl-cta pl-cta-ghost" onClick={() => navigate('/settings/pagamentos')}>
                  Cancelar assinatura
                </button>
              )}
            </section>

            {/* PRO */}
            <section className="pl-card pl-pro" aria-label="Plano Pro" aria-current={plan === 'pro' ? 'true' : undefined}>
              <div className="pl-tier-row">
                <h3 className="pl-tier">Pro</h3>
                {plan === 'pro'
                  ? <span className="pl-badge pl-badge-current">Plano atual</span>
                  : <span className="pl-badge">Recomendado</span>}
              </div>
              <p className="pl-tagline">Para quem quer controle total</p>
              <div className="pl-price"><span className="pl-price-num">{price(PRICES.pro[billing])}</span><span className="pl-price-note">por mês</span></div>
              <p className="pl-price-sub">{billing === 'mensal' ? 'Cancele quando quiser' : 'Cobrado anualmente (R$ 99,00/ano)'}</p>
              <Feats list={PRO_FEATS} />
              {plan === 'pro' ? (
                <button type="button" className="pl-cta pl-cta-current" disabled>Plano atual</button>
              ) : (
                <button type="button" className="pl-cta pl-cta-pro"
                  onClick={() => plan === 'elite' ? setShowDowngradeModal(true) : handleCheckout('pro', period)} disabled={!!loading}>
                  {loading === `pro_${period}` ? 'Aguarde…' : (<><BoltIcon /> {plan === 'elite' ? 'Mudar para Pro' : 'Assinar Pro'}</>)}
                </button>
              )}
              <p className="pl-cta-note">PIX ou cartão · Cancele quando quiser</p>
            </section>

            {/* ELITE */}
            <section className="pl-card pl-elite" aria-label="Plano Elite" aria-current={plan === 'elite' ? 'true' : undefined}>
              <div className="pl-tier-row">
                <h3 className="pl-tier">Elite</h3>
                {plan === 'elite' && <span className="pl-badge pl-badge-current">Plano atual</span>}
              </div>
              <p className="pl-tagline">Para quem quer o poder da IA</p>
              <div className="pl-price"><span className="pl-price-num">{price(PRICES.elite[billing])}</span><span className="pl-price-note">por mês</span></div>
              <p className="pl-price-sub">{billing === 'mensal' ? 'Cancele quando quiser' : 'Cobrado anualmente (R$ 334,80/ano)'}</p>
              <Feats list={ELITE_FEATS} />
              {plan === 'elite' ? (
                <button type="button" className="pl-cta pl-cta-current" disabled>Plano atual</button>
              ) : (
                <>
                  <button type="button" className="pl-cta pl-cta-elite" onClick={() => handleCheckout('elite', period)} disabled={!!loading}>
                    {loading === `elite_${period}` ? 'Aguarde…' : (<><BoltIcon /> {plan === 'pro' ? 'Fazer upgrade para Elite' : 'Assinar Elite'}</>)}
                  </button>
                  <p className="pl-cta-note">PIX ou cartão · Cancele quando quiser</p>
                </>
              )}
            </section>

            {/* Comparativo */}
            <section className="pl-card pl-compare" aria-label="Comparativo completo">
              <h3 className="pl-section-title">Comparativo completo</h3>
              <div className="pl-table" role="table">
                <div className="pl-tr pl-th" role="row">
                  <div className="pl-td-feat" role="columnheader">Funcionalidade</div>
                  <div className="pl-td" role="columnheader">Grátis</div>
                  <div className="pl-td pl-td-pro" role="columnheader">Pro</div>
                  <div className="pl-td" role="columnheader">Elite</div>
                </div>
                {COMPARE_GROUPS.map(g => (
                  <div key={g.label} role="rowgroup">
                    <div className="pl-group">{g.label}</div>
                    {g.rows.map(r => (
                      <div key={r.feat} className="pl-tr" role="row">
                        <div className="pl-td-feat" role="cell">{r.feat}</div>
                        <div className="pl-td" role="cell"><Cell v={r.free} /></div>
                        <div className="pl-td pl-td-pro" role="cell"><Cell v={r.pro} /></div>
                        <div className="pl-td" role="cell"><Cell v={r.elite} /></div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </section>

            {/* Garantia + FAQ */}
            <section className="pl-card pl-guar" aria-label="Cancele quando quiser">
              <h3 className="pl-section-title">Cancele quando quiser</h3>
              <p className="pl-guar-sub">Sem contratos, sem fidelidade. Cancele a qualquer momento, sem taxas ou complicações.</p>
              <div className="pl-tags"><span>Sem contrato</span><span>100% privado</span><span>Sem cartão agora</span></div>
            </section>

            <section className="pl-card pl-faq" aria-label="Perguntas frequentes">
              <h3 className="pl-section-title">Perguntas frequentes</h3>
              {FAQ.map(([q, a], i) => (
                <div key={q} className={`pl-faq-item${openFaq === i ? ' open' : ''}`}>
                  <button type="button" className="pl-faq-q" aria-expanded={openFaq === i} onClick={() => toggleFaq(i)}>
                    <span>{q}</span><span className="pl-faq-arrow" aria-hidden="true">›</span>
                  </button>
                  {openFaq === i && <p className="pl-faq-a">{a}</p>}
                </div>
              ))}
            </section>
          </div>
        </div>
      </div>

      {/* ── Modal: Elite tentando fazer downgrade para Pro ── */}
      {showDowngradeModal && (
        <div className="pl-modal-overlay" onClick={() => setShowDowngradeModal(false)}>
          <div className="pl-modal" role="dialog" aria-label="Atenção: downgrade de plano" onClick={e => e.stopPropagation()}>
            <h3 className="pl-modal-title">Atenção: downgrade de plano</h3>
            <p className="pl-modal-sub">Você possui o plano Elite ativo</p>
            <p className="pl-modal-text">
              Você já possui o plano Elite ativo. Para alterar sua assinatura para o Pro sem perder seus dias restantes, <strong>aguarde o fim do seu ciclo de faturamento atual</strong> ou fale com nosso suporte.
            </p>
            <p className="pl-modal-mail">suporte@finance.com.br</p>
            <button type="button" className="pl-cta pl-cta-pro" onClick={() => setShowDowngradeModal(false)}>Entendido</button>
          </div>
        </div>
      )}
    </>
  )
}
