import { useState } from 'react'
import { Link } from 'react-router-dom'

const CheckIcon = () => (
  <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
    <path d="M2 6l3 3 5-5" stroke="#4ac46e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const FEATURES = [
  {
    title: 'Dashboard em tempo real',
    desc: 'Veja seu saldo, gastos e entradas do mês em um painel limpo e intuitivo. Tudo atualizado na hora.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4ac46e" strokeWidth="2" strokeLinecap="round">
        <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
      </svg>
    ),
  },
  {
    title: 'Categorias de gastos',
    desc: 'Organize cada transação por categoria e visualize exatamente para onde vai o seu dinheiro todo mês.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4ac46e" strokeWidth="2" strokeLinecap="round">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>
      </svg>
    ),
  },
  {
    title: 'Relatório PDF mensal',
    desc: 'Receba um resumo completo e detalhado do mês direto no seu e-mail, gerado automaticamente.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4ac46e" strokeWidth="2" strokeLinecap="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    ),
  },
  {
    title: 'Contas fixas automáticas',
    desc: 'Cadastre suas contas recorrentes uma vez e o app as lança automaticamente todo mês para você.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4ac46e" strokeWidth="2" strokeLinecap="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
  },
  {
    title: 'Histórico de meses',
    desc: 'Acesse e compare o histórico completo de todos os meses anteriores para entender sua evolução.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4ac46e" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
  },
  {
    title: 'Exportação CSV',
    desc: 'Exporte todas as suas transações em CSV para usar em planilhas ou outros sistemas financeiros.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4ac46e" strokeWidth="2" strokeLinecap="round">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
    ),
  },
]

const FREE_FEATURES = [
  'Dashboard com saldo do mês',
  'Até 30 transações por mês',
  'Categorias de gastos',
  'Relatório mensal em PDF',
]

const PRO_FEATURES = [
  { text: <>Transações — <span className="lp2-feat-hi">Ilimitadas</span></> },
  { text: <>Contas fixas — <span className="lp2-feat-hi">Ilimitadas</span></> },
  { text: 'Limites por categoria' },
  { text: 'Relatório PDF mensal' },
  { text: 'Histórico de meses' },
  { text: 'Exportação CSV' },
  { text: 'Suporte prioritário' },
]

