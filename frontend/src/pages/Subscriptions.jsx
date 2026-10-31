import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { transactionsAPI } from '../services/api.js'
import { useUser } from '../hooks/useUser.js'
import { useForcedLightTheme } from '../hooks/useTheme.js'
import Navbar from '../components/layout/Navbar.jsx'
import { fmt } from '../utils/format.js'
import { readCancelFlags, setCancelFlag, subKey } from '../utils/subsCancel.js'

const HIDDEN = 'R$ ••••'
const readHidden = () => { try { return localStorage.getItem('hide-balance') === '1' } catch { return false } }
const DAY_MS = 24 * 60 * 60 * 1000
const STALE_DAYS = 35 // uma assinatura mensal sem cobrança há mais que isso provavelmente já parou

const BackIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
)
const RepeatGlyph = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/>
  </svg>
)
const SparkGlyph = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9z"/>
  </svg>
)

// "há 2 dias" / "hoje" / "ontem" — a última cobrança da assinatura
function sinceLabel(date, now) {
  const d = Math.max(0, Math.floor((now - new Date(date).getTime()) / DAY_MS))
  return { days: d, text: d === 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias` }
}

// Assinaturas (Nancy 2, tela 21): os gastos recorrentes que a Nancy detecta (mesma detecção do slide
// de assinaturas das stories — só o que parece assinatura de verdade; recurso do plano Elite). O
// interruptor liga/desliga o "lembrar de cancelar": desligado, a assinatura passa a aparecer nas
// Notificações como lembrete de cancelamento. O app não sabe se você USA o serviço (só vê as
// cobranças), então a linha mostra há quanto tempo foi a última cobrança, em vermelho quando ela
// parou de vir (mais de 35 dias: provavelmente já foi cancelada).
export default function Subscriptions() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useUser()
  useForcedLightTheme() // tela desenhada só no claro (design Nancy 2)
  const isElite = user?.plan === 'elite'

  const [subs,    setSubs]    = useState([])
  const [loading, setLoading] = useState(isElite)
  const [failed,  setFailed]  = useState(false)
  const [flags,   setFlags]   = useState(() => readCancelFlags())
  const [hidden]              = useState(readHidden)
  const [now]                 = useState(() => Date.now())

  const load = () => {
    setFailed(false)
    return transactionsAPI.subscriptions({ strict: 1 })
      .then(r => setSubs(Array.isArray(r.data) ? r.data : []))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false))
  }
  useEffect(() => { if (isElite) load(); else setLoading(false) }, [isElite]) // eslint-disable-line react-hooks/exhaustive-deps

  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate('/goals'))
  const total = useMemo(() => subs.reduce((s, x) => s + Number(x.amount), 0), [subs])
  const money = (n) => (hidden ? HIDDEN : `R$ ${fmt(n)}`)

  const toggle = (sub) => {
    const key = subKey(sub.description)
    setCancelFlag(sub, !flags[key])
    setFlags(readCancelFlags())
  }

  return (
    <>
      <Navbar />
      <div className="pwnav fin-pwnav fade-in">
        <div className="fin-page">
          <header className="fin-hero">
            <button type="button" className="fin-back" onClick={goBack} aria-label="Voltar"><BackIcon /></button>
            <div className="fin-hero-text">
              <h1 className="fin-hero-title">Assinaturas</h1>
              <p className="fin-hero-sub">Detectadas pela Nancy IA</p>
            </div>
          </header>

          <div className="fin-body">
            {!isElite ? (
              <section className="fin-card sb-state">
                <h2 className="fin-title">Recurso Elite</h2>
                <p className="fin-sub">A Nancy detecta sozinha as assinaturas e gastos recorrentes e lembra você de cancelar as que não usa.</p>
                <button type="button" className="fin-btn sb-btn" onClick={() => navigate('/planos')}>Ver planos</button>
              </section>
            ) : loading ? (
              <div className="sb-state"><div className="dsb-loader"><div className="dsb-loader-ring" /></div></div>
            ) : failed ? (
              <section className="fin-card sb-state">
                <h2 className="fin-title">Não foi possível carregar</h2>
                <p className="fin-sub">Confira sua conexão e tente de novo.</p>
                <button type="button" className="fin-btn sb-btn" onClick={() => { setLoading(true); load() }}>Tentar de novo</button>
              </section>
            ) : subs.length === 0 ? (
              <section className="fin-card sb-state">
                <h2 className="fin-title">Nenhuma assinatura detectada ainda</h2>
                <p className="fin-sub">Precisamos de pelo menos 2 meses de lançamentos parecidos para reconhecer uma assinatura.</p>
              </section>
            ) : (
              <>
                <section className="sb-sum" aria-label="Total das assinaturas">
                  <span className="sb-sum-ico"><SparkGlyph /></span>
                  <div>
                    <span className="sb-sum-lbl">A Nancy detectou</span>
                    <strong className="sb-sum-val">{money(total)}/mês</strong>
                  </div>
                </section>

                <ul className="fin-card sb-list">
                  {subs.map(s => {
                    const key = subKey(s.description)
                    const keep = !flags[key]
                    const since = s.lastDate ? sinceLabel(s.lastDate, now) : null
                    const stale = since && since.days > STALE_DAYS
                    return (
                      <li key={key} className="sb-item">
                        <span className="sb-ico"><RepeatGlyph /></span>
                        <span className="sb-info">
                          <span className="sb-name">{s.description}</span>
                          <span className={`sb-sub${stale ? ' stale' : ''}`}>
                            {money(s.amount)}{since ? ` · cobrada ${since.text}` : ''}
                          </span>
                        </span>
                        <button type="button" role="switch" aria-checked={keep} aria-label={`Manter ${s.description}`}
                          className={`sb-switch${keep ? ' on' : ''}`} onClick={() => toggle(s)}>
                          <span className="sb-knob" />
                        </button>
                      </li>
                    )
                  })}
                </ul>

                <p className="sb-hint">Desative para a Nancy lembrar você de cancelar.</p>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
