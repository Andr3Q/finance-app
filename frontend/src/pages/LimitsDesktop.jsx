import Navbar from '../components/layout/Navbar.jsx'
import DesktopTabs from '../components/layout/DesktopTabs.jsx'
import ProtoIcon from '../components/layout/ProtoIcon.jsx'
import ProtoCategoryIcon from '../components/layout/ProtoCategoryIcon.jsx'
import CurrencyInput from '../components/ui/CurrencyInput.jsx'
import { CATEGORY_LABELS } from '../constants/index.js'
import { WARN_PCT } from '../utils/categoryLimits.js'

// Limites no desktop (design "Nancy Desktop", tela 24): abas de Metas e um cartão por categoria com teto, em três colunas (ícone, nome, barra de 10px
// verde/amarela/vermelha, gasto e teto em mono e a nota "R$ X disponível" / "Atenção: N% usado"). Só a apresentação — os tetos, o gasto do mês, salvar
// e remover (com a mesma confirmação) são do Limits, que passa tudo em `ctx`. O design não desenha "Novo limite" nem o × de remover: ficam no cartão
// de baixo e no canto de cada cartão.
export default function LimitsDesktop({ ctx }) {
  const { isPro, loading, failed, retry, rows, note, money, onRemove, goPlans, chips, selected, onPick, more, setMore, forcedMore, amount, setAmount, onSave, saving, msg } = ctx
  return (
    <>
      <Navbar />
      <div className="pwnav ndh-pwnav fade-in">
        <div className="ndx-page">
          <DesktopTabs group="metas" label="Seções de metas" />

          {!isPro ? (
            <section className="nlm-card nlm-state">
              <h2>Recurso Pro</h2>
              <p>Defina um teto de gasto para cada categoria e a Nancy avisa quando você chegar perto.</p>
              <button type="button" className="nlm-btn" onClick={goPlans}>Ver planos</button>
            </section>
          ) : loading ? (
            <div className="nlm-loading"><div className="dsb-loader-ring" style={{ margin: '0 auto' }} /></div>
          ) : failed ? (
            <section className="nlm-card nlm-state">
              <h2>Não foi possível carregar</h2>
              <p>Confira sua conexão e tente de novo.</p>
              <button type="button" className="nlm-btn" onClick={retry}>Tentar de novo</button>
            </section>
          ) : (
            <>
              {rows.length === 0 ? (
                <section className="nlm-card"><p className="nlm-empty">Nenhum limite definido. Escolha uma categoria abaixo e informe o teto.</p></section>
              ) : (
                <ul className="nlm-grid" aria-label="Limites por categoria">
                  {rows.map(r => {
                    const n = note(r)
                    return (
                      <li key={r.category} className="nlm-card nlm-item">
                        <div className="nlm-top">
                          <span className="nlm-ico"><ProtoCategoryIcon category={r.category} size={20} /></span>
                          <span className="nlm-name">{r.label}</span>
                          <button type="button" className="nlm-del" aria-label={`Remover limite de ${r.label}`} onClick={() => onRemove(r)}><ProtoIcon name="x" size={16} /></button>
                        </div>
                        <div className="nlm-bar" role="progressbar" aria-label={`${r.label}: ${r.used}% do limite usado`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, r.used)}>
                          <span className={`nlm-fill ${r.state}`} style={{ width: `${Math.min(100, r.pct)}%` }} />
                        </div>
                        <div className="nlm-amounts"><span>{money(r.spent)}</span><span>de {money(r.limit)}</span></div>
                        <p className={`nlm-note ${n.cls}`}>{n.text}</p>
                      </li>
                    )
                  })}
                </ul>
              )}

              <section className="nlm-card nlm-new" aria-label="Novo limite">
                <h2>Novo limite</h2>
                <p className="nlm-hint">A Nancy avisa quando passar de {WARN_PCT}%</p>
                <div className="nlm-chips" role="radiogroup" aria-label="Categoria">
                  {chips.map(c => (
                    <button key={c} type="button" role="radio" aria-checked={selected === c} className={`nlm-chip${selected === c ? ' on' : ''}`} onClick={() => onPick(c)}>{CATEGORY_LABELS[c]}</button>
                  ))}
                  {!forcedMore && <button type="button" className="nlm-chip more" aria-expanded={more} onClick={() => setMore(m => !m)}>{more ? 'Menos' : 'Mais'}</button>}
                </div>
                <form className="nlm-form" onSubmit={onSave}>
                  <CurrencyInput className="nlm-inp" placeholder="Teto (R$)" value={amount} onChange={setAmount} />
                  <button type="submit" className="nlm-btn" disabled={saving}>Salvar</button>
                </form>
                {msg && <p className={`nlm-msg ${msg.ok ? 'ok' : 'err'}`} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
              </section>
            </>
          )}
        </div>
      </div>
    </>
  )
}
