import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/layout/Navbar.jsx'
import ProtoIcon from '../components/layout/ProtoIcon.jsx'
import { sheetAPI, budgetAPI } from '../services/api.js'
import { saveUser } from '../hooks/useUser.js'
import { useHideBalance } from '../hooks/useHideBalance.js'
import { useForcedLightTheme } from '../hooks/useTheme.js'
import { invalidateCache } from '../services/cache.js'
import { invalidateStories } from '../services/storiesData.js'
import { isAndroidApp } from '../utils/androidApp.js'

const FORECAST_KEY = 'nancy-sheet-forecast'
const HIDDEN = '••••'
const MAX_AMOUNT = 99999999
const SECTION_COLOR = { income: '#087A52', fixed: '#1546FF', installments: '#6A4BFF', variable: '#0A2A9E' }
const FRESH_MS = 10 * 60 * 1000

const readForecast = () => { try { return localStorage.getItem(FORECAST_KEY) !== '0' } catch { return true } }
const writeForecast = (on) => { try { localStorage.setItem(FORECAST_KEY, on ? '1' : '0') } catch { /* aba privada: vale só nesta visita */ } }

// valores em reais inteiros, como no design ("16.200"); vazio vira "–" e negativo usa o sinal de menos
const whole = (n) => `${n < 0 ? '−' : ''}${Math.round(Math.abs(n)).toLocaleString('pt-BR')}`
const show = (v, hidden) => (hidden ? HIDDEN : v === null || v === undefined ? '–' : whole(v))
// o campo editável mostra o número cru ("15000"; com centavos de verdade, "380,50")
const raw = (v) => (v === null || v === undefined ? '' : Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ','))

// "1.234,5" → 1234.5; "15.5" → 15.5 (ponto com 1-2 casas é decimal); "15.000" → 15000. NaN se não for número.
function parseMoney(text) {
  const t = String(text).trim().replace(/\s|R\$/g, '')
  if (!t) return NaN
  if (t.includes(',')) return Number(t.replace(/\./g, '').replace(',', '.'))
  if (/^\d+\.\d{1,2}$/.test(t)) return Number(t)
  return Number(t.replace(/\./g, ''))
}

function ago(iso, now) {
  const diff = Math.max(0, now - new Date(iso).getTime())
  if (diff < 60_000) return 'agora'
  if (diff < 3_600_000) return `há ${Math.floor(diff / 60_000)} min`
  if (diff < 86_400_000) return `há ${Math.floor(diff / 3_600_000)} h`
  const d = new Date(iso), today = new Date(now)
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  if (d.getFullYear() === yesterday.getFullYear() && d.getMonth() === yesterday.getMonth() && d.getDate() === yesterday.getDate()) return 'ontem'
  return `${d.getDate()} ${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][d.getMonth()]}`
}

