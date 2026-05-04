import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { budgetAPI, reportsAPI } from '../services/api.js'
import Navbar from '../components/Navbar.jsx'
import UpgradeModal from '../components/UpgradeModal.jsx'

const CATEGORIES = [
  { key: 'food',      label: 'Alimentação' },
  { key: 'shopping',  label: 'Shopping'    },
  { key: 'transport', label: 'Transporte'  },
  { key: 'health',    label: 'Saúde'       },
  { key: 'leisure',   label: 'Lazer'       },
  { key: 'education', label: 'Educação'    },
  { key: 'home',      label: 'Casa'        },
  { key: 'other',     label: 'Outros'      },
]

export default function Settings() {
  const navigate = useNavigate()
  let user = {}
  try { user = JSON.parse(localStorage.getItem('user') || '{}') } catch { user = {} }
  const isPro = user.plan === 'pro'
  const [salary,    setSalary]    = useState(user.salary || 0)
  const [salaryDisplay, setSalaryDisplay] = useState(
    user.salary > 0
      ? user.salary.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
      : ''
  )
  const [budgets,      setBudgets]      = useState([])
  const [limits,       setLimits]       = useState([])
  const [newBudget,    setNewBudget]     = useState({ name: '', amount: '' })
  const [newLimit,     setNewLimit]      = useState({ category: 'food', amount: '' })
  const [savingSal,    setSavingSal]     = useState(false)
  const [closing,      setClosing]       = useState(false)
  const [msg,          setMsg]           = useState('')
  const [msgType,      setMsgType]       = useState('success')
  const [upgradeModal, setUpgradeModal]  = useState(null)

  const showMsg = (text, type = 'success') => {
    setMsg(text); setMsgType(type)
    setTimeout(() => setMsg(''), 4000)
  }

  const fetchBudgets = async () => {
    try { const res = await budgetAPI.list(); setBudgets(res.data) }
    catch (err) { console.error(err) }
  }
  const fetchLimits = async () => {
    try { const res = await budgetAPI.getLimits(); setLimits(res.data) }
    catch (err) { console.error(err) }
  }

  useEffect(() => { fetchBudgets(); fetchLimits() }, [])

  const handleSalary = async (e) => {
    e.preventDefault(); setSavingSal(true)
    try {
      await budgetAPI.updateSalary(salary)
      const stored = JSON.parse(localStorage.getItem('user') || '{}')
      localStorage.setItem('user', JSON.stringify({ ...stored, salary }))
      showMsg('Salário atualizado com sucesso')
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
      showMsg('Conta fixa adicionada!')
    } catch { showMsg('Erro ao adicionar conta fixa.', 'error') }
  }

  const handleDeleteBudget = async (id) => {
    try {
      await budgetAPI.remove(id)
      fetchBudgets()
      showMsg('Conta fixa removida.')
    } catch (err) { showMsg(err.response?.data?.error || 'Erro ao remover.', 'error') }
  }

  const handleSaveLimit = async (e) => {
    e.preventDefault()
    if (!newLimit.amount) return
    try {
      await budgetAPI.setLimit({ category: newLimit.category, amount: parseFloat(newLimit.amount) })
      setNewLimit(p => ({ ...p, amount: '' }))
      fetchLimits()
      showMsg('Limite salvo!')
    } catch (err) { showMsg(err.response?.data?.error || 'Erro ao salvar limite.', 'error') }
  }

  const handleRemoveLimit = async (category) => {
    try {
      await budgetAPI.removeLimit(category)
      fetchLimits()
      showMsg('Limite removido.')
    } catch { showMsg('Erro ao remover limite.', 'error') }
  }

  const handleMonthlyClose = async () => {
    if (!window.confirm('Isso vai gerar o PDF, enviar para o seu e-mail e zerar os gastos do mês.\n\nDeseja continuar?')) return
    setClosing(true)
    try {
      const res = await reportsAPI.monthlyClose()
      showMsg(res.data.message)
    } catch (err) { showMsg(err.response?.data?.error || 'Erro ao fechar o mês.', 'error') }
    finally { setClosing(false) }
  }

  const totalFixed = budgets.reduce((s, b) => s + b.amount, 0)

  return (
    <>
      <Navbar />
      <div className="page pwnav fade-in" style={{ maxWidth: 740 }}>

        {/* Header */}
        <div className="pgh">
          <div>
            <div className="pgt">Configurações</div>
            <div className="pgs">Gerencie seu perfil e preferências</div>
          </div>
        </div>

        {/* Toast de feedback */}
        {msg && (
          <div className={`toast ${msgType === 'error' ? 'terr' : 'tok'} mb16`}>
            <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
              {msgType === 'error'
                ? <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                : <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
              }
            </svg>
            {msg}
          </div>
        )}

        {/* Salário */}
        <div className="card mb16">
          <div className="sct" style={{ marginBottom: 14 }}>Salário Mensal</div>
          <form onSubmit={handleSalary} className="sfrow">
            <div className="inp-prefix-wrap" style={{ flex: 1, minWidth: 180 }}>
              <span className="inp-prefix">R$</span>
              <input
                className="inp inp-prefixed"
                type="text"
                inputMode="decimal"
                value={salaryDisplay}
                placeholder="0,00"
                onChange={e => {
                  const raw = e.target.value.replace(/[^0-9,]/g, '')
                  setSalaryDisplay(raw)
                  setSalary(parseFloat(raw.replace(',', '.')) || 0)
                }}
                onBlur={() => {
                  if (salary > 0) setSalaryDisplay(salary.toLocaleString('pt-BR', { minimumFractionDigits: 2 }))
                  else setSalaryDisplay('')
                }}
              />
            </div>
            <button type="submit" className="btn bp" style={{ minWidth: 130, justifyContent: 'center' }} disabled={savingSal}>
              <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                <path d="M7.707 10.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V6h5a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2h5v5.586l-1.293-1.293z"/>
              </svg>
              {savingSal ? 'Salvando...' : 'Salvar'}
            </button>
          </form>
        </div>

        {/* Contas Fixas */}
        <div className="card mb16">
          <div className="sct" style={{ marginBottom: 14 }}>
            Contas Fixas
            <span className="bdg borange">Total: R$ {totalFixed.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
          </div>

          {budgets.length === 0 ? (
            <p style={{ color: 'var(--t2)', fontSize: 14, marginBottom: 14 }}>Nenhuma conta fixa cadastrada.</p>
          ) : budgets.map(b => (
            <div key={b.id} className="fxi">
              <span className="fxn">{b.name}</span>
              <div className="fx g8">
                <span className="fxv">R$ {b.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                <button
                  className="btn bg txrm"
                  style={{ padding: '5px 10px', fontSize: 12, color: 'var(--red)', borderColor: 'rgba(255,71,87,.2)' }}
                  onClick={() => handleDeleteBudget(b.id)}
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" width="12" height="12">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
                  </svg>
                </button>
              </div>
            </div>
          ))}

          <form onSubmit={handleAddBudget} className="sfrow" style={{ marginTop: 14 }}>
            <input className="inp" type="text" placeholder="Nome da conta" style={{ flex: 2, minWidth: 160 }}
              value={newBudget.name} onChange={e => setNewBudget(p => ({ ...p, name: e.target.value }))} />
            <input className="inp" type="number" placeholder="R$ valor" style={{ flex: 1, minWidth: 110 }}
              value={newBudget.amount} min="0" step="0.01"
              onChange={e => setNewBudget(p => ({ ...p, amount: e.target.value }))} />
            <button type="submit" className="btn bg" style={{ minWidth: 110, justifyContent: 'center' }}>
              <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/>
              </svg>
              Adicionar
            </button>
          </form>
        </div>

        {/* Limites por Categoria — exclusivo Pro */}
        <div className="card mb16" style={{ position: 'relative', overflow: 'hidden' }}>
          <div className="sct" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            Limites por Categoria
            {!isPro && <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--c)', color: '#020d10', padding: '2px 7px', borderRadius: 20 }}>PRO</span>}
          </div>
          <p style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 14 }}>
            Defina teto de gasto por categoria para alertas automáticos.
          </p>

          {!isPro ? (
            <div
              onClick={() => setUpgradeModal('Limites por categoria são exclusivos do plano Pro.')}
              style={{ cursor: 'pointer', padding: '16px', background: 'rgba(0,255,204,.04)', border: '1px dashed rgba(0,255,204,.2)', borderRadius: 10, textAlign: 'center' }}
            >
              <div style={{ fontSize: 22, marginBottom: 6 }}>🔒</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c)', marginBottom: 4 }}>Recurso Pro</div>
              <div style={{ fontSize: 12, color: 'var(--t2)' }}>Clique para fazer upgrade e desbloquear</div>
            </div>
          ) : (
            <>
              {limits.length === 0 ? (
                <p style={{ color: 'var(--t2)', fontSize: 14, marginBottom: 14 }}>Nenhum limite definido.</p>
              ) : limits.map(l => {
                const cat = CATEGORIES.find(c => c.key === l.category)
                return (
                  <div key={l.category} className="fxi" style={{ marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', fontFamily: 'var(--fd)' }}>
                      {cat?.label || l.category}
                    </span>
                    <div className="fx g8">
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c)' }}>
                        R$ {l.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                      <button className="txrm" onClick={() => handleRemoveLimit(l.category)}>
                        <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                )
              })}
              <form onSubmit={handleSaveLimit} className="sfrow">
                <select className="inp" style={{ flex: 1, minWidth: 150 }}
                  value={newLimit.category} onChange={e => setNewLimit(p => ({ ...p, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
                <input className="inp" type="number" placeholder="R$ limite" style={{ flex: 1, minWidth: 110 }}
                  value={newLimit.amount} min="1" step="0.01"
                  onChange={e => setNewLimit(p => ({ ...p, amount: e.target.value }))} />
                <button type="submit" className="btn bg" style={{ minWidth: 110, justifyContent: 'center' }}>Salvar</button>
              </form>
            </>
          )}
        </div>

        {/* Fechar Mês — exclusivo Pro */}
        <div className="card" style={{ borderColor: isPro ? 'rgba(255,71,87,.15)' : 'rgba(0,255,204,.15)' }}>
          <div className="sct" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            Fechar o Mês
            {!isPro && <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--c)', color: '#020d10', padding: '2px 7px', borderRadius: 20 }}>PRO</span>}
          </div>
          {!isPro ? (
            <div
              onClick={() => setUpgradeModal('O relatório PDF mensal é exclusivo do plano Pro.')}
              style={{ cursor: 'pointer', padding: '16px', background: 'rgba(0,255,204,.04)', border: '1px dashed rgba(0,255,204,.2)', borderRadius: 10, textAlign: 'center' }}
            >
              <div style={{ fontSize: 22, marginBottom: 6 }}>🔒</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c)', marginBottom: 4 }}>Recurso Pro</div>
              <div style={{ fontSize: 12, color: 'var(--t2)' }}>Gere relatórios PDF mensais e receba por e-mail</div>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 16 }}>
                Gera PDF e envia para{' '}
                <strong style={{ color: 'var(--t1)' }}>{user.reportEmail || user.email || 'seu e-mail'}</strong>.
                {' '}Registros serão zerados.
              </p>
              <button className="btn bd" onClick={handleMonthlyClose} disabled={closing}>
                {closing ? (
                  <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Gerando relatório...</>
                ) : (
                  <>
                    <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
                      <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/>
                      <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/>
                    </svg>
                    Fechar Mês e Enviar Relatório
                  </>
                )}
              </button>
            </>
          )}
        </div>

      </div>

      {upgradeModal && (
        <UpgradeModal reason={upgradeModal} onClose={() => { setUpgradeModal(null); navigate('/planos') }} />
      )}
    </>
  )
}
