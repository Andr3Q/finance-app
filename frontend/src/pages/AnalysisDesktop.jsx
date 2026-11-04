import Navbar from '../components/layout/Navbar.jsx'
import DesktopTabs from '../components/layout/DesktopTabs.jsx'
import ProtoIcon from '../components/layout/ProtoIcon.jsx'
import ProtoCategoryIcon from '../components/layout/ProtoCategoryIcon.jsx'
import { CATEGORY_COLORS } from '../utils/monthAnalysis.js'

// Análise do mês no desktop (design "Nancy Desktop", tela 18): abas do Extrato, "Gastos por categoria" com barras à esquerda e, à direita, o
// maior gasto variável em azul e o convite para a Nancy IA. Só a apresentação — a análise, o ocultar valores e a pergunta ao chat são
// do Analysis, que passa tudo em `ctx`. O design não desenha o "% do total" do maior gasto, o carregando, a falha nem o mês sem gastos.
export default function AnalysisDesktop({ ctx }) {
  const { loading, failed, retry, a, money, pctLabel, labelOf, askNancy, askText } = ctx
  const empty = !loading && !failed && a.categories.length === 0
  return (
    <>
      <Navbar />
      <div className="pwnav ndh-pwnav fade-in">
        <div className="ndx-page">
          <DesktopTabs group="extrato" label="Seções do extrato" />

          {loading ? (
            <div className="nda-state"><div className="dsb-loader-ring" style={{ margin: '0 auto' }} /></div>
          ) : failed ? (
            <section className="nda-card nda-state">
              <h2>Não foi possível carregar</h2>
              <p>Confira sua conexão e tente de novo.</p>
              <button type="button" className="nda-btn" onClick={retry}>Tentar de novo</button>
            </section>
          ) : empty ? (
            <section className="nda-card nda-state">
              <h2>Nenhum gasto este mês ainda</h2>
              <p>Assim que você registrar saídas, mostramos aqui para onde o dinheiro está indo.</p>
            </section>
          ) : (
            <div className="nda-grid">
              <section className="nda-card nda-cats">
                <h2>Gastos por categoria</h2>
                <ul className="nda-list">
                  {a.categories.map(c => {
                    const color = CATEGORY_COLORS[c.category] || CATEGORY_COLORS.other
                    return (
                      <li key={c.category} className="nda-item">
                        <div className="nda-line">
                          <span className="nda-ico" style={{ color }}><ProtoCategoryIcon category={c.category} size={20} /></span>
                          <span className="nda-name">{labelOf(c.category)}</span>
                          <span className="nda-val">{money(c.amount)}</span>
                          <span className="nda-pct" title="% da renda do mês">{pctLabel(c.pctOfBase, c.amount)}</span>
                        </div>
                        <div className="nda-bar" aria-hidden="true"><div className="nda-fill" style={{ width: `${c.barPct}%`, background: color }} /></div>
                      </li>
                    )
                  })}
                </ul>
              </section>

              <div className="nda-side">
                {a.top && (
                  <section className="nda-top" aria-label="Maior gasto variável">
                    <span className="nda-eyebrow">MAIOR GASTO VARIÁVEL</span>
                    <strong className="nda-top-name">{labelOf(a.top.category)}</strong>
                    <span className="nda-top-val">{money(a.top.amount)}<small>{a.top.pctOfVariable}% do total</small></span>
                  </section>
                )}
                <button type="button" className="nda-ask" onClick={askNancy}>
                  <span className="nda-ask-ico"><ProtoIcon name="spark" size={20} /></span>
                  <span className="nda-ask-text">{askText}</span>
                  <ProtoIcon name="chev" size={20} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
