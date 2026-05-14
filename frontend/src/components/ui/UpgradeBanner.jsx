import { useNavigate } from 'react-router-dom'

export default function UpgradeBanner() {
  const navigate = useNavigate()
  let user = {}
  try { user = JSON.parse(localStorage.getItem('user') || '{}') } catch { user = {} }
  if (user.plan === 'pro') return null

  return (
    <div className="upg-banner fu d1" onClick={() => navigate('/planos')} role="button" tabIndex={0}>
      {/* Glow decorativo */}
      <div className="upg-glow" />

      {/* Ícone animado */}
      <div className="upg-icon">
        <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
          <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd"/>
        </svg>
      </div>

      {/* Textos */}
      <div className="upg-text">
        <div className="upg-title">Upgrade para Pro</div>
        <div className="upg-sub">Ilimitado · PDF mensal · CSV · Suporte prioritário</div>
      </div>

      {/* Botão */}
      <button
        className="upg-cta"
        onClick={e => { e.stopPropagation(); navigate('/planos') }}
      >
        Ver planos
        <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd"/>
        </svg>
      </button>
    </div>
  )
}
