import DesktopAuthHero from '../auth/DesktopAuthHero.jsx'
import ProtoIcon from '../layout/ProtoIcon.jsx'

// Primeiros passos no desktop (design "Nancy Desktop", tela 07): tela cheia com o mesmo painel azul das telas de acesso, os 3 pontinhos
// de etapa e uma pergunta por etapa ("Vamos começar" é o título das três). Só a apresentação — o estado e as regras (salvar salário,
// adicionar conta fixa, criar meta, pular, concluir) continuam no OnboardingModal, que passa tudo em `ctx`.
// O design só desenha o NOME da conta fixa e da meta; o servidor também exige o valor, então cada etapa ganha o campo de valor
// no mesmo estilo (e os atalhos do design preenchem o nome).
const QUESTIONS = { 1: 'Quanto você ganha por mês?', 2: 'Qual sua principal conta fixa?', 3: 'Qual seu primeiro objetivo?' }
const BILL_CHIPS = ['Aluguel', 'Internet', 'Plano de saúde', 'Academia']
const GOAL_CHIPS = ['Reserva de emergência', 'Viagem', 'Carro', 'Quitar dívidas']

export default function OnboardingDesktop({ ctx }) {
  const {
    step, saving, salary, onSalary, salaryErr, bName, onBName, bAmount, onBAmount, budgetsAdded, budgetErr, contaErr,
    gTitle, onGTitle, gAmount, onGAmount, goalErr, confirmSkip,
    handleNext, handleSkip, handleBack, handleAddBudget, skip, closeSkip,
  } = ctx
  const canAdd = !!bName.trim() && parseFloat(bAmount) > 0 && !saving && !budgetErr

  return (
    <div className="ad-ob">
      <main className="ad-split">
        <DesktopAuthHero variant="form" />
        <section className="ad-panel" aria-labelledby="ad-ob-title">
          <div className="ad-panel-inner">
            <button type="button" className="ad-back" onClick={handleBack} disabled={saving} aria-label="Voltar">
              <ProtoIcon name="back" size={20} />Voltar
            </button>
            <div className="ad-dots" role="img" aria-label={`Etapa ${step} de 3`}>
              {[1, 2, 3].map(s => <span key={s} className={`ad-dot${s <= step ? ' on' : ''}${s === step ? ' cur' : ''}`} />)}
            </div>
            <h2 id="ad-ob-title" className="ad-form-title">Vamos começar</h2>
            <p className="ad-form-sub">{QUESTIONS[step]}</p>

            {step === 1 && (
              <>
                <input
                  type="number" className="ad-input ad-money" placeholder="R$ 0,00" aria-label="Salário mensal"
                  aria-invalid={salaryErr ? 'true' : undefined} aria-describedby={salaryErr ? 'ob-salary-err' : undefined}
                  min="0" max="999999999" value={salary} onChange={onSalary} autoFocus
                />
                {salaryErr && <span id="ob-salary-err" className="ad-error" role="alert">{salaryErr}</span>}
              </>
            )}

            {step === 2 && (
              <>
                {budgetsAdded > 0 && (
                  <span className="ad-added" role="status"><ProtoIcon name="check" size={16} />{budgetsAdded} {budgetsAdded === 1 ? 'conta adicionada' : 'contas adicionadas'}</span>
                )}
                <input
                  id="ob-bname" type="text" className="ad-input" placeholder="Ex.: Aluguel" aria-label="Nome da conta fixa"
                  maxLength={60} value={bName} onChange={onBName} autoFocus
                />
                <div className="ad-chips">
                  {BILL_CHIPS.map(c => <button key={c} type="button" className="ad-chip" onClick={() => onBName({ target: { value: c } })}>{c}</button>)}
                </div>
                <input
                  id="ob-bamount" type="number" className="ad-input" placeholder="Valor mensal (R$)" aria-label="Valor da conta fixa"
                  min="0.01" value={bAmount} onChange={onBAmount}
                />
                {budgetErr && <span className="ad-warn" role="alert">{budgetErr}</span>}
                <button type="button" className="ad-btn-secondary ad-btn--form" onClick={handleAddBudget} disabled={!canAdd}>
                  {saving ? '...' : '+ Adicionar conta'}
                </button>
                {contaErr && <span className="ad-error" role="alert">{contaErr}</span>}
              </>
            )}

            {step === 3 && (
              <>
                <input
                  id="ob-gtitle" type="text" className="ad-input" placeholder="Ex.: Reserva de emergência" aria-label="Nome da meta"
                  maxLength={80} value={gTitle} onChange={onGTitle} autoFocus
                />
                <div className="ad-chips">
                  {GOAL_CHIPS.map(c => <button key={c} type="button" className="ad-chip ad-chip--green" onClick={() => onGTitle({ target: { value: c } })}>{c}</button>)}
                </div>
                <input
                  id="ob-gamount" type="number" className="ad-input" placeholder="Valor-alvo (R$)" aria-label="Valor-alvo da meta"
                  min="0.01" value={gAmount} onChange={onGAmount}
                />
                {goalErr && <span className="ad-error" role="alert">{goalErr}</span>}
              </>
            )}

            <button type="button" className="ad-btn-primary ad-btn--form ad-btn--next" onClick={handleNext} disabled={saving}>
              {saving ? <span className="auth-spinner" /> : step < 3 ? 'Continuar' : 'Começar a usar a Nancy'}
            </button>
            <button type="button" className="ad-skip" onClick={handleSkip} disabled={saving}>Pular por agora</button>
          </div>
        </section>
      </main>

      {confirmSkip && (
        <div className="gls-modal-overlay" style={{ zIndex: 5 }} onClick={closeSkip}>
          <div className="gls-modal" role="dialog" aria-modal="true" aria-labelledby="ob-skip-title" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
            <div className="gls-modal-head"><span id="ob-skip-title">Pular sem salvar o salário?</span></div>
            <div className="gls-modal-body" style={{ textAlign: 'center', paddingTop: 8 }}>
              <div style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.6 }}>Você digitou um salário, mas ele ainda não foi salvo. Pular mesmo assim?</div>
            </div>
            <div className="gls-modal-foot">
              <button className="gls-btn-ghost" onClick={closeSkip}>Continuar editando</button>
              <button className="gls-btn-save" onClick={skip}>Pular mesmo assim</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
