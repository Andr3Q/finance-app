import Navbar from '../components/layout/Navbar.jsx'
import DesktopTabs from '../components/layout/DesktopTabs.jsx'
import ProtoIcon from '../components/layout/ProtoIcon.jsx'
import { usePageSubtitle } from '../hooks/usePageSubtitle.js'

// Contas do mês no desktop (design "Nancy Desktop", tela 16): abas do Extrato, três números (pagas, total e status) e uma linha por conta com
// o círculo de "paga", o vencimento, o valor e a etiqueta. Só a apresentação — dados, ordem, confirmação de pagamento e avisos são
// do BillsMonth, que passa tudo em `ctx` e mantém o modal "Marcar como paga?".
export default function BillsMonthDesktop({ ctx }) {
  const { sorted, paidCount, pendingCount, count, empty, money, monthName, onTap, goFinance } = ctx
  usePageSubtitle(`Compromissos de ${monthName}`)
  return (
    <>
      <Navbar />
      <div className="pwnav ndh-pwnav fade-in">
        <div className="ndx-page">
          <DesktopTabs group="extrato" label="Seções do extrato" />

          {empty ? (
            <section className="ndb-empty">
              <h2>Nenhuma conta fixa cadastrada</h2>
              <p>Cadastre seu aluguel, internet e outras contas recorrentes para acompanhar o que já foi pago.</p>
              <button type="button" className="ndb-btn" onClick={goFinance}>Cadastrar contas</button>
            </section>
          ) : (
            <>
              <section className="ndb-stats" aria-label="Resumo do mês">
                <div className="ndb-stat ndb-stat--blue"><span className="ndb-lbl">Pagas</span><span className="ndb-big">{paidCount}/{count}</span></div>
                <div className="ndb-stat"><span className="ndb-lbl">Total do mês</span><span className="ndb-mono">{money.total}</span></div>
                <div className="ndb-stat"><span className="ndb-lbl">Status</span><span className="ndb-status">{pendingCount === 0 ? 'Tudo pago' : `${pendingCount} ${pendingCount === 1 ? 'pendente' : 'pendentes'}`}</span></div>
              </section>

              <ul className="ndb-card">
                {sorted.map(b => (
                  <li key={b.id} className="ndb-item">
                    <button type="button" className="ndb-row" onClick={() => onTap(b)} aria-label={`${b.name}, ${b.paidThisMonth ? 'paga' : 'pendente'}, ${money.of(b.amount)}`}>
                      <span className={`ndb-check${b.paidThisMonth ? ' on' : ''}`}>{b.paidThisMonth && <ProtoIcon name="check" size={20} />}</span>
                      <span className="ndb-name">{b.name}</span>
                      <span className="ndb-due">{b.dueDay ? `Vence dia ${b.dueDay}` : 'Sem dia de vencimento'}</span>
                      <span className="ndb-amt">{money.of(b.amount)}</span>
                      <span className={`ndb-pill ${b.paidThisMonth ? 'paid' : 'pending'}`}>{b.paidThisMonth ? 'Paga' : 'Pendente'}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {pendingCount > 0 && <p className="ndb-hint">Toque numa conta para marcar como paga.</p>}
            </>
          )}
        </div>
      </div>
    </>
  )
}
