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
import PlanUsageBanner from '../components/ui/PlanUsageBanner.jsx'

import { CATEGORY_LABELS, MONTHS } from '../constants/index.js'
import { fmt } from '../utils/format.js'

function exportCSV(rows) {
  const header = ['Data', 'Descrição', 'Categoria', 'Tipo', 'Valor (R$)']
  const lines  = rows.map(t => {
    const date = new Date(t.date).toLocaleDateString('pt-BR')
    const desc = (t.description || CATEGORY_LABELS[t.category] || t.category).replace(/"/g, '""')
    const cat  = (CATEGORY_LABELS[t.category] || t.category).replace(/"/g, '""')
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

export default function Transactions() {
  const user = useUser()
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
  const [showParcForm,  setShowParcForm]  = useState(false)
  const [newParc,       setNewParc]       = useState({ name: '', amount: '', total: '' })
  const [parcLoading,   setParcLoading]   = useState(false)
  const [payingId,          setPayingId]          = useState(null)
  const [unpayingId,        setUnpayingId]        = useState(null)
  const [editingTx,         setEditingTx]         = useState(null)
  const [confirmDeleteTx,   setConfirmDeleteTx]   = useState(null)
  const [confirmDeleteParc, setConfirmDeleteParc] = useState(null)
  const fileInputRef  = useRef(null)
  const carouselRef     = useRef(null)
  const carouselWrapRef = useRef(null)
  const fetchRef        = useRef(null)
  const today         = new Date()
  const [selDate,  setSelDate]  = useState(() => new Date())
  const [selDir,   setSelDir]   = useState('none')
  const [animKey,       setAnimKey]       = useState(0)
  const [compromsOpen,  setCompromsOpen]  = useState(true)
  const selMonth = selDate.getMonth() + 1
  const selYear  = selDate.getFullYear()
  const isCurrentMonth = selDate.getMonth() === today.getMonth() && selDate.getFullYear() === today.getFullYear()

  const carouselMonths = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() - (11 - i), 1)
    return { month: d.getMonth() + 1, year: d.getFullYear(), label: MONTHS[d.getMonth()].slice(0, 3) }
  })

  const minCarousel = carouselMonths[0]
  const isOldestMonth = selDate.getFullYear() === minCarousel.year && selDate.getMonth() + 1 === minCarousel.month

  const navigate = (newDate) => {
    const cur = new Date(selDate.getFullYear(), selDate.getMonth(), 1)
    setSelDir(newDate > cur ? 'next' : 'prev')
    setAnimKey(k => k + 1)
    setSelDate(newDate)
  }
  const goToPrev = () => { if (!isOldestMonth) navigate(new Date(selDate.getFullYear(), selDate.getMonth() - 1, 1)) }
  const goToNext = () => { if (!isCurrentMonth) navigate(new Date(selDate.getFullYear(), selDate.getMonth() + 1, 1)) }

  const getMonthBalance = (m, y) => {
    const txs = transactions.filter(t => t.month === m && t.year === y)
    if (!txs.length) return null
    const inc = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const exp = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    return inc - exp
  }

  useEffect(() => {
    if (!carouselRef.current) return
    const el = carouselRef.current.querySelector('.tx1-carousel-item.on')
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [selDate])

  useEffect(() => {
    if (selDir === 'none' || !carouselWrapRef.current) return
    const wrap = carouselWrapRef.current
    const cls = selDir === 'next' ? 'tx1-slide-next' : 'tx1-slide-prev'
    wrap.classList.remove('tx1-slide-next', 'tx1-slide-prev')
    void wrap.offsetWidth
    wrap.classList.add(cls)
    const t = setTimeout(() => wrap.classList.remove('tx1-slide-next', 'tx1-slide-prev'), 400)
    return () => clearTimeout(t)
  }, [animKey])

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  const fetchTransactions = async (force = false) => {
    const key = txCacheKey(selMonth, selYear)
    if (!force) {
      const cached = getCache(key)
      if (cached) { setTransactions(cached); setLoading(false); return }
    }
    try {
      const res = await transactionsAPI.list({ month: selMonth, year: selYear, limit: 200 })
      const raw  = res.data.data ?? res.data
      const data = Array.isArray(raw) ? raw : []
      setCache(key, data, 30_000)
      setTransactions(data)
    } catch { showToast('Erro ao carregar transações.', false) }
    finally { setLoading(false) }
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
      setParcOpen(true)
      setShowParcForm(true)
      routerNavigate(location.pathname, { replace: true, state: {} })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  useEffect(() => {
    setLoading(true)
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
  const balance       = totalIncome - totalExpenses
  const balancePos    = balance >= 0

  const filtered = transactions.filter(t => {
    const matchMonth  = t.month === selMonth && t.year === selYear
    const isFixed = t.category === 'fixed' && t.type === 'expense'
    const desc = (t.description || CATEGORY_LABELS[t.category] || '').toLowerCase()
    const cat  = (CATEGORY_LABELS[t.category] || '').toLowerCase()
    const matchSearch = !search || desc.includes(search.toLowerCase()) || cat.includes(search.toLowerCase())
    const matchFilter =
      filter === 'all'     ? !isFixed :
      filter === 'expense' ? t.type === 'expense' && !isFixed :
      filter === 'income'  ? t.type === 'income'  :
      true
    return matchMonth && matchSearch && matchFilter
  })

  const FILTER_PILLS = [
    { value: 'all',     label: 'Todas',    },
    { value: 'income',  label: 'Entradas', },
    { value: 'expense', label: 'Saídas',   },
  ]

  const grouped = (() => {
    const todayMs = new Date().setHours(0,0,0,0)
    const yestMs  = todayMs - 86400000
    const map     = new Map()
    filtered.forEach(t => {
      const dMs = new Date(t.date).setHours(0,0,0,0)
      const key = dMs === todayMs ? 'Hoje'
        : dMs === yestMs ? 'Ontem'
        : new Date(t.date).toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'short' })
      if (!map.has(key)) map.set(key, { txs: [], totalExp: 0, cats: {} })
      const entry = map.get(key)
      entry.txs.push(t)
      if (t.type === 'expense') {
        entry.totalExp += t.amount
        entry.cats[t.category] = (entry.cats[t.category] || 0) + t.amount
      }
    })
    return [...map.entries()]
  })()

  const comproms = monthTxs
    .filter(t => t.category === 'fixed' && t.type === 'expense')
    .sort((a, b) => new Date(a.date) - new Date(b.date))
  const compromsTotal = comproms.reduce((s, t) => s + t.amount, 0)

  const expsByCategory = monthTxs
    .filter(t => t.type === 'expense' && t.category !== 'fixed')
    .reduce((acc, t) => { acc[t.category] = (acc[t.category] || 0) + t.amount; return acc }, {})
  const topCats = Object.entries(expsByCategory).sort((a, b) => b[1] - a[1]).slice(0, 3)
  const totalVarExp = Object.values(expsByCategory).reduce((s, v) => s + v, 0)

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
        <div className="tx1-page">

          {/* ── Carrossel de meses ── */}
          <div className="tx1-month-nav">
            <button
              className="tx1-month-arrow"
              onClick={e => { goToPrev(); const b = e.currentTarget; b.classList.remove('press-left'); void b.offsetWidth; b.classList.add('press-left'); setTimeout(() => b.classList.remove('press-left'), 250) }}
              disabled={isOldestMonth}
              aria-label="Mês anterior"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <div className="tx1-carousel-wrap" ref={carouselWrapRef}>
              <div className="tx1-carousel" ref={carouselRef}>
                {carouselMonths.map(({ month, year, label }) => {
                  const active = month === selMonth && year === selYear
                  const bal    = getMonthBalance(month, year)
                  return (
                    <button
                      key={`${year}-${month}`}
                      className={`tx1-carousel-item${active ? ' on' : ''}`}
                      onClick={() => navigate(new Date(year, month - 1, 1))}
                    >
                      <span className="tx1-carousel-mon">{label}</span>
                      {year !== today.getFullYear() && <span className="tx1-carousel-year">'{String(year).slice(2)}</span>}
                      {bal !== null && (
                        <span className={`tx1-carousel-bal ${bal >= 0 ? 'pos' : 'neg'}`}>{bal >= 0 ? '+' : '−'}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
            <button
              className="tx1-month-arrow"
              onClick={e => { goToNext(); const b = e.currentTarget; b.classList.remove('press-right'); void b.offsetWidth; b.classList.add('press-right'); setTimeout(() => b.classList.remove('press-right'), 250) }}
              disabled={isCurrentMonth}
              aria-label="Próximo mês"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>

          {/* ── Hero card ── */}
          <div className="tx1-hero">
            <div className="tx1-hero-glow" />
            <div className="tx1-hero-glow tx1-hero-glow2" />
            <div className="grad-particles" aria-hidden="true">
              {[4,12,22,33,44,55,65,76,85,93].map((left, i) => (
                <span key={i} className="grad-particle" style={{
                  left:`${left}%`,
                  width: `${2 + (i % 3)}px`,
                  height: `${2 + (i % 3)}px`,
                  animationDelay: `${(i * 0.55) % 3}s`,
                  animationDuration: `${2.2 + (i % 4) * 0.6}s`,
                  opacity: 0.3 + (i % 3) * 0.15,
                }} />
              ))}
            </div>
            <div className={`tx1-hero-content tx1-anim-${selDir}`} key={animKey}>
            <div className="tx1-hero-left">
              <div className="tx1-hero-label">{MONTHS[selDate.getMonth()]} {selYear}</div>
              <div className="tx1-hero-balance" style={{ color: balancePos ? 'var(--t1)' : '#ff6b6b' }}>
                {balancePos ? '' : '−'}R$ {fmt(Math.abs(balance))}
              </div>
              <div className="tx1-hero-sub">saldo do mês</div>
              <span className="tx1-hero-badge" style={{ background: balancePos ? 'rgba(74,226,172,.15)' : 'rgba(255,71,87,.12)', color: balancePos ? '#4ae2ac' : '#ff4757', border: `1px solid ${balancePos ? 'rgba(74,226,172,.25)' : 'rgba(255,71,87,.2)'}` }}>
                {balancePos ? '↑ Positivo' : '↓ Negativo'}
              </span>
            </div>
            <div className="tx1-hero-stats">
              <div className="tx1-hero-stat">
                <div className="tx1-stat-ico" style={{ background:'rgba(74,226,172,.12)' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4ae2ac" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
                  </svg>
                </div>
                <div>
                  <div className="tx1-stat-lbl">Entradas</div>
                  <div className="tx1-stat-val" style={{ color:'#4ae2ac' }}>R$ {fmt(totalIncome)}</div>
                </div>
              </div>
              <div className="tx1-hero-stat">
                <div className="tx1-stat-ico" style={{ background:'rgba(255,107,107,.1)' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ff6b6b" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
                  </svg>
                </div>
                <div>
                  <div className="tx1-stat-lbl">Saídas</div>
                  <div className="tx1-stat-val" style={{ color:'#ff6b6b' }}>R$ {fmt(totalExpenses)}</div>
                </div>
              </div>
              <div className="tx1-hero-stat">
                <div className="tx1-stat-ico" style={{ background:'rgba(255,255,255,.06)' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="2.5" strokeLinecap="round">
                    <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                  </svg>
                </div>
                <div>
                  <div className="tx1-stat-lbl">Transações</div>
                  <div className="tx1-stat-val">{monthTxs.length}</div>
                </div>
              </div>
            </div>
            </div>{/* tx1-hero-content */}
          </div>

          <PlanUsageBanner
            plan={user?.plan ?? 'free'}
            feature="transactions"
            used={monthTxs.length}
            label="transações este mês"
          />

          {/* ── Parcelas ── */}
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

          {/* ── Compromissos do Mês ── */}
          {comproms.length > 0 && (
            <div className="comproms-section">
              <div className="comproms-header" onClick={() => setCompromsOpen(p => !p)}>
                <div className="comproms-header-left">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
                  </svg>
                  <span>Compromissos do mês</span>
                  <span className="parc-badge">{comproms.length}</span>
                </div>
                <div className="parc-header-right">
                  <span className="comproms-header-total">R$ {fmt(compromsTotal)}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                    style={{ transition:'transform .2s', transform: compromsOpen ? 'rotate(180deg)' : 'rotate(0deg)', opacity:.4 }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </div>
              </div>
              {compromsOpen && (
                <div className="comproms-body">
                  <div className="comproms-banner">
                    <div className="comproms-stat">
                      <span className="comproms-stat-num comproms-ok">{comproms.length}/{comproms.length}</span>
                      <span className="comproms-stat-lbl">registradas</span>
                    </div>
                    <div className="comproms-stat-div" />
                    <div className="comproms-stat">
                      <span className="comproms-stat-num">R$ {fmt(compromsTotal)}</span>
                      <span className="comproms-stat-lbl">este mês</span>
                    </div>
                    <div className="comproms-stat-div" />
                    <div className="comproms-stat">
                      <span className="comproms-stat-num comproms-ok">✓ Em dia</span>
                      <span className="comproms-stat-lbl">sem atrasos</span>
                    </div>
                  </div>
                  <div className="comproms-bills">
                    {comproms.map(t => (
                      <div key={t.id} className="comproms-bill paid">
                        <div className="comproms-check">
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        </div>
                        <div className="comproms-bill-info">
                          <span className="comproms-bill-name">{t.description || CATEGORY_LABELS[t.category] || t.category}</span>
                          <span className="comproms-bill-date">{new Date(t.date).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})}</span>
                        </div>
                        <span className="comproms-bill-amount">R$ {fmt(t.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Section: Gastos do Dia a Dia ── */}
          <div className="tx1-section-sep">
            <span className="tx1-section-title">Gastos do dia a dia</span>
          </div>

          {/* ── Toolbar ── */}
          <div className="tx1-toolbar">
            <div className="tx1-search-wrap">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink:0, color:'rgba(255,255,255,.3)' }}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                className="tx1-search"
                placeholder="Buscar descrição ou categoria…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && <button className="tx1-search-clear" onClick={() => setSearch('')}>×</button>}
            </div>
            <div className="tx1-pills">
              {FILTER_PILLS.map(p => (
                <button key={p.value} className={`tx1-pill${filter === p.value ? ' on' : ''}`} onClick={() => setFilter(p.value)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Lista agrupada ── */}
          <div className="tx1-list-card">
            {loading ? (
              <div className="tx1-empty"><div className="dsb-loader-ring" style={{ margin:'0 auto' }} /></div>
            ) : filtered.length === 0 ? (
              <div className="tx1-empty">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(74,226,172,.4)" strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom:12 }}>
                  <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                </svg>
                <div style={{ fontSize:14, fontWeight:600, color:'rgba(255,255,255,.4)', marginBottom:4 }}>Nenhuma transação encontrada</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,.2)' }}>{search || filter !== 'all' ? 'Ajuste os filtros de busca.' : comproms.length > 0 ? 'Nenhum gasto variável. Os compromissos aparecem acima.' : 'Registre sua primeira transação.'}</div>
              </div>
            ) : (
              <>
                {grouped.map(([dateLabel, { txs, totalExp, cats }]) => (
                  <div key={dateLabel}>
                    <div className="tx1-date-header">
                      <div className={`tx1-date-label${dateLabel === 'Hoje' ? ' is-today' : dateLabel === 'Ontem' ? ' is-yest' : ''}`}>{dateLabel}</div>
                      {totalExp > 0 && <span className="tx1-day-subtotal">−R$ {fmt(totalExp)}</span>}
                    </div>
                    {Object.keys(cats).length > 1 && (
                      <div className="tx1-day-cats">
                        {Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([cat, val]) => (
                          <span key={cat} className="tx1-day-cat-pill">
                            {CATEGORY_LABELS[cat] || cat} · R$ {fmt(val)}
                          </span>
                        ))}
                      </div>
                    )}
                    {txs.map(t => {
                      const isInc    = t.type === 'income'
                      const isFixed  = t.category === 'fixed'
                      const catLabel = CATEGORY_LABELS[t.category] || t.category
                      const desc     = t.description || catLabel
                      return (
                        <div key={t.id} className={`tx1-row${isInc ? ' is-inc' : ''}`}>
                          <div className={`tx1-row-ico ${isInc ? 'inc' : 'exp'}`}>
                            <CategoryIcon category={t.category} size={14} color="currentColor" />
                          </div>
                          <div className="tx1-row-info">
                            <div className="tx1-row-name">{desc}</div>
                            <div className="tx1-row-meta">
                              <span className={`tx1-tag ${isInc ? 'inc' : isFixed ? 'fix' : 'exp'}`}>{catLabel}</span>
                              <span className="tx1-row-type">{isFixed ? 'Fixa' : isInc ? 'Entrada' : 'Variável'}</span>
                            </div>
                          </div>
                          <div className="tx1-row-right">
                            <div className={`tx1-row-val ${isInc ? 'inc' : 'exp'}`}>{isInc ? '+' : '−'}R$ {fmt(t.amount)}</div>
                            <div className="tx1-row-date">{new Date(t.date).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})}</div>
                          </div>
                          <button className="tx1-del" style={{ color:'rgba(255,255,255,.25)' }} onClick={() => setEditingTx(t)} title="Editar">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                          </button>
                          <button className="tx1-del" onClick={() => setConfirmDeleteTx(t.id)} title="Remover" aria-label="Remover transação">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                              <polyline points="3 6 5 6 21 6"/>
                              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                              <path d="M10 11v6M14 11v6"/>
                            </svg>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                ))}
                {topCats.length >= 2 && !search && filter === 'all' && (
                  <div className="tx1-ai-box">
                    <div className="tx1-ai-header">
                      <div className="tx1-ai-icon">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                      </div>
                      <span>Análise do mês</span>
                    </div>
                    <div className="tx1-ai-insights">
                      <div className="tx1-ai-insight">
                        <span className="tx1-ai-insight-label">Maior gasto variável</span>
                        <span className="tx1-ai-insight-val">{CATEGORY_LABELS[topCats[0][0]] || topCats[0][0]} · R$ {fmt(topCats[0][1])} ({Math.round(topCats[0][1] / totalVarExp * 100)}% do total)</span>
                      </div>
                      <div className="tx1-ai-insight">
                        <span className="tx1-ai-insight-label">Top categorias</span>
                        <div className="tx1-ai-cats">
                          {topCats.map(([cat, val]) => (
                            <div key={cat} className="tx1-ai-cat-bar">
                              <span className="tx1-ai-cat-name">{CATEGORY_LABELS[cat] || cat}</span>
                              <div className="tx1-ai-bar-wrap">
                                <div className="tx1-ai-bar-fill" style={{ width:`${Math.round(val / topCats[0][1] * 100)}%` }} />
                              </div>
                              <span className="tx1-ai-cat-val">R$ {fmt(val)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                <div className="tx1-footer">
                  <span>{filtered.length} transação(ões)</span>
                </div>
              </>
            )}
          </div>

          {/* ── Ações ── */}
          <div className="tx1-toolbar-actions">
            <button className="tx1-btn-ghost" onClick={() => fileInputRef.current?.click()}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              Importar CSV
            </button>
            <button className="tx1-btn-ghost" onClick={() => exportCSV(filtered)} disabled={filtered.length === 0}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Exportar CSV
            </button>
            <button className="tx1-btn-primary" onClick={() => setShowForm(true)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Nova Transação
            </button>
          </div>

        </div>
      </div>

      <button className="fab" onClick={() => setShowForm(true)} aria-label="Nova transação">
        <svg viewBox="0 0 20 20" fill="currentColor" width="22" height="22">
          <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/>
        </svg>
      </button>

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
