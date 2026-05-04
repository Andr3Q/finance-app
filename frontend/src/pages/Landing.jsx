import { Link } from 'react-router-dom'

const Check = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15" style={{ flexShrink: 0 }}>
    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
  </svg>
)

const LogoIcon = ({ size = 22 }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="var(--c)" strokeWidth="2" width={size} height={size}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941"/>
  </svg>
)

const FEATURES = [
  {
    title: 'Dashboard em tempo real',
    desc: 'Veja seu saldo, gastos e entradas do mês em um painel limpo e intuitivo. Tudo atualizado na hora.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="26" height="26">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
  {
    title: 'Categorias de gastos',
    desc: 'Organize tudo por alimentação, transporte, saúde e mais. Saiba exatamente para onde vai cada centavo.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="26" height="26">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
      </svg>
    ),
  },
  {
    title: 'Contas fixas automáticas',
    desc: 'Cadastre aluguel, internet e academia. No início de cada mês elas são lançadas automaticamente.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="26" height="26">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
      </svg>
    ),
  },
  {
    title: 'Relatório mensal em PDF',
    desc: 'Ao fechar o mês, receba um relatório completo por e-mail com todos os seus gastos organizados.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="26" height="26">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  },
]

const FREE_FEATURES  = [
  'Dashboard com saldo do mês',
  'Até 30 transações por mês',
  'Categorias de gastos',
  'Relatório mensal em PDF',
]

const PRO_FEATURES = [
  'Tudo do plano gratuito',
  'Transações ilimitadas',
  'Contas fixas automáticas',
  'Limites por categoria',
  'Importação via CSV',
  'Suporte prioritário',
]

export default function Landing() {
  return (
    <div className="lp">

      {/* ── Nav ── */}
      <nav className="lp-nav">
        <div className="lp-logo">
          <LogoIcon size={22} />
          <span>FinançasPro</span>
        </div>
        <div className="lp-nav-acts">
          <Link to="/login"    className="btn bg"  style={{ padding: '9px 20px' }}>Entrar</Link>
          <Link to="/register" className="btn bp"  style={{ padding: '9px 20px' }}>Começar grátis</Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="lp-hero">
        <div className="lp-pill">
          <span className="lp-pill-dot" />
          Controle financeiro pessoal
        </div>

        <h1 className="lp-h1">
          Seu dinheiro<br />
          <span className="lp-h1-glow">sob controle.</span>
        </h1>

        <p className="lp-sub">
          Registre gastos, acompanhe entradas e receba<br className="lp-br" />
          relatórios mensais automáticos em PDF.
        </p>

        <div className="lp-ctas">
          <Link to="/register" className="btn bp lp-btn-lg">
            Criar conta grátis
            <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
              <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd"/>
            </svg>
          </Link>
          <Link to="/login" className="btn bg lp-btn-lg">Já tenho conta</Link>
        </div>

        <div className="lp-stats">
          <div className="lp-stat">
            <span>Grátis</span>
            <small>Para começar</small>
          </div>
          <div className="lp-stat-sep" />
          <div className="lp-stat">
            <span>100%</span>
            <small>Privado</small>
          </div>
          <div className="lp-stat-sep" />
          <div className="lp-stat">
            <span>PDF</span>
            <small>Relatório mensal</small>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="lp-sec">
        <div className="lp-sec-label">Funcionalidades</div>
        <h2 className="lp-h2">Tudo que você precisa</h2>
        <p className="lp-h2-sub">Uma plataforma completa para organizar suas finanças pessoais do jeito certo.</p>
        <div className="lp-feat-grid">
          {FEATURES.map(f => (
            <div key={f.title} className="lp-feat-card">
              <div className="lp-feat-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="lp-sec">
        <div className="lp-sec-label">Planos</div>
        <h2 className="lp-h2">Simples e transparente</h2>
        <p className="lp-h2-sub">Comece grátis. Quando precisar de mais, temos o plano certo para você.</p>

        <div className="lp-price-grid">

          <div className="lp-price-card">
            <div className="lp-price-name">Grátis</div>
            <div className="lp-price-val">R$0<span>/mês</span></div>
            <div className="lp-price-desc">Ideal para começar</div>
            <ul className="lp-price-list">
              {FREE_FEATURES.map(f => <li key={f}><Check />{f}</li>)}
            </ul>
            <Link to="/register" className="btn bg" style={{ width: '100%', justifyContent: 'center', marginTop: 'auto' }}>
              Começar grátis
            </Link>
          </div>

          <div className="lp-price-card lp-price-pro">
            <div className="lp-price-badge">Em breve</div>
            <div className="lp-price-name">Pro</div>
            <div className="lp-price-val">R$19,90<span>/mês</span></div>
            <div className="lp-price-desc">Para quem quer mais controle</div>
            <ul className="lp-price-list">
              {PRO_FEATURES.map(f => <li key={f}><Check />{f}</li>)}
            </ul>
            <button className="btn bp" style={{ width: '100%', justifyContent: 'center', marginTop: 'auto', opacity: 0.45 }} disabled>
              Em breve
            </button>
          </div>

        </div>
      </section>

      {/* ── CTA Final ── */}
      <section className="lp-cta-final">
        <h2 className="lp-h2">Pronto para começar?</h2>
        <p className="lp-h2-sub">Crie sua conta gratuita agora e tenha controle total do seu dinheiro.</p>
        <Link to="/register" className="btn bp lp-btn-lg">
          Criar conta grátis
          <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
            <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd"/>
          </svg>
        </Link>
      </section>

      {/* ── Footer ── */}
      <footer className="lp-footer">
        <div className="lp-logo">
          <LogoIcon size={18} />
          <span>FinançasPro</span>
        </div>
        <p>© 2026 FinançasPro. Todos os direitos reservados.</p>
      </footer>

    </div>
  )
}
