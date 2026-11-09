import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/layout/Navbar.jsx'
import ProtoIcon from '../components/layout/ProtoIcon.jsx'
import { HIDDEN, EXAMPLES, MODES, money } from '../hooks/usePurchaseAnalyzer.js'
import { PARCELAS } from '../utils/purchaseAnalysis.js'

const BackIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
)

// Analisador de compras no celular (design Nancy 2, tela 37). É a mesma conta do desktop (hooks/usePurchaseAnalyzer.js); aqui só muda o visual:
// formulário → (carregando só enquanto os números reais chegam do servidor, sem espera falsa) → resultado, com "Editar" e "Analisar outra compra".
// O cabeçalho e a margem de 18px são os das outras telas internas (fin-*). As cores dos vereditos e das etiquetas estão no CSS (anm-*).
export default function PurchaseAnalyzerMobile({ a }) {
  const navigate = useNavigate()
  const { hidden, base, status, form, error, result, pending, busy, done, toast, load, set, pick, analyze, newPurchase, registerPurchase, askNancy, createGoal } = a
  const pageRef = useRef(null)
  const [editing, setEditing] = useState(false)

  const scrollTop = () => {
    pageRef.current?.closest('.pwnav')?.scrollTo?.(0, 0)
    window.scrollTo?.(0, 0)
  }
  // cada análise nova (objeto novo) mostra o resultado e leva a tela para o topo
  useEffect(() => { setEditing(false); if (result) scrollTop() }, [result])

  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate('/dashboard'))
  const v = (n, suffix = '') => (hidden ? HIDDEN : `${money(n)}${suffix}`)
  const rows = base ? [
    ['Renda mensal', v(base.income)], ['Contas fixas', v(base.fixedTotal)], ['Parcelas atuais', v(base.installmentsMonthly, '/mês')],
    ['Sobra média', v(base.leftover, '/mês')], ['Saldo disponível', v(base.balance)],
  ] : []
  const loadingResult = pending && status === 'loading'
  const showResult = !!result && !editing && !loadingResult
  const showForm = !showResult && !loadingResult

  const modeLabel = (inp) => (inp.mode === 'pix' ? 'Pix / débito' : inp.mode === 'c1' ? 'Crédito 1x' : `Parcelado em ${inp.parcelas}x`)

  return (
    <>
      <Navbar />
      {toast && <div className={`toast toast-top ${toast.ok ? 'tok' : 'terr'}`} role="status">{toast.msg}</div>}
      <div className="pwnav fin-pwnav fade-in">
        <div className="fin-page" ref={pageRef}>
          <header className="fin-hero">
            <button type="button" className="fin-back" onClick={goBack} aria-label="Voltar"><BackIcon /></button>
            <div className="fin-hero-text">
              <h1 className="fin-hero-title">Analisador de compras</h1>
              <p className="fin-hero-sub">A Nancy avalia antes de você comprar</p>
            </div>
          </header>

          <div className="fin-body anm-body">
            {showForm && (
              <>
                <section className="anm-intro" aria-label="Analisador de compras">
                  <span className="anm-glow" aria-hidden="true" />
                  <span className="anm-kicker">ANALISADOR DE COMPRAS</span>
                  <h2 className="anm-intro-t">Pergunte antes de passar o cartão.</h2>
                  <p className="anm-intro-s">À vista, parcelado ou melhor esperar? A Nancy compara cada opção com a sua sobra, suas parcelas e sua reserva.</p>
                </section>

                <section className="anm-card anm-form" aria-label="O que você quer comprar?">
                  <div className="anm-head">
                    <span className="anm-ico"><ProtoIcon name="card" size={20} /></span>
                    <div className="anm-head-text">
                      <h2 className="anm-title">O que você quer comprar?</h2>
                      <p className="anm-sub">A Nancy cruza o valor com suas contas, parcelas e metas.</p>
                    </div>
                  </div>

                  <div className="anm-field">
                    <label className="anm-label" htmlFor="anm-item">Produto</label>
                    <input id="anm-item" className="anm-input" value={form.item} onChange={set('item')} placeholder="Ex.: Notebook novo" maxLength={60} />
                  </div>

                  <div className="anm-field">
                    <label className="anm-label" htmlFor="anm-price">Valor</label>
                    <div className={`anm-price${error && !/^Informe seu salário/.test(error) ? ' err' : ''}`}>
                      <span className="anm-cur">R$</span>
                      <input id="anm-price" value={form.price} onChange={set('price')} placeholder="0,00" inputMode="decimal" onKeyDown={e => { if (e.key === 'Enter') analyze() }} />
                    </div>
                  </div>

                  <div className="anm-ex">
                    {EXAMPLES.map(([t, p]) => (
                      <button key={t} type="button" className="anm-ex-chip" onClick={() => pick({ item: t, price: p })}>{`${t} · R$ ${p}`}</button>
                    ))}
                  </div>

                  <div className="anm-field">
                    <span className="anm-label" id="anm-mode-l">Como você pensa em pagar?</span>
                    <div className="anm-modes" role="group" aria-labelledby="anm-mode-l">
                      {MODES.map(([k, label, icon]) => (
                        <button key={k} type="button" className={`anm-mode${form.mode === k ? ' on' : ''}`} aria-pressed={form.mode === k} onClick={() => pick({ mode: k })}>
                          <ProtoIcon name={icon} size={17} /><span>{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {form.mode === 'cN' && (
                    <div className="anm-field" role="group" aria-label="Em quantas vezes?">
                      <span className="anm-label">Em quantas vezes?</span>
                      <div className="anm-parc">
                        {PARCELAS.map(n => (
                          <button key={n} type="button" className={`anm-n${form.parcelas === n ? ' on' : ''}`} aria-pressed={form.parcelas === n} onClick={() => pick({ parcelas: n })}>{n}x</button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="anm-two">
                    <div className="anm-field">
                      <label className="anm-label" htmlFor="anm-desc">Desconto no Pix (%)</label>
                      <input id="anm-desc" className="anm-input" value={form.discount} onChange={set('discount')} inputMode="decimal" />
                    </div>
                    <div className="anm-field">
                      <label className="anm-label" htmlFor="anm-rate">Juros (% a.m.)</label>
                      <input id="anm-rate" className="anm-input" value={form.rate} onChange={set('rate')} inputMode="decimal" />
                    </div>
                  </div>

                  {error && (
                    <p className="anm-err" role="alert">
                      {error}
                      {error.startsWith('Informe seu salário') && <> <button type="button" className="anm-link" onClick={() => navigate('/finance')}>Ir para Finanças</button></>}
                    </p>
                  )}
                  <button type="button" className="anm-go" onClick={analyze}><ProtoIcon name="spark" size={18} />Analisar com a Nancy</button>
                </section>

                <section className="anm-card anm-base" aria-label="A Nancy está usando">
                  <span className="anm-base-h">A NANCY ESTÁ USANDO</span>
                  {status === 'error' ? (
                    <span className="anm-base-note">Não foi possível carregar seus números. <button type="button" className="anm-link" onClick={load}>Tentar de novo</button></span>
                  ) : status === 'loading' ? (
                    <span className="anm-base-note">Carregando…</span>
                  ) : rows.map(([l, x]) => (
                    <div key={l} className="anm-base-row"><span>{l}</span><span className="anm-mono">{x}</span></div>
                  ))}
                  {status === 'ready' && base && !base.hasHistory && (
                    <span className="anm-base-note">Ainda sem meses fechados: o gasto variável é o deste mês.</span>
                  )}
                </section>
              </>
            )}

            {loadingResult && (
              <section className="anm-card anm-wait" aria-live="polite">
                <span className="anm-dots" aria-hidden="true"><i /><i /><i /></span>
                <h2 className="anm-wait-t">Nancy está analisando suas contas…</h2>
                <p className="anm-wait-s">Cruzando contas fixas, parcelas, gastos variáveis e metas.</p>
              </section>
            )}

            {showResult && (
              <>
                <section className="anm-summary" aria-label="Compra analisada">
                  <span className="anm-summary-ico"><ProtoIcon name="bag" size={20} /></span>
                  <div className="anm-summary-text">
                    <span className="anm-summary-t">{result.item || 'Sua compra'}</span>
                    <span className="anm-summary-s">{`${money(result.price)} · ${modeLabel(result.input)}`}</span>
                  </div>
                  <button type="button" className="anm-edit" onClick={() => { setEditing(true); scrollTop() }}>Editar</button>
                </section>

                <section className={`anm-verdict tone-${result.verdict.tone}`} aria-label="Veredito da Nancy">
                  <span className="anm-verdict-k"><ProtoIcon name="spark" size={14} />VEREDITO DA NANCY</span>
                  <h2 className="anm-verdict-t">{result.verdict.title}</h2>
                  <p className="anm-verdict-s">{result.verdict.sub}</p>
                  <div className="anm-score">
                    <span className="anm-score-l">Saúde financeira depois da compra</span>
                    <span className="anm-score-r"><span className="anm-score-n">{result.verdict.score}</span><span className="anm-score-d">{result.verdict.delta}</span></span>
                  </div>
                </section>

                <section className="anm-card" aria-label="Por que essa resposta">
                  <h2 className="anm-card-t">Por que essa resposta</h2>
                  {result.reasons.map((r, i) => (
                    <div key={i} className="anm-reason">
                      <span className={`anm-reason-i ${r.ok ? 'ok' : 'warn'}`}><ProtoIcon name={r.ok ? 'check' : 'alert'} size={13} /></span>
                      <span className="anm-reason-t">{r.text}</span>
                    </div>
                  ))}
                </section>

                <section className="anm-card anm-cmp" aria-label="Comparando as formas de pagar">
                  <h2 className="anm-card-t">Comparando as formas de pagar</h2>
                  {result.options.map(o => (
                    <div key={o.k} className={`anm-opt ${o.tone}`}>
                      <div className="anm-opt-top">
                        <div className="anm-opt-name"><span className="anm-opt-label">{o.label}</span><span className={`anm-tag ${o.tone}`}>{o.tag}</span></div>
                        <span className="anm-opt-score">Saúde <span className="anm-mono">{o.score}</span></span>
                      </div>
                      <div className="anm-opt-bottom">
                        <span className="anm-opt-pv anm-mono">{money(o.pv)}{o.k !== 'pix' && o.k !== 'c1' && <span className="anm-opt-per">/mês</span>}</span>
                        <div className="anm-opt-side">
                          <span><span className={`anm-mono anm-pct${o.pct > 0.4 ? ' high' : ''}`}>{Math.round(o.pct * 100)}%</span> da sobra</span>
                          <span>Total <span className="anm-mono anm-opt-total">{money(o.total)}</span></span>
                        </div>
                      </div>
                    </div>
                  ))}
                </section>

                <section className="anm-card anm-next" aria-label="Próximo passo">
                  <h2 className="anm-card-t">Próximo passo</h2>
                  <button type="button" className="anm-primary" onClick={registerPurchase} disabled={busy || !!done}><ProtoIcon name="check" size={16} />{result.registerLabel}</button>
                  <button type="button" className="anm-secondary" onClick={askNancy}><ProtoIcon name="mic" size={16} />Perguntar mais à Nancy</button>
                  <button type="button" className="anm-secondary" onClick={createGoal} disabled={busy}><ProtoIcon name="target" size={16} />Criar meta para comprar depois</button>
                  {done && (
                    <p className="anm-done" role="status"><ProtoIcon name="check" size={16} />{done.msg} <button type="button" className="anm-link" onClick={() => navigate(done.to)}>{done.label}</button></p>
                  )}
                </section>

                <button type="button" className="anm-again" onClick={() => { newPurchase(); scrollTop() }}>Analisar outra compra</button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
