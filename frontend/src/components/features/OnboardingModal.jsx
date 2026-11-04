import { useState } from 'react'
import { authAPI, budgetAPI, goalsAPI } from '../../services/api.js'
import { invalidateCache } from '../../services/cache.js'
import { useEscapeKey } from '../../hooks/useEscapeKey.js'
import { useUser, saveUser } from '../../hooks/useUser.js'
import { analytics } from '../../services/analytics.js'
import { useIsDesktop } from '../../hooks/useIsDesktop.js'
import OnboardingDesktop from './OnboardingDesktop.jsx'

const IconChevronLeft = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
)

const STEP_TITLES = { 1: 'Vamos começar', 2: 'Contas fixas', 3: 'Primeira meta' }

export default function OnboardingModal() {
  const user = useUser()

  // Pula a pergunta de salário (passo 1) quando o usuário já informou no
  // cadastro — perguntar de novo logo em seguida é redundante e confuso.
  const [step,           setStep]           = useState(() => user.salary > 0 ? 2 : 1)
  const [saving,         setSaving]         = useState(false)
  const [salary,         setSalary]         = useState(() => user.salary > 0 ? String(user.salary) : '')
  const [bName,          setBName]          = useState('')
  const [bAmount,        setBAmount]        = useState('')
  const [budgetsAdded,   setBudgetsAdded]   = useState(0)
  const [budgetErr,      setBudgetErr]      = useState('')
  const [gTitle,         setGTitle]         = useState('')
  const [gAmount,        setGAmount]        = useState('')
  const [confirmSkip,    setConfirmSkip]    = useState(false) // diálogo do app: "Pular sem salvar o salário?"
  const [salaryErr,      setSalaryErr]      = useState('')
  const [goalErr,        setGoalErr]        = useState('')
  const [contaErr,       setContaErr]       = useState('')
  useEscapeKey(() => setConfirmSkip(false), confirmSkip)
  const isDesktop = useIsDesktop() // no desktop os Primeiros passos têm layout próprio (design "Nancy Desktop"); a lógica é a mesma

  // Fonte de verdade é o servidor (onboardingComplete), não uma flag local —
  // antes disso dependia de sessionStorage.just_registered, que some ao
  // fechar o app/aba. Quem fechava o app no meio do onboarding (sem terminar)
  // nunca mais via o modal de novo, mesmo com onboardingComplete ainda false
  // no banco.
  if (!user.id || user.onboardingComplete) return null

  const finish = async () => {
    setSaving(true)
    try { await authAPI.completeOnboarding() } catch {}
    analytics.track('onboarding_completed')
    // Usa o `user` vivo do hook, não uma cópia do sessionStorage — ver mesmo
    // fix em ProfileCard.jsx (apagava salary/reportEmail do estado global).
    saveUser({ ...user, onboardingComplete: true })
    // O Início já carregou (vazio) por trás do onboarding: sem este aviso ele ficava zerado até a pessoa recarregar a página.
    invalidateCache('dashboard')
    window.dispatchEvent(new CustomEvent('budget-updated'))
  }

  const handleNext = async () => {
    if (step === 1) {
      // Vazio ou ≤ 0 seguia em frente sem dizer nada (achado N2-1), e uma falha ao salvar também: a pessoa achava que o salário
      // tinha sido guardado. Agora só avança com o salário salvo — ou por "Pular por agora".
      const v = parseFloat(salary)
      if (salary.trim() === '') { setSalaryErr('Informe seu salário ou toque em "Pular por agora".'); return }
      if (!(v > 0)) { setSalaryErr('Informe um valor maior que zero.'); return }
      setSalaryErr('')
      setSaving(true)
      try {
        await budgetAPI.updateSalary(v)
        saveUser({ ...user, salary: v })
        setStep(2)
      } catch (err) {
        setSalaryErr(err.response?.data?.error || 'Não foi possível salvar o salário agora. Tente de novo ou toque em "Pular por agora".')
      } finally {
        setSaving(false)
      }
    } else if (step === 2) {
      // Conta digitada e não adicionada ("+ Adicionar conta") se perdia em silêncio ao continuar (achado da revisão independente).
      if (bName.trim() || bAmount.trim()) {
        setContaErr('Toque em "+ Adicionar conta" para guardar esta conta, ou limpe os campos para continuar.')
        return
      }
      setStep(3)
    } else {
      // Meta é opcional, mas preenchida pela metade ou com falha ao criar não pode passar como se tivesse sido criada.
      if (gTitle.trim() || gAmount.trim()) {
        if (!gTitle.trim() || !(parseFloat(gAmount) > 0)) { setGoalErr('Informe o nome e um valor-alvo maior que zero, ou toque em "Pular por agora".'); return }
        setGoalErr('')
        setSaving(true)
        try {
          await goalsAPI.create({ title: gTitle.trim(), targetAmount: parseFloat(gAmount) })
        } catch (err) {
          setGoalErr(err.response?.data?.error || 'Não foi possível criar a meta agora. Tente de novo ou toque em "Pular por agora".')
          setSaving(false)
          return
        }
      }
      await finish()
    }
  }

  // No passo 1, "Pular" descartava o salário digitado sem avisar — fácil de
  // clicar por engano com o botão "Continuar" logo ao lado. Também usada pelo
  // botão de voltar quando ele está no passo 1 (não tem passo anterior dentro
  // do onboarding pra onde voltar — pular é a ação equivalente).
  const skip = () => {
    setConfirmSkip(false)
    if (step < 3) setStep(s => s + 1)
    else finish()
  }
  const handleSkip = () => {
    if (step === 1 && parseFloat(salary) > 0) { setConfirmSkip(true); return } // confirma no próprio app (não no diálogo do navegador)
    skip()
  }

  const handleBack = () => {
    if (step === 1) handleSkip()
    else setStep(s => s - 1)
  }

  const handleAddBudget = async () => {
    if (!bName.trim() || !(parseFloat(bAmount) > 0) || saving) return
    setSaving(true)
    setBudgetErr('')
    try {
      await budgetAPI.create({ name: bName.trim(), amount: parseFloat(bAmount) })
      setBudgetsAdded(n => n + 1)
      setBName('')
      setBAmount('')
      setContaErr('')
    } catch (err) {
      if (err.response?.data?.limitReached) {
        setBudgetErr('Limite de contas do seu plano atingido. Você pode adicionar mais após o trial.')
      }
    }
    setSaving(false)
  }

  if (isDesktop) {
    return <OnboardingDesktop ctx={{
      step, saving, salary, salaryErr, bName, bAmount, budgetsAdded, budgetErr, contaErr, gTitle, gAmount, goalErr, confirmSkip,
      onSalary: e => { setSalary(e.target.value); setSalaryErr('') },
      onBName: e => { setBName(e.target.value); setBudgetErr(''); setContaErr('') },
      onBAmount: e => { setBAmount(e.target.value); setBudgetErr(''); setContaErr('') },
      onGTitle: e => { setGTitle(e.target.value); setGoalErr('') },
      onGAmount: e => { setGAmount(e.target.value); setGoalErr('') },
      handleNext, handleSkip, handleBack, handleAddBudget, skip, closeSkip: () => setConfirmSkip(false),
    }} />
  }

  return (
    <div className="ob-overlay">
      <div className="ob-shell">
        <div className="auth-hero ob-hero">
          <div className="ob-hero-top">
            <button type="button" className="auth-back" aria-label="Voltar" onClick={handleBack} disabled={saving}>
              <IconChevronLeft />
            </button>
            <div className="ob-dots">
              {[1, 2, 3].map(s => (
                <span key={s} className={`ob-dot${step === s ? ' current' : step > s ? ' done' : ''}`} />
              ))}
            </div>
          </div>
          <h1 className="auth-title">{STEP_TITLES[step]}</h1>
          {step === 1 && <p className="auth-subtitle">Quanto você ganha por mês?</p>}
        </div>

        <div className="auth-sheet ob-sheet">
          <div className="ob-sheet-body">
            {step === 1 && (
              <div className="auth-field">
                <div className="ob-currency-wrap">
                  <span className="ob-currency-prefix">R$</span>
                  <input
                    type="number"
                    placeholder="0,00"
                    aria-label="Salário mensal"
                    aria-invalid={salaryErr ? 'true' : undefined}
                    aria-describedby={salaryErr ? 'ob-salary-err' : undefined}
                    value={salary}
                    onChange={e => { setSalary(e.target.value); setSalaryErr('') }}
                    min="0"
                    max="999999999"
                    className="ob-currency-input"
                    autoFocus
                  />
                </div>
                {salaryErr && <p id="ob-salary-err" className="ob-err" role="alert">{salaryErr}</p>}
                <p className="ob-hint">Usamos isso para calcular seu saldo disponível. Você pode mudar depois.</p>
              </div>
            )}

            {step === 2 && (
              <>
                <p className="ob-desc">Adicione aluguel, internet, academia... Você pode incluir mais depois em Perfil → Finanças.</p>
                {budgetsAdded > 0 && (
                  <div className="ob-added">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    {budgetsAdded} {budgetsAdded === 1 ? 'conta adicionada' : 'contas adicionadas'}
                  </div>
                )}
                <div className="ob-row">
                  <div className="ob-field">
                    <label htmlFor="ob-bname">Nome</label>
                    <input
                      id="ob-bname"
                      type="text"
                      placeholder="Ex: Aluguel"
                      value={bName}
                      onChange={e => { setBName(e.target.value); setBudgetErr(''); setContaErr('') }}
                      maxLength={60}
                    />
                  </div>
                  <div className="ob-field ob-field-sm">
                    <label htmlFor="ob-bamount">Valor</label>
                    <input
                      id="ob-bamount"
                      type="number"
                      placeholder="1200"
                      value={bAmount}
                      onChange={e => { setBAmount(e.target.value); setBudgetErr(''); setContaErr('') }}
                      min="0.01"
                    />
                  </div>
                </div>
                {budgetErr && (
                  <div style={{ fontSize: 12, color: '#f59e0b', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    {budgetErr}
                  </div>
                )}
                <button
                  className="ob-add"
                  onClick={handleAddBudget}
                  disabled={!bName.trim() || !(parseFloat(bAmount) > 0) || saving || !!budgetErr}
                >
                  {saving ? '...' : '+ Adicionar conta'}
                </button>
                {contaErr && <p className="ob-err" role="alert">{contaErr}</p>}
              </>
            )}

            {step === 3 && (
              <>
                <p className="ob-desc">Defina um objetivo: viagem, reserva de emergência, celular novo... (opcional)</p>
                <div className="ob-field">
                  <label htmlFor="ob-gtitle">Nome da meta</label>
                  <input
                    id="ob-gtitle"
                    type="text"
                    placeholder="Ex: Reserva de emergência"
                    value={gTitle}
                    onChange={e => { setGTitle(e.target.value); setGoalErr('') }}
                    maxLength={80}
                    autoFocus
                  />
                </div>
                <div className="ob-field">
                  <label htmlFor="ob-gamount">Valor-alvo</label>
                  <input
                    id="ob-gamount"
                    type="number"
                    placeholder="Ex: 10000"
                    value={gAmount}
                    onChange={e => { setGAmount(e.target.value); setGoalErr('') }}
                    min="0.01"
                  />
                </div>
                {goalErr && <p className="ob-err" role="alert">{goalErr}</p>}
              </>
            )}
          </div>

          <div className="ob-sheet-actions">
            <button className="auth-btn-primary" onClick={handleNext} disabled={saving}>
              {saving ? <div className="auth-spinner" /> : <span>{step === 3 ? 'Concluir' : 'Continuar'}</span>}
            </button>
            <button type="button" className="ob-skip-link" onClick={handleSkip} disabled={saving}>
              Pular por agora
            </button>
          </div>
        </div>
      </div>
      {confirmSkip && (
        <div className="gls-modal-overlay" style={{ zIndex: 5 }} onClick={() => setConfirmSkip(false)}>
          <div className="gls-modal" role="dialog" aria-modal="true" aria-labelledby="ob-skip-title" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
            <div className="gls-modal-head"><span id="ob-skip-title">Pular sem salvar o salário?</span></div>
            <div className="gls-modal-body" style={{ textAlign: 'center', paddingTop: 8 }}>
              <div style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.6 }}>Você digitou um salário, mas ele ainda não foi salvo. Pular mesmo assim?</div>
            </div>
            <div className="gls-modal-foot">
              <button className="gls-btn-ghost" onClick={() => setConfirmSkip(false)}>Continuar editando</button>
              <button className="gls-btn-save" onClick={skip}>Pular mesmo assim</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
