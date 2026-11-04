import Navbar from '../components/layout/Navbar.jsx'
import DesktopTabs from '../components/layout/DesktopTabs.jsx'
import ProtoIcon from '../components/layout/ProtoIcon.jsx'
import { MONTHS } from '../constants/index.js'
import { fmtK } from '../utils/historyInsight.js'

const MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
// o design escreve o abreviado com vírgula ("5,2k"); o do celular usa ponto
const kv = (v) => fmtK(v).replace('.', ',')
const BAR_MAX = 230 // px da barra mais alta (no print, 9,5k mede 230 e 5,2k mede 126)

// Histórico no desktop (design "Nancy Desktop", tela 21): abas de Metas e o cartão "Resultado por mês" com uma barra por mês (a do mês atual em verde).
// Só a apresentação — os seis meses, o cálculo do resultado, a frase sobre o mês atual e o relatório da IA são do History, que passa tudo em
// `ctx`. O design não desenha a frase do mês, o relatório (Elite) nem os estados de plano, carregando, falha e sem dados.
export default function HistoryDesktop({ ctx }) {
  const { isPro, isElite, loading, failed, retry, months, maxAbs, hasData, insight, goPlans, report } = ctx
  const now = new Date()
  return (
    <>
      <Navbar />
      <div className="pwnav ndh-pwnav fade-in">
        <div className="ndx-page">
          <DesktopTabs group="metas" label="Seções de metas" />

          {!isPro ? (
            <section className="nhs-card nhs-state">
              <h2>Recurso Pro</h2>
              <p>Veja o resultado de cada mês e como o mês atual se compara aos anteriores.</p>
              <button type="button" className="nhs-btn" onClick={goPlans}>Ver planos</button>
            </section>
          ) : loading ? (
            <div className="nhs-loading"><div className="dsb-loader-ring" style={{ margin: '0 auto' }} /></div>
          ) : failed && months.length === 0 ? (
            <section className="nhs-card nhs-state">
              <h2>Não foi possível carregar</h2>
              <p>Confira sua conexão e tente de novo.</p>
              <button type="button" className="nhs-btn" onClick={retry}>Tentar de novo</button>
            </section>
          ) : !hasData ? (
            <section className="nhs-card nhs-state">
              <h2>Sem dados de histórico ainda</h2>
              <p>Assim que você registrar lançamentos, mostramos aqui como cada mês fechou.</p>
            </section>
          ) : (
            <>
              <section className="nhs-card">
                <h2 className="nhs-title">Resultado por mês</h2>
                <div className="nhs-chart" role="list">
                  {months.map((m, i) => {
                    const last = i === months.length - 1
                    const h = m.active ? Math.max(6, Math.round((Math.abs(m.saved) / maxAbs) * BAR_MAX)) : 6
                    return (
                      <div key={`${m.year}-${m.month}`} className="nhs-col" role="listitem" aria-label={`${MONTHS[m.month - 1]}: ${m.active ? `resultado ${kv(m.saved)}` : 'sem movimento'}`}>
                        <span className="nhs-val">{m.active ? kv(m.saved) : '–'}</span>
                        <span className={`nhs-bar${last ? ' cur' : ''}${m.active && m.saved < 0 ? ' neg' : ''}${m.active ? '' : ' off'}`} style={{ height: h }} />
                        <span className="nhs-mon">{MONTHS_SHORT[m.month - 1]}</span>
                      </div>
                    )
                  })}
                </div>
              </section>

              {insight && (
                <section className="nhs-card nhs-insight">
                  <span className={`nhs-insight-ico${insight.kind === 'below' ? ' down' : ''}`}><ProtoIcon name={insight.kind === 'below' ? 'down' : 'up'} size={20} /></span>
                  <div><h2>{insight.title}</h2><p>{insight.text}</p></div>
                </section>
              )}
            </>
          )}

          {isElite && (
            <section className="nhs-card nhs-report">
              <h2 className="nhs-title">Relatório mensal da Nancy</h2>
              <p className="nhs-sub">Análise completa do mês escolhido, gerada por IA.</p>
              <div className="nhs-controls">
                <select className="nhs-select" aria-label="Mês do relatório" value={report.month} onChange={e => report.setMonth(+e.target.value)}>
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
                <select className="nhs-select" aria-label="Ano do relatório" value={report.year} onChange={e => report.setYear(+e.target.value)}>
                  {Array.from({ length: 4 }, (_, i) => now.getFullYear() - 2 + i).map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <button type="button" className="nhs-btn" onClick={report.generate} disabled={report.loading}>{report.loading ? 'Gerando…' : 'Gerar relatório'}</button>
              </div>
              {report.text && !report.loading && <div className="nhs-report-text">{report.text}</div>}
            </section>
          )}
        </div>
      </div>
    </>
  )
}
