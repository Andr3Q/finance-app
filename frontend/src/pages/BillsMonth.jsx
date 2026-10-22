import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import { budgetAPI } from '../services/api.js'
import { invalidateCache } from '../services/cache.js'
import { useForcedLightTheme } from '../hooks/useTheme.js'
import Navbar from '../components/layout/Navbar.jsx'
import { MONTHS } from '../constants/index.js'
import { fmt } from '../utils/format.js'
import { txCacheKey, currentBrasiliaMonthYear } from '../utils/txCache.js'

const BackIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
)
const CheckIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)

const HIDDEN = 'R$ ••••'
const readHidden = () => { try { return localStorage.getItem('hide-balance') === '1' } catch { return false } }

// Contas do mês (Nancy 2, tela 15): as contas fixas deste mês, quais já foram pagas e quanto falta.
// Tocar numa conta pendente a marca como paga (cria a saída no extrato, igual ao "Marcar como paga"
// da tela Finanças) — por isso pede confirmação antes: o app não tem "desmarcar", desfazer é apagar
// o lançamento no Extrato.
export default function BillsMonth() {
  const navigate = useNavigate()
  const location = useLocation()
  useForcedLightTheme() // tela desenhada só no claro (design Nancy 2)

  const [bills,   setBills]   = useState([])
  const [loaded,  setLoaded]  = useState(false)
  const [toast,   setToast]   = useState(null)
  const [confirm, setConfirm] = useState(null)   // conta que está sendo confirmada
  const [paying,  setPaying]  = useState(false)
  const [hidden]              = useState(readHidden)

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  const fetchBills = async () => {
    try {
      const res = await budgetAPI.list()
      setBills(Array.isArray(res.data) ? res.data : [])
    } catch {
      showToast('Erro ao carregar as contas do mês.', false)
    } finally {
      setLoaded(true)
    }
  }
  useEffect(() => { fetchBills() }, [])

  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate('/transactions'))

  // por vencimento (sem dia de vencimento por último), mantendo a ordem original no empate
  const sorted = useMemo(
    () => bills.map((b, i) => ({ b, i })).sort((x, y) => ((x.b.dueDay ?? 99) - (y.b.dueDay ?? 99)) || (x.i - y.i)).map(x => x.b),
    [bills],
  )
  const paidCount    = bills.filter(b => b.paidThisMonth).length
  const pendingCount = bills.length - paidCount
  const total        = bills.reduce((s, b) => s + b.amount, 0)
  const money = (n) => (hidden ? HIDDEN : `R$ ${fmt(n)}`)
  const monthName = MONTHS[new Date().getMonth()].toLowerCase()

  const onTap = (b) => {
    if (!b.paidThisMonth) { setConfirm(b); return }
    showToast(`${b.name} já está paga${b.paidDate ? ` (${new Date(b.paidDate).toLocaleDateString('pt-BR')})` : ''}. Pra desfazer, apague o lançamento no Extrato.`)
  }

  const confirmPay = async () => {
    const b = confirm
    if (!b || paying) return
    setPaying(true)
    try {
      await budgetAPI.pay(b.id)
      setConfirm(null)
      showToast(`${b.name} marcada como paga!`)
      fetchBills()
      const { month, year } = currentBrasiliaMonthYear()
      invalidateCache(txCacheKey(month, year))
      invalidateCache('dashboard')
      window.dispatchEvent(new CustomEvent('budget-updated'))
    } catch (err) {
      setConfirm(null)
      showToast(err.response?.data?.error || 'Erro ao marcar conta como paga.', false)
    } finally {
      setPaying(false)
    }
  }

  return (
    <>
      <Navbar />

      {toast && (
        <div className={`toast ${toast.ok ? 'tok' : 'terr'}`} style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 9001, maxWidth: 'calc(100vw - 32px)', textAlign: 'center' }}>
          {toast.msg}
        </div>
      )}

      <div className="pwnav fin-pwnav fade-in">
        <div className="fin-page">
          <header className="fin-hero">
            <button type="button" className="fin-back" onClick={goBack} aria-label="Voltar"><BackIcon /></button>
            <div className="fin-hero-text">
              <h1 className="fin-hero-title">Contas do mês</h1>
              <p className="fin-hero-sub">Compromissos de {monthName}</p>
            </div>
          </header>

          <div className="fin-body">
            {loaded && bills.length === 0 ? (
              <section className="fin-card cm-empty">
                <h2 className="fin-title">Nenhuma conta fixa cadastrada</h2>
                <p className="fin-sub">Cadastre seu aluguel, internet e outras contas recorrentes para acompanhar o que já foi pago.</p>
                <button type="button" className="fin-btn cm-empty-btn" onClick={() => navigate('/financas')}>Cadastrar contas</button>
              </section>
            ) : (
              <>
                <section className="cm-summary" aria-label="Resumo do mês">
                  <div className="cm-stat">
                    <span className="cm-val">{paidCount}/{bills.length}</span>
                    <span className="cm-lbl">Pagas</span>
                  </div>
                  <div className="cm-stat">
                    <span className="cm-val cm-mono">{money(total)}</span>
                    <span className="cm-lbl">Este mês</span>
                  </div>
                  <div className="cm-stat">
                    <span className="cm-val cm-mint">{pendingCount === 0 ? 'Tudo pago' : `${pendingCount} ${pendingCount === 1 ? 'pendente' : 'pendentes'}`}</span>
                    <span className="cm-lbl">Status</span>
                  </div>
                </section>

                <ul className="fin-card cm-list">
                  {sorted.map(b => (
                    <li key={b.id} className="cm-item">
                      <button type="button" className="cm-row" onClick={() => onTap(b)}
                        aria-label={`${b.name}, ${b.paidThisMonth ? 'paga' : 'pendente'}, ${money(b.amount)}`}>
                        <span className={`cm-check${b.paidThisMonth ? ' on' : ''}`}>{b.paidThisMonth && <CheckIcon />}</span>
                        <span className="cm-info">
                          <span className="cm-name">{b.name}</span>
                          <span className="cm-due">{b.dueDay ? `Vence dia ${b.dueDay}` : 'Sem dia de vencimento'}</span>
                        </span>
                        <span className="cm-right">
                          <span className="cm-amount">{money(b.amount)}</span>
                          <span className={`cm-pill ${b.paidThisMonth ? 'paid' : 'pending'}`}>{b.paidThisMonth ? 'Paga' : 'Pendente'}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>

                <p className="cm-hint">Toque numa conta para marcar como paga.</p>
              </>
            )}
          </div>
        </div>
      </div>

      {confirm && createPortal(
        <div className="gls-modal-overlay" onClick={() => !paying && setConfirm(null)}>
          <div className="gls-modal" role="dialog" aria-label="Marcar como paga" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
            <div className="gls-modal-body" style={{ textAlign: 'center', paddingTop: 22 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--t1)', marginBottom: 8 }}>Marcar como paga?</div>
              <div style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.6 }}>
                {confirm.name} · {money(confirm.amount)}<br />Vai entrar no Extrato como uma saída de hoje.
              </div>
            </div>
            <div className="gls-modal-foot">
              <button className="gls-btn-ghost" onClick={() => setConfirm(null)} disabled={paying}>Cancelar</button>
              <button className="gls-btn-save" onClick={confirmPay} disabled={paying}>{paying ? 'Marcando…' : 'Marcar como paga'}</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
