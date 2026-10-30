import fs from 'node:fs'
import path from 'node:path'

// Início, Extrato e stories guardam o que buscaram e só descartam quando alguém avisa que o dado mudou ('budget-updated',
// ou invalidateStories direto). Foi um ponto que esqueceu o aviso — o "Lançar agora" do Início — que deixou o story do mês
// com as contas fixas de antes. Este teste varre o código: todo arquivo que muda dado precisa avisar.
const SRC = path.resolve(process.cwd(), 'src') // o vitest roda a partir de frontend/

const MUTATION = /\b(transactionsAPI\.(create|update|remove|autoLaunch)|budgetAPI\.(create|update|remove|pay|updateSalary|setLimit|removeLimit)|goalsAPI\.(create|update|remove)|installmentsAPI\.(create|pay|unpay|remove)|reportsAPI\.monthlyClose)\(/
const SIGNAL = /budget-updated|invalidateStories/

// O formulário de transação só salva e entrega o resultado a quem o abriu — os dois lugares que o abrem são conferidos abaixo.
const DELEGATES = new Set(['components/features/TransactionForm.jsx'])
const FORM_OWNERS = ['pages/Transactions.jsx', 'components/features/NewTransactionSheet.jsx']

function sources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) return e.name === '__tests__' ? [] : sources(full)
    return /\.(jsx?|mjs)$/.test(e.name) ? [full] : []
  })
}
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8')

describe('quem muda dado avisa o app', () => {
  it('todo arquivo que cria/edita/apaga lançamento, conta fixa, meta ou parcelado também avisa', () => {
    const offenders = sources(SRC)
      .map(f => path.relative(SRC, f).split(path.sep).join('/'))
      .filter(rel => rel !== 'services/api.js' && !DELEGATES.has(rel))
      .filter(rel => { const src = read(rel); return MUTATION.test(src) && !SIGNAL.test(src) })
    expect(offenders).toEqual([])
  })

  it('o formulário de transação só salva: quem o abre é quem avisa', () => {
    for (const rel of FORM_OWNERS) expect(read(rel), rel).toMatch(SIGNAL)
  })
})
