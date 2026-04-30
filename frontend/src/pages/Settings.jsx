// ═══════════════════════════════════════════════════════
// ⚙️  src/pages/Settings.jsx — Configurações
// ═══════════════════════════════════════════════════════

import { useState, useEffect } from 'react'
import { budgetAPI, reportsAPI } from '../services/api.js'
import Navbar from '../components/Navbar.jsx'

// Botão de exclusão com confirmação inline (sem window.confirm)
function DeleteBudgetButton({ id, onDeleted, onError }) {
  const [confirm,  setConfirm]  = useState(false) // true = mostrando "Tem certeza?"
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await budgetAPI.remove(id)
      onDeleted()
    } catch (err) {
      onError(err.response?.data?.error || 'Erro ao remover conta fixa.')
      setConfirm(false)
    } finally {
      setDeleting(false)
    }
  }

  if (deleting) return <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>removendo...</span>

  if (confirm) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 12, color: 'var(--color-red)' }}>Tem certeza?</span>
      <button onClick={handleDelete} style={{
        background: 'var(--color-red)', border: 'none', color: '#fff',
        borderRadius: 6, padding: '3px 10px', cursor: 'pointer',
        fontFamily: 'inherit', fontSize: 12, fontWeight: 600
      }}>Sim</button>
      <button onClick={() => setConfirm(false)} style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)',
        borderRadius: 6, padding: '3px 10px', cursor: 'pointer',
        fontFamily: 'inherit', fontSize: 12
      }}>Não</button>
    </div>
  )

  return (
    <button onClick={() => setConfirm(true)} style={{
      background: 'none', border: 'none', color: 'var(--text-muted)',
      cursor: 'pointer', fontSize: 18, padding: '2px 6px', transition: 'color 0.2s',
      lineHeight: 1
    }}
      title="Remover conta fixa"
      onMouseEnter={e => e.currentTarget.style.color = 'var(--color-red)'}
      onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
    >✕</button>
  )
}

// Categorias disponíveis para limites
const CATEGORIES = [
  { key: 'food',       label: '🍔 Alimentação'  },
  { key: 'shopping',  label: '🛍️ Shopping'      },
  { key: 'transport', label: '🚗 Transporte'    },
  { key: 'health',    label: '💊 Saúde'         },
  { key: 'leisure',   label: '🎮 Lazer'         },
  { key: 'education', label: '📚 Educação'      },
  { key: 'home',      label: '🏠 Casa'          },
  { key: 'other',     label: '📦 Outros'        },
]

