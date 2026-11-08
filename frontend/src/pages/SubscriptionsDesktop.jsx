import Navbar from '../components/layout/Navbar.jsx'
import DesktopTabs from '../components/layout/DesktopTabs.jsx'
import ProtoIcon from '../components/layout/ProtoIcon.jsx'

// Assinaturas no desktop (design "Nancy Desktop", tela 22): abas de Metas, o cartão azul com o total detectado (320px) e a lista de assinaturas com
// o interruptor "manter". Só a apresentação — a detecção, o "lembrar de cancelar" (guardado no aparelho) e o ocultar valores são do Subscriptions,
// que passa tudo em `ctx`. O app só vê as cobranças, não o uso do serviço: a linha diz "Última cobrança", não "Último uso" como o desenho.
export default function SubscriptionsDesktop({ ctx }) {
  const { isElite, loading, failed, retry, subs, flags, keyOf, since, staleCount, money, total, onToggle, goPlans } = ctx
  return (
    <>
      <Navbar />
      <div className="pwnav ndh-pwnav fade-in">
        <div className="ndx-page">
          <DesktopTabs group="metas" label="Seções de metas" />

          {!isElite ? (
            <section className="nsb-card nsb-state">
              <h2>Recurso Elite</h2>
              <p>A Nancy detecta sozinha as assinaturas e gastos recorrentes e lembra você de cancelar as que não usa.</p>
              {goPlans && <button type="button" className="nsb-btn" onClick={goPlans}>Ver planos</button>}
            </section>
          ) : loading ? (
            <div className="nsb-loading"><div className="dsb-loader-ring" style={{ margin: '0 auto' }} /></div>
          ) : failed ? (
            <section className="nsb-card nsb-state">
              <h2>Não foi possível carregar</h2>
              <p>Confira sua conexão e tente de novo.</p>
              <button type="button" className="nsb-btn" onClick={retry}>Tentar de novo</button>
            </section>
          ) : subs.length === 0 ? (
            <section className="nsb-card nsb-state">
              <h2>Nenhuma assinatura detectada ainda</h2>
              <p>Precisamos de pelo menos 2 meses de lançamentos parecidos para reconhecer uma assinatura.</p>
            </section>
          ) : (
            <div className="nsb-grid">
              <section className="nsb-sum" aria-label="Total das assinaturas">
                <span className="nsb-sum-lbl"><span><ProtoIcon name="spark" size={20} /></span>A Nancy detectou</span>
                <strong className="nsb-sum-val">{money(total)}/mês</strong>
                <span className="nsb-sum-note">
                  {staleCount > 0
                    ? `${staleCount} ${staleCount === 1 ? 'assinatura' : 'assinaturas'} sem cobrança há mais de 35 dias.`
                    : 'Desative para a Nancy lembrar você de cancelar.'}
                </span>
              </section>

              <ul className="nsb-card nsb-list">
                {subs.map(s => {
                  const keep = !flags[keyOf(s.description)]
                  const sn = s.lastDate ? since(s.lastDate) : null
                  return (
                    <li key={keyOf(s.description)} className="nsb-item">
                      <span className="nsb-ico"><ProtoIcon name="repeat" size={20} /></span>
                      <span className="nsb-info">
                        <span className="nsb-name">{s.description}</span>
                        {sn && <span className={`nsb-sub${sn.stale ? ' stale' : ''}`}>Última cobrança {sn.text}</span>}
                      </span>
                      <span className="nsb-val">{money(s.amount)}</span>
                      <button type="button" role="switch" aria-checked={keep} aria-label={`Manter ${s.description}`} className={`nsb-switch${keep ? ' on' : ''}`} onClick={() => onToggle(s)}><span /></button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
