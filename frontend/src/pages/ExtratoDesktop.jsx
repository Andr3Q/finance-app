import Navbar from '../components/layout/Navbar.jsx'
import DesktopTabs from '../components/layout/DesktopTabs.jsx'
import ProtoIcon from '../components/layout/ProtoIcon.jsx'
import PlanUsageBanner from '../components/ui/PlanUsageBanner.jsx'
import ProtoCategoryIcon from '../components/layout/ProtoCategoryIcon.jsx'
import { usePageSubtitle } from '../hooks/usePageSubtitle.js'
import { CATEGORY_LABELS } from '../constants/index.js'

const HIDDEN = 'R$ ••••'
const brl = (n) => Math.abs(Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const signed = (n, hidden) => (hidden ? HIDDEN : `${n < 0 ? '− ' : '+ '}R$ ${brl(n)}`)
const pad = (n) => String(n).padStart(2, '0')

const FILTERS = [['all', 'Todos'], ['income', 'Entradas'], ['expense', 'Saídas']]

// Extrato no desktop (design "Nancy Desktop", tela 10): abas, filtros em pílulas, busca por descrição e a tabela do mês.
// Só a apresentação — dados, filtros, edição, exclusão, importar/exportar CSV e janela de 12 meses são os do Transactions, que passa
// tudo em `ctx` e mantém os modais (editar, remover) e o aviso. O design não desenha a troca de mês, o resultado do mês nem
// Importar/Exportar CSV: são funções do app e ficam fora do cartão, sem mexer nele.
export default function ExtratoDesktop({ ctx }) {
  const {
    user, loading, rows, filter, setFilter, search, setSearch, hidden, onEdit, onDelete,
    monthName, monthTitle, goToPrev, goToNext, isOldestMonth, isCurrentMonth, result, empty, openClosing,
    importCsv, exportCsv, planBanner,
  } = ctx
  usePageSubtitle(`Todas as movimentações de ${monthName}`)
  const nothing = !loading && rows.length === 0

  return (
    <>
      <Navbar />
      <div className="pwnav ndh-pwnav fade-in">
        <div className="ndx-page">
          {planBanner && <PlanUsageBanner plan={user?.plan ?? 'free'} feature="transactions" used={planBanner.used} label="transações este mês" />}

          <div className="ndx-toprow">
            <DesktopTabs group="extrato" label="Seções do extrato" />
            <div className="ndx-meta">
              <div className="ndx-month" role="group" aria-label="Mês do extrato">
                <button type="button" className="ndx-month-btn" onClick={goToPrev} disabled={isOldestMonth} aria-label="Mês anterior"><ProtoIcon name="back" size={16} /></button>
                <span className="ndx-month-lbl">{monthTitle}</span>
                <button type="button" className="ndx-month-btn ndx-month-btn--next" onClick={goToNext} disabled={isCurrentMonth} aria-label="Próximo mês"><ProtoIcon name="back" size={16} /></button>
              </div>
              <dl className="ndx-sum" aria-label="Resultado do mês">
                <div><dt>Resultado</dt><dd className={`ndx-sum-res ${result.pos ? 'pos' : 'neg'}`}>{result.result}</dd></div>
                <div><dt>Entradas</dt><dd>{result.income}</dd></div>
                <div><dt>Saídas</dt><dd>{result.expenses}</dd></div>
              </dl>
              {result.note && <p className="ndx-sum-note">{result.note}</p>}
            </div>
          </div>

          <section className="ndx-card">
            <div className="ndx-filters">
              {FILTERS.map(([k, l]) => (
                <button key={k} type="button" className={`ndx-pill${filter === k ? ' on' : ''}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
              ))}
              <span className="ndx-spacer" />
              <input className="ndx-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Filtrar por descrição" aria-label="Filtrar por descrição" />
            </div>

            <div className="ndx-thead" aria-hidden="true"><span /><span>DESCRIÇÃO</span><span>CATEGORIA</span><span>DATA</span><span className="r">VALOR</span></div>

            {loading ? (
              <div className="ndx-empty"><div className="dsb-loader-ring" style={{ margin: '0 auto' }} /></div>
            ) : (
              <ul className="ndx-rows">
                {rows.map(t => {
                  const inc = t.type === 'income'
                  const cat = CATEGORY_LABELS[t.category] || t.category
                  const d = new Date(t.date)
                  return (
                    <li key={t.id} className="ndx-row">
                      <button type="button" className="ndx-row-main" onClick={() => onEdit(t)} title="Editar">
                        <span className={`ndh-row-ico${inc ? ' inc' : ''}`}><ProtoCategoryIcon category={t.category} size={18} /></span>
                        <span className="ndh-row-desc">{t.description || cat}</span>
                        <span className="ndh-row-cat">{cat}</span>
                        <span className="ndh-row-date">{pad(d.getDate())}/{pad(d.getMonth() + 1)}</span>
                        <span className={`ndh-row-amt${inc ? ' inc' : ''}`}>{signed(inc ? t.amount : -t.amount, hidden)}</span>
                      </button>
                      <button type="button" className="ndx-del" onClick={() => onDelete(t)} title="Remover" aria-label="Remover transação"><ProtoIcon name="x" size={14} /></button>
                    </li>
                  )
                })}
              </ul>
            )}

            {nothing && (empty.filtering
              ? <span className="ndx-none">Nada encontrado com esse filtro.</span>
              : (
                <div className="ndx-none">
                  <strong>{empty.title}</strong>
                  <span>{empty.sub}</span>
                  {empty.closed && <button type="button" className="ndx-link" onClick={openClosing}>Ver relatórios</button>}
                </div>
              ))}
          </section>

          <div className="ndx-actions">
            <button type="button" className="ndx-ghost" onClick={importCsv}><ProtoIcon name="upload" size={16} />Importar CSV</button>
            <button type="button" className="ndx-ghost" onClick={exportCsv} disabled={rows.length === 0}><ProtoIcon name="download" size={16} />Exportar CSV</button>
          </div>
        </div>
      </div>
    </>
  )
}
