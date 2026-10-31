import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import { installmentsAPI } from '../services/api.js'
import { invalidateCache } from '../services/cache.js'
import { useForcedLightTheme } from '../hooks/useTheme.js'
import { useEscapeKey } from '../hooks/useEscapeKey.js'
import Navbar from '../components/layout/Navbar.jsx'
import CurrencyInput from '../components/ui/CurrencyInput.jsx'
import { LayersGlyph, PlusGlyph } from '../components/ui/NancyGlyphs.jsx'
import { txCacheKey, currentBrasiliaMonthYear } from '../utils/txCache.js'
import { fmt } from '../utils/format.js'

const BackIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
)

// Compras parceladas (Nancy 2, tela 15 do catálogo "Parcelados"): antes era uma seção dentro do
// Extrato; agora é uma tela própria. A lógica (listar, criar, pagar, desfazer, remover) é a mesma.
// Mudanças que vêm do design: o formulário pede o VALOR TOTAL e o número de parcelas (a API guarda
// o valor de cada parcela, então dividimos aqui e mostramos o resultado antes de salvar).
export default function Installments() {
  const navigate = useNavigate()
  const location = useLocation()
  useForcedLightTheme() // tela desenhada só no claro (design Nancy 2)

  const [plans,    setPlans]    = useState([])
  const [loaded,   setLoaded]   = useState(false)
  const [toast,    setToast]    = useState(null)
  const [openId,   setOpenId]   = useState(null)   // card com os detalhes (desfazer / remover) aberto
  const [payingId,   setPayingId]   = useState(null)
  const [unpayingId, setUnpayingId] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  useEscapeKey(() => setConfirmDelete(null), !!confirmDelete)
  const deleting = plans.find(p => p.id === confirmDelete) || null
  const [form,     setForm]     = useState({ name: '', total: '', count: '' })
  const [saving,   setSaving]   = useState(false)
  const nameRef = useRef(null)

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  const fetchPlans = async () => {
    try {
      const res = await installmentsAPI.list()
      setPlans(Array.isArray(res.data) ? res.data : [])
    } catch { /* mantém o que já estava na tela */ }
    finally { setLoaded(true) }
  }
  useEffect(() => { fetchPlans() }, [])

  // Vem do "Compra Parcelada" do menu do "+": já leva o cursor pro formulário. Limpa o state
  // pra não refocar sozinho quando o usuário voltar pra cá pelo botão voltar do navegador.
  useEffect(() => {
    if (location.state?.focusForm) {
      nameRef.current?.focus()
      nameRef.current?.scrollIntoView?.({ block: 'center' })
      navigate(location.pathname, { replace: true, state: {} })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate('/transactions'))

  // pagar/desfazer criam ou removem uma transação no mês real: derruba o cache dele e o do Início
  const afterTransactionChange = () => {
    const { month, year } = currentBrasiliaMonthYear()
    invalidateCache(txCacheKey(month, year))
    invalidateCache('dashboard')
    window.dispatchEvent(new CustomEvent('budget-updated'))
  }

  const handlePay = async (id) => {
    setPayingId(id)
    try {
      await installmentsAPI.pay(id)
      fetchPlans()
      afterTransactionChange()
      showToast('Parcela registrada como transação!')
    } catch (err) {
      showToast(err.response?.data?.error || 'Erro ao pagar parcela.', false)
    } finally {
      setPayingId(null)
    }
  }

  const handleUnpay = async (id) => {
    setUnpayingId(id)
    try {
      await installmentsAPI.unpay(id)
      fetchPlans()
      afterTransactionChange()
      showToast('Parcela desfeita.')
    } catch (err) {
      showToast(err.response?.data?.error || 'Erro ao desfazer parcela.', false)
    } finally {
      setUnpayingId(null)
    }
  }

  const handleDelete = async (id) => {
    setConfirmDelete(null)
    let lastErr
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await installmentsAPI.remove(id)
        fetchPlans()
        showToast('Parcelamento removido.')
        return
      } catch (err) {
        lastErr = err
        if (err?.response?.status === 404) break
        if (attempt < 3) await new Promise(r => setTimeout(r, 600 * attempt))
      }
    }
    showToast(lastErr?.response?.data?.error || 'Erro ao remover. Tente novamente.', false)
  }

  // valor de cada parcela = total ÷ nº de parcelas, em centavos
  const count    = parseInt(form.count, 10)
  const total    = Number(form.total)
  const perParcel = total > 0 && count >= 2 ? Math.round((total / count) * 100) / 100 : null
  // A parcela é arredondada em centavos, então as parcelas podem somar um pouco a mais OU a menos que a compra (20 em 3x = 20,01).
  const roundedTotal  = perParcel !== null ? Math.round(perParcel * count * 100) / 100 : 0
  const roundingDiff  = perParcel !== null ? Math.round((roundedTotal - total) * 100) / 100 : 0

  const handleCreate = async (e) => {
    e.preventDefault()
    if (saving) return
    if (!form.name || !form.total || !form.count) {
      showToast('Preencha nome, valor e número de parcelas.', false)
      return
    }
    // aviso do app (não a bolha do navegador, que some em alguns celulares): a API só aceita de 2 a 360 parcelas
    if (!(count >= 2 && count <= 360)) {
      showToast('O número de parcelas deve ser de 2 a 360.', false)
      return
    }
    setSaving(true)
    try {
      await installmentsAPI.create({ name: form.name, amount: perParcel ?? total, totalInstallments: count })
      setForm({ name: '', total: '', count: '' })
      fetchPlans()
      showToast('Parcelamento criado!')
    } catch (err) {
      showToast(err.response?.data?.error || 'Erro ao criar parcelamento.', false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Navbar />

      {toast && (
        <div className={`toast toast-top ${toast.ok ? 'tok' : 'terr'}`}>
          {toast.msg}
        </div>
      )}

      <div className="pwnav fin-pwnav fade-in">
        <div className="fin-page">
          <header className="fin-hero">
            <button type="button" className="fin-back" onClick={goBack} aria-label="Voltar"><BackIcon /></button>
            <div className="fin-hero-text">
              <h1 className="fin-hero-title">Compras parceladas</h1>
              <p className="fin-hero-sub">Parcelas em andamento</p>
            </div>
          </header>

          <div className="fin-body">
            {loaded && plans.length === 0 && (
              <section className="fin-card inst-empty">
                <span className="fin-ico"><LayersGlyph /></span>
                <div className="fin-head-text">
                  <h2 className="fin-title">Nenhuma compra parcelada</h2>
                  <p className="fin-sub">Cadastre abaixo uma compra para acompanhar as parcelas.</p>
                </div>
              </section>
            )}

            {plans.map(p => {
              const remaining = p.totalInstallments - p.paidInstallments
              const pct       = Math.round((p.paidInstallments / p.totalInstallments) * 100)
              const done      = remaining === 0
              const open      = openId === p.id
              return (
                <section key={p.id} className={`fin-card inst-card${done ? ' inst-done' : ''}`}>
                  <button type="button" className="inst-head" onClick={() => setOpenId(open ? null : p.id)} aria-expanded={open}>
                    <span className="fin-ico"><LayersGlyph /></span>
                    <span className="inst-head-text">
                      <span className="fin-title">{p.name}</span>
                      <span className="fin-sub">{p.paidInstallments} de {p.totalInstallments} parcelas</span>
                    </span>
                    <span className="inst-val">R$ {fmt(p.amount)}</span>
                  </button>

                  <div className="inst-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${pct}% pago`}>
                    <div className="inst-fill" style={{ width: `${pct}%` }} />
                  </div>

                  <div className="inst-foot">
                    {done ? (
                      <span className="inst-quit">✓ Quitado</span>
                    ) : (
                      <>
                        <span className="inst-rest">Restante: R$ {fmt(remaining * p.amount)}</span>
                        <button
                          type="button"
                          className="inst-pay"
                          onClick={() => handlePay(p.id)}
                          disabled={payingId === p.id || unpayingId === p.id}
                          aria-label={`Pagar parcela ${p.paidInstallments + 1}/${p.totalInstallments}`}
                        >
                          {payingId === p.id ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : 'Pagar parcela'}
                        </button>
                      </>
                    )}
                  </div>

                  {open && (
                    <div className="inst-detail">
                      {p.paidInstallments > 0 && (
                        <button type="button" className="inst-link" onClick={() => handleUnpay(p.id)} disabled={unpayingId === p.id || payingId === p.id} title="Desfazer última parcela">
                          {unpayingId === p.id ? <span className="spinner" style={{ width: 11, height: 11, borderWidth: 2 }} /> : 'Desfazer'}
                        </button>
                      )}
                      <button type="button" className="inst-link inst-link-del" onClick={() => setConfirmDelete(p.id)} title="Remover" aria-label="Remover parcelamento">
                        Remover compra
                      </button>
                    </div>
                  )}
                </section>
              )
            })}

            <section className="fin-card inst-new">
              <h2 className="inst-new-title">Nova compra parcelada</h2>
              <form onSubmit={handleCreate} className="inst-form" noValidate>
                <input
                  ref={nameRef} className="inst-inp" placeholder="O que você comprou?" maxLength={100}
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
                <div className="inst-row2">
                  <CurrencyInput className="inst-inp" placeholder="Valor total" value={form.total} onChange={v => setForm(f => ({ ...f, total: v }))} />
                  <input
                    className="inst-inp" type="number" inputMode="numeric" placeholder="Parcelas" min="2" max="360"
                    value={form.count} onChange={e => setForm(f => ({ ...f, count: e.target.value }))}
                  />
                </div>
                {perParcel !== null && (
                  <p className="inst-calc">{count} parcelas de R$ {fmt(perParcel)}</p>
                )}
                {/* a parcela é arredondada em centavos: quando isso muda o total, diz quanto fica (ex.: 1.000 em 3x = 999,99) */}
                {perParcel !== null && roundingDiff !== 0 && (
                  <p className="inst-calc">Total das parcelas: R$ {fmt(roundedTotal)} (R$ {fmt(Math.abs(roundingDiff))} {roundingDiff > 0 ? 'a mais' : 'a menos'} que o valor da compra, por causa do arredondamento)</p>
                )}
                <button type="submit" className="inst-add" disabled={saving}>
                  {saving ? 'Adicionando…' : <><PlusGlyph /> Adicionar parcela</>}
                </button>
              </form>
            </section>
          </div>
        </div>
      </div>

      {confirmDelete && createPortal(
        <div className="gls-modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="gls-modal" role="dialog" aria-modal="true" aria-labelledby="inst-del-title" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
            <div className="gls-modal-head">
              <span id="inst-del-title">Remover parcelamento</span>
              <button className="gls-modal-close" onClick={() => setConfirmDelete(null)} aria-label="Fechar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="gls-modal-body" style={{ textAlign: 'center', paddingTop: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--t1)', marginBottom: 8 }}>Tem certeza?</div>
              <div style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.6 }}>
                {deleting && (
                  <div style={{ fontWeight: 600, color: 'var(--t1)' }}>
                    {deleting.name} · {deleting.totalInstallments}x R$ {fmt(deleting.amount)}
                    <div style={{ fontWeight: 400, color: 'var(--t2)' }}>{deleting.paidInstallments} de {deleting.totalInstallments} parcelas pagas</div>
                  </div>
                )}
                <div style={{ marginTop: 6 }}>Todas as parcelas restantes serão removidas permanentemente.</div>
                {deleting && deleting.paidInstallments > 0 && (
                  <div>As parcelas já pagas continuam no Extrato.</div>
                )}
              </div>
            </div>
            <div className="gls-modal-foot">
              <button className="gls-btn-ghost" onClick={() => setConfirmDelete(null)}>Cancelar</button>
              <button className="gls-btn-save" style={{ background: '#ef4444' }} onClick={() => handleDelete(confirmDelete)}>Sim, excluir</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
