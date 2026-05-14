import { IconAlert, IconInfo } from './icons.jsx'

export default function AlertBanner({ percent }) {
  if (percent < 50) return null

  const cfg =
    percent >= 100 ? { color: 'var(--red)',    bg: 'rgba(255,71,87,.08)',   border: 'rgba(255,71,87,.2)',   Icon: IconAlert, msg: 'Limite ultrapassado! Revise seus gastos urgentemente.' } :
    percent >= 90  ? { color: 'var(--orange)',  bg: 'rgba(255,140,66,.08)',  border: 'rgba(255,140,66,.2)',  Icon: IconAlert, msg: 'Cuidado! Você está com 90% do orçamento utilizado.' } :
    percent >= 70  ? { color: 'var(--yellow)',  bg: 'rgba(255,193,7,.07)',   border: 'rgba(255,193,7,.18)',  Icon: IconAlert, msg: 'Atenção! Você está chegando no limite do orçamento.' } :
                     { color: 'var(--blue)',    bg: 'rgba(79,142,247,.07)',  border: 'rgba(79,142,247,.18)', Icon: IconInfo,  msg: 'Você já usou metade do seu orçamento mensal.' }

  return (
    <div className="alt fu" style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color, marginBottom: 12 }}>
      <cfg.Icon size={15} color={cfg.color} />
      <span style={{ fontWeight: 500, fontSize: 13 }}>{cfg.msg}</span>
      <button className="alx" onClick={e => e.currentTarget.closest('.alt').remove()}>
        <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
        </svg>
      </button>
    </div>
  )
}
