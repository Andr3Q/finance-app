import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import { budgetAPI } from '../services/api.js'
import { useUser } from '../hooks/useUser.js'
import { useForcedLightTheme } from '../hooks/useTheme.js'
import Navbar from '../components/layout/Navbar.jsx'
import { MONTHS } from '../constants/index.js'
import { readReminders, saveReminders, billSetting, leadLabel, LEAD_OPTIONS, DEFAULT_LEAD } from '../utils/reminders.js'

const BackIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
)
const ClockGlyph = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>
  </svg>
)

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const EMPTY_NEW = { name: '', day: '', month: '', lead: String(DEFAULT_LEAD) }

// Lembretes (Nancy 2, tela 22): avisos de vencimento por conta. Cada conta fixa com dia de vencimento
// vira uma linha com interruptor; tocar na linha escolhe quantos dias antes avisar (padrão 2); dá pra
// criar lembretes avulsos (ex.: IPVA, todo janeiro). Os avisos aparecem nas Notificações. As escolhas
// ficam neste aparelho. Recurso do plano Elite (os outros veem o convite).
export default function Reminders() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useUser()
  useForcedLightTheme() // tela desenhada só no claro (design Nancy 2)
  const isElite = user?.plan === 'elite'

  const [budgets, setBudgets] = useState([])
  const [loading, setLoading] = useState(isElite)
  const [failed,  setFailed]  = useState(false)
  const [state,   setState]   = useState(() => readReminders())
  const [sheet,   setSheet]   = useState(null)    // { kind: 'bill'|'custom', id }
  const [adding,  setAdding]  = useState(false)
  const [form,    setForm]    = useState(EMPTY_NEW)
  const [formErr, setFormErr] = useState('')

  const load = () => {
    setFailed(false)
    return budgetAPI.list()
      .then(r => setBudgets(Array.isArray(r.data) ? r.data : []))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false))
  }
  useEffect(() => { if (isElite) load(); else setLoading(false) }, [isElite]) // eslint-disable-line react-hooks/exhaustive-deps

  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate('/goals'))
  const update = (next) => { setState(next); saveReminders(next) }

  const rows = useMemo(() => {
    const bills = budgets.filter(b => b.dueDay).sort((a, b) => a.dueDay - b.dueDay).map(b => {
      const s = billSetting(state, b.id)
      return { kind: 'bill', id: b.id, name: b.name, on: s.on, lead: s.lead, when: `Dia ${b.dueDay}` }
    })
    const custom = state.custom.map(c => ({
      kind: 'custom', id: c.id, name: c.name, on: c.on, lead: c.lead, when: c.month ? MONTHS[c.month - 1] : `Dia ${c.day}`,
    }))
    return [...bills, ...custom]
  }, [budgets, state])

  const toggle = (row) => {
    if (row.kind === 'bill') update({ ...state, bills: { ...state.bills, [row.id]: { on: !row.on, lead: row.lead } } })
    else update({ ...state, custom: state.custom.map(c => (c.id === row.id ? { ...c, on: !c.on } : c)) })
  }
  const setLead = (row, lead) => {
    if (row.kind === 'bill') update({ ...state, bills: { ...state.bills, [row.id]: { on: row.on, lead } } })
    else update({ ...state, custom: state.custom.map(c => (c.id === row.id ? { ...c, lead } : c)) })
  }
  const remove = (row) => { update({ ...state, custom: state.custom.filter(c => c.id !== row.id) }); setSheet(null) }

  const create = (e) => {
    e.preventDefault()
    const day = parseInt(form.day, 10)
    if (!form.name.trim()) return setFormErr('Dê um nome ao lembrete.')
    if (!(day >= 1 && day <= 31)) return setFormErr('O dia deve ser um número de 1 a 31.')
    update({ ...state, custom: [...state.custom, { id: newId(), name: form.name.trim().slice(0, 60), day, month: form.month ? Number(form.month) : null, lead: Number(form.lead), on: true }] })
    setAdding(false); setForm(EMPTY_NEW); setFormErr('')
  }

  const sheetRow = sheet && rows.find(r => r.kind === sheet.kind && r.id === sheet.id)

  return (
    <>
      <Navbar />
      <div className="pwnav fin-pwnav fade-in">
        <div className="fin-page">
          <header className="fin-hero">
            <button type="button" className="fin-back" onClick={goBack} aria-label="Voltar"><BackIcon /></button>
            <div className="fin-hero-text">
              <h1 className="fin-hero-title">Lembretes</h1>
              <p className="fin-hero-sub">Avisos de vencimento</p>
            </div>
          </header>

          <div className="fin-body">
            {!isElite ? (
              <section className="fin-card rm-state">
                <h2 className="fin-title">Recurso Elite</h2>
                <p className="fin-sub">Escolha de quantos dias antes a Nancy avisa cada conta e crie lembretes avulsos, como o IPVA.</p>
                <button type="button" className="fin-btn rm-btn" onClick={() => navigate('/planos')}>Ver planos</button>
              </section>
            ) : loading ? (
              <div className="rm-state"><div className="dsb-loader"><div className="dsb-loader-ring" /></div></div>
            ) : failed ? (
              <section className="fin-card rm-state">
                <h2 className="fin-title">Não foi possível carregar</h2>
                <p className="fin-sub">Confira sua conexão e tente de novo.</p>
                <button type="button" className="fin-btn rm-btn" onClick={() => { setLoading(true); load() }}>Tentar de novo</button>
              </section>
            ) : (
              <>
                <section className="fin-card rm-card">
                  <h2 className="rm-title">Lembretes de vencimento</h2>
                  {rows.length === 0 ? (
                    <p className="rm-empty">Nenhuma conta com dia de vencimento ainda. Cadastre suas contas fixas ou crie um lembrete avulso.</p>
                  ) : (
                    <ul className="rm-list">
                      {rows.map(r => (
                        <li key={`${r.kind}-${r.id}`} className="rm-item">
                          <button type="button" className="rm-row" onClick={() => setSheet({ kind: r.kind, id: r.id })} aria-label={`Antecedência do lembrete de ${r.name}`}>
                            <span className="rm-ico"><ClockGlyph /></span>
                            <span className="rm-info">
                              <span className="rm-name">{r.name}</span>
                              <span className="rm-sub">{r.when} · {leadLabel(r.lead)}</span>
                            </span>
                          </button>
                          <button type="button" role="switch" aria-checked={r.on} aria-label={`Lembrete de ${r.name}`}
                            className={`sb-switch${r.on ? ' on' : ''}`} onClick={() => toggle(r)}>
                            <span className="sb-knob" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <button type="button" className="rm-add" onClick={() => { setAdding(true); setFormErr('') }}>+ Novo lembrete</button>
              </>
            )}
          </div>
        </div>
      </div>

      {sheetRow && createPortal(
        <div className="gls-modal-overlay" onClick={() => setSheet(null)}>
          <div className="gls-modal" role="dialog" aria-label={`Lembrete de ${sheetRow.name}`} style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
            <div className="gls-modal-head"><span>{sheetRow.name}</span></div>
            <div className="gls-modal-body">
              <p className="rm-sheet-lbl">Avisar</p>
              <div className="rm-leads" role="radiogroup" aria-label="Quantos dias antes avisar">
                {LEAD_OPTIONS.map(n => (
                  <button key={n} type="button" role="radio" aria-checked={sheetRow.lead === n} className={`rm-lead${sheetRow.lead === n ? ' on' : ''}`}
                    onClick={() => setLead(sheetRow, n)}>{leadLabel(n)}</button>
                ))}
              </div>
              {sheetRow.kind === 'custom' && (
                <button type="button" className="gls-remove-link" onClick={() => remove(sheetRow)}>Remover lembrete</button>
              )}
            </div>
            <div className="gls-modal-foot"><button className="gls-btn-save" onClick={() => setSheet(null)}>Pronto</button></div>
          </div>
        </div>,
        document.body
      )}

      {adding && createPortal(
        <div className="gls-modal-overlay" onClick={() => setAdding(false)}>
          <form className="gls-modal" noValidate role="dialog" aria-label="Novo lembrete" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()} onSubmit={create}>
            <div className="gls-modal-head"><span>Novo lembrete</span></div>
            <div className="gls-modal-body">
              <label className="gls-label" htmlFor="rm-name">Nome</label>
              <input id="rm-name" className="gls-input" placeholder="Ex.: IPVA 2027" maxLength={60} autoFocus
                value={form.name} onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setFormErr('') }} />
              <label className="gls-label" htmlFor="rm-day">Dia do vencimento</label>
              <input id="rm-day" className="gls-input" type="number" inputMode="numeric" min="1" max="31" placeholder="1 a 31"
                value={form.day} onChange={e => { setForm(f => ({ ...f, day: e.target.value })); setFormErr('') }} />
              <label className="gls-label" htmlFor="rm-month">Repete</label>
              <select id="rm-month" className="gls-input" value={form.month} onChange={e => setForm(f => ({ ...f, month: e.target.value }))}>
                <option value="">Todo mês</option>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>Todo ano, em {m.toLowerCase()}</option>)}
              </select>
              <label className="gls-label" htmlFor="rm-lead">Avisar</label>
              <select id="rm-lead" className="gls-input" value={form.lead} onChange={e => setForm(f => ({ ...f, lead: e.target.value }))}>
                {LEAD_OPTIONS.map(n => <option key={n} value={n}>{leadLabel(n)}</option>)}
              </select>
              {formErr && <div className="rm-err" role="alert">{formErr}</div>}
            </div>
            <div className="gls-modal-foot">
              <button type="button" className="gls-btn-ghost" onClick={() => setAdding(false)}>Cancelar</button>
              <button type="submit" className="gls-btn-save">Criar lembrete</button>
            </div>
          </form>
        </div>,
        document.body
      )}
    </>
  )
}
