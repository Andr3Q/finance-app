import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { transactionsAPI, agentAPI } from '../services/api.js'
import { getCache, setCache } from '../services/cache.js'
import { useUser } from '../hooks/useUser.js'
import { useForcedLightTheme } from '../hooks/useTheme.js'
import Navbar from '../components/layout/Navbar.jsx'
import { MONTHS } from '../constants/index.js'
import { fmtK, historyInsight } from '../utils/historyInsight.js'

const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const CACHE_KEY = 'history:6'
const TTL_5MIN  = 5 * 60_000
const BAR_MAX   = 136 // px da barra mais alta

const BackIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
)
const Arrow = ({ down }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {down ? <><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></> : <><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></>}
  </svg>
)

// Histórico (Nancy 2, tela 20): o resultado de cada um dos últimos 6 meses (mesma conta do cartão do
// Extrato e do resumo em stories) e uma frase sobre o mês atual. Recurso do plano Pro. O relatório
// mensal da IA (Elite), que morava na antiga aba "Histórico" das Metas, continua aqui embaixo.
export default function History() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useUser()
  useForcedLightTheme() // tela desenhada só no claro (design Nancy 2)
  const isPro   = user?.plan === 'pro' || user?.plan === 'elite'
  const isElite = user?.plan === 'elite'

  const [months,  setMonths]  = useState(() => (isPro ? getCache(CACHE_KEY) : null) || [])
  const [loading, setLoading] = useState(() => isPro && !getCache(CACHE_KEY))
  const [failed,  setFailed]  = useState(false)

  const load = () => {
    setFailed(false)
    return transactionsAPI.monthlyHistory(6)
      .then(r => { const d = Array.isArray(r.data) ? r.data : []; setCache(CACHE_KEY, d, TTL_5MIN); setMonths(d) })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false))
  }
  useEffect(() => { if (isPro) load(); else setLoading(false) }, [isPro]) // eslint-disable-line react-hooks/exhaustive-deps

  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate('/goals'))

  const maxAbs  = useMemo(() => Math.max(1, ...months.filter(m => m.active).map(m => Math.abs(m.saved))), [months])
  const insight = useMemo(() => historyInsight(months), [months])
  const hasData = months.some(m => m.active)

  // ── relatório mensal da IA (Elite) ──
  const now = new Date()
  const [reportMonth, setReportMonth] = useState(now.getMonth() + 1)
  const [reportYear,  setReportYear]  = useState(now.getFullYear())
  const [report, setReport] = useState(null)
  const [reportLoading, setReportLoading] = useState(false)
  const reportCache = useRef(new Map())
  const generateReport = async () => {
    const key = `${reportMonth}-${reportYear}`
    const cached = reportCache.current.get(key)
    if (cached?.text && Date.now() - cached.ts < 6 * 3600 * 1000) { setReport(cached.text); return }
    setReportLoading(true); setReport(null)
    try {
      const { data } = await agentAPI.monthlyReport(reportMonth, reportYear)
      const text = data.report || data.text || ''
      setReport(text)
      if (text && !text.startsWith('Nenhuma')) reportCache.current.set(key, { text, ts: Date.now() })
    } catch (err) {
      setReport(err.response?.data?.error || 'Erro ao gerar relatório. Tente novamente.')
    } finally { setReportLoading(false) }
  }

  return (
    <>
      <Navbar />
      <div className="pwnav fin-pwnav fade-in">
        <div className="fin-page">
          <header className="fin-hero">
            <button type="button" className="fin-back" onClick={goBack} aria-label="Voltar"><BackIcon /></button>
            <div className="fin-hero-text">
              <h1 className="fin-hero-title">Histórico</h1>
              <p className="fin-hero-sub">Últimos 6 meses</p>
            </div>
          </header>

          <div className="fin-body">
            {!isPro ? (
              <section className="fin-card hs-state">
                <h2 className="fin-title">Recurso Pro</h2>
                <p className="fin-sub">Veja o resultado de cada mês e como o mês atual se compara aos anteriores.</p>
                <button type="button" className="fin-btn hs-btn" onClick={() => navigate('/planos')}>Ver planos</button>
              </section>
            ) : loading ? (
              <div className="hs-state"><div className="dsb-loader"><div className="dsb-loader-ring" /></div></div>
            ) : failed && months.length === 0 ? (
              <section className="fin-card hs-state">
                <h2 className="fin-title">Não foi possível carregar</h2>
                <p className="fin-sub">Confira sua conexão e tente de novo.</p>
                <button type="button" className="fin-btn hs-btn" onClick={() => { setLoading(true); load() }}>Tentar de novo</button>
              </section>
            ) : !hasData ? (
              <section className="fin-card hs-state">
                <h2 className="fin-title">Sem dados de histórico ainda</h2>
                <p className="fin-sub">Assim que você registrar lançamentos, mostramos aqui como cada mês fechou.</p>
              </section>
            ) : (
              <>
                <section className="fin-card hs-chart-card">
                  <h2 className="hs-title">Resultado por mês</h2>
                  <div className="hs-chart" role="list">
                    {months.map((m, i) => {
                      const last = i === months.length - 1
                      const h = m.active ? Math.max(6, Math.round((Math.abs(m.saved) / maxAbs) * BAR_MAX)) : 6
                      const neg = m.active && m.saved < 0
                      return (
                        <div key={`${m.year}-${m.month}`} className="hs-col" role="listitem"
                          aria-label={`${MONTHS[m.month - 1]}: ${m.active ? `resultado ${fmtK(m.saved)}` : 'sem movimento'}`}>
                          <span className="hs-val">{m.active ? fmtK(m.saved) : '–'}</span>
                          <span className={`hs-bar${last ? ' cur' : ''}${neg ? ' neg' : ''}${m.active ? '' : ' off'}`} style={{ height: h }} />
                          <span className="hs-mon">{MONTHS_SHORT[m.month - 1]}</span>
                        </div>
                      )
                    })}
                  </div>
                </section>

                {insight && (
                  <section className="fin-card hs-insight">
                    <span className={`hs-insight-ico${insight.kind === 'below' ? ' down' : ''}`}><Arrow down={insight.kind === 'below'} /></span>
                    <div className="hs-insight-text">
                      <h2 className="hs-insight-title">{insight.title}</h2>
                      <p className="hs-insight-sub">{insight.text}</p>
                    </div>
                  </section>
                )}
              </>
            )}

            {isElite && (
              <section className="fin-card hs-report">
                <h2 className="hs-title">Relatório mensal da Nancy</h2>
                <p className="fin-sub">Análise completa do mês escolhido, gerada por IA.</p>
                <div className="hs-report-controls">
                  <select className="hs-select" aria-label="Mês do relatório" value={reportMonth} onChange={e => setReportMonth(+e.target.value)}>
                    {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                  <select className="hs-select" aria-label="Ano do relatório" value={reportYear} onChange={e => setReportYear(+e.target.value)}>
                    {Array.from({ length: 4 }, (_, i) => now.getFullYear() - 2 + i).map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <button type="button" className="hs-gen" onClick={generateReport} disabled={reportLoading}>
                    {reportLoading ? 'Gerando…' : 'Gerar relatório'}
                  </button>
                </div>
                {report && !reportLoading && <div className="hs-report-text">{report}</div>}
              </section>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