export default function Landing() {
  const [toast, setToast] = useState(false)

  const handleProClick = () => {
    setToast(true)
    setTimeout(() => setToast(false), 4000)
  }

  return (
    <div className="lp2">

      {/* Top accent line */}
      <div className="lp2-accent-line" />

      {/* ── Navbar ── */}
      <nav className="lp2-nav">
        <div className="lp2-nav-inner">
          <Link to="/" className="lp2-logo">
            <div className="lp2-logo-mark">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <rect x="5"    y="3"   width="3.5" height="18"  rx="1.5" fill="#4ac46e"/>
                <rect x="5"    y="3"   width="14"  height="4"   rx="1.5" fill="#4ac46e"/>
                <rect x="5"    y="10.5" width="10"  height="3.5" rx="1.5" fill="#4ac46e" opacity="0.8"/>
              </svg>
            </div>
            <span className="lp2-logo-name">Finanças<span>Pro</span></span>
          </Link>
          <Link to="/register" className="lp2-nav-cta">Começar grátis</Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="lp2-hero">
        <div className="lp2-geo" aria-hidden="true">
          <div className="lp2-ring lp2-ring1" />
          <div className="lp2-ring lp2-ring2" />
          <div className="lp2-ring lp2-ring3" />
          <div className="lp2-grid-lines" />
        </div>

        <div className="lp2-hero-inner">
          <div className="lp2-hero-content">
            <div className="lp2-badge anim-1">
              <span className="lp2-badge-dot" />
              Controle financeiro pessoal
            </div>

            <h1 className="lp2-h1 anim-2">
              Seu dinheiro
              <span className="lp2-h1-green"> sob controle.</span>
            </h1>

            <p className="lp2-sub anim-3">
              Registre gastos, acompanhe entradas e receba relatórios mensais automáticos em PDF. Simples, rápido e 100% privado.
            </p>

            <div className="lp2-ctas anim-4">
              <Link to="/register" className="lp2-btn-primary">
                Criar conta grátis
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
                </svg>
              </Link>
              <Link to="/login" className="lp2-btn-secondary">
                Já tenho conta
              </Link>
            </div>

            <div className="lp2-trust anim-5">
              <div className="lp2-trust-item">
                <div className="lp2-trust-val">Grátis</div>
                <div className="lp2-trust-lbl">Para começar</div>
              </div>
              <div className="lp2-trust-item">
                <div className="lp2-trust-val">100%</div>
                <div className="lp2-trust-lbl">Privado</div>
              </div>
              <div className="lp2-trust-item">
                <div className="lp2-trust-val">PDF</div>
                <div className="lp2-trust-lbl">Relatório mensal</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Funcionalidades ── */}
      <section className="lp2-features">
        <div className="lp2-section-inner">
          <div className="lp2-eyebrow">Funcionalidades</div>
          <h2 className="lp2-section-title">Tudo que você precisa</h2>
          <p className="lp2-section-sub">Uma plataforma completa para organizar suas finanças pessoais do jeito certo.</p>

          <div className="lp2-feat-grid">
            {FEATURES.map(f => (
              <div key={f.title} className="lp2-feat-card">
                <div className="lp2-feat-icon">{f.icon}</div>
                <div className="lp2-feat-title">{f.title}</div>
                <div className="lp2-feat-desc">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Planos ── */}
      <section className="lp2-pricing">
        <div className="lp2-section-inner">
          <div className="lp2-eyebrow">Planos & Preços</div>
          <h2 className="lp2-section-title">Escolha seu plano</h2>
          <p className="lp2-section-sub">Controle total do seu dinheiro, no seu ritmo.</p>

          {toast && (
            <div className="toast tok" style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 400, whiteSpace: 'nowrap' }}>
              Em breve! Você será notificado quando o Pro estiver disponível.
            </div>
          )}

          <div className="lp2-plans-grid">
            {/* Grátis */}
            <div className="lp2-plan-card">
              <div className="lp2-plan-header">
                <div>
                  <div className="lp2-plan-name">Grátis</div>
                  <div className="lp2-plan-tagline">Ideal para começar</div>
                </div>
              </div>
              <div className="lp2-plan-price">R$ 0<small>/mês</small></div>
              <div className="lp2-plan-cancel">&nbsp;</div>
              <ul className="lp2-plan-feats">
                {FREE_FEATURES.map(f => (
                  <li key={f} className="lp2-plan-feat">
                    <div className="lp2-feat-check"><CheckIcon /></div>
                    {f}
                  </li>
                ))}
              </ul>
              <Link to="/register" className="lp2-btn-ghost">Começar grátis</Link>
            </div>

            {/* Pro */}
            <div className="lp2-plan-card lp2-plan-pro">
              <div className="lp2-plan-header">
                <div>
                  <div className="lp2-plan-name lp2-plan-name-g">Pro</div>
                  <div className="lp2-plan-tagline">Acesso completo</div>
                </div>
                <div className="lp2-plan-badge">★ Recomendado</div>
              </div>
              <div className="lp2-plan-price">R$ 19<small>,90/mês</small></div>
              <div className="lp2-plan-cancel">Cancele quando quiser · Sem fidelidade</div>
              <ul className="lp2-plan-feats">
                {PRO_FEATURES.map((f, i) => (
                  <li key={i} className="lp2-plan-feat">
                    <div className="lp2-feat-check"><CheckIcon /></div>
                    {f.text}
                  </li>
                ))}
              </ul>
              <button className="lp2-btn-plan-primary" onClick={handleProClick}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
                Assinar Pro — Em breve
              </button>
              <div className="lp2-plan-note">Para começar, sem cartão de crédito</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="lp2-bottom-cta">
        <div className="lp2-bottom-cta-inner">
          <h2 className="lp2-bottom-cta-title">Pronto para começar?</h2>
          <p className="lp2-bottom-cta-sub">Crie sua conta gratuita agora e tenha controle total do seu dinheiro.</p>
          <Link to="/register" className="lp2-btn-primary lp2-btn-cta-full">
            Criar conta grátis
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round">
              <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
            </svg>
          </Link>
          <div className="lp2-bottom-cta-note">Grátis para começar · Sem cartão de crédito</div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="lp2-footer">
        <div className="lp2-footer-inner">
          <Link to="/" className="lp2-logo">
            <div className="lp2-logo-mark">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <rect x="5"    y="3"   width="3.5" height="18"  rx="1.5" fill="#4ac46e"/>
                <rect x="5"    y="3"   width="14"  height="4"   rx="1.5" fill="#4ac46e"/>
                <rect x="5"    y="10.5" width="10"  height="3.5" rx="1.5" fill="#4ac46e" opacity="0.8"/>
              </svg>
            </div>
            <span className="lp2-logo-name" style={{ fontSize: 16 }}>Finanças<span>Pro</span></span>
          </Link>
          <p className="lp2-footer-note">© 2026 FinançasPro · Todos os direitos reservados</p>
        </div>
      </footer>

    </div>
  )
}
