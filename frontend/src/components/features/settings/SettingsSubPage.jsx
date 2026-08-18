import { useNavigate } from 'react-router-dom'
import Navbar from '../../layout/Navbar.jsx'

// Casca compartilhada pelas subtelas de "Mais" (Perfil, Segurança, etc.) —
// mesmo header/back-link em todas, só troca o título e o conteúdo.
export default function SettingsSubPage({ title, children }) {
  const navigate = useNavigate()
  return (
    <>
      <Navbar />
      <div className="pwnav fade-in">
        <div className="dsb-content">
          <div className="cfg-wrap">
            <button
              type="button"
              onClick={() => navigate('/settings')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20,
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                fontSize: 12, fontWeight: 600, color: 'var(--t3)',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>
              </svg>
              Voltar para Mais
            </button>
            <div className="cfg-sec-title r2">{title}</div>
            {children}
          </div>
        </div>
      </div>
    </>
  )
}
