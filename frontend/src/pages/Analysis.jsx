import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { transactionsAPI } from '../services/api.js'
import { getCache, setCache } from '../services/cache.js'
import { useForcedLightTheme } from '../hooks/useTheme.js'
import Navbar from '../components/layout/Navbar.jsx'
import { CategoryIcon } from '../components/ui/icons.jsx'
import { CATEGORY_LABELS } from '../constants/index.js'
import { fmt } from '../utils/format.js'
import { analyzeMonth, CATEGORY_COLORS } from '../utils/monthAnalysis.js'

const HIDDEN = 'R$ ••••'
const readHidden = () => { try { return localStorage.getItem('hide-balance') === '1' } catch { return false } }

const BackIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
)
const SparkIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9z"/><path d="M19 3v4M17 5h4"/>
  </svg>
)
const ChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="9 18 15 12 9 6"/>
  </svg>
)

const labelOf = (c) => CATEGORY_LABELS[c] || c

// Análise do mês (Nancy 2, tela 17): de onde veio o gasto do mês atual. Usa os mesmos dados do Início.
export default function Analysis() {
  const navigate = useNavigate()
  const location = useLocation()
  useForcedLightTheme() // tela desenhada só no claro (design Nancy 2)

  const [data,    setData]    = useState(() => getCache('dashboard') || null)
  const [loading, setLoading] = useState(() => !getCache('dashboard'))
  const [failed,  setFailed]  = useState(false)
  const [hidden]              = useState(readHidden)

  const load = async () => {
    setFailed(false)
    try {
      const { data: fresh } = await transactionsAPI.dashboard()
      if (!fresh || typeof fresh !== 'object') throw new Error('invalid response')
      setData(fresh)
      setCache('dashboard', fresh)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate('/transactions'))

  const a = useMemo(
    () => analyzeMonth(Array.isArray(data?.transactions) ? data.transactions : [], data?.summary || null),
    [data],
  )
  const money = (n) => (hidden ? HIDDEN : `R$ ${fmt(n)}`)
  const pctLabel = (p, amount) => (p === 0 && amount > 0 ? '<1%' : `${p}%`)

  const askNancy = () => {
    const message = a.cutTarget > 0
      ? `Onde posso cortar R$ ${a.cutTarget} dos meus gastos este mês?`
      : 'Analise meus gastos deste mês e me diga onde posso economizar.'
    window.dispatchEvent(new CustomEvent('nancy:open-agent-chat', { detail: { message } }))
  }

  return (
    <>
      <Navbar />
      <div className="pwnav fin-pwnav fade-in">
        <div className="fin-page">
          <header className="fin-hero">
            <button type="button" className="fin-back" onClick={goBack} aria-label="Voltar"><BackIcon /></button>
            <div className="fin-hero-text">
              <h1 className="fin-hero-title">Análise do mês</h1>
              <p className="fin-hero-sub">Para onde foi seu dinheiro</p>
            </div>
          </header>

          <div className="fin-body">
            {loading ? (
              <div className="an-state"><div className="dsb-loader"><div className="dsb-loader-ring" /></div></div>
            ) : failed && !data ? (
              <section className="fin-card an-state">
                <h2 className="fin-title">Não foi possível carregar</h2>
                <p className="fin-sub">Confira sua conexão e tente de novo.</p>
                <button type="button" className="fin-btn an-retry" onClick={() => { setLoading(true); load() }}>Tentar de novo</button>
              </section>
            ) : a.categories.length === 0 ? (
              <section className="fin-card an-state">
                <h2 className="fin-title">Nenhum gasto este mês ainda</h2>
                <p className="fin-sub">Assim que você registrar saídas, mostramos aqui para onde o dinheiro está indo.</p>
              </section>
            ) : (
              <>
                {a.top && (
                  <section className="an-top" aria-label="Maior gasto variável">
                    <span className="an-top-eyebrow">Maior gasto variável</span>
                    <div className="an-top-row">
                      <strong className="an-top-name">{labelOf(a.top.category)}</strong>
                      <span className="an-top-val">{money(a.top.amount)}</span>
                    </div>
                    <span className="an-top-pill">{a.top.pctOfVariable}% do total</span>
                  </section>
                )}

                <section className="fin-card an-cats">
                  <h2 className="an-cats-title">Gastos por categoria</h2>
                  <ul className="an-list">
                    {a.categories.map(c => {
                      const color = CATEGORY_COLORS[c.category] || CATEGORY_COLORS.other
                      return (
                        <li key={c.category} className="an-item">
                          <div className="an-item-line">
                            <span className="an-item-ico" style={{ color }}><CategoryIcon category={c.category} size={14} /></span>
                            <span className="an-item-name">{labelOf(c.category)}</span>
                            <span className="an-item-val">{money(c.amount)}</span>
                            <span className="an-item-pct" title="% da renda do mês">{pctLabel(c.pctOfBase, c.amount)}</span>
                          </div>
                          <div className="an-bar" aria-hidden="true"><div className="an-bar-fill" style={{ width: `${c.barPct}%`, background: color }} /></div>
                        </li>
                      )
                    })}
                  </ul>
                </section>

                <button type="button" className="fin-card an-ask" onClick={askNancy}>
                  <span className="an-ask-ico"><SparkIcon /></span>
                  <span className="an-ask-text">
                    {a.cutTarget > 0
                      ? `Quer que a Nancy sugira onde cortar ${hidden ? HIDDEN : `R$ ${a.cutTarget}`} este mês?`
                      : 'Quer que a Nancy analise seus gastos deste mês?'}
                  </span>
                  <ChevronRight />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
