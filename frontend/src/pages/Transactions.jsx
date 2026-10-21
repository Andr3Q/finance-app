import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate as useRouterNavigate } from 'react-router-dom'
import { transactionsAPI, installmentsAPI } from '../services/api.js'
import { getCache, setCache, invalidateCache } from '../services/cache.js'
import Navbar from '../components/layout/Navbar.jsx'
import TransactionForm from '../components/features/TransactionForm.jsx'
import CurrencyInput from '../components/ui/CurrencyInput.jsx'
import { CategoryIcon } from '../components/ui/icons.jsx'
import { useUser } from '../hooks/useUser.js'
import { useForcedLightTheme } from '../hooks/useTheme.js'
import PlanUsageBanner from '../components/ui/PlanUsageBanner.jsx'
import { getLimit } from '../config/planLimits.js'

import { CATEGORY_LABELS, MONTHS, WEEKDAYS } from '../constants/index.js'
import { fmt } from '../utils/format.js'

// Neutraliza CSV Injection (Formula Injection): um valor começando com
// =, +, -, @, tab ou CR é interpretado como fórmula por Excel/Sheets/
// LibreOffice ao abrir o arquivo exportado (ex: descrição de uma transação
// digitada como "=HYPERLINK(...)" por quem a criou) — prefixar com aspas
// simples força o programa a tratar como texto literal, sem alterar o que
// aparece na célula. Achado de auditoria de segurança, 2026-10-21.
export function csvSafe(value) {
  const str = String(value ?? '')
  return /^[=+\-@\t\r]/.test(str) ? `'${str}` : str
}

function exportCSV(rows) {
  const header = ['Data', 'Descrição', 'Categoria', 'Tipo', 'Valor (R$)']
  const lines  = rows.map(t => {
    const date = new Date(t.date).toLocaleDateString('pt-BR')
    const desc = csvSafe(t.description || CATEGORY_LABELS[t.category] || t.category).replace(/"/g, '""')
    const cat  = csvSafe(CATEGORY_LABELS[t.category] || t.category).replace(/"/g, '""')
    const type = t.type === 'income' ? 'Entrada' : 'Saída'
    const val  = (t.type === 'income' ? t.amount : -t.amount).toFixed(2).replace('.', ',')
    return `"${date}","${desc}","${cat}","${type}","${val}"`
  })
  const csv  = [header.join(','), ...lines].join('\r\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `transacoes-${new Date().toISOString().slice(0, 7)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

const txCacheKey = (m, y) => `transactions:list:${y}-${m}`

// /installments/:id/pay e /unpay sempre criam ou removem a transação no mês
// REAL atual (nowBrasilia() no backend), não no mês que o usuário está vendo
// na tela (selMonth/selYear pode ser um mês diferente, navegado manualmente).
// Sem isso, pagar/desfazer uma parcela enquanto o usuário navega outro mês
// invalidava o cache do mês errado, deixando o mês real desatualizado até o
// TTL de 30s expirar sozinho.
function currentBrasiliaMonthYear() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: 'numeric',
  }).formatToParts(new Date())
  const get = (type) => Number(parts.find(p => p.type === type).value)
  return { month: get('month'), year: get('year') }
}

const IconBillFile = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
    <line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>
  </svg>
)
const IconLayers = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>
  </svg>
)
const IconChevron = ({ dir }) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    <polyline points={dir === 'left' ? '15 18 9 12 15 6' : '9 18 15 12 9 6'}/>
  </svg>
)

