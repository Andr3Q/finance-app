import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Navbar from '../components/layout/Navbar.jsx'
import UpgradeModal from '../components/ui/UpgradeModal.jsx'
import { reportsAPI, transactionsAPI } from '../services/api.js'
import { invalidateCache } from '../services/cache.js'
import { useUser } from '../hooks/useUser.js'
import { useForcedLightTheme } from '../hooks/useTheme.js'
import { currentBrasiliaMonthYear } from '../utils/txCache.js'
import { MONTHS } from '../constants/index.js'
import { fmt } from '../utils/format.js'

const HIDDEN = 'R$ ••••'
const readHidden = () => { try { return localStorage.getItem('hide-balance') === '1' } catch { return false } }

const Svg = ({ size = 18, sw = 1.9, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
)
const BackIcon = () => <Svg size={17} sw={2.4}><polyline points="15 18 9 12 15 6"/></Svg>
const ScaleIcon = () => <Svg size={16} sw={1.9}><path d="M12 3v18.5"/><path d="M3 8.5h18"/><path d="M4.8 9L1.6 14.8a3.3 3.3 0 006.4 0z"/><path d="M19.2 9L16 14.8a3.3 3.3 0 006.4 0z"/></Svg>
const DocIcon = () => <Svg size={18}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></Svg>
const DownloadIcon = () => <Svg size={18}><path d="M12 3v12"/><polyline points="7 11 12 16 17 11"/><line x1="5" y1="21" x2="19" y2="21"/></Svg>

// Balanço mensal (Nancy 2, tela 28): o resultado do mês aberto (mesmo cálculo do Extrato e da story "Resumo do mês"),
// o botão que fecha o mês e a lista dos meses já fechados, cada um com o PDF para baixar. Fechar continua sendo
// o mesmo de antes: gera o PDF, manda para o e-mail e arquiva os lançamentos do mês (por isso pede confirmação).
// Fechar e baixar PDF são recursos Pro: no plano grátis os botões abrem o convite.
export default function SettingsMonthlyClose() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useUser()
  useForcedLightTheme() // tela desenhada só no claro (design Nancy 2)
  const isPro = user.plan === 'pro' || user.plan === 'elite'

  const [recap,     setRecap]     = useState(undefined)   // undefined = carregando; null = indisponível
  const [history,   setHistory]   = useState(null)        // null = carregando/indisponível
  const [closing,   setClosing]   = useState(false)
  const [busyKey,   setBusyKey]   = useState(null)        // "mês-ano" do PDF sendo baixado
  const [upgrade,   setUpgrade]   = useState(null)
  const [msg,       setMsg]       = useState('')
  const [msgType,   setMsgType]   = useState('success')
  const [hidden]                  = useState(readHidden)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  const showMsg = (text, type = 'success') => {
    setMsg(text); setMsgType(type)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMsg(''), 5000)
  }

  const load = useCallback(async () => {
    const [r, h] = await Promise.allSettled([transactionsAPI.monthlyRecap(0), reportsAPI.history()])
    setRecap(r.status === 'fulfilled' ? (r.value.data || null) : null)
    setHistory(h.status === 'fulfilled' && Array.isArray(h.value.data) ? h.value.data : null)
  }, [])
  useEffect(() => { load() }, [load])

  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate('/settings'))
  const money = (n) => (hidden ? HIDDEN : `R$ ${fmt(n)}`)
  const signed = (n) => (hidden ? HIDDEN : n > 0 ? `+R$ ${fmt(n)}` : n < 0 ? `−R$ ${fmt(-n)}` : `R$ ${fmt(0)}`)

  const { month, year } = currentBrasiliaMonthYear()
  const known = !!recap && recap.hasData

  const close = async () => {
    if (!isPro) { setUpgrade('O relatório PDF mensal é exclusivo do plano Pro.'); return }
    if (!window.confirm('Isso vai gerar o PDF, enviar para o seu e-mail e zerar os gastos do mês.\n\nDeseja continuar?')) return
    setClosing(true)
    try {
      const res = await reportsAPI.monthlyClose()
      showMsg(res.data.message)
      invalidateCache('dashboard')
      window.dispatchEvent(new CustomEvent('budget-updated'))
      load()
    } catch (err) {
      if (err.response?.data?.limitReached) setUpgrade('O relatório PDF mensal é exclusivo do plano Pro.')
      else showMsg(err.response?.data?.error || 'Erro ao fechar o mês.', 'error')
    } finally {
      setClosing(false)
    }
  }

  const download = async (h) => {
    if (!isPro) { setUpgrade('O relatório PDF mensal é exclusivo do plano Pro.'); return }
    const key = `${h.month}-${h.year}`
    if (busyKey) return
    setBusyKey(key)
    try {
      const res = await reportsAPI.pdf(h.month, h.year)
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `nancy-balanco-${h.year}-${String(h.month).padStart(2, '0')}.pdf`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch {
      showMsg('Não foi possível baixar o relatório. Tente de novo.', 'error')
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <>
      <Navbar />
      {msg && (
        <div className={`toast ${msgType === 'error' ? 'terr' : 'tok'}`} role={msgType === 'error' ? 'alert' : 'status'}
          style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 9001, maxWidth: 'calc(100vw - 32px)', textAlign: 'center' }}>
          {msg}
        </div>
      )}
      <div className="pwnav fin-pwnav fade-in">
        <div className="fin-page">
          <header className="fin-hero">
            <button type="button" className="fin-back" onClick={goBack} aria-label="Voltar"><BackIcon /></button>
            <div className="fin-hero-text">
              <h1 className="fin-hero-title">Balanço mensal</h1>
              <p className="fin-hero-sub">Fechar o mês e gerar relatório</p>
            </div>
          </header>

          <div className="fin-body">
            <section className="bm-card" aria-label="Resultado do mês">
              <div className="bm-label">{MONTHS[month - 1]} {year}</div>
              <div className="bm-value">{known ? signed(recap.saved) : '—'}</div>
              <div className="bm-sub">
                <div className="bm-box"><span className="bm-box-lbl">Entradas</span><span className="bm-box-val in">{money(recap?.totalIncome ?? 0)}</span></div>
                <div className="bm-box"><span className="bm-box-lbl">Saídas</span><span className="bm-box-val">{money(recap?.totalExpenses ?? 0)}</span></div>
              </div>
              <button type="button" className="bm-close" onClick={close} disabled={closing}>
                {closing ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Gerando relatório…</> : <><ScaleIcon /> Fechar mês e gerar PDF</>}
              </button>
            </section>

            <section className="fin-card bm-list-card" aria-label="Relatórios anteriores">
              <h2 className="bm-list-title">Relatórios anteriores</h2>
              {history && history.length > 0 ? (
                <ul className="bm-list">
                  {history.map(h => {
                    const label = `${MONTHS[h.month - 1]} ${h.year}`
                    const key = `${h.month}-${h.year}`
                    return (
                      <li key={key} className="bm-row">
                        <span className="bm-doc"><DocIcon /></span>
                        <span className="bm-row-name">{label}</span>
                        <button type="button" className="bm-dl" onClick={() => download(h)} disabled={busyKey === key} aria-label={`Baixar relatório de ${label}`}>
                          {busyKey === key ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <DownloadIcon />}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="bm-empty">{history === null ? 'Não foi possível carregar os relatórios agora.' : 'Nenhum mês fechado ainda. Quando você fechar um mês, o relatório fica aqui para baixar.'}</p>
              )}
            </section>
          </div>
        </div>
      </div>
      {upgrade && <UpgradeModal reason={upgrade} onClose={() => setUpgrade(null)} />}
    </>
  )
}
