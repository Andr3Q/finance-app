import Navbar from '../components/layout/Navbar.jsx'
import DesktopTabs from '../components/layout/DesktopTabs.jsx'
import ProtoIcon from '../components/layout/ProtoIcon.jsx'
import { leadLabel } from '../utils/reminders.js'

// Lembretes no desktop (design "Nancy Desktop", tela 23): abas de Metas e um cartão de até 906px com uma linha por conta (ícone de relógio, nome,
// "Dia 3 · 2 dias antes" e o interruptor). Só a apresentação — as contas, as escolhas (guardadas no aparelho), a janela de antecedência, o lembrete
// avulso e a remoção são do Reminders, que passa tudo em `ctx` e mantém as janelas. O design não desenha "Novo lembrete" nem os estados de plano,
// carregando, falha e vazio.
export default function RemindersDesktop({ ctx }) {
  const { isElite, loading, failed, retry, rows, onOpen, onToggle, onAdd, goPlans } = ctx
  return (
    <>
      <Navbar />
      <div className="pwnav ndh-pwnav fade-in">
        <div className="ndx-page">
          <DesktopTabs group="metas" label="Seções de metas" />

          {!isElite ? (
            <section className="nrm-card nrm-state">
              <h2>Recurso Elite</h2>
              <p>Escolha de quantos dias antes a Nancy avisa cada conta e crie lembretes avulsos, como o IPVA.</p>
              {goPlans && <button type="button" className="nrm-btn" onClick={goPlans}>Ver planos</button>}
            </section>
          ) : loading ? (
            <div className="nrm-loading"><div className="dsb-loader-ring" style={{ margin: '0 auto' }} /></div>
          ) : failed ? (
            <section className="nrm-card nrm-state">
              <h2>Não foi possível carregar</h2>
              <p>Confira sua conexão e tente de novo.</p>
              <button type="button" className="nrm-btn" onClick={retry}>Tentar de novo</button>
            </section>
          ) : (
            <>
              <section className="nrm-card nrm-list-card">
                {rows.length === 0 ? (
                  <p className="nrm-empty">Nenhuma conta com dia de vencimento ainda. Cadastre suas contas fixas ou crie um lembrete avulso.</p>
                ) : (
                  <ul className="nrm-list">
                    {rows.map(r => (
                      <li key={`${r.kind}-${r.id}`} className="nrm-item">
                        <button type="button" className="nrm-row" onClick={() => onOpen(r)} aria-label={`Antecedência do lembrete de ${r.name}`}>
                          <span className="nrm-ico"><ProtoIcon name="clock" size={20} /></span>
                          <span className="nrm-info"><span className="nrm-name">{r.name}</span><span className="nrm-sub">{r.when} · {leadLabel(r.lead)}</span></span>
                        </button>
                        <button type="button" role="switch" aria-checked={r.on} aria-label={`Lembrete de ${r.name}`} className={`nrm-switch${r.on ? ' on' : ''}`} onClick={() => onToggle(r)}><span /></button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <button type="button" className="nrm-add" onClick={onAdd}><ProtoIcon name="plus" size={18} />Novo lembrete</button>
            </>
          )}
        </div>
      </div>
    </>
  )
}
