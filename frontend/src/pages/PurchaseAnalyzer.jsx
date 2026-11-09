import { useNavigate } from 'react-router-dom'
import Navbar from '../components/layout/Navbar.jsx'
import ProtoIcon from '../components/layout/ProtoIcon.jsx'
import { useIsDesktop } from '../hooks/useIsDesktop.js'
import { useForcedLightTheme } from '../hooks/useTheme.js'
import { usePurchaseAnalyzer, HIDDEN, EXAMPLES, MODES, money } from '../hooks/usePurchaseAnalyzer.js'
import { PARCELAS } from '../utils/purchaseAnalysis.js'
import PurchaseAnalyzerMobile from './PurchaseAnalyzerMobile.jsx'

// Analisador de compras. A lógica toda (números do servidor, comparação, registrar compra, perguntar à Nancy, criar meta) está em
// hooks/usePurchaseAnalyzer.js e é a mesma nas duas telas. Aqui fica o visual do DESKTOP (design "Nancy Desktop", tela 38); o do celular
// (design tela 37) está em PurchaseAnalyzerMobile.jsx.
export default function PurchaseAnalyzer() {
  const isDesktop = useIsDesktop()
  useForcedLightTheme()
  const navigate = useNavigate()
  const analyzer = usePurchaseAnalyzer()
  if (!isDesktop) return <PurchaseAnalyzerMobile a={analyzer} />
  const { hidden, base, status, form, error, result, pending, busy, done, toast, load, set, pick, analyze, registerPurchase, askNancy, createGoal } = analyzer

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
                    <button type="button" className="ndz-primary" onClick={registerPurchase} disabled={busy || !!done}><ProtoIcon name="check" size={16} />{result.registerLabel}</button>
                    <button type="button" className="ndz-secondary" onClick={askNancy}><ProtoIcon name="mic" size={16} />Perguntar mais à Nancy</button>
                    <button type="button" className="ndz-secondary" onClick={createGoal} disabled={busy}><ProtoIcon name="target" size={16} />Criar meta para comprar depois</button>
                    {done && (
                      <p className="ndz-done" role="status"><ProtoIcon name="check" size={16} />{done.msg} <button type="button" className="ndz-link" onClick={() => navigate(done.to)}>{done.label}</button></p>
                    )}
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
