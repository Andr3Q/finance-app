import { Link, useNavigate } from 'react-router-dom'

export default function NotFound() {
  const navigate = useNavigate()

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--t1)', fontFamily: 'var(--fs)', display: 'flex', flexDirection: 'column' }}>

      <header style={{ borderBottom: '1px solid var(--bd)', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'var(--t1)' }}>
          <img src="/logo-icon.png" alt="FinançasPro" style={{ width: 28, height: 28 }} />
          <span style={{ fontWeight: 700, fontSize: 15 }}>FinançasPro</span>
        </Link>
      </header>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', textAlign: 'center' }}>

        <div style={{
          fontSize: 96, fontWeight: 900, fontFamily: 'var(--fd)',
          background: 'linear-gradient(135deg, var(--c), rgba(74,196,110,.3))',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          lineHeight: 1, marginBottom: 16, userSelect: 'none',
        }}>
          404
        </div>

        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
          Página não encontrada
        </div>
        <div style={{ fontSize: 14, color: 'var(--t2)', maxWidth: 360, lineHeight: 1.6, marginBottom: 32 }}>
          O endereço que você acessou não existe ou foi removido.
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            className="btn bp"
            style={{ fontSize: 14, padding: '10px 20px' }}
            onClick={() => navigate(-1)}
          >
            <svg viewBox="0 0 24 24" fill="none" width="14" height="14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Voltar
          </button>
          <Link to="/dashboard" className="btn bg" style={{ fontSize: 14, padding: '10px 20px', textDecoration: 'none' }}>
            Ir para o dashboard
          </Link>
        </div>

      </div>
    </div>
  )
}
