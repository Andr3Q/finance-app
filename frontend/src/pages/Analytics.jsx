import { useState, useEffect } from 'react'
import Navbar from '../components/layout/Navbar.jsx'
import GradCard from '../components/ui/GradCard.jsx'
import { transactionsAPI, agentAPI } from '../services/api.js'

const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const MONTHS_FULL  = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const CATEGORY_LABELS = {
  food:'Alimentação', shopping:'Shopping', transport:'Transporte',
  health:'Saúde', leisure:'Lazer', education:'Educação',
  home:'Casa', income:'Entrada Extra', other:'Outros',
}

const fmt = (n) => n?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) ?? '0,00'

// ── Gráfico de barras SVG ────────────────────────────────
function BarChart({ data }) {
  const maxVal = Math.max(...data.flatMap(d => [d.income, d.expenses]), 1)
  const W = 100 / data.length
  const barH = 100

  return (
    <div className="anl-chart-wrap">
      <div className="anl-chart-legend">
        <span className="anl-legend-dot" style={{ background: '#4ac46e' }} /> Entradas
        <span className="anl-legend-dot" style={{ background: '#ff6b6b', marginLeft: 14 }} /> Saídas
      </div>
      <div className="anl-chart-body">
        <svg viewBox={`0 0 ${data.length * 52} ${barH + 28}`} className="anl-chart-svg" preserveAspectRatio="none">
          {data.map((d, i) => {
            const incH  = (d.income   / maxVal) * barH
            const expH  = (d.expenses / maxVal) * barH
            const x     = i * 52
            return (
              <g key={i}>
                {/* Entrada */}
                <rect x={x + 4}  y={barH - incH} width={20} height={Math.max(incH, 1)}  rx="3" fill="#4ac46e" opacity=".85" />
                {/* Saída */}
                <rect x={x + 27} y={barH - expH} width={20} height={Math.max(expH, 1)} rx="3" fill="#ff6b6b" opacity=".85" />
                {/* Label mês */}
                <text x={x + 26} y={barH + 18} textAnchor="middle" className="anl-chart-label">
                  {MONTHS_SHORT[d.month - 1]}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      {/* Valores abaixo */}
      <div className="anl-chart-vals">
        {data.map((d, i) => (
          <div key={i} className="anl-chart-col">
            <span style={{ color: '#4ac46e' }}>+{fmt(d.income)}</span>
            <span style={{ color: '#ff6b6b' }}>-{fmt(d.expenses)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Detector de assinaturas ──────────────────────────────
function SubscriptionsList({ data, loading }) {
  if (loading) return (
    <div className="anl-loading">
      <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
    </div>
  )
  if (!data.length) return (
    <div className="anl-empty">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="1.5" strokeLinecap="round">
        <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/>
        <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/>
      </svg>
      <span>Nenhuma assinatura detectada</span>
      <span className="anl-empty-sub">Precisamos de pelo menos 2 meses de transações similares</span>
    </div>
  )
  const total = data.reduce((s, s2) => s + s2.amount, 0)
  return (
    <div className="anl-subs-list">
      {data.map((s, i) => (
        <div key={i} className="anl-sub-item">
          <div className="anl-sub-ico">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#7b2fff" strokeWidth="2" strokeLinecap="round">
              <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/>
              <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/>
            </svg>
          </div>
          <div className="anl-sub-info">
            <span className="anl-sub-name">{s.description}</span>
            <span className="anl-sub-cat">{CATEGORY_LABELS[s.category] || s.category} · {s.months}x detectado</span>
          </div>
          <span className="anl-sub-amt">R$ {fmt(s.amount)}/mês</span>
        </div>
      ))}
      <div className="anl-subs-total">
        <span>Total em assinaturas</span>
        <span style={{ color: '#ff6b6b', fontWeight: 700 }}>R$ {fmt(total)}/mês</span>
      </div>
    </div>
  )
}

// ── Página principal ─────────────────────────────────────
export default function Analytics() {
  const [history,       setHistory]       = useState([])
  const [subs,          setSubs]          = useState([])
  const [loadingHist,   setLoadingHist]   = useState(true)
  const [loadingSubs,   setLoadingSubs]   = useState(true)
  const [report,        setReport]        = useState(null)
  const [reportLoading, setReportLoading] = useState(false)
  const now = new Date()
  const [reportMonth,   setReportMonth]   = useState(now.getMonth() + 1)
  const [reportYear,    setReportYear]    = useState(now.getFullYear())

  const generateReport = async () => {
    setReportLoading(true)
    setReport(null)
    try {
      const { data } = await agentAPI.monthlyReport(reportMonth, reportYear)
      setReport(data.report || data.text || '')
    } catch (err) {
      setReport(err.response?.data?.error || 'Erro ao gerar relatório. Tente novamente.')
    } finally {
      setReportLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    transactionsAPI.monthlyHistory(6)
      .then(r => { if (!cancelled) setHistory(r.data) })
      .catch(() => { if (!cancelled) setLoadingHist(false) })
      .finally(() => { if (!cancelled) setLoadingHist(false) })

    transactionsAPI.subscriptions()
      .then(r => { if (!cancelled) setSubs(r.data) })
      .catch(() => { if (!cancelled) setLoadingSubs(false) })
      .finally(() => { if (!cancelled) setLoadingSubs(false) })

    return () => { cancelled = true }
  }, [])

  return (
    <>
      <Navbar />
      <div className="pwnav fade-in">
        <div className="dsb-content">
          <div className="anl-page">

            {/* ── Histórico de Gastos ── */}
            <div className="cfg-sec-title">Histórico de gastos</div>
            <GradCard
              iconBg="rgba(79,142,247,.1)" iconBorder="rgba(79,142,247,.25)"
              icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4f8ef7" strokeWidth="2" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>}
              title="Evolução mensal"
              sub="Entradas e saídas dos últimos 6 meses"
            >
              {loadingHist ? (
                <div className="anl-loading"><span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /></div>
              ) : history.length > 0 ? (
                <BarChart data={history} />
              ) : (
                <div className="anl-empty"><span>Sem dados de histórico ainda</span></div>
              )}
            </GradCard>

            {/* ── Detector de Assinaturas ── */}
            <div className="cfg-sec-title">Detector de assinaturas</div>
            <GradCard
              iconBg="rgba(123,47,255,.1)" iconBorder="rgba(123,47,255,.25)"
              icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7b2fff" strokeWidth="2" strokeLinecap="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>}
              title="Gastos recorrentes detectados"
              sub="Transações que se repetem em meses diferentes"
            >
              <SubscriptionsList data={subs} loading={loadingSubs} />
            </GradCard>

            {/* ── Relatório IA ── */}
            <div className="cfg-sec-title">Relatório com IA</div>
            <GradCard
              iconBg="rgba(255,140,66,.1)" iconBorder="rgba(255,140,66,.25)"
              icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ff8c42" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>}
              title="Relatório mensal IA"
              sub="Análise completa gerada por inteligência artificial"
            >
              <div className="anl-report-controls">
                <select className="anl-report-select" value={reportMonth} onChange={e => setReportMonth(+e.target.value)}>
                  {MONTHS_FULL.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
                <select className="anl-report-select" value={reportYear} onChange={e => setReportYear(+e.target.value)}>
                  {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <button className="anl-report-btn" onClick={generateReport} disabled={reportLoading}>
                  {reportLoading
                    ? <><span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />Gerando...</>
                    : 'Gerar relatório'
                  }
                </button>
              </div>
              {reportLoading && (
                <div className="anl-loading">
                  <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                </div>
              )}
              {report && !reportLoading && (
                <div className="anl-report-text">{report}</div>
              )}
            </GradCard>

          </div>
        </div>
      </div>
    </>
  )
}
