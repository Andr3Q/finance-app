import ProtoIcon from '../components/layout/ProtoIcon.jsx'

// Planos no desktop (design "Nancy Desktop", tela 30): título e seletor Mensal/Anual na mesma linha e os três cartões lado a lado
// (Grátis, Pro, Elite). A página (Planos.jsx) segue dona do pagamento, do plano e do aviso de rebaixamento; aqui só a apresentação.
// Mais nada além do que o design mostra: comparativo, garantia e perguntas frequentes ficam só no celular.
//
// Textos do design que mudam por NECESSIDADE (o app cobra por isto, então a página não pode prometer o que não entrega):
//  - Pro: o design diz "Transações ilimitadas"; o limite real do Pro é 35 por mês (só o Elite é ilimitado).
//  - Preço do Elite no anual: o design calcula R$ 29,08/mês; o que se cobra é R$ 334,80/ano, ou R$ 27,90/mês.
const CARDS = [
  { key: 'free',  name: 'Grátis', desc: 'Para começar a se organizar', tier: 0,
    feats: ['Dashboard do mês', '20 transações por mês', 'Categorias de gastos', 'Exportação CSV'] },
  { key: 'pro',   name: 'Pro',    desc: 'Para quem quer controle total', tier: 1,
    feats: ['35 transações por mês', '35 contas fixas', 'Limites por categoria', 'Relatório PDF mensal', 'Histórico completo'] },
  { key: 'elite', name: 'Elite',  desc: 'O poder da IA nas suas finanças', tier: 2,
    feats: ['Tudo do Pro', 'Nancy IA ilimitada (texto e áudio)', 'Planilha IA automática', 'Previsão mensal com IA', 'Detector de assinaturas'] },
]

// estrela cheia do design ("✦ Seu plano atual"); o caractere em si não passa no teste de emojis, então é um desenho
const Star = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M12 1c.6 5.9 5.1 10.4 11 11-5.9.6-10.4 5.1-11 11-.6-5.9-5.1-10.4-11-11C6.9 11.4 11.4 6.9 12 1z" /></svg>
)

const brl = (v) => (v === 0 ? 'R$ 0' : `R$ ${v.toFixed(2).replace('.', ',')}`)

export default function PlanosDesktop({ ctx }) {
  const { plan, billing, setBilling, prices, loading, period, onCheckout, onDowngrade } = ctx

  const cta = (c) => {
    if (c.key === 'free') return { label: 'Plano básico', disabled: true, kind: 'muted' }
    if (plan === c.key) return { label: 'Seu plano atual', disabled: true, kind: c.key === 'elite' ? 'mint' : 'muted', spark: true }
    const busy = loading === `${c.key}_${period}`
    if (c.key === 'pro') {
      return plan === 'elite'
        ? { label: 'Mudar para Pro', kind: 'blue', run: onDowngrade }
        : { label: busy ? 'Aguarde…' : 'Assinar Pro', kind: 'blue', run: () => onCheckout('pro', period), disabled: !!loading }
    }
    return { label: busy ? 'Aguarde…' : plan === 'pro' ? 'Fazer upgrade para Elite' : 'Assinar Elite', kind: 'mint', run: () => onCheckout('elite', period), disabled: !!loading }
  }

  return (
    <div className="ndpl">
      <div className="ndpl-head">
        <h2 className="ndpl-title">Controle total do <span>seu dinheiro.</span></h2>
        <div className="ndpl-toggle" role="group" aria-label="Periodicidade">
          <button type="button" className={billing === 'mensal' ? 'on' : ''} aria-pressed={billing === 'mensal'} onClick={() => setBilling('mensal')}>Mensal</button>
          <button type="button" className={billing === 'anual' ? 'on' : ''} aria-pressed={billing === 'anual'} onClick={() => setBilling('anual')}>Anual · 2 meses grátis</button>
        </div>
      </div>

      <div className="ndpl-grid">
        {CARDS.map(c => {
          const current = plan === c.key
          const price = c.key === 'free' ? 0 : prices[c.key][billing]
          const tag = c.tier === 0 ? null : current ? 'Atual' : c.key === 'pro' ? 'Recomendado' : null
          const b = cta(c)
          return (
            <section key={c.key} className={`ndpl-card t${c.tier}`} aria-label={`Plano ${c.name}`} aria-current={current ? 'true' : undefined}>
              <div className="ndpl-name-row">
                <h3 className="ndpl-name">{c.name}</h3>
                {tag && <span className="ndpl-tag">{tag}</span>}
              </div>
              <p className="ndpl-desc">{c.desc}</p>
              <div className="ndpl-price">
                <span className="ndpl-price-n">{brl(price)}</span>
                <span className="ndpl-price-per">{c.key === 'free' ? 'para sempre' : billing === 'anual' ? '/mês no anual' : '/mês'}</span>
              </div>
              <ul className="ndpl-feats">
                {c.feats.map(f => (
                  <li key={f} className="ndpl-feat"><span className="ndpl-chk"><ProtoIcon name="check" /></span>{f}</li>
                ))}
              </ul>
              <button type="button" className={`ndpl-cta ${b.kind}`} disabled={b.disabled} onClick={b.run}>
                {b.spark && <Star />}{b.label}
              </button>
            </section>
          )
        })}
      </div>
    </div>
  )
}