// Planilha IA (design "Nancy Desktop", tela 12): três meses reais, o atual editável e dois de previsão, em quatro seções
// (Receitas, Contas fixas, Parcelas, Variáveis) e o saldo do mês. Cada conta, parcela, entrada e gasto registrado já é uma linha: a
// planilha é montada no servidor (services/sheet.js). A previsão é a média dos meses com movimento mais o que resta das parcelas;
// não há modelo de IA por trás do nome. Editar o mês atual muda o salário ou o valor da conta fixa — as outras linhas vêm dos
// lançamentos e só se leem.
export default function Planilha() {
  useForcedLightTheme()
  const navigate = useNavigate()
  const [hidden] = useHideBalance()
  const [data, setData]       = useState(null)
  const [status, setStatus]   = useState('loading') // loading | ready | error | locked
  const [forecast, setForecast] = useState(readForecast)
  const [toast, setToast]     = useState(null)
  const [fresh, setFresh]     = useState(null)   // linha recém-criada: { id, flash }
  const [localFeed, setLocalFeed] = useState([])
  const [nf, setNf]           = useState({ name: '', val: '' })
  const [nfErr, setNfErr]     = useState('')
  const [busy, setBusy]       = useState(false)
  const [exporting, setExporting] = useState(false)
  const [rev, setRev]       = useState(0) // muda para os campos do mês atual voltarem ao valor de antes (valor inválido ou recusado)
  const [tick, setTick]       = useState(() => Date.now())
  const seq = useRef(0)
  const loadedAt = useRef(0)

  const flash = useCallback((msg, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }, [])

  const load = useCallback(async () => {
    const mine = ++seq.current
    try {
      const res = await sheetAPI.get()
      if (mine !== seq.current) return
      loadedAt.current = Date.now()
      setData(res.data)
      setStatus('ready')
    } catch (err) {
      if (mine !== seq.current) return
      setStatus(err?.response?.status === 403 && err.response?.data?.code === 'plan_required' ? 'locked' : 'error')
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const again = () => load()
    window.addEventListener('budget-updated', again)
    return () => window.removeEventListener('budget-updated', again)
  }, [load])
  // a etiqueta "atualizada ..." acompanha o relógio e a planilha se refaz ao voltar para a aba depois de um minuto
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 30_000)
    const onVisible = () => { if (document.visibilityState === 'visible' && Date.now() - loadedAt.current > 60_000) load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible) }
  }, [load])

  const toggleForecast = () => setForecast(f => { writeForecast(!f); return !f })

  const afterChange = () => { invalidateCache('dashboard'); invalidateStories() }

  const commit = async (row, text) => {
    const cur = data.months.findIndex(m => m.kind === 'current')
    const before = row.values[cur]
    const value = parseMoney(text)
    if (!Number.isFinite(value) || (row.edit.kind === 'budget' ? value <= 0 : value < 0) || value > MAX_AMOUNT) {
      flash(row.edit.kind === 'salary' ? 'Informe um salário válido.' : 'Informe um valor maior que zero.', false)
      setRev(n => n + 1) // o campo volta ao valor de antes
      return
    }
    if (Math.round(value * 100) === Math.round((before ?? 0) * 100)) return
    try {
      if (row.edit.kind === 'salary') {
        await budgetAPI.updateSalary(value)
        try { saveUser({ ...JSON.parse(sessionStorage.getItem('user') || '{}'), salary: value }) } catch { /* sem sessionStorage */ }
      } else {
        await budgetAPI.update(row.edit.id, { amount: value })
      }
      afterChange()
      setFresh({ id: row.id, flash: true, badge: false })
      setTimeout(() => setFresh(f => (f && f.id === row.id ? { ...f, flash: false } : f)), 1400)
      await load()
    } catch (err) {
      flash(err.response?.data?.error || 'Não foi possível salvar o valor.', false)
      setRev(n => n + 1)
    }
  }

  const addFixed = async (e) => {
    e?.preventDefault()
    const name = nf.name.trim()
    const amount = parseMoney(nf.val)
    if (!name) return setNfErr('Informe o nome da conta.')
    if (!Number.isFinite(amount) || amount <= 0) return setNfErr('Informe um valor maior que zero.')
    if (amount > MAX_AMOUNT) return setNfErr('Valor acima do permitido.')
    setNfErr('')
    setBusy(true)
    try {
      const res = await budgetAPI.create({ name, amount })
      afterChange()
      const id = `budget:${res.data.id}`
      setFresh({ id, flash: true, badge: true })
      setTimeout(() => setFresh(f => (f && f.id === id ? { ...f, flash: false } : f)), 1400)
      setLocalFeed(l => [{ text: `${name} adicionada como conta fixa → nova linha em Contas fixas`, at: new Date().toISOString() }, ...l].slice(0, 4))
      setNf({ name: '', val: '' })
      await load()
    } catch (err) {
      setNfErr(err.response?.data?.error || 'Não foi possível adicionar a conta.')
    } finally {
      setBusy(false)
    }
  }

  const exportXlsx = async () => {
    setExporting(true)
    try {
      const res = await sheetAPI.export(forecast)
      const url = URL.createObjectURL(res.data)
      const d = new Date()
      const a = document.createElement('a')
      a.href = url
      a.download = `planilha-nancy-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      flash('Não foi possível exportar a planilha.', false)
    } finally {
      setExporting(false)
    }
  }

  const cols = data ? data.months.map((m, i) => ({ ...m, i })).filter(m => forecast || m.kind !== 'forecast') : []
  const grid = { gridTemplateColumns: `minmax(0, 1.5fr) repeat(${Math.max(cols.length, 1)}, minmax(0, 1fr))` }
  const feed = [...localFeed, ...(data?.feed || [])].slice(0, 4)
  const updated = data?.generatedAt ? ago(data.generatedAt, tick) : 'agora'

  return (
    <>
      <Navbar />
      {toast && <div className={`toast toast-top ${toast.ok ? 'tok' : 'terr'}`} role="status">{toast.msg}</div>}
      <div className="pwnav ndh-pwnav fade-in">
        <div className="ndp-page">
          {status === 'locked' && (
            <div className="ndp-lock">
              <span className="ndp-lock-ico"><ProtoIcon name="grid" size={26} /></span>
              <h2>A Planilha IA faz parte do plano Elite</h2>
              <p>Ela monta sozinha uma planilha com as suas contas, parcelas e gastos, e prevê os próximos meses. Também está no Elite a Nancy IA ilimitada, com texto e áudio.</p>
              {!isAndroidApp() && <button type="button" className="ndp-btn" onClick={() => navigate('/planos')}>Ver planos</button>}
            </div>
          )}

          {status === 'error' && (
            <div className="ndp-lock">
              <h2>Não foi possível montar a planilha</h2>
              <p>Verifique a conexão e tente de novo.</p>
              <button type="button" className="ndp-btn" onClick={() => { setStatus('loading'); load() }}>Tentar de novo</button>
            </div>
          )}

          {status === 'loading' && <div className="ndp-loading"><div className="dsb-loader-ring" style={{ margin: '0 auto' }} /></div>}

          {status === 'ready' && data && (
            <>
              <div className="ndp-bar">
                <span className="ndp-sync"><span className="ndp-dot" />Sincronizada com suas contas · atualizada {updated}</span>
                <label className="ndp-fc">
                  Previsão da IA
                  <button type="button" role="switch" aria-checked={forecast} aria-label="Previsão da IA" className={`ndp-switch${forecast ? ' on' : ''}`} onClick={toggleForecast}><span /></button>
                </label>
                <span className="ndp-spacer" />
                <button type="button" className="ndp-export" onClick={exportXlsx} disabled={exporting}><ProtoIcon name="download" size={18} />Exportar .xlsx</button>
              </div>

              <div className="ndp-grid">
                <div className="ndp-card ndp-table" role="table" aria-label="Planilha de contas por mês">
                  <div className="ndp-scroll">
                    <div className="ndp-inner">
                      <div className="ndp-row ndp-head" style={grid} role="row">
                        <span role="columnheader">CONTA</span>
                        {cols.map(c => (
                          <span key={c.key} role="columnheader" className={`ndp-th ${c.kind}`}>
                            {c.label}{c.kind === 'forecast' && <span className="ndp-spark" aria-label="previsão"><ProtoIcon name="spark" size={10} /></span>}
                          </span>
                        ))}
                      </div>

                      {data.sections.map(s => (
                        <div key={s.id} role="rowgroup">
                          <div className="ndp-row ndp-sec" style={{ ...grid, '--sec': SECTION_COLOR[s.id] }} role="row">
                            <span role="rowheader"><i />{s.label}</span>
                            {cols.map(c => <span key={c.key} role="cell" className={`ndp-cell ${c.kind}`}>{show(s.total[c.i], hidden)}</span>)}
                          </div>
                          {s.rows.map(r => {
                            const isFresh = fresh?.id === r.id
                            return (
                              <div key={r.id} className={`ndp-row ndp-item${isFresh && fresh.flash ? ' flash' : ''}`} style={grid} role="row">
                                <span role="rowheader" className="ndp-name">{r.label}{isFresh && fresh.badge && <em>NOVA</em>}</span>
                                {cols.map(c => {
                                  const v = r.values[c.i]
                                  if (c.kind !== 'current') return <span key={c.key} role="cell" className={`ndp-cell ${c.kind}`}>{show(v, hidden)}</span>
                                  const editable = !!r.edit && !hidden
                                  return (
                                    <span key={c.key} role="cell" className="ndp-cell current">
                                      <input
                                        key={`${r.id}:${v}:${hidden}:${rev}`} className="ndp-cur" defaultValue={hidden ? HIDDEN : raw(v)} readOnly={!editable}
                                        aria-label={`${r.label} em ${c.label}`} inputMode="decimal"
                                        onBlur={editable ? (e) => commit(r, e.target.value) : undefined}
                                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); else if (e.key === 'Escape') { e.currentTarget.value = raw(v); e.currentTarget.blur() } }}
                                      />
                                    </span>
                                  )
                                })}
                              </div>
                            )
                          })}
                        </div>
                      ))}

                      <div className="ndp-row ndp-net" style={grid} role="row">
                        <span role="rowheader">Saldo do mês</span>
                        {cols.map(c => <span key={c.key} role="cell" className={`ndp-cell ${c.kind}`}>{show(data.net[c.i], hidden)}</span>)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="ndp-side">
                  <section className="ndp-card ndp-how">
                    <h2><span><ProtoIcon name="spark" size={20} /></span>Como a Nancy monta</h2>
                    <p>Cada conta, parcela ou gasto que você registra vira uma linha. A previsão usa sua média e as parcelas restantes.</p>
                    {feed.length > 0 ? (
                      <ul className="ndp-feed" aria-live="polite">
                        {feed.map((e, i) => (
                          <li key={`${e.at}:${e.text}`} className={i === 0 && tick - new Date(e.at).getTime() < FRESH_MS ? 'new' : ''}>
                            <i />
                            <div><span>{e.text}</span><small>{ago(e.at, tick)}</small></div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="ndp-feed-empty">Quando você registrar contas, parcelas ou entradas, o que mudou aparece aqui.</p>
                    )}
                  </section>

                  <form className="ndp-card ndp-add" onSubmit={addFixed} noValidate>
                    <h2>Adicionar conta fixa</h2>
                    <input className="ndp-input" value={nf.name} onChange={e => setNf(f => ({ ...f, name: e.target.value }))} placeholder="Ex.: Streaming" aria-label="Nome da conta fixa" maxLength={100} />
                    <input className="ndp-input" value={nf.val} onChange={e => setNf(f => ({ ...f, val: e.target.value }))} placeholder="Valor mensal" aria-label="Valor mensal" inputMode="decimal" />
                    {nfErr && <span className="ndp-err" role="alert">{nfErr}</span>}
                    <button type="submit" className="ndp-btn" disabled={busy}><ProtoIcon name="plus" size={18} />Adicionar e ver na planilha</button>
                  </form>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
