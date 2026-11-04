import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import Navbar from '../components/layout/Navbar.jsx'
import ProtoIcon from '../components/layout/ProtoIcon.jsx'
import { analyzerAPI, transactionsAPI, installmentsAPI, goalsAPI } from '../services/api.js'
import { useIsDesktop } from '../hooks/useIsDesktop.js'
import { useHideBalance } from '../hooks/useHideBalance.js'
import { useForcedLightTheme } from '../hooks/useTheme.js'
import { invalidateCache } from '../services/cache.js'
import { invalidateStories } from '../services/storiesData.js'
import { analyzePurchase, parseNum, PARCELAS } from '../utils/purchaseAnalysis.js'
import { fmt } from '../utils/format.js'

const HIDDEN = '••••'
const EXAMPLES = [['Celular novo', '7.000'], ['Sofá', '3.200'], ['Viagem a Lisboa', '12.000'], ['Carro seminovo', '85.000']]
const MODES = [['pix', 'Pix / débito', 'zap'], ['c1', 'Crédito 1x', 'card'], ['cN', 'Parcelado', 'layers']]
const FIRST = { item: '', price: '', discount: '5', rate: '0', mode: 'cN', parcelas: 10 }
const MAX_PRICE = 99999999

const money = (n) => `R$ ${fmt(Math.round(n * 100) / 100)}`
// data de hoje + n meses, no formato que a API de metas aceita (AAAA-MM-DD)
const inMonths = (n) => {
  const d = new Date()
  d.setMonth(d.getMonth() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Analisador de compras (design "Nancy Desktop", tela 38): a pessoa diz o que quer comprar, o valor e como pensa em pagar; a Nancy
// compara Pix, crédito à vista e parcelado com a sobra mensal, as parcelas atuais e o saldo, e diz o que fazer. Os números dela vêm
// do servidor (GET /api/analyzer/base) e a comparação roda aqui (utils/purchaseAnalysis.js) — é conta, não modelo de IA; por isso a
// resposta é instantânea e não há tela de "analisando" de mentira. O "próximo passo" faz de verdade: registra a compra (saída ou
// parcelamento), abre o chat da Nancy IA com a pergunta pronta ou cria uma meta.
export default function PurchaseAnalyzer() {
  const isDesktop = useIsDesktop()
  useForcedLightTheme()
  const navigate = useNavigate()
  const [hidden] = useHideBalance()
  const [base, setBase] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [form, setForm] = useState(FIRST)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)       // a análise é uma foto do momento em que se clicou em "Analisar"
  const [pending, setPending] = useState(false)    // clicou em Analisar antes de os números chegarem
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  const flash = (msg, ok = true) => {
    clearTimeout(timer.current)
    setToast({ msg, ok })
    timer.current = setTimeout(() => setToast(null), 4000)
  }

  const load = useCallback(() => {
    setStatus('loading')
    return analyzerAPI.base()
      .then(r => { setBase(r.data); setStatus('ready'); return r.data })
      .catch(() => { setStatus('error'); return null })
  }, [])
  useEffect(() => { if (isDesktop) load() }, [isDesktop, load])

  const set = (k) => (e) => { setForm(f => ({ ...f, [k]: e.target.value })); setError('') }
  const pick = (patch) => { setForm(f => ({ ...f, ...patch })); setError('') }

  const run = useCallback((b, f) => {
    const price = parseNum(f.price)
    if (!(price > 0)) { setError('Informe o valor da compra.'); return }
    if (price > MAX_PRICE) { setError('O valor máximo é R$ 99.999.999,00.'); return }
    if (!(b.income > 0)) { setError('Informe seu salário em Finanças para a Nancy analisar.'); return }
    setError('')
    setResult({ ...analyzePurchase(b, f), item: f.item.trim(), input: f })
  }, [])

  // se clicou antes de os números chegarem, a análise sai assim que chegarem
  useEffect(() => { if (pending && status === 'ready' && base) { setPending(false); run(base, form) } }, [pending, status, base, form, run])
  useEffect(() => { if (pending && status === 'error') setPending(false) }, [pending, status])

  const analyze = () => {
    if (!(parseNum(form.price) > 0)) { setError('Informe o valor da compra.'); return }
    if (status === 'ready' && base) run(base, form)
    else if (status === 'loading') setPending(true)
    else setError('Não foi possível carregar seus números agora. Tente de novo.')
  }

  const name = (result?.item) || 'Compra'
  const registerPurchase = async () => {
    if (!result || busy) return
    setBusy(true)
    try {
      if (!result.rec) {
        await goalsAPI.create({ title: name, targetAmount: result.price, deadline: inMonths(result.months) })
        navigate('/goals')
        return
      }
      if (result.rec.n === 1) {
        await transactionsAPI.create({ description: name, amount: result.rec.pv, type: 'expense', category: 'shopping' })
        invalidateCache('dashboard'); invalidateStories()
        window.dispatchEvent(new CustomEvent('budget-updated'))
        flash('Compra registrada no Extrato.')
      } else {
        await installmentsAPI.create({ name, amount: result.rec.pv, totalInstallments: result.rec.n })
        invalidateCache('dashboard'); invalidateStories()
        flash(`${name} em ${result.rec.n}x adicionada às parcelas.`)
      }
      load() // saldo e parcelas mudaram: a próxima análise parte dos números novos (a atual segue na tela)
    } catch (err) {
      flash(err.response?.data?.error || 'Não foi possível registrar agora. Tente de novo.', false)
    } finally {
      setBusy(false)
    }
  }
  const askNancy = () => {
    window.dispatchEvent(new CustomEvent('nancy:open-agent-chat', { detail: { message: `Vale a pena comprar ${result?.item || 'isso'} de ${money(result.price)}?` } }))
  }
  const createGoal = async () => {
    if (!result || busy) return
    setBusy(true)
    try {
      await goalsAPI.create({ title: result.item || 'Compra planejada', targetAmount: result.price, deadline: inMonths(Math.max(1, result.months)) })
      navigate('/goals')
    } catch (err) {
      flash(err.response?.data?.error || 'Não foi possível criar a meta agora. Tente de novo.', false)
    } finally {
      setBusy(false)
    }
  }

  if (!isDesktop) return <Navigate to="/dashboard" replace />

  const v = (n, suffix = '') => (hidden ? HIDDEN : `${money(n)}${suffix}`)
  const rows = base ? [
    ['Renda mensal', v(base.income)], ['Contas fixas', v(base.fixedTotal)], ['Parcelas atuais', v(base.installmentsMonthly, '/mês')],
    ['Sobra média', v(base.leftover, '/mês')], ['Saldo disponível', v(base.balance)],
  ] : []
  const loadingResult = pending && status === 'loading'

  return (
    <>
      <Navbar />
      {toast && <div className={`toast toast-top ${toast.ok ? 'tok' : 'terr'}`} role="status">{toast.msg}</div>}
      <div className="pwnav ndh-pwnav fade-in">
        <div className="ndz-page">
          <section className="ndz-form" aria-label="O que você quer comprar?">
            <div className="ndz-head">
              <span className="ndz-ico"><ProtoIcon name="card" size={20} /></span>
              <div className="ndz-head-text">
                <h2 className="ndz-title">O que você quer comprar?</h2>
                <p className="ndz-sub">A Nancy cruza o valor com suas contas, parcelas e metas.</p>
              </div>
            </div>

            <label className="ndz-label" htmlFor="ndz-item">Produto</label>
            <input id="ndz-item" className="ndz-input" value={form.item} onChange={set('item')} placeholder="Ex.: Notebook novo" maxLength={60} />

            <label className="ndz-label" htmlFor="ndz-price">Valor</label>
            <div className="ndz-price">
              <span className="ndz-cur">R$</span>
              <input id="ndz-price" value={form.price} onChange={set('price')} placeholder="0,00" inputMode="decimal" onKeyDown={e => { if (e.key === 'Enter') analyze() }} />
            </div>

            <div className="ndz-chips">
              {EXAMPLES.map(([t, p]) => (
                <button key={t} type="button" className="ndz-chip" onClick={() => pick({ item: t, price: p })}>{`${t} · R$ ${p}`}</button>
              ))}
            </div>

            <span className="ndz-label" id="ndz-mode-l">Como você pensa em pagar?</span>
            <div className="ndz-modes" role="group" aria-labelledby="ndz-mode-l">
              {MODES.map(([k, label, icon]) => (
                <button key={k} type="button" className={`ndz-mode${form.mode === k ? ' on' : ''}`} aria-pressed={form.mode === k} onClick={() => pick({ mode: k })}>
                  <ProtoIcon name={icon} size={17} /><span>{label}</span>
                </button>
              ))}
            </div>

            {form.mode === 'cN' && (
              <div className="ndz-parc" role="group" aria-label="Em quantas vezes?">
                <span className="ndz-label">Em quantas vezes?</span>
                {PARCELAS.map(n => (
                  <button key={n} type="button" className={`ndz-n${form.parcelas === n ? ' on' : ''}`} aria-pressed={form.parcelas === n} onClick={() => pick({ parcelas: n })}>{n}x</button>
                ))}
              </div>
            )}

            <div className="ndz-two">
              <div className="ndz-field">
                <label className="ndz-label" htmlFor="ndz-desc">Desconto no Pix (%)</label>
                <input id="ndz-desc" className="ndz-input" value={form.discount} onChange={set('discount')} inputMode="decimal" />
              </div>
              <div className="ndz-field">
                <label className="ndz-label" htmlFor="ndz-rate">Juros do parcelado (% a.m.)</label>
                <input id="ndz-rate" className="ndz-input" value={form.rate} onChange={set('rate')} inputMode="decimal" />
              </div>
            </div>

            {error && (
              <p className="ndz-err" role="alert">
                {error}
                {error.startsWith('Informe seu salário') && <> <button type="button" className="ndz-link" onClick={() => navigate('/finance')}>Ir para Finanças</button></>}
              </p>
            )}
            <button type="button" className="ndz-go" onClick={analyze}><ProtoIcon name="spark" size={18} />Analisar com a Nancy</button>

            <div className="ndz-base" aria-label="A Nancy está usando">
              <span className="ndz-base-h">A NANCY ESTÁ USANDO</span>
              {status === 'error' ? (
                <span className="ndz-base-err">Não foi possível carregar seus números. <button type="button" className="ndz-link" onClick={load}>Tentar de novo</button></span>
              ) : status === 'loading' ? (
                <span className="ndz-base-err">Carregando…</span>
              ) : rows.map(([l, x]) => (
                <div key={l} className="ndz-base-row"><span>{l}</span><span className="ndz-mono">{x}</span></div>
              ))}
              {status === 'ready' && base && !base.hasHistory && (
                <span className="ndz-base-note">Ainda sem meses fechados: o gasto variável é o deste mês.</span>
              )}
            </div>
          </section>

          <div className="ndz-out">
            {loadingResult ? (
              <section className="ndz-wait" aria-live="polite">
                <span className="ndz-dots" aria-hidden="true"><i /><i /><i /></span>
                <h2 className="ndz-wait-t">Nancy está analisando suas contas…</h2>
                <p className="ndz-wait-s">Cruzando contas fixas, parcelas, gastos variáveis e metas.</p>
              </section>
            ) : !result ? (
              <section className="ndz-empty">
                <span className="ndz-empty-glow" aria-hidden="true" />
                <span className="ndz-empty-k">ANALISADOR DE COMPRAS</span>
                <h2 className="ndz-empty-t">Pergunte antes de passar o cartão.</h2>
                <p className="ndz-empty-s">À vista, parcelado ou melhor esperar? A Nancy compara cada opção com a sua sobra mensal, suas parcelas atuais e sua reserva.</p>
              </section>
            ) : (
              <>
                <section className={`ndz-verdict tone-${result.verdict.tone}`} aria-label="Veredito da Nancy">
                  <div className="ndz-verdict-text">
                    <span className="ndz-verdict-k"><ProtoIcon name="spark" size={14} />{`VEREDITO DA NANCY · ${(result.item || 'Sua compra').toUpperCase()}`}</span>
                    <h2 className="ndz-verdict-t">{result.verdict.title}</h2>
                    <p className="ndz-verdict-s">{result.verdict.sub}</p>
                  </div>
                  <div className="ndz-score">
                    <span className="ndz-score-l">Saúde financeira</span>
                    <span className="ndz-score-n">{result.verdict.score}</span>
                    <span className="ndz-score-d">{result.verdict.delta}</span>
                  </div>
                </section>

                <div className="ndz-two-col">
                  <section className="ndz-card" aria-label="Por que essa resposta">
                    <h2 className="ndz-card-t">Por que essa resposta</h2>
                    {result.reasons.map((r, i) => (
                      <div key={i} className="ndz-reason">
                        <span className={`ndz-reason-i ${r.ok ? 'ok' : 'warn'}`}><ProtoIcon name={r.ok ? 'check' : 'alert'} size={13} /></span>
                        <span className="ndz-reason-t">{r.text}</span>
                      </div>
                    ))}
                  </section>
                  <section className="ndz-card" aria-label="Próximo passo">
                    <h2 className="ndz-card-t">Próximo passo</h2>
                    <button type="button" className="ndz-primary" onClick={registerPurchase} disabled={busy}><ProtoIcon name="check" size={16} />{result.registerLabel}</button>
                    <button type="button" className="ndz-secondary" onClick={askNancy}><ProtoIcon name="mic" size={16} />Perguntar mais à Nancy</button>
                    <button type="button" className="ndz-secondary" onClick={createGoal} disabled={busy}><ProtoIcon name="target" size={16} />Criar meta para comprar depois</button>
                  </section>
                </div>

                <section className="ndz-card ndz-table" aria-label="Comparando as formas de pagar">
                  <h2 className="ndz-card-t">Comparando as formas de pagar</h2>
                  <div className="ndz-tr head" aria-hidden="true"><span>FORMA</span><span>PARCELA</span><span>DA SOBRA</span><span>TOTAL PAGO</span><span>SAÚDE</span><span /></div>
                  {result.options.map(o => (
                    <div key={o.k} className={`ndz-tr row ${o.tone}`}>
                      <span className="ndz-forma">{o.label}</span>
                      <span className="ndz-mono ndz-pv">{money(o.pv)}</span>
                      <span className={`ndz-mono ndz-pct${o.pct > 0.4 ? ' high' : ''}`}>{Math.round(o.pct * 100)}%</span>
                      <span className="ndz-mono ndz-total">{money(o.total)}</span>
                      <span className="ndz-mono ndz-sc">{o.score}</span>
                      <span className={`ndz-tag ${o.tone}`}>{o.tag}</span>
                    </div>
                  ))}
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
