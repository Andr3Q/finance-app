import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { transactionsAPI, budgetAPI } from '../services/api.js'
import { getCache, setCache, invalidateCache } from '../services/cache.js'
import { useUser } from '../hooks/useUser.js'
import { useForcedLightTheme } from '../hooks/useTheme.js'
import Navbar from '../components/layout/Navbar.jsx'
import CurrencyInput from '../components/ui/CurrencyInput.jsx'
import { CATEGORY_LABELS } from '../constants/index.js'
import { fmt } from '../utils/format.js'
import { LIMIT_CATEGORIES, WARN_PCT, spentByCategory, limitStatus } from '../utils/categoryLimits.js'

const HIDDEN = 'R$ ••••'
// O design mostra 4 categorias nos chips; as outras 4 ficam atrás de "Mais" (e abertas sozinhas quando já têm teto)
const MAIN_CATEGORIES = LIMIT_CATEGORIES.slice(0, 4)
const MORE_CATEGORIES = LIMIT_CATEGORIES.slice(4)
const readHidden = () => { try { return localStorage.getItem('hide-balance') === '1' } catch { return false } }

const Svg = ({ size = 16, sw = 2, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
)
const BackIcon = () => <Svg size={17} sw={2.4}><polyline points="15 18 9 12 15 6"/></Svg>
const ScaleGlyph = () => (
  <Svg size={22} sw={1.9}>
    <path d="M12 3v18.5"/><path d="M3 8.5h18"/>
    <path d="M4.8 9L1.6 14.8a3.3 3.3 0 006.4 0z"/><path d="M19.2 9L16 14.8a3.3 3.3 0 006.4 0z"/>
  </Svg>
)
// Um ícone por categoria (desenhados como os do design: Alimentação, Transporte e Shopping)
const CAT_ICONS = {
  food:      <><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></>,
  transport: <><path d="M7.5 5h9a2 2 0 011.9 1.4L20.5 11v5a1 1 0 01-1 1h-15a1 1 0 01-1-1v-5l2.1-4.6A2 2 0 017.5 5z"/><path d="M7 17v2.5"/><path d="M17 17v2.5"/></>,
  shopping:  <><path d="M4.5 8h15l-1 11.5a2 2 0 01-2 1.8h-9a2 2 0 01-2-1.8z"/><path d="M8.5 8V6.5a3.5 3.5 0 017 0V8"/></>,
  health:    <path d="M12 20.5s-8-4.6-8-10.2A4.3 4.3 0 018 6c1.7 0 3.2.9 4 2.3C12.8 6.9 14.3 6 16 6a4.3 4.3 0 014 4.3c0 5.6-8 10.2-8 10.2z"/>,
  leisure:   <><path d="M3 9a3 3 0 010 6v2a2 2 0 002 2h14a2 2 0 002-2v-2a3 3 0 010-6V7a2 2 0 00-2-2H5a2 2 0 00-2 2z"/><path d="M14 5v2"/><path d="M14 11v2"/><path d="M14 17v2"/></>,
  education: <><path d="M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/><path d="M22 10v6"/></>,
  home:      <path d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z"/>,
  other:     <><rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/></>,
}

// Limites por categoria (Nancy 2): cada categoria com teto mostra quanto do mês já foi usado
// (verde até 80%, amarelo de 80% pra cima, vermelho quando estoura) e "Novo limite" cria ou
// atualiza o teto de qualquer categoria. Gasto e tetos vêm do mesmo resumo do Início, então batem
// com os avisos das Notificações. Recurso Pro/Elite.
export default function Limits() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useUser()
  useForcedLightTheme() // tela desenhada só no claro (design Nancy 2)
  const isPro = user?.plan === 'pro' || user?.plan === 'elite'

  const [data,    setData]    = useState(() => getCache('dashboard') || null)
  const [loading, setLoading] = useState(() => isPro && !getCache('dashboard'))
  const [failed,  setFailed]  = useState(false)
  const [hidden]              = useState(readHidden)
  const [cat,     setCat]     = useState(null)   // categoria escolhida em "Novo limite"
  const [amount,  setAmount]  = useState('')
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState(null)   // { text, ok }
  const [more,    setMore]    = useState(false)

  const load = useCallback(async () => {
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
  }, [])

  useEffect(() => { if (isPro) load(); else setLoading(false) }, [isPro, load])

  const limits = useMemo(() => (Array.isArray(data?.limits) ? data.limits : []), [data])
  const spent  = useMemo(() => spentByCategory(Array.isArray(data?.transactions) ? data.transactions : []), [data])

  const rows = useMemo(() => {
    const order = (c) => { const i = LIMIT_CATEGORIES.indexOf(c); return i === -1 ? 99 : i }
    return limits
      .filter(l => Number(l.amount) > 0)
      .map(l => ({ category: l.category, label: CATEGORY_LABELS[l.category] || l.category, limit: Number(l.amount), spent: spent[l.category] || 0 }))
      .sort((a, b) => order(a.category) - order(b.category))
      .map(r => ({ ...r, ...limitStatus(r.limit, r.spent) }))
  }, [limits, spent])

  // Escolha inicial: a primeira categoria que ainda não tem teto
  const selected = cat || LIMIT_CATEGORIES.find(c => !limits.some(l => l.category === c)) || LIMIT_CATEGORIES[0]

  const forcedMore = limits.some(l => MORE_CATEGORIES.includes(l.category)) || (!cat && MORE_CATEGORIES.includes(selected))
  const chips = more || forcedMore ? LIMIT_CATEGORIES : MAIN_CATEGORIES

  const pick = (c) => {
    setCat(c); setMsg(null)
    const current = limits.find(l => l.category === c)
    setAmount(current ? Number(current.amount) : '')   // categoria que já tem teto abre pra editar
  }

  const changed = async () => {
    invalidateCache('dashboard')
    window.dispatchEvent(new CustomEvent('budget-updated'))
    await load()
  }

  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate('/goals'))
  const money = (n) => (hidden ? HIDDEN : `R$ ${fmt(n)}`)

  const save = async (e) => {
    e.preventDefault()
    if (!(Number(amount) > 0)) { setMsg({ text: 'Informe o teto de gasto.', ok: false }); return }
    setSaving(true); setMsg(null)
    try {
      await budgetAPI.setLimit({ category: selected, amount })
      setAmount(''); setCat(null)
      setMsg({ text: 'Limite salvo!', ok: true })
      await changed()
    } catch (err) {
      setMsg({ text: err.response?.data?.error || 'Erro ao salvar limite.', ok: false })
    } finally {
      setSaving(false)
    }
  }

  const remove = async (row) => {
    setMsg(null)
    try {
      await budgetAPI.removeLimit(row.category)
      await changed()
    } catch {
      setMsg({ text: 'Erro ao remover limite.', ok: false })
    }
  }

  const note = (r) => {
    if (r.state === 'over') return { cls: 'over', text: r.over > 0 ? `Passou ${money(r.over)} do limite` : 'Limite atingido' }
    if (r.state === 'warn') return { cls: 'warn', text: `Atenção: ${r.used}% usado` }
    return { cls: '', text: `${money(r.left)} disponível` }
  }

  return (
    <>
      <Navbar />
      <div className="pwnav fin-pwnav fade-in">
        <div className="fin-page">
          <header className="fin-hero">
            <button type="button" className="fin-back" onClick={goBack} aria-label="Voltar"><BackIcon /></button>
            <div className="fin-hero-text">
              <h1 className="fin-hero-title">Limites</h1>
              <p className="fin-hero-sub">Teto de gasto por categoria</p>
            </div>
          </header>

          <div className="fin-body">
            {!isPro ? (
              <section className="fin-card lm-state">
                <h2 className="fin-title">Recurso Pro</h2>
                <p className="fin-sub">Defina um teto de gasto para cada categoria e a Nancy avisa quando você chegar perto.</p>
                <button type="button" className="fin-btn lm-state-btn" onClick={() => navigate('/planos')}>Ver planos</button>
              </section>
            ) : loading ? (
              <div className="lm-state"><div className="dsb-loader"><div className="dsb-loader-ring" /></div></div>
            ) : failed && !data ? (
              <section className="fin-card lm-state">
                <h2 className="fin-title">Não foi possível carregar</h2>
                <p className="fin-sub">Confira sua conexão e tente de novo.</p>
                <button type="button" className="fin-btn lm-state-btn" onClick={() => { setLoading(true); load() }}>Tentar de novo</button>
              </section>
            ) : (
              <>
                <section className="fin-card lm-card" aria-label="Limites por categoria">
                  <div className="fin-head">
                    <span className="fin-ico"><ScaleGlyph /></span>
                    <div className="fin-head-text">
                      <h2 className="fin-title">Limites por categoria</h2>
                      <p className="fin-sub">A Nancy avisa quando passar de {WARN_PCT}%</p>
                    </div>
                  </div>
                  {rows.length === 0 ? (
                    <p className="lm-empty">Nenhum limite definido. Escolha uma categoria abaixo e informe o teto.</p>
                  ) : (
                    <ul className="lm-list">
                      {rows.map(r => {
                        const n = note(r)
                        return (
                          <li key={r.category} className="lm-item">
                            <div className="lm-top">
                              <span className="lm-cat"><Svg size={16} sw={2}>{CAT_ICONS[r.category] || CAT_ICONS.other}</Svg></span>
                              <span className="lm-name">{r.label}</span>
                              <span className="lm-amt">{money(r.spent)} / {money(r.limit)}</span>
                              <button type="button" className="lm-del" aria-label={`Remover limite de ${r.label}`} onClick={() => remove(r)}>
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true"><line x1="2" y1="2" x2="12" y2="12"/><line x1="12" y1="2" x2="2" y2="12"/></svg>
                              </button>
                            </div>
                            <div className="lm-bar" role="progressbar" aria-label={`${r.label}: ${r.used}% do limite usado`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, r.used)}>
                              <span className={`lm-fill ${r.state}`} style={{ width: `${Math.min(100, r.pct)}%` }} />
                            </div>
                            <p className={`lm-note ${n.cls}`}>{n.text}</p>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </section>

                <section className="fin-card lm-new" aria-label="Novo limite">
                  <h2 className="lm-new-title">Novo limite</h2>
                  <div className="lm-chips" role="radiogroup" aria-label="Categoria">
                    {chips.map(c => (
                      <button key={c} type="button" role="radio" aria-checked={selected === c} className={`lm-chip${selected === c ? ' on' : ''}`} onClick={() => pick(c)}>
                        {CATEGORY_LABELS[c]}
                      </button>
                    ))}
                    {!forcedMore && (
                      <button type="button" className="lm-chip more" aria-expanded={more} onClick={() => setMore(m => !m)}>{more ? 'Menos' : 'Mais'}</button>
                    )}
                  </div>
                  <form className="lm-form" onSubmit={save}>
                    <CurrencyInput className="lm-inp" placeholder="Teto (R$)" value={amount} onChange={v => { setAmount(v); setMsg(null) }} />
                    <button type="submit" className="fin-btn lm-save" disabled={saving}>Salvar</button>
                  </form>
                  {msg && <p className={`lm-msg ${msg.ok ? 'ok' : 'err'}`} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
