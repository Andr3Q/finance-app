import NancyMark from '../ui/NancyMark.jsx'
import ProtoIcon from '../layout/ProtoIcon.jsx'

const PILLS = ['Resumo em stories', 'Nancy IA com voz', 'Planilha IA', 'LGPD']

// Painel azul das telas de acesso no desktop (design "Nancy Desktop"). `landing` é a Boas-vindas: título grande e os dois cartões
// inclinados; `form` é o painel das telas com formulário (entrar, criar conta...): título menor, sem cartões.
// Larguras: o protótipo é content-box — 62% (ou 46%) da janela MAIS os 2×56px de padding.
export default function DesktopAuthHero({ variant = 'landing' }) {
  const landing = variant === 'landing'
  return (
    <div className={`ad-hero ad-hero--${variant}`}>
      <div className="ad-hero-glow" aria-hidden="true" />
      <div className="ad-brand">
        <NancyMark size={44} />
        <span className="ad-brand-name">nancy</span>
      </div>

      <div className="ad-hero-main">
        <h1 className="ad-headline">Seu dinheiro, <span>saudável.</span></h1>
        <p className="ad-lead">Organize contas, crie metas, veja sua planilha se montar sozinha e converse com uma IA que entende suas finanças.</p>

        {landing && (
          <div className="ad-cards" aria-hidden="true">
            <div className="ad-card-balance">
              <span className="ad-card-label">Saldo disponível</span>
              <span className="ad-card-value">R$ 23.500</span>
              <div className="ad-card-bar"><div /></div>
              <div className="ad-card-tags">
                <span className="ad-tag ad-tag--blue">Saúde 79</span>
                <span className="ad-tag ad-tag--green">+8,4%</span>
              </div>
            </div>
            <div className="ad-card-ai">
              <span className="ad-card-ai-title"><span><ProtoIcon name="spark" /></span>Nancy IA</span>
              <span className="ad-card-ai-text">Você pode guardar <b>R$ 400</b> a mais cortando delivery.</span>
            </div>
          </div>
        )}
      </div>

      <ul className="ad-pills">
        {PILLS.map(p => <li key={p}>{p}</li>)}
      </ul>
    </div>
  )
}
