import Navbar from '../components/layout/Navbar.jsx'
import DesktopTabs from '../components/layout/DesktopTabs.jsx'
import ProtoIcon from '../components/layout/ProtoIcon.jsx'
import CurrencyInput from '../components/ui/CurrencyInput.jsx'
import { MONTHS } from '../constants/index.js'
import { fmt } from '../utils/format.js'

// "jul 2027": o mês da última parcela (a 1ª parcela é o mês de início do parcelamento)
const endLabel = (p) => {
  const idx = p.startYear * 12 + (p.startMonth - 1) + (p.totalInstallments - 1)
  return Number.isFinite(idx) ? ` · termina em ${MONTHS[idx % 12].slice(0, 3).toLowerCase()} ${Math.floor(idx / 12)}` : '' // sem o mês de início, não inventa o fim
}

// Compras parceladas no desktop (design "Nancy Desktop", tela 17): abas do Extrato e um cartão por compra, em duas colunas (ícone, nome, parcelas
// pagas, valor por mês, barra de progresso, restante e "Pagar parcela"). Só a apresentação — listar, pagar, desfazer, remover e criar são do
// Installments, que passa tudo em `ctx` e mantém o modal de remover e os avisos. O design não desenha o formulário de nova compra, o detalhe
// (Desfazer, Remover compra) nem o estado "Quitado": são funções do app e ficam no cartão certo ou abaixo da lista.
export default function InstallmentsDesktop({ ctx }) {
  const { plans, loaded, openId, setOpenId, payingId, unpayingId, onPay, onUnpay, onRemove, form, setForm, saving, onCreate, nameRef, calc } = ctx
  return (
    <>
      <Navbar />
      <div className="pwnav ndh-pwnav fade-in">
        <div className="ndx-page">
          <DesktopTabs group="extrato" label="Seções do extrato" />

          <div className="ndi-grid">
            {loaded && plans.length === 0 && (
              <section className="ndi-card ndi-empty">
                <span className="ndi-ico"><ProtoIcon name="layers" size={20} /></span>
                <div className="ndi-head-text"><h2>Nenhuma compra parcelada</h2><p>Cadastre abaixo uma compra para acompanhar as parcelas.</p></div>
              </section>
            )}

            {plans.map(p => {
              const remaining = p.totalInstallments - p.paidInstallments
              const pct = Math.round((p.paidInstallments / p.totalInstallments) * 100)
              const done = remaining === 0
              const open = openId === p.id
              return (
                <section key={p.id} className={`ndi-card${done ? ' done' : ''}`}>
                  <button type="button" className="ndi-head" onClick={() => setOpenId(open ? null : p.id)} aria-expanded={open}>
                    <span className="ndi-ico"><ProtoIcon name="layers" size={20} /></span>
                    <span className="ndi-head-text"><span className="ndi-name">{p.name}</span><span className="ndi-prog">{p.paidInstallments} de {p.totalInstallments} parcelas</span></span>
                    <span className="ndi-val">R$ {fmt(p.amount)}/mês</span>
                  </button>
                  <div className="ndi-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${pct}% pago`}>
                    <div className="ndi-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="ndi-foot">
                    {done ? (
                      <span className="ndi-quit"><ProtoIcon name="check" size={16} />Quitado</span>
                    ) : (
                      <>
                        <span className="ndi-rest">Restante: R$ {fmt(remaining * p.amount)}{endLabel(p)}</span>
                        <button type="button" className="ndi-pay" onClick={() => onPay(p.id)} disabled={payingId === p.id || unpayingId === p.id} aria-label={`Pagar parcela ${p.paidInstallments + 1}/${p.totalInstallments}`}>
                          {payingId === p.id ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : 'Pagar parcela'}
                        </button>
                      </>
                    )}
                  </div>
                  {open && (
                    <div className="ndi-detail">
                      {p.paidInstallments > 0 && (
                        <button type="button" className="ndi-link" onClick={() => onUnpay(p.id)} disabled={unpayingId === p.id || payingId === p.id} title="Desfazer última parcela">
                          {unpayingId === p.id ? <span className="spinner" style={{ width: 11, height: 11, borderWidth: 2 }} /> : 'Desfazer'}
                        </button>
                      )}
                      <button type="button" className="ndi-link ndi-link--del" onClick={() => onRemove(p.id)} title="Remover" aria-label="Remover parcelamento">Remover compra</button>
                    </div>
                  )}
                </section>
              )
            })}

            <form className="ndi-card ndi-new" onSubmit={onCreate} noValidate aria-label="Nova compra parcelada">
              <h2>Nova compra parcelada</h2>
              <div className="ndi-new-row">
                <input ref={nameRef} className="ndi-inp" placeholder="O que você comprou?" maxLength={100} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                <CurrencyInput className="ndi-inp" placeholder="Valor total" value={form.total} onChange={v => setForm(f => ({ ...f, total: v }))} />
                <input className="ndi-inp" type="number" inputMode="numeric" placeholder="Parcelas" min="2" max="360" value={form.count} onChange={e => setForm(f => ({ ...f, count: e.target.value }))} />
                <button type="submit" className="ndi-add" disabled={saving}>{saving ? 'Adicionando…' : <><ProtoIcon name="plus" size={18} />Adicionar parcela</>}</button>
              </div>
              {calc.perParcel !== null && <p className="ndi-calc">{calc.count} parcelas de R$ {fmt(calc.perParcel)}</p>}
              {calc.perParcel !== null && calc.roundingDiff !== 0 && (
                <p className="ndi-calc">Total das parcelas: R$ {fmt(calc.roundedTotal)} (R$ {fmt(Math.abs(calc.roundingDiff))} {calc.roundingDiff > 0 ? 'a mais' : 'a menos'} que o valor da compra, por causa do arredondamento)</p>
              )}
            </form>
          </div>
        </div>
      </div>
    </>
  )
}