export default function Settings() {
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const [salary,     setSalary]     = useState(user.salary || 0)
  const [budgets,    setBudgets]    = useState([])
  const [limits,     setLimits]     = useState([]) // limites por categoria
  const [newBudget,  setNewBudget]  = useState({ name: '', amount: '' })
  const [newLimit,   setNewLimit]   = useState({ category: 'food', amount: '' })
  const [savingSal,  setSavingSal]  = useState(false)
  const [closing,    setClosing]    = useState(false)
  const [msg,        setMsg]        = useState('')
  const [msgType,    setMsgType]    = useState('') // 'success' | 'error'

  const showMsg = (text, type = 'success') => {
    setMsg(text); setMsgType(type)
    setTimeout(() => setMsg(''), 4000)
  }

  const fetchBudgets = async () => {
    try {
      const res = await budgetAPI.list()
      setBudgets(res.data)
    } catch (err) { console.error(err) }
  }

  const fetchLimits = async () => {
    try {
      const res = await budgetAPI.getLimits()
      setLimits(res.data)
    } catch (err) { console.error(err) }
  }

  useEffect(() => { fetchBudgets(); fetchLimits() }, [])

  const handleSaveLimit = async (e) => {
    e.preventDefault()
    if (!newLimit.amount) return
    try {
      await budgetAPI.setLimit({ category: newLimit.category, amount: parseFloat(newLimit.amount) })
      setNewLimit(p => ({ ...p, amount: '' }))
      fetchLimits()
      showMsg('✅ Limite salvo!')
    } catch (err) { showMsg(err.response?.data?.error || 'Erro ao salvar limite.', 'error') }
  }

  const handleRemoveLimit = async (category) => {
    try {
      await budgetAPI.removeLimit(category)
      fetchLimits()
      showMsg('🗑️ Limite removido.')
    } catch (err) { showMsg('Erro ao remover limite.', 'error') }
  }

  const handleSalary = async (e) => {
    e.preventDefault(); setSavingSal(true)
    try {
      await budgetAPI.updateSalary(salary)
      const stored = JSON.parse(localStorage.getItem('user') || '{}')
      localStorage.setItem('user', JSON.stringify({ ...stored, salary }))
      showMsg('✅ Salário atualizado com sucesso!')
    } catch { showMsg('Erro ao salvar salário.', 'error') }
    finally  { setSavingSal(false) }
  }

  const handleAddBudget = async (e) => {
    e.preventDefault()
    if (!newBudget.name || !newBudget.amount) return
    try {
      await budgetAPI.create(newBudget)
      setNewBudget({ name: '', amount: '' })
      fetchBudgets()
      showMsg('✅ Conta fixa adicionada!')
    } catch { showMsg('Erro ao adicionar conta fixa.', 'error') }
  }

  const handleDeleteBudget = async (id) => {
    try {
      await budgetAPI.remove(id)
      fetchBudgets()
      showMsg('🗑️ Conta fixa removida.')
    } catch (err) {
      showMsg(err.response?.data?.error || 'Erro ao remover conta fixa.', 'error')
    }
  }

  const handleMonthlyClose = async () => {
    if (!window.confirm(
      '⚠️ Isso vai gerar o relatório em PDF, enviar para o seu e-mail e zerar os gastos do mês atual.\n\nDeseja continuar?'
    )) return

    setClosing(true)
    try {
      const res = await reportsAPI.monthlyClose()
      showMsg(`📧 ${res.data.message}`)
    } catch (err) {
      showMsg(err.response?.data?.error || 'Erro ao fechar o mês.', 'error')
    } finally {
      setClosing(false)
    }
  }

  const totalFixed = budgets.reduce((s, b) => s + b.amount, 0)

  return (
    <>
      <Navbar />
      <div className="page page-with-nav fade-in" style={{ maxWidth: 700 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>⚙️ Configurações</h1>
        <p className="text-muted mb-24" style={{ marginBottom: 28 }}>Gerencie seu salário, contas fixas e e-mail de relatórios</p>

        {/* Mensagem de feedback */}
        {msg && (
          <div style={{
            padding: '14px 18px', borderRadius: 12, marginBottom: 20, fontSize: 14, fontWeight: 500,
            background: msgType === 'error' ? 'rgba(255,71,87,0.12)' : 'rgba(0,208,132,0.12)',
            border: `1px solid ${msgType === 'error' ? 'rgba(255,71,87,0.3)' : 'rgba(0,208,132,0.3)'}`,
            color: msgType === 'error' ? 'var(--color-red)' : 'var(--color-green)'
          }}>
            {msg}
          </div>
        )}

        {/* Salário */}
        <div className="card mb-16" style={{ marginBottom: 16 }}>
          <h3 style={{ fontWeight: 700, marginBottom: 16 }}>💰 Salário Mensal</h3>
          <form onSubmit={handleSalary} className="form-row" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label className="label">Valor em R$</label>
              <input className="input" type="number" value={salary} min="0" step="0.01"
                onChange={e => setSalary(parseFloat(e.target.value) || 0)} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', minWidth: 140 }}>
              <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={savingSal}>
                {savingSal ? 'Salvando...' : '💾 Salvar'}
              </button>
            </div>
          </form>
        </div>

        {/* Contas Fixas */}
        <div className="card mb-16" style={{ marginBottom: 16 }}>
          <div className="flex-between mb-16">
            <h3 style={{ fontWeight: 700 }}>📋 Contas Fixas</h3>
            <span className="badge badge-orange">
              Total: R$ {totalFixed.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>

          {/* Lista de contas */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {budgets.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Nenhuma conta fixa cadastrada ainda.</p>
            ) : budgets.map(b => (
              <div key={b.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px', background: 'rgba(255,255,255,0.03)',
                borderRadius: 10, border: '1px solid var(--border)'
              }}>
                <span style={{ fontWeight: 500 }}>📌 {b.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span style={{ color: 'var(--color-orange)', fontWeight: 700 }}>
                    R$ {b.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                  <DeleteBudgetButton
                    id={b.id}
                    onDeleted={() => { fetchBudgets(); showMsg('🗑️ Conta fixa removida.') }}
                    onError={(msg) => showMsg(msg, 'error')}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Adicionar nova conta */}
          <form onSubmit={handleAddBudget} className="form-row" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 2, minWidth: 180 }}>
              <label className="label">Nome</label>
              <input className="input" placeholder="Ex: Aluguel, Luz, Internet..."
                value={newBudget.name} onChange={e => setNewBudget(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <label className="label">Valor (R$)</label>
              <input className="input" type="number" placeholder="500" min="0" step="0.01"
                value={newBudget.amount} onChange={e => setNewBudget(p => ({ ...p, amount: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', minWidth: 120 }}>
              <button type="submit" className="btn btn-ghost" style={{ width: '100%' }}>＋ Adicionar</button>
            </div>
          </form>
        </div>

        {/* Limites por Categoria */}
        <div className="card mb-16" style={{ marginBottom: 16 }}>
          <h3 style={{ fontWeight: 700, marginBottom: 6 }}>🏷️ Limites por Categoria</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
            Defina quanto você pode gastar por mês em cada categoria. O Dashboard vai alertar quando estiver chegando no limite.
          </p>

          {/* Lista de limites existentes */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {limits.length === 0
              ? <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Nenhum limite definido ainda.</p>
              : limits.map(l => {
                  const cat = CATEGORIES.find(c => c.key === l.category)
                  return (
                    <div key={l.category} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 16px', background: 'rgba(255,255,255,0.03)',
                      borderRadius: 10, border: '1px solid var(--border)'
                    }}>
                      <span style={{ fontWeight: 500 }}>{cat?.label || l.category}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <span style={{ color: 'var(--color-green)', fontWeight: 700 }}>
                          R$ {l.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês
                        </span>
                        <button onClick={() => handleRemoveLimit(l.category)} style={{
                          background: 'none', border: 'none', color: 'var(--text-muted)',
                          cursor: 'pointer', fontSize: 18, lineHeight: 1,
                          transition: 'color 0.2s'
                        }}
                          onMouseEnter={e => e.currentTarget.style.color = 'var(--color-red)'}
                          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                          title="Remover limite"
                        >✕</button>
                      </div>
                    </div>
                  )
                })
            }
          </div>

          {/* Formulário para adicionar/atualizar limite */}
          <form onSubmit={handleSaveLimit} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 2, minWidth: 160 }}>
              <label className="label">Categoria</label>
              <select className="input" value={newLimit.category}
                onChange={e => setNewLimit(p => ({ ...p, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <label className="label">Limite (R$)</label>
              <input className="input" type="number" placeholder="500" min="1" step="0.01"
                value={newLimit.amount} onChange={e => setNewLimit(p => ({ ...p, amount: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button type="submit" className="btn btn-ghost">💾 Salvar</button>
            </div>
          </form>
        </div>

        {/* Fechamento Mensal */}
        <div className="card" style={{ borderColor: 'rgba(255,71,87,0.2)' }}>
          <h3 style={{ fontWeight: 700, marginBottom: 8 }}>📅 Fechar o Mês</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>
            Gera um relatório PDF completo com todos os gastos e entradas do mês atual,
            envia para o seu e-mail (<strong style={{ color: 'var(--text-primary)' }}>{user.email}</strong>) e
            zera os registros para o próximo ciclo.
          </p>
          <button className="btn btn-danger" onClick={handleMonthlyClose} disabled={closing}>
            {closing
              ? <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Gerando relatório...</>
              : '📧 Fechar Mês e Enviar Relatório'
            }
          </button>
        </div>
      </div>
    </>
  )
}
