import Navbar from '../components/layout/Navbar.jsx'
import DesktopTabs from '../components/layout/DesktopTabs.jsx'
import ProtoIcon from '../components/layout/ProtoIcon.jsx'
import PlanUsageBanner from '../components/ui/PlanUsageBanner.jsx'
import CurrencyInput from '../components/ui/CurrencyInput.jsx'
import { fmt } from '../utils/format.js'

const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
// o verde do design vale para as metas na cor padrão do app (menta); quem escolheu outra cor na meta continua com ela
const DEFAULT_COLORS = ['#3DE29F', '#4ae2ac']
const colorOf = (c) => (!c || DEFAULT_COLORS.includes(c) ? '#12C985' : c)

// Metas no desktop (design "Nancy Desktop", tela 20): abas do assunto (Metas, Histórico, Assinaturas, Lembretes, Limites) e um cartão por meta, em
// três colunas (ícone, % concluído, nome, prazo, barra, guardado/alvo e "Depositar R$ X"). Só a apresentação — criar, editar, depositar e remover
// (com os mesmos modais) são do Goals, que passa tudo em `ctx`. O design não desenha o formulário "Nova meta" (fica abaixo dos cartões) nem o
// aviso de limite do plano.
export default function GoalsDesktop({ ctx }) {
  const { goals, loading, plan, onEdit, onDeposit, newGoal, setNewGoal, onCreate, saving, creating, atGoalLimit } = ctx
  return (
    <>
      <Navbar />
      <div className="pwnav ndh-pwnav fade-in">
        <div className="ndx-page">
          <DesktopTabs group="metas" label="Seções de metas" />
          {!loading && <PlanUsageBanner plan={plan ?? 'free'} feature="goals" used={goals.length} label="metas" />}

          {loading ? (
            <div className="ndg-loading"><span className="spinner" style={{ width: 22, height: 22, borderWidth: 2.5 }} /></div>
          ) : (
            <div className="ndg-grid">
              {goals.map(g => {
                const target = Number(g.targetAmount), current = Number(g.currentAmount)
                const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0
                const done = pct >= 100
                const quick = Math.min(500, Math.round((target - current) * 100) / 100)
                const dl = g.deadline ? new Date(g.deadline) : null
                return (
                  <section key={g.id} className="ndg-card" style={{ '--gc': colorOf(g.color) }}>
                    <div className="ndg-top">
                      <span className="ndg-ico"><ProtoIcon name="target" size={20} /></span>
                      <span className="ndg-pct">{done ? 'Concluída' : `${pct}%`}</span>
                    </div>
                    <button type="button" className="ndg-title" onClick={() => onEdit(g)} aria-label={`Editar meta ${g.title}`}>
                      <span className="ndg-name">{g.title}</span>
                      {dl && <span className="ndg-due">Até {MONTHS_SHORT[dl.getUTCMonth()]} {dl.getUTCFullYear()}</span>}
                    </button>
                    <div className="ndg-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${g.title}: ${pct}%`}>
                      <div className="ndg-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="ndg-amounts"><span>R$ {fmt(current)}</span><span>R$ {fmt(target)}</span></div>
                    {done ? (
                      <span className="ndg-done">Meta atingida</span>
                    ) : (
                      <button type="button" className="ndg-dep" onClick={() => onDeposit(g, quick)} aria-label={`Depositar na meta ${g.title}`}>
                        <ProtoIcon name="plus" size={18} />Depositar R$ {Number.isInteger(quick) ? quick.toLocaleString('pt-BR') : fmt(quick)}
                      </button>
                    )}
                  </section>
                )
              })}

              <form className="ndg-card ndg-new" onSubmit={onCreate} aria-label="Nova meta">
                <h2>Nova meta</h2>
                <div className="ndg-new-row">
                  <input className="ndg-inp" placeholder="Ex.: Carro novo" maxLength={80} value={newGoal.title} onChange={e => setNewGoal(g => ({ ...g, title: e.target.value }))} />
                  <CurrencyInput className="ndg-inp" placeholder="Valor alvo (R$)" value={newGoal.targetAmount} onChange={v => setNewGoal(g => ({ ...g, targetAmount: v }))} />
                  <button type="submit" className="ndg-create" disabled={saving || !newGoal.title.trim() || !(Number(newGoal.targetAmount) > 0) || atGoalLimit}>{creating ? 'Criando…' : 'Criar meta'}</button>
                </div>
                {atGoalLimit && <p className="ndg-limit">Você atingiu o limite de metas do seu plano.</p>}
              </form>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
