import { useState } from 'react'
import { authAPI, budgetAPI, goalsAPI } from '../../services/api.js'
import { useUser, saveUser } from '../../hooks/useUser.js'
import { analytics } from '../../services/analytics.js'

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
  }

  const handleNext = async () => {
    if (step === 1) {
      const v = parseFloat(salary)
      if (v > 0) {
        try {
          await budgetAPI.updateSalary(v)
          saveUser({ ...user, salary: v })
        } catch {}
      }
      setStep(2)
    } else if (step === 2) {
      setStep(3)
    } else {
      if (gTitle.trim() && parseFloat(gAmount) > 0) {
        setSaving(true)
        try { await goalsAPI.create({ title: gTitle.trim(), targetAmount: parseFloat(gAmount) }) } catch {}
      }
      await finish()
    }
  }

  // No passo 1, "Pular" descartava o salário digitado sem avisar — fácil de
  // clicar por engano com o botão "Continuar" logo ao lado. Também usada pelo
  // botão de voltar quando ele está no passo 1 (não tem passo anterior dentro
  // do onboarding pra onde voltar — pular é a ação equivalente).
  const handleSkip = () => {
    if (step === 1 && parseFloat(salary) > 0 &&
        !window.confirm('Você digitou um salário mas não salvou. Pular mesmo assim?')) {
      return
    }
    if (step < 3) setStep(s => s + 1)
    else finish()
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
    } catch (err) {
      if (err.response?.data?.limitReached) {
        setBudgetErr('Limite de contas do seu plano atingido. Você pode adicionar mais após o trial.')
      }
    }
    setSaving(false)
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
                    value={salary}
                    onChange={e => setSalary(e.target.value)}
                    min="0"
                    max="999999999"
                    className="ob-currency-input"
                    autoFocus
                  />
                </div>
                <p className="ob-hint">Usamos isso para calcular seu saldo disponível. Você pode mudar depois.</p>
              </div>
            )}

            {step === 2 && (
              <>
                <p className="ob-desc">Adicione aluguel, internet, academia... Você pode incluir mais depois em Configurações.</p>
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
                    <label>Nome</label>
                    <input
                      type="text"
                      placeholder="Ex: Aluguel"
                      value={bName}
                      onChange={e => { setBName(e.target.value); setBudgetErr('') }}
                      maxLength={60}
                    />
                  </div>
                  <div className="ob-field ob-field-sm">
                    <label>Valor</label>
                    <input
                      type="number"
                      placeholder="1200"
                      value={bAmount}
                      onChange={e => { setBAmount(e.target.value); setBudgetErr('') }}
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
              </>
            )}

            {step === 3 && (
              <>
                <p className="ob-desc">Defina um objetivo: viagem, reserva de emergência, celular novo... (opcional)</p>
                <div className="ob-field">
                  <label>Nome da meta</label>
                  <input
                    type="text"
                    placeholder="Ex: Reserva de emergência"
                    value={gTitle}
                    onChange={e => setGTitle(e.target.value)}
                    maxLength={80}
                    autoFocus
                  />
                </div>
                <div className="ob-field">
                  <label>Valor-alvo</label>
                  <input
                    type="number"
                    placeholder="Ex: 10000"
                    value={gAmount}
                    onChange={e => setGAmount(e.target.value)}
                    min="0.01"
                  />
                </div>
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
    </div>
  )
}
