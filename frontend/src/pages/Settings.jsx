import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { budgetAPI, reportsAPI, notificationsAPI } from '../services/api.js'
import { isInstalled, getInstallPrompt, clearInstallPrompt } from '../services/installPrompt.js'
import Navbar from '../components/Navbar.jsx'
import UpgradeModal from '../components/UpgradeModal.jsx'
import { useUser, saveUser } from '../hooks/useUser.js'
import { useTheme } from '../hooks/useTheme.js'

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

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export default function Settings() {
  const navigate = useNavigate()
  const user = useUser()
  const { theme, toggle: toggleTheme } = useTheme()
  const isPro = user.plan === 'pro'

  const nameParts  = (user.name || '').split(' ')
  const [firstName,     setFirstName]     = useState(nameParts[0] || '')
  const [lastName,      setLastName]      = useState(nameParts.slice(1).join(' ') || '')
  const [profileEmail,  setProfileEmail]  = useState(user.email || '')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg,    setProfileMsg]    = useState('')

  const [salary,        setSalary]        = useState(user.salary || 0)
  const [salaryDisplay, setSalaryDisplay] = useState(
    user.salary > 0 ? user.salary.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : ''
  )
  const [savingSal,  setSavingSal]  = useState(false)
  const [budgets,    setBudgets]    = useState([])
  const [newBudget,  setNewBudget]  = useState({ name: '', amount: '' })
  const [limits,     setLimits]     = useState([])
  const [newLimit,   setNewLimit]   = useState({ category: 'food', amount: '' })
  const [closing,    setClosing]    = useState(false)
  const [msg,        setMsg]        = useState('')
  const [msgType,    setMsgType]    = useState('success')
  const [upgradeModal, setUpgradeModal] = useState(null)
  const [notifStatus,  setNotifStatus]  = useState('loading')
  const [notifLoading, setNotifLoading] = useState(false)
  const [appInstalled, setAppInstalled] = useState(() => isInstalled())
  const [installMode,  setInstallMode]  = useState('idle')
  const [platform] = useState(() => {
    const ua = navigator.userAgent
    return { isIOS: /iPhone|iPad|iPod/.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua)) }
  })

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

  useEffect(() => {
    ;(async () => { await Promise.all([fetchBudgets(), fetchLimits()]) })()
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setNotifStatus('unsupported')
    } else {
      setNotifStatus(Notification.permission)
    }
    const onInstalled = () => setAppInstalled(true)
    const onPrompt = (e) => { e.preventDefault(); window.__installPrompt = e; setInstallMode('idle') }
    window.addEventListener('appinstalled', onInstalled)
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => {
      window.removeEventListener('appinstalled', onInstalled)
      window.removeEventListener('beforeinstallprompt', onPrompt)
    }
  }, [])

  const handleInstall = async () => {
    const prompt = getInstallPrompt()
    if (!prompt) { setInstallMode('fallback'); return }
    setInstallMode('installing')
    try {
      prompt.prompt()
      const { outcome } = await prompt.userChoice
      clearInstallPrompt()
      if (outcome === 'accepted') { setAppInstalled(true); setInstallMode('idle') }
      else { setInstallMode('fallback') }
    } catch { setInstallMode('fallback') }
  }

  const handleSaveProfile = (e) => {
    e.preventDefault()
    setSavingProfile(true)
    const fullName = [firstName, lastName].filter(Boolean).join(' ')
    const stored = JSON.parse(localStorage.getItem('user') || '{}')
    saveUser({ ...stored, name: fullName, email: profileEmail })
    setTimeout(() => {
      setSavingProfile(false)
      setProfileMsg('Perfil atualizado!')
      setTimeout(() => setProfileMsg(''), 3000)
    }, 300)
  }

  const handleSalary = async (e) => {
    e.preventDefault(); setSavingSal(true)
    try {
      await budgetAPI.updateSalary(salary)
      const stored = JSON.parse(localStorage.getItem('user') || '{}')
      saveUser({ ...stored, salary })
      showMsg('Salário atualizado com sucesso!')
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
    } catch { showMsg('Erro ao remover limite.', 'error') }
  }

  const handleToggleNotifications = async () => {
    if (notifStatus === 'unsupported' || notifLoading) return
    if (notifStatus === 'denied') {
      showMsg('Bloqueado — Ajustes > Finance > Notificações', 'error'); return
    }
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || !!navigator.standalone
    if (isIOS && !isStandalone) {
      showMsg('Adicione o app à tela inicial e abra de lá para ativar notificações.', 'error'); return
    }
    if (notifStatus === 'granted') {
      setNotifStatus('default')
      showMsg('Notificações desativadas.')
      navigator.serviceWorker.ready
        .then(reg => reg.pushManager.getSubscription())
        .then(sub => {
          if (!sub) return
          notificationsAPI.unsubscribe({ endpoint: sub.endpoint }).catch(() => {})
          sub.unsubscribe().catch(() => {})
        })
      return
    }
    setNotifLoading(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setNotifStatus(permission)
        if (permission === 'denied') showMsg('Permissão negada. Ajustes > Finance > Notificações.', 'error')
        return
      }
      setNotifStatus('granted')
      setNotifLoading(false)
      showMsg('Notificações ativadas!')
      const [{ data }, reg] = await Promise.all([
        notificationsAPI.getVapidKey(),
        navigator.serviceWorker.ready,
      ])
      if (!data.key) return
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.key),
      })
      await notificationsAPI.subscribe(sub.toJSON())
    } catch (err) {
      console.error('Push error:', err)
      setNotifStatus('default')
      showMsg(err.message || 'Erro ao ativar notificações.', 'error')
    } finally {
      setNotifLoading(false)
    }
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
  const initials   = user.name
    ? user.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
    : '?'

  return (
    <>
      <Navbar />

      {msg && (
        <div className={`toast ${msgType === 'error' ? 'terr' : 'tok'}`} style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 400, whiteSpace: 'nowrap' }}>
          {msg}
        </div>
      )}

      <div className="pwnav fade-in">
        <div className="dsb-content">
          <div className="cfg-wrap">

            {/* ── Hero ── */}
            <div className="cfg-hero r1">
              <div className="cfg-hero-glow-bg" />
              <div className="cfg-hero-particles" aria-hidden="true">
                {[
                  { left:  4, size: 3, delay: 0,   dur: 2.8 },
                  { left: 13, size: 4, delay: 0.9, dur: 3.2 },
                  { left: 25, size: 3, delay: 1.5, dur: 2.5 },
                  { left: 38, size: 5, delay: 0.4, dur: 3.5 },
                  { left: 52, size: 3, delay: 1.1, dur: 2.9 },
                  { left: 65, size: 4, delay: 0.7, dur: 3.1 },
                  { left: 78, size: 3, delay: 1.8, dur: 2.6 },
                  { left: 89, size: 4, delay: 0.3, dur: 3.3 },
                  { left: 96, size: 3, delay: 1.3, dur: 2.7 },
                ].map((p, i) => (
                  <span key={i} className="cfg-hero-particle" style={{
                    left: `${p.left}%`, width: p.size, height: p.size,
                    animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`,
                  }} />
                ))}
              </div>
              <div className="cfg-av">
                {initials}
                <div className="cfg-av-glow" />
              </div>
              <div className="cfg-hero-info">
                <div className="cfg-hero-name">{user.name || 'Usuário'}</div>
                <div className="cfg-hero-email">{user.email}</div>
                <div className="cfg-hero-badges">
                  <span className={`cfg-badge ${isPro ? 'pro' : 'free'}`}>{isPro ? 'Pro ✨' : 'Grátis'}</span>
                </div>
              </div>
            </div>

            {/* ── Perfil ── */}
            <div className="cfg-sec-title r2">Perfil</div>

            <div className="cfg-card r3">
              <div className="cfg-card-head">
                <div className="cfg-ch-ico">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ac46e" strokeWidth="2" strokeLinecap="round">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg>
                </div>
                <div>
                  <div className="cfg-ch-title">Informações pessoais</div>
                  <div className="cfg-ch-sub">Atualize seus dados de perfil</div>
                </div>
              </div>
              <form onSubmit={handleSaveProfile} className="cfg-card-body">
                <div className="cfg-grid2">
                  <div className="cfg-field">
                    <label className="cfg-lbl">Nome</label>
                    <input className="cfg-inp" type="text" value={firstName}
                      onChange={e => setFirstName(e.target.value)} placeholder="André" />
                  </div>
                  <div className="cfg-field">
                    <label className="cfg-lbl">Sobrenome</label>
                    <input className="cfg-inp" type="text" value={lastName}
                      onChange={e => setLastName(e.target.value)} placeholder="Pereira" />
                  </div>
                </div>
                <div className="cfg-field" style={{ marginBottom: 0 }}>
                  <label className="cfg-lbl">E-mail</label>
                  <input className="cfg-inp" type="email" value={profileEmail}
                    onChange={e => setProfileEmail(e.target.value)} placeholder="seu@email.com" />
                </div>
                <div className="cfg-form-footer">
                  {profileMsg && <span className="cfg-inline-ok">{profileMsg}</span>}
                  <button type="submit" className="cfg-btn-primary" disabled={savingProfile}>
                    {savingProfile ? 'Salvando…' : 'Salvar alterações'}
                  </button>
                </div>
              </form>
            </div>

            {/* ── Financeiro ── */}
            <div className="cfg-sec-title r4">Financeiro</div>

            {/* Salário */}
            <div className="cfg-card r5">
              <div className="cfg-card-head">
                <div className="cfg-ch-ico">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ac46e" strokeWidth="2" strokeLinecap="round">
                    <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
                  </svg>
                </div>
                <div>
                  <div className="cfg-ch-title">Salário mensal</div>
                  <div className="cfg-ch-sub">Usado para calcular seu saldo disponível</div>
                </div>
              </div>
              <form onSubmit={handleSalary} className="cfg-card-body">
                <div className="cfg-inp-group">
                  <span className="cfg-inp-prefix">R$</span>
                  <input
                    className="cfg-inp cfg-inp-prefixed"
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
                  <button type="submit" className="cfg-btn-primary" disabled={savingSal} style={{ flexShrink: 0 }}>
                    {savingSal ? 'Salvando…' : 'Salvar'}
                  </button>
                </div>
              </form>
            </div>

            {/* Contas Fixas */}
            <div className="cfg-card r6">
              <div className="cfg-card-head">
                <div className="cfg-ch-ico">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ac46e" strokeWidth="2" strokeLinecap="round">
                    <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                  </svg>
                </div>
                <div>
                  <div className="cfg-ch-title">Contas fixas</div>
                  <div className="cfg-ch-sub">Despesas recorrentes mensais</div>
                </div>
              </div>
              <div className="cfg-card-body">
                {budgets.length === 0 ? (
                  <div className="cfg-empty-hint">Nenhuma conta fixa cadastrada.</div>
                ) : (
                  <div className="cfg-fixed-list">
                    {budgets.map(b => (
                      <div key={b.id} className="cfg-fixed-item">
                        <span className="cfg-fixed-name">{b.name}</span>
                        <div className="cfg-fixed-right">
                          <span className="cfg-fixed-val">R$ {b.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                          <button className="cfg-del-btn" type="button" onClick={() => handleDeleteBudget(b.id)} aria-label="Remover">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className="cfg-fixed-total">
                      <span>Total mensal</span>
                      <span>R$ {totalFixed.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                )}
                <form onSubmit={handleAddBudget} className="cfg-add-row">
                  <input className="cfg-inp" type="text" placeholder="Nome da conta"
                    value={newBudget.name} onChange={e => setNewBudget(p => ({ ...p, name: e.target.value }))} />
                  <input className="cfg-inp cfg-inp-num" type="number" placeholder="Valor"
                    min="0" step="0.01" value={newBudget.amount}
                    onChange={e => setNewBudget(p => ({ ...p, amount: e.target.value }))} />
                  <button type="submit" className="cfg-btn-ghost">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    Adicionar
                  </button>
                </form>
              </div>
            </div>

            {/* ── Preferências ── */}
            <div className="cfg-sec-title r7">Preferências</div>

            {/* Aparência */}
            <div className="cfg-card" style={{ marginBottom: 12 }}>
              <div className="cfg-card-head">
                <div className="cfg-ch-ico">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ac46e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="5"/>
                    <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                  </svg>
                </div>
                <div>
                  <div className="cfg-ch-title">Aparência</div>
                  <div className="cfg-ch-sub">Escolha entre modo claro e escuro</div>
                </div>
              </div>
              <div className="cfg-notif-list">
                <div className="cfg-notif-row">
                  <div className="cfg-notif-info">
                    <div className="cfg-notif-label">{theme === 'dark' ? 'Modo escuro' : 'Modo claro'}</div>
                    <div className="cfg-notif-desc">{theme === 'dark' ? 'Interface em fundo escuro' : 'Interface em fundo claro'}</div>
                  </div>
                  <CfgToggle on={theme === 'dark'} onChange={toggleTheme} />
                </div>
              </div>
            </div>

            {/* Notificações */}
            <div className="cfg-card r8">
              <div className="cfg-card-head">
                <div className="cfg-ch-ico">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ac46e" strokeWidth="2" strokeLinecap="round">
                    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                    <path d="M13.73 21a2 2 0 01-3.46 0"/>
                  </svg>
                </div>
                <div>
                  <div className="cfg-ch-title">Notificações</div>
                  <div className="cfg-ch-sub">Gerencie seus alertas</div>
                </div>
              </div>
              <div className="cfg-notif-list">

                <div className="cfg-notif-row">
                  <div className="cfg-notif-info">
                    <div className="cfg-notif-label">Avisos de transações</div>
                    <div className={`cfg-notif-desc${notifStatus === 'granted' ? ' on' : notifStatus === 'denied' ? ' err' : ''}`}>
                      {notifStatus === 'unsupported' && 'Instale o app na tela inicial para usar notificações.'}
                      {notifStatus === 'denied'      && 'Bloqueado — habilite em Configurações > Finance.'}
                      {notifStatus === 'granted'     && 'Ativo — você recebe avisos de gastos e saldo.'}
                      {notifStatus === 'default'     && 'Receba avisos a cada transação registrada.'}
                      {notifStatus === 'loading'     && 'Verificando...'}
                    </div>
                  </div>
                  {notifStatus !== 'unsupported' && notifStatus !== 'loading' && (
                    <CfgToggle
                      on={notifStatus === 'granted'}
                      disabled={notifStatus === 'denied' || notifLoading}
                      onChange={handleToggleNotifications}
                    />
                  )}
                </div>

                <div className="cfg-notif-row">
                  <div className="cfg-notif-info">
                    <div className="cfg-notif-label">Lembrete de contas fixas</div>
                    <div className="cfg-notif-desc">Receba lembretes das suas despesas fixas.</div>
                  </div>
                  <CfgToggle on={false} onChange={() => {}} />
                </div>

                <div className="cfg-notif-row">
                  <div className="cfg-notif-info">
                    <div className="cfg-notif-label">Alerta de orçamento</div>
                    <div className="cfg-notif-desc">Notificação ao atingir 80% do limite.</div>
                  </div>
                  <CfgToggle on={false} onChange={() => {}} />
                </div>

                <div className="cfg-notif-row" style={{ borderBottom: 'none' }}>
                  <div className="cfg-notif-info">
                    <div className="cfg-notif-label">Relatório PDF por e-mail</div>
                    <div className="cfg-notif-desc">Receba o resumo mensal no seu e-mail.</div>
                  </div>
                  <CfgToggle
                    on={isPro}
                    onChange={() => { if (!isPro) setUpgradeModal('Receba relatórios PDF mensais. Recurso exclusivo do plano Pro.') }}
                  />
                </div>

              </div>
            </div>

            {/* Limites por categoria — Pro */}
            <div className="cfg-card r9">
              <div className="cfg-card-head">
                <div className="cfg-ch-ico">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ac46e" strokeWidth="2" strokeLinecap="round">
                    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
                  </svg>
                </div>
                <div>
                  <div className="cfg-ch-title">
                    Limites por categoria
                    {!isPro && <span className="cfg-pro-badge">PRO</span>}
                  </div>
                  <div className="cfg-ch-sub">Defina teto de gasto por categoria</div>
                </div>
              </div>
              <div className="cfg-card-body">
                {!isPro ? (
                  <div className="cfg-pro-lock" onClick={() => setUpgradeModal('Limites por categoria são exclusivos do plano Pro.')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4ac46e" strokeWidth="1.5" strokeLinecap="round">
                      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                    </svg>
                    <div className="cfg-pro-lock-title">Recurso Pro</div>
                    <div className="cfg-pro-lock-sub">Clique para fazer upgrade e desbloquear</div>
                  </div>
                ) : (
                  <>
                    {limits.length === 0 ? (
                      <div className="cfg-empty-hint">Nenhum limite definido.</div>
                    ) : (
                      <div className="cfg-fixed-list">
                        {limits.map(l => {
                          const cat = CATEGORIES.find(c => c.key === l.category)
                          return (
                            <div key={l.category} className="cfg-fixed-item">
                              <span className="cfg-fixed-name">{cat?.label || l.category}</span>
                              <div className="cfg-fixed-right">
                                <span className="cfg-fixed-val">R$ {l.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                <button className="cfg-del-btn" type="button" onClick={() => handleRemoveLimit(l.category)} aria-label="Remover">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                  </svg>
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    <form onSubmit={handleSaveLimit} className="cfg-add-row">
                      <select className="cfg-inp" value={newLimit.category}
                        onChange={e => setNewLimit(p => ({ ...p, category: e.target.value }))}>
                        {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                      </select>
                      <input className="cfg-inp cfg-inp-num" type="number" placeholder="R$ limite"
                        min="1" step="0.01" value={newLimit.amount}
                        onChange={e => setNewLimit(p => ({ ...p, amount: e.target.value }))} />
                      <button type="submit" className="cfg-btn-ghost">Salvar</button>
                    </form>
                  </>
                )}
              </div>
            </div>

            {/* Fechar mês — Pro */}
            <div className="cfg-card r10">
              <div className="cfg-card-head">
                <div className="cfg-ch-ico">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ac46e" strokeWidth="2" strokeLinecap="round">
                    <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/>
                    <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/>
                  </svg>
                </div>
                <div>
                  <div className="cfg-ch-title">
                    Fechar o mês
                    {!isPro && <span className="cfg-pro-badge">PRO</span>}
                  </div>
                  <div className="cfg-ch-sub">Gera PDF e envia para seu e-mail</div>
                </div>
              </div>
              <div className="cfg-card-body">
                {!isPro ? (
                  <div className="cfg-pro-lock" onClick={() => setUpgradeModal('O relatório PDF mensal é exclusivo do plano Pro.')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4ac46e" strokeWidth="1.5" strokeLinecap="round">
                      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                    </svg>
                    <div className="cfg-pro-lock-title">Recurso Pro</div>
                    <div className="cfg-pro-lock-sub">Gere relatórios PDF mensais e receba por e-mail</div>
                  </div>
                ) : (
                  <>
                    <p className="cfg-close-desc">
                      Gera PDF e envia para{' '}
                      <strong style={{ color: 'var(--t1)' }}>{user.reportEmail || user.email || 'seu e-mail'}</strong>.
                      {' '}Os registros do mês serão zerados.
                    </p>
                    <button className="cfg-btn-danger" onClick={handleMonthlyClose} disabled={closing}>
                      {closing ? (
                        <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Gerando relatório...</>
                      ) : (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/>
                            <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/>
                          </svg>
                          Fechar mês e enviar relatório
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Instalar App */}
            {!appInstalled && (
              <div className="cfg-card cfg-install-card r11">
                <div className="cfg-card-head">
                  <img src="/icon-192.png" alt="" className="cfg-app-ico" />
                  <div>
                    <div className="cfg-ch-title">Instalar Finance</div>
                    <div className="cfg-ch-sub">Acesse com um toque, sem abrir o navegador</div>
                  </div>
                </div>
                <div className="cfg-card-body">
                  {platform.isIOS ? (
                    <div className="cfg-install-steps">
                      <CfgInstallStep n="1" text={<>Toque no botão <strong style={{ color: 'var(--c)' }}>Compartilhar</strong> na barra do Safari</>} />
                      <CfgInstallStep n="2" text={<>Role e toque em <strong style={{ color: 'var(--c)' }}>"Adicionar à Tela de Início"</strong></>} />
                      <CfgInstallStep n="3" text={<>Toque em <strong style={{ color: 'var(--c)' }}>"Adicionar"</strong> no canto superior direito</>} />
                    </div>
                  ) : installMode === 'fallback' ? (
                    <div className="cfg-install-steps">
                      <CfgInstallStep n="1" text={<>Toque no menu <strong style={{ color: 'var(--c)' }}>⋮</strong> no canto superior direito do Chrome</>} />
                      <CfgInstallStep n="2" text={<>Toque em <strong style={{ color: 'var(--c)' }}>"Instalar app"</strong> ou <strong style={{ color: 'var(--c)' }}>"Adicionar à tela inicial"</strong></>} />
                    </div>
                  ) : (
                    <button className="cfg-btn-primary" style={{ width: '100%', justifyContent: 'center' }}
                      onClick={handleInstall} disabled={installMode === 'installing'}>
                      {installMode === 'installing' ? 'Instalando…' : '⚡ Instalar agora'}
                    </button>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {upgradeModal && (
        <UpgradeModal reason={upgradeModal} onClose={() => { setUpgradeModal(null); navigate('/planos') }} />
      )}
    </>
  )
}

function CfgToggle({ on, disabled, onChange }) {
  return (
    <button
      type="button"
      className={`cfg-toggle${on ? ' on' : ''}`}
      onClick={onChange}
      disabled={disabled}
      aria-label="Toggle"
    >
      <span className="cfg-toggle-thumb" />
    </button>
  )
}

function CfgInstallStep({ n, text }) {
  return (
    <div className="cfg-install-step">
      <div className="cfg-step-n">{n}</div>
      <div className="cfg-step-text">{text}</div>
    </div>
  )
}
