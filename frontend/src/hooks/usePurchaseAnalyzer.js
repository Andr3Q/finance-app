import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { analyzerAPI, transactionsAPI, installmentsAPI, goalsAPI } from '../services/api.js'
import { useHideBalance } from './useHideBalance.js'
import { invalidateCache } from '../services/cache.js'
import { invalidateStories } from '../services/storiesData.js'
import { analyzePurchase, parseNum } from '../utils/purchaseAnalysis.js'
import { fmt } from '../utils/format.js'

export const HIDDEN = '••••'
export const EXAMPLES = [['Celular novo', '7.000'], ['Sofá', '3.200'], ['Viagem a Lisboa', '12.000'], ['Carro seminovo', '85.000']]
export const MODES = [['pix', 'Pix / débito', 'zap'], ['c1', 'Crédito 1x', 'card'], ['cN', 'Parcelado', 'layers']]
const FIRST = { item: '', price: '', discount: '5', rate: '0', mode: 'cN', parcelas: 10 }
const MAX_PRICE = 99999999

export const money = (n) => `R$ ${fmt(Math.round(n * 100) / 100)}`
// data de hoje + n meses, no formato que a API de metas aceita (AAAA-MM-DD)
const inMonths = (n) => {
  const d = new Date()
  d.setMonth(d.getMonth() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Tudo que o Analisador de compras faz (tela 38 do desktop e tela 37 do celular): a pessoa diz o que quer comprar, o valor e como pensa em pagar;
// a Nancy compara Pix, crédito à vista e parcelado com a sobra mensal, as parcelas atuais e o saldo, e diz o que fazer. Os números dela vêm do
// servidor (GET /api/analyzer/base) e a comparação roda aqui (utils/purchaseAnalysis.js) — é conta, não modelo de IA; por isso a resposta é
// instantânea e não há tela de "analisando" de mentira. O "próximo passo" faz de verdade: registra a compra (saída ou parcelamento), abre o chat
// da Nancy IA com a pergunta pronta ou cria uma meta. As duas telas (desktop e celular) usam este hook e só mudam o visual.
export function usePurchaseAnalyzer() {
  const navigate = useNavigate()
  const [hidden] = useHideBalance()
  const [base, setBase] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [form, setForm] = useState(FIRST)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)       // a análise é uma foto do momento em que se clicou em "Analisar"
  const [pending, setPending] = useState(false)    // clicou em Analisar antes de os números chegarem
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)                    // vale na hora (o estado só vale na próxima renderização): cliques no mesmo instante não criam duas vezes
  const [done, setDone] = useState(null)           // confirmação que FICA na tela depois de registrar (o aviso de cima some em 4 s)
  const [toast, setToast] = useState(null)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  const flash = (msg, ok = true) => {
    clearTimeout(timer.current)
    setToast({ msg, ok })
    timer.current = setTimeout(() => setToast(null), 4000)
  }

  const load = useCallback(() => {
    setStatus('loading')
    return analyzerAPI.base()
      .then(r => { setBase(r.data); setStatus('ready'); return r.data })
      .catch(() => { setStatus('error'); return null })
  }, [])
  useEffect(() => { load() }, [load])

  const set = (k) => (e) => { setForm(f => ({ ...f, [k]: e.target.value })); setError('') }
  const pick = (patch) => { setForm(f => ({ ...f, ...patch })); setError('') }

  const run = useCallback((b, f) => {
    const price = parseNum(f.price)
    if (!(price > 0)) { setError('Informe o valor da compra.'); return }
    if (price > MAX_PRICE) { setError('O valor máximo é R$ 99.999.999,00.'); return }
    if (!(b.income > 0)) { setError('Informe seu salário em Finanças para a Nancy analisar.'); return }
    setError('')
    setDone(null)
    setResult({ ...analyzePurchase(b, f), item: f.item.trim(), input: f })
  }, [])

  // se clicou antes de os números chegarem, a análise sai assim que chegarem
  useEffect(() => { if (pending && status === 'ready' && base) { setPending(false); run(base, form) } }, [pending, status, base, form, run])
  useEffect(() => { if (pending && status === 'error') setPending(false) }, [pending, status])

  const analyze = () => {
    if (!(parseNum(form.price) > 0)) { setError('Informe o valor da compra.'); return }
    if (status === 'ready' && base) run(base, form)
    else if (status === 'loading') setPending(true)
    else setError('Não foi possível carregar seus números agora. Tente de novo.')
  }

  // "Analisar outra compra" (celular): limpa produto e valor e volta ao formulário, mantendo a forma de pagar, o desconto e os juros escolhidos
  const newPurchase = () => {
    setForm(f => ({ ...f, item: '', price: '' }))
    setResult(null)
    setDone(null)
    setError('')
  }

  const name = (result?.item) || 'Compra'
  const registerPurchase = async () => {
    if (!result || busyRef.current || done) return
    busyRef.current = true
    setBusy(true)
    try {
      if (!result.rec) {
        await goalsAPI.create({ title: name, targetAmount: result.price, deadline: inMonths(result.months) })
        navigate('/goals')
        return
      }
      if (result.rec.n === 1) {
        await transactionsAPI.create({ description: name, amount: result.rec.pv, type: 'expense', category: 'shopping' })
        invalidateCache('dashboard'); invalidateStories()
        window.dispatchEvent(new CustomEvent('budget-updated'))
        flash('Compra registrada no Extrato.')
        setDone({ msg: 'Compra registrada no Extrato.', to: '/transactions', label: 'Ver no Extrato' })
      } else {
        await installmentsAPI.create({ name, amount: result.rec.pv, totalInstallments: result.rec.n })
        invalidateCache('dashboard'); invalidateStories()
        flash(`${name} em ${result.rec.n}x adicionada às parcelas.`)
        setDone({ msg: `${name} em ${result.rec.n}x adicionada às parcelas.`, to: '/parcelados', label: 'Ver parcelas' })
      }
      load() // saldo e parcelas mudaram: a próxima análise parte dos números novos (a atual segue na tela)
    } catch (err) {
      flash(err.response?.data?.error || 'Não foi possível registrar agora. Tente de novo.', false)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }
  const askNancy = () => {
    window.dispatchEvent(new CustomEvent('nancy:open-agent-chat', { detail: { message: `Vale a pena comprar ${result?.item || 'isso'} de ${money(result.price)}?` } }))
  }
  const createGoal = async () => {
    if (!result || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      await goalsAPI.create({ title: result.item || 'Compra planejada', targetAmount: result.price, deadline: inMonths(Math.max(1, result.months)) })
      navigate('/goals')
    } catch (err) {
      flash(err.response?.data?.error || 'Não foi possível criar a meta agora. Tente de novo.', false)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return { hidden, base, status, form, error, result, pending, busy, done, toast, load, set, pick, analyze, newPurchase, registerPurchase, askNancy, createGoal }
}