export default function Transactions() {
  const user = useUser()
  useForcedLightTheme() // Extrato é desenhado só no claro (design Nancy 2)
  const location = useLocation()
  const routerNavigate = useRouterNavigate() // nome próprio: "navigate" já é a função de trocar de mês nesta tela
  const [transactions,  setTransactions]  = useState([])
  const [installments,  setInstallments]  = useState([])
  const [loading,       setLoading]       = useState(true)
  const [showForm,      setShowForm]      = useState(false)
  const [filter,        setFilter]        = useState('all')
  const [search,        setSearch]        = useState('')
  const [toast,         setToast]         = useState(null)
  const [parcOpen,      setParcOpen]      = useState(true)
  // Chip "Parcelados" do cabeçalho: a seção de compras parceladas fica recolhida
  // até o atalho ser tocado (a tela dedicada de parcelados ainda não existe).
  const [showParc,      setShowParc]      = useState(false)
  // Resultado do mês vindo do mesmo cálculo da story "Resumo do mês".
  const [recap,         setRecap]         = useState(null)
  // Mesma preferência "ocultar valores" do Início — lida uma vez ao abrir.
  const [hideValues] = useState(() => {
    try { return localStorage.getItem('hide-balance') === '1' } catch { return false }
  })
  const [showParcForm,  setShowParcForm]  = useState(false)
  const [newParc,       setNewParc]       = useState({ name: '', amount: '', total: '' })
  const [parcLoading,   setParcLoading]   = useState(false)
  const [payingId,          setPayingId]          = useState(null)
  const [unpayingId,        setUnpayingId]        = useState(null)
  const [editingTx,         setEditingTx]         = useState(null)
  const [confirmDeleteTx,   setConfirmDeleteTx]   = useState(null)
  const [confirmDeleteParc, setConfirmDeleteParc] = useState(null)
  const fileInputRef  = useRef(null)
  const chipsRef       = useRef(null)
  const fetchRef        = useRef(null)
  // Navegar rápido entre meses dispara várias fetchTransactions em paralelo —
  // sem isso, a resposta de um mês antigo podia chegar DEPOIS da resposta do
  // mês atual (rede mais lenta, sem ordem garantida) e sobrescrever a tela com
  // dado do mês errado. Só a fetch mais recente (maior seq) tem permissão de
  // aplicar seu resultado.
  const fetchSeq        = useRef(0)
  const recapSeq        = useRef(0)
  const today         = new Date()
  const [selDate,  setSelDate]  = useState(() => new Date())
  const selMonth = selDate.getMonth() + 1
  const selYear  = selDate.getFullYear()
  const isCurrentMonth = selDate.getMonth() === today.getMonth() && selDate.getFullYear() === today.getFullYear()

  // Mesma janela de antes: do mês atual até 11 meses atrás (12 no total).
  const oldestMonth   = new Date(today.getFullYear(), today.getMonth() - 11, 1)
  const isOldestMonth = selDate.getFullYear() === oldestMonth.getFullYear() && selDate.getMonth() === oldestMonth.getMonth()

  const goToPrev = () => { if (!isOldestMonth)  setSelDate(new Date(selDate.getFullYear(), selDate.getMonth() - 1, 1)) }
  const goToNext = () => { if (!isCurrentMonth) setSelDate(new Date(selDate.getFullYear(), selDate.getMonth() + 1, 1)) }

  const scrollChips = (dir) => chipsRef.current?.scrollBy?.({ left: dir * 140, behavior: 'smooth' })

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  // Resultado/Entradas/Saídas do cartão: mesmo cálculo da story "Resumo do mês"
  // (GET /transactions/monthly-recap, offset = meses até o mês atual, 0 a -11).
  // Mesma proteção de ordem das transações: só a resposta mais recente vale.
  const fetchRecap = async () => {
    const nowBr  = currentBrasiliaMonthYear()
    const offset = (selYear * 12 + selMonth) - (nowBr.year * 12 + nowBr.month)
    const mySeq  = ++recapSeq.current
    try {
      const res = await transactionsAPI.monthlyRecap(offset)
      if (mySeq === recapSeq.current) setRecap(res.data)
    } catch {
      // sem o recap o cartão mostra "—" no resultado e usa as transações nos totais
      if (mySeq === recapSeq.current) setRecap(null)
    }
  }

  const fetchTransactions = async (force = false) => {
    fetchRecap()
    const key   = txCacheKey(selMonth, selYear)
    const mySeq = ++fetchSeq.current
    if (!force) {
      const cached = getCache(key)
      if (cached) { setTransactions(cached); setLoading(false); return }
    }
    try {
      const res = await transactionsAPI.list({ month: selMonth, year: selYear, limit: 200 })
      // Uma navegação mais recente já assumiu o controle enquanto essa
      // requisição estava no ar — descarta, senão sobrescreve o mês certo.
      if (mySeq !== fetchSeq.current) return
      const raw  = res.data.data ?? res.data
      const data = Array.isArray(raw) ? raw : []
      setCache(key, data, 30_000)
      setTransactions(data)
    } catch {
      if (mySeq === fetchSeq.current) showToast('Erro ao carregar transações.', false)
    } finally {
      if (mySeq === fetchSeq.current) setLoading(false)
    }
  }
  fetchRef.current = fetchTransactions

  const fetchInstallments = async () => {
    try {
      const res = await installmentsAPI.list()
      setInstallments(Array.isArray(res.data) ? res.data : [])
    } catch {}
  }

  useEffect(() => { fetchInstallments() }, [])

  // Vem do menu rápido do "+" na barra de navegação ("Compra Parcelada") —
  // já abre a seção de parcelamentos expandida com o formulário visível.
  // Limpa o state da navegação depois, pra não reabrir sozinho ao voltar
  // pra essa tela depois (ex: botão voltar do navegador).
  useEffect(() => {
    if (location.state?.openInstallmentForm) {
      setShowParc(true)
      setParcOpen(true)
      setShowParcForm(true)
      routerNavigate(location.pathname, { replace: true, state: {} })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  useEffect(() => {
    setLoading(true)
    setRecap(null) // não mostra o resultado do mês anterior enquanto o novo carrega
    fetchRef.current()
  }, [selMonth, selYear])

  useEffect(() => {
    const handler = () => fetchRef.current(true)
    window.addEventListener('budget-updated', handler)
    return () => window.removeEventListener('budget-updated', handler)
  }, [])

  const handleImportCSV = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    try {
      setLoading(true)
      const res = await transactionsAPI.importCSV(formData)
      showToast(res.data.message)
      invalidateCache(txCacheKey(selMonth, selYear))
      fetchTransactions(true)
    } catch (err) {
      showToast(err.response?.data?.error || 'Erro ao importar CSV.', false)
      setLoading(false)
    }
    e.target.value = null
  }

  const handleDelete = async (id) => {
    setConfirmDeleteTx(null)
    let lastErr
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await transactionsAPI.remove(id)
        invalidateCache(txCacheKey(selMonth, selYear))
        fetchTransactions(true)
        return
      } catch (err) {
        lastErr = err
        if (err?.response?.status === 404) break
        if (attempt < 3) await new Promise(r => setTimeout(r, 600 * attempt))
      }
    }
    showToast(lastErr?.response?.data?.error || 'Erro ao remover. Tente novamente.', false)
  }

  const handlePay = async (id) => {
    setPayingId(id)
    try {
      await installmentsAPI.pay(id)
      fetchInstallments()
      const { month: curMonth, year: curYear } = currentBrasiliaMonthYear()
      invalidateCache(txCacheKey(curMonth, curYear))
      invalidateCache(txCacheKey(selMonth, selYear))
      fetchTransactions(true)
      invalidateCache('dashboard')
      window.dispatchEvent(new CustomEvent('budget-updated'))
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
      fetchInstallments()
      const { month: curMonth, year: curYear } = currentBrasiliaMonthYear()
      invalidateCache(txCacheKey(curMonth, curYear))
      invalidateCache(txCacheKey(selMonth, selYear))
      fetchTransactions(true)
      invalidateCache('dashboard')
      window.dispatchEvent(new CustomEvent('budget-updated'))
      showToast('Parcela desfeita.')
    } catch (err) {
      showToast(err.response?.data?.error || 'Erro ao desfazer parcela.', false)
    } finally {
      setUnpayingId(null)
    }
  }

  const handleDeleteInstallment = async (id) => {
    setConfirmDeleteParc(null)
    let lastErr
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await installmentsAPI.remove(id)
        fetchInstallments()
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

  const handleCreateInstallment = async (e) => {
    e.preventDefault()
    if (!newParc.name || !newParc.amount || !newParc.total) {
      showToast('Preencha nome, valor e número de parcelas.', false)
      return
    }
    setParcLoading(true)
    try {
      await installmentsAPI.create({
        name:              newParc.name,
        amount:            newParc.amount,
        totalInstallments: parseInt(newParc.total),
      })
      setNewParc({ name: '', amount: '', total: '' })
      setShowParcForm(false)
      fetchInstallments()
      showToast('Parcelamento criado!')
    } catch (err) {
      showToast(err.response?.data?.error || 'Erro ao criar parcelamento.', false)
    } finally {
      setParcLoading(false)
    }
  }

  const monthTxs      = transactions.filter(t => t.month === selMonth && t.year === selYear)
  const totalExpenses = monthTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const totalIncome   = monthTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)

  // O resultado inclui o salário e reserva as contas fixas ainda não pagas (igual
  // ao saldo do Início e à story "Você guardou"); Entradas/Saídas são só os
  // lançamentos. Sem o recap (carregando/falhou) ou num mês sem lançamentos, o
  // resultado vira "—" — não inventa um valor — e os totais usam as transações.
  const resultKnown   = !!recap && recap.hasData
  const resultPos     = !resultKnown || recap.saved >= 0
  const shownIncome   = recap?.totalIncome   ?? totalIncome
  const shownExpenses = recap?.totalExpenses ?? totalExpenses

  const HIDDEN = 'R$ ••••'
  const brl    = (n) => (hideValues ? HIDDEN : `R$ ${fmt(n)}`)
  const signed = (n) => (hideValues ? HIDDEN : n > 0 ? `+R$ ${fmt(n)}` : n < 0 ? `−R$ ${fmt(-n)}` : `R$ ${fmt(0)}`)

  const filtered = transactions.filter(t => {
    const matchMonth  = t.month === selMonth && t.year === selYear
    const desc = (t.description || CATEGORY_LABELS[t.category] || '').toLowerCase()
    const cat  = (CATEGORY_LABELS[t.category] || '').toLowerCase()
    const matchSearch = !search || desc.includes(search.toLowerCase()) || cat.includes(search.toLowerCase())
    const matchFilter = filter === 'all' || t.type === filter
    return matchMonth && matchSearch && matchFilter
  })

  const FILTER_PILLS = [
    { value: 'all',     label: 'Todas',    },
    { value: 'income',  label: 'Entradas', },
    { value: 'expense', label: 'Saídas',   },
  ]

  // Um cartão por dia, do mais recente pro mais antigo; o total do dia é o
  // líquido (entradas − saídas) e só o dia de hoje leva o prefixo "HOJE ·".
  const grouped = (() => {
    const todayMs = new Date().setHours(0, 0, 0, 0)
    const days    = new Map()
    filtered.forEach(t => {
      const date = new Date(t.date)
      const key  = new Date(date).setHours(0, 0, 0, 0)
      if (!days.has(key)) days.set(key, { key, date, txs: [], net: 0 })
      const g = days.get(key)
      g.txs.push(t)
      g.net += t.type === 'income' ? t.amount : -t.amount
    })
    return [...days.values()]
      .sort((a, b) => b.key - a.key)
      .map(g => ({
        ...g,
        label: `${g.key === todayMs ? 'HOJE · ' : ''}${WEEKDAYS[g.date.getDay()].slice(0, 3).toUpperCase()}, ${String(g.date.getDate()).padStart(2, '0')} ${MONTHS[g.date.getMonth()].slice(0, 3).toUpperCase()}`,
      }))
  })()

  const activeInstallments = installments.filter(p => p.paidInstallments < p.totalInstallments)

  return (
    <>
      <Navbar />

      {toast && (
        <div className={`toast ${toast.ok ? 'tok' : 'terr'}`} style={{ position:'fixed', top:16, left:'50%', transform:'translateX(-50%)', zIndex:9001, whiteSpace:'nowrap' }}>
          {toast.msg}
        </div>
      )}

      <input type="file" accept=".csv" ref={fileInputRef} style={{ display:'none' }} onChange={handleImportCSV} />

      <div className="pwnav fade-in">
        <div className="ex-page">

          {/* ── Cabeçalho azul: título, atalhos e resultado do mês (tela 10) ── */}
          <div className="ex-hero">
            <h1 className="ex-title">Extrato</h1>

            <div className="ex-chips-row">
              <button className="ex-chip-arrow" onClick={() => scrollChips(-1)} aria-label="Atalhos anteriores">
                <IconChevron dir="left" />
              </button>
              <div className="ex-chips" ref={chipsRef}>
                <button className="ex-chip" onClick={() => routerNavigate('/financas')}>
                  <IconBillFile /> Contas do mês
                </button>
                <button className={`ex-chip${showParc ? ' on' : ''}`} aria-pressed={showParc} onClick={() => setShowParc(p => !p)}>
                  <IconLayers /> Parcelados
                </button>
              </div>
              <button className="ex-chip-arrow" onClick={() => scrollChips(1)} aria-label="Próximos atalhos">
                <IconChevron dir="right" />
              </button>
            </div>

            <div className="ex-result">
              <div className="ex-result-head">
                <span className="ex-result-label">Resultado de {MONTHS[selDate.getMonth()].toLowerCase()}{selYear !== today.getFullYear() ? ` de ${selYear}` : ''}</span>
                <div className="ex-month-nav">
                  <button onClick={goToPrev} disabled={isOldestMonth} aria-label="Mês anterior"><IconChevron dir="left" /></button>
                  <button onClick={goToNext} disabled={isCurrentMonth} aria-label="Próximo mês"><IconChevron dir="right" /></button>
                </div>
              </div>
              <div className={`ex-result-val ${resultPos ? 'pos' : 'neg'}`}>
                {resultKnown ? signed(recap.saved) : '—'}
              </div>
              <div className="ex-result-sub">
                <div>
                  <span className="ex-result-sub-lbl">Entradas</span>
                  <span className="ex-mono ex-in">{brl(shownIncome)}</span>
                </div>
                <div>
                  <span className="ex-result-sub-lbl">Saídas</span>
                  <span className="ex-mono ex-out">{brl(shownExpenses)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="ex-body">

            {/* Só aparece perto do limite do plano (80%+): no resto do tempo o Extrato fica
                limpo como no design, sem perder o aviso de que o limite está chegando. */}
            {monthTxs.length >= getLimit(user?.plan ?? 'free', 'transactions') * 0.8 && (
              <PlanUsageBanner
                plan={user?.plan ?? 'free'}
                feature="transactions"
                used={monthTxs.length}
                label="transações este mês"
              />
            )}

            {/* ── Compras parceladas (aparece pelo atalho "Parcelados" do cabeçalho) ── */}
            {showParc && (
            <div className="parc-section">
              <div className="parc-header" onClick={() => setParcOpen(p => !p)}>
                <div className="parc-header-left">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
                  </svg>
                  <span>Compras parceladas</span>
                  {activeInstallments.length > 0 && (
                    <span className="parc-badge">{activeInstallments.length}</span>
                  )}
                </div>
                <div className="parc-header-right">
                  <button
                    className="parc-new-btn"
                    onClick={e => { e.stopPropagation(); setShowParcForm(p => !p); setParcOpen(true) }}
                  >
                    + Nova parcela
                  </button>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                    style={{ transition: 'transform .2s', transform: parcOpen ? 'rotate(180deg)' : 'rotate(0deg)', opacity: .4 }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </div>
              </div>

              {parcOpen && (
                <div className="parc-body">

                  {/* Formulário novo parcelamento */}
                  {showParcForm && (
                    <form className="parc-form" onSubmit={handleCreateInstallment}>
                      <input
                        className="cfg-inp"
                        placeholder="Nome (ex: Celular Samsung)"
                        value={newParc.name}
                        onChange={e => setNewParc(p => ({ ...p, name: e.target.value }))}
                        maxLength={100}
                      />
                      <CurrencyInput
                        className="cfg-inp cfg-inp-num"
                        placeholder="Valor por parcela"
                        value={newParc.amount}
                        onChange={v => setNewParc(p => ({ ...p, amount: v }))}
                      />
                      <input
                        className="cfg-inp cfg-inp-num"
                        type="number"
                        inputMode="numeric"
                        placeholder="Nº parcelas"
                        min="2" max="360"
                        value={newParc.total}
                        onChange={e => setNewParc(p => ({ ...p, total: e.target.value }))}
                      />
                      <button type="submit" className="cfg-btn-ghost" disabled={parcLoading}>
                        {parcLoading
                          ? <span className="spinner" style={{ width:13, height:13, borderWidth:2 }} />
                          : 'Adicionar'
                        }
                      </button>
                      <button type="button" className="cfg-btn-ghost" style={{ opacity:.5 }} onClick={() => setShowParcForm(false)}>
                        Cancelar
                      </button>
                    </form>
                  )}

                  {installments.length === 0 && !showParcForm ? (
                    <div className="parc-empty">Nenhuma compra parcelada. Clique em "+ Nova parcela" para adicionar.</div>
                  ) : (
                    <div className="parc-grid">
                      {installments.map(p => {
                        const remaining  = p.totalInstallments - p.paidInstallments
                        const pct        = Math.round((p.paidInstallments / p.totalInstallments) * 100)
                        const totalRem   = remaining * p.amount
                        const done       = remaining === 0
                        return (
                          <div key={p.id} className={`parc-card${done ? ' parc-done' : ''}`}>
                            <div className="parc-card-top">
                              <div className="parc-name">{p.name}</div>
                              <button className="parc-del" onClick={() => setConfirmDeleteParc(p.id)} title="Remover" aria-label="Remover parcelamento">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                              </button>
                            </div>

                            <div className="parc-progress-wrap">
                              <div className="parc-progress-header">
                                <span className="parc-count">
                                  {done
                                    ? '✓ Quitado'
                                    : <>{p.paidInstallments}/{p.totalInstallments} pagas</>
                                  }
                                </span>
                                <span className="parc-pct">{pct}%</span>
                              </div>
                              <div className="parc-progress-track">
                                <div className="parc-progress-fill" style={{ width: `${pct}%` }} />
                              </div>
                            </div>

                            <div className="parc-values">
                              <div className="parc-val-item">
                                <span className="parc-val-label">Por parcela</span>
                                <span className="parc-val-amount">R$ {fmt(p.amount)}</span>
                              </div>
                              {!done && (
                                <div className="parc-val-item" style={{ textAlign: 'right' }}>
                                  <span className="parc-val-label">Restante</span>
                                  <span className="parc-remaining">R$ {fmt(totalRem)}</span>
                                </div>
                              )}
                            </div>

                            <div className="parc-actions">
                              {!done && (
                                <button
                                  className="parc-pay-btn"
                                  onClick={() => handlePay(p.id)}
                                  disabled={payingId === p.id || unpayingId === p.id}
                                >
                                  {payingId === p.id
                                    ? <><span className="spinner" style={{ width:12, height:12, borderWidth:2 }} /> Registrando...</>
                                    : <>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                          <polyline points="20 6 9 17 4 12"/>
                                        </svg>
                                        Pagar parcela {p.paidInstallments + 1}/{p.totalInstallments}
                                      </>
                                  }
                                </button>
                              )}
                              {p.paidInstallments > 0 && (
                                <button
                                  className="parc-unpay-btn"
                                  onClick={() => handleUnpay(p.id)}
                                  disabled={unpayingId === p.id || payingId === p.id}
                                  title="Desfazer última parcela"
                                >
                                  {unpayingId === p.id
                                    ? <span className="spinner" style={{ width:11, height:11, borderWidth:2 }} />
                                    : <>
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                          <path d="M3 7v6h6"/><path d="M3 13C5 8 9.5 5 15 5a9 9 0 010 18c-3.5 0-6.5-1.5-8.5-4"/>
                                        </svg>
                                        Desfazer
                                      </>
                                  }
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
            )}

            {/* ── Busca e filtros ── */}
            <div className="ex-search">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink:0 }}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                className="ex-search-input"
                placeholder="Buscar no extrato"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && <button className="ex-search-clear" onClick={() => setSearch('')} aria-label="Limpar busca">×</button>}
            </div>
            <div className="ex-pills">
              {FILTER_PILLS.map(p => (
                <button key={p.value} className={`ex-pill${filter === p.value ? ' on' : ''}`} onClick={() => setFilter(p.value)}>
                  {p.label}
                </button>
              ))}
            </div>

            {/* ── Lista: um cartão por dia ── */}
            {loading ? (
              <div className="ex-empty"><div className="dsb-loader-ring" style={{ margin:'0 auto' }} /></div>
            ) : filtered.length === 0 ? (
              <div className="ex-empty">
                <div className="ex-empty-title">Nenhuma transação encontrada</div>
                <div className="ex-empty-sub">{search || filter !== 'all' ? 'Ajuste os filtros de busca.' : 'Registre sua primeira transação.'}</div>
              </div>
            ) : grouped.map(g => (
              <div key={g.key} className="ex-day">
                <div className="ex-day-head">
                  <span className="ex-day-label">{g.label}</span>
                  <span className="ex-day-total">{signed(g.net)}</span>
                </div>
                {g.txs.map(t => {
                  const isInc    = t.type === 'income'
                  const catLabel = CATEGORY_LABELS[t.category] || t.category
                  const desc     = t.description || catLabel
                  return (
                    <div key={t.id} className="ex-row">
                      {/* A linha inteira abre a edição (o Extrato não tem botão de lápis). */}
                      <button className="ex-row-main" onClick={() => setEditingTx(t)} title="Editar">
                        <span className="ex-row-ico"><CategoryIcon category={t.category} size={16} color="currentColor" /></span>
                        <span className="ex-row-info">
                          <span className="ex-row-name">{desc}</span>
                          <span className="ex-row-cat">{catLabel}</span>
                        </span>
                        <span className={`ex-row-val ${isInc ? 'inc' : 'exp'}`}>{hideValues ? HIDDEN : `${isInc ? '+' : '−'}R$ ${fmt(t.amount)}`}</span>
                      </button>
                      <button className="ex-del" onClick={() => setConfirmDeleteTx(t.id)} title="Remover" aria-label="Remover transação">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </div>
                  )
                })}
              </div>
            ))}

            {/* ── Ações (importar/exportar não têm outro ponto de acesso no app) ── */}
            <div className="ex-actions">
              <button className="ex-btn-ghost" onClick={() => fileInputRef.current?.click()}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                Importar CSV
              </button>
              <button className="ex-btn-ghost" onClick={() => exportCSV(filtered)} disabled={filtered.length === 0}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Exportar CSV
              </button>
              {/* No celular o "+" central da barra inferior é quem cria transações. */}
              <button className="ex-btn-primary ex-btn-new" onClick={() => setShowForm(true)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Nova Transação
              </button>
            </div>

          </div>
        </div>
      </div>

      {showForm && (
        <TransactionForm
          onClose={() => setShowForm(false)}
          onSuccess={() => { setShowForm(false); invalidateCache(txCacheKey(selMonth, selYear)); fetchTransactions(true) }}
        />
      )}

      {editingTx && (
        <TransactionForm
          initialData={editingTx}
          editingId={editingTx.id}
          onClose={() => setEditingTx(null)}
          onSuccess={() => { setEditingTx(null); invalidateCache(txCacheKey(selMonth, selYear)); fetchTransactions(true) }}
        />
      )}

      {confirmDeleteTx && createPortal(
        <div className="gls-modal-overlay" onClick={() => setConfirmDeleteTx(null)}>
          <div className="gls-modal" style={{ maxWidth:360 }} onClick={e => e.stopPropagation()}>
            <div className="gls-modal-head">
              <span>Remover transação</span>
              <button className="gls-modal-close" onClick={() => setConfirmDeleteTx(null)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="gls-modal-body" style={{ textAlign:'center', paddingTop:8 }}>
              <div style={{ width:48, height:48, borderRadius:12, background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.2)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                  <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                </svg>
              </div>
              <div style={{ fontWeight:700, fontSize:15, color:'var(--t1)', marginBottom:8 }}>Tem certeza?</div>
              <div style={{ fontSize:13, color:'var(--t2)', lineHeight:1.6 }}>Esta transação será removida permanentemente.</div>
            </div>
            <div className="gls-modal-foot">
              <button className="gls-btn-ghost" onClick={() => setConfirmDeleteTx(null)}>Cancelar</button>
              <button className="gls-btn-save" style={{ background:'#ef4444' }} onClick={() => handleDelete(confirmDeleteTx)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                </svg>
                Sim, excluir
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {confirmDeleteParc && createPortal(
        <div className="gls-modal-overlay" onClick={() => setConfirmDeleteParc(null)}>
          <div className="gls-modal" style={{ maxWidth:360 }} onClick={e => e.stopPropagation()}>
            <div className="gls-modal-head">
              <span>Remover parcelamento</span>
              <button className="gls-modal-close" onClick={() => setConfirmDeleteParc(null)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="gls-modal-body" style={{ textAlign:'center', paddingTop:8 }}>
              <div style={{ width:48, height:48, borderRadius:12, background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.2)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                  <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                </svg>
              </div>
              <div style={{ fontWeight:700, fontSize:15, color:'var(--t1)', marginBottom:8 }}>Tem certeza?</div>
              <div style={{ fontSize:13, color:'var(--t2)', lineHeight:1.6 }}>Todas as parcelas restantes serão removidas permanentemente.</div>
            </div>
            <div className="gls-modal-foot">
              <button className="gls-btn-ghost" onClick={() => setConfirmDeleteParc(null)}>Cancelar</button>
              <button className="gls-btn-save" style={{ background:'#ef4444' }} onClick={() => handleDeleteInstallment(confirmDeleteParc)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                </svg>
                Sim, excluir
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
