import { useEffect } from 'react'
import { Link } from 'react-router-dom'

// Ícones inline (estilo consistente com components/ui/icons.jsx: stroke,
// strokeWidth 1.8-2, strokeLinecap round) — não existia um de "alvo"/"mic"
// na lib compartilhada ainda.
const IconDocCheck = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
    <polyline points="14 2 14 8 20 8"/><polyline points="9 15 11 17 15 12.5"/>
  </svg>
)
const IconTarget = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>
  </svg>
)
const IconMic = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="2" width="6" height="12" rx="3"/>
    <path d="M5 11a7 7 0 0014 0"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/>
  </svg>
)
const IconPlus = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
)

export default function Landing() {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark')
  }, [])

  return (
    <div className="lw-page">
      <div className="lw-card">
        <header className="lw-topbar">
          <div className="lw-brand">
            <span className="lw-brand-mark">n</span>
            <span className="lw-brand-name">nancy</span>
          </div>
          <Link to="/login" className="lw-btn-login">Entrar</Link>
        </header>

        <div className="lw-chip-summary">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="9" strokeDasharray="28 56" strokeLinecap="round"/>
          </svg>
          Resumo de outubro
        </div>

        <div className="lw-preview">
          <div className="lw-preview-head">
            <span className="lw-preview-label">Saldo disponível</span>
            <span className="lw-preview-pct">+8,4%</span>
          </div>
          <div className="lw-preview-balance">R$ 23.500,00</div>
          <svg className="lw-sparkline" viewBox="0 0 220 46" fill="none" preserveAspectRatio="none">
            <path d="M2 36 C 30 38, 50 30, 70 28 S 110 20, 130 18 S 170 10, 218 4"
              stroke="var(--c)" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
            <path d="M2 36 C 30 38, 50 30, 70 28 S 110 20, 130 18 S 170 10, 218 4 V46 H2 Z"
              fill="var(--c)" opacity=".12" stroke="none"/>
          </svg>

          <div className="lw-callout">
            <span className="lw-callout-ico"><IconPlus /></span>
            Dá para guardar mais R$ 400 este mês.
          </div>
        </div>

        <h1 className="lw-headline">
          Seu dinheiro,<br/>
          <span className="lw-headline-accent">saudável.</span>
        </h1>
        <p className="lw-sub">Organize contas, crie metas e converse com uma IA que entende suas finanças.</p>

        <div className="lw-chips">
          <span className="lw-chip"><IconDocCheck /> Contas em dia</span>
          <span className="lw-chip"><IconTarget /> Metas</span>
        </div>
        <div className="lw-chips">
          <span className="lw-chip"><IconMic /> IA por voz</span>
        </div>

        <div className="lw-ctas">
          <Link to="/register" className="lw-btn-primary">Criar conta grátis</Link>
          <Link to="/login" className="lw-btn-secondary">Já tenho conta</Link>
        </div>

        <p className="lw-footnote">Grátis para sempre · Sem cartão de crédito</p>
      </div>
    </div>
  )
}
