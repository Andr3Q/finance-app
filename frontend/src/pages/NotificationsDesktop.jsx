import Navbar from '../components/layout/Navbar.jsx'
import ProtoIcon from '../components/layout/ProtoIcon.jsx'
import { maskAmounts } from '../utils/storySlides.js'

// ícone de cada tipo de aviso (os cinco do design: salário, resumo, limite, conta; os demais usam o traço mais próximo)
const ICON = { salary: 'wallet', recap: 'spark', limit: 'alert', bill: 'receipt', reminder: 'clock', cancel: 'repeat', trial: 'zap', tip: 'spark' }

// Notificações no desktop (design "Nancy Desktop", tela 14): um cartão de até 906px com uma linha por aviso (ícone azul de 40px, título,
// texto e quando). Só a apresentação — os avisos são calculados na hora e a marcação de "visto" é a do Notifications, que passa tudo em
// `ctx`. O design não desenha o "Tentar de novo", o "Tudo em dia" nem o atalho das preferências: são estados e funções do app.
export default function NotificationsDesktop({ ctx }) {
  const { items, hidden, loading, failed, retry, open, goPrefs } = ctx
  return (
    <>
      <Navbar />
      <div className="pwnav ndh-pwnav fade-in">
        <div className="ndn-page">
          {items.length > 0 ? (
            <ul className="ndn-card">
              {items.map(n => (
                <li key={n.id} className="ndn-item">
                  <button type="button" className="ndn-row" onClick={() => open(n)}>
                    <span className="ndn-ico"><ProtoIcon name={ICON[n.kind] || 'bell'} size={18} /></span>
                    <span className="ndn-main">
                      <span className="ndn-name">{n.title}</span>
                      <span className="ndn-text">{hidden ? maskAmounts(n.body) : n.body}</span>
                    </span>
                    <span className="ndn-when">{n.when}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="ndn-card ndn-empty">
              {loading ? (
                <div className="dsb-loader-ring" style={{ margin: '0 auto' }} />
              ) : failed ? (
                <>
                  <strong>Não foi possível carregar</strong>
                  <span>Confira sua conexão e tente de novo.</span>
                  <button type="button" className="ndn-link" onClick={retry}>Tentar de novo</button>
                </>
              ) : (
                <>
                  <span className="ndn-empty-ico"><ProtoIcon name="bell" size={26} /></span>
                  <strong>Tudo em dia</strong>
                  <span>Quando uma conta estiver vencendo, uma categoria chegar perto do limite ou o resumo do mês ficar pronto, avisamos por aqui.</span>
                </>
              )}
            </div>
          )}
          <button type="button" className="ndn-prefs" onClick={goPrefs}>Preferências de notificação</button>
        </div>
      </div>
    </>
  )
}
