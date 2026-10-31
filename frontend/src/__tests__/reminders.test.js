import { readReminders, saveReminders, billSetting, nextOccurrence, daysBetween, leadLabel, dueText, whenText, DEFAULT_LEAD } from '../utils/reminders.js'

beforeEach(() => localStorage.clear())

describe('lembretes — preferências guardadas no aparelho', () => {
  it('sem nada guardado: estado vazio, e toda conta avisa 2 dias antes e ligada', () => {
    const s = readReminders()
    expect(s).toEqual({ bills: {}, custom: [] })
    expect(billSetting(s, 'b1')).toEqual({ on: true, lead: DEFAULT_LEAD })
    expect(DEFAULT_LEAD).toBe(2)
  })

  it('salva e lê de volta o que o usuário escolheu', () => {
    const state = { bills: { b1: { on: false, lead: 0 } }, custom: [{ id: 'c1', name: 'IPVA 2027', day: 15, month: 1, lead: 7, on: true }] }
    saveReminders(state)
    expect(readReminders()).toEqual(state)
    expect(billSetting(readReminders(), 'b1')).toEqual({ on: false, lead: 0 })
  })

  it('descarta lixo: JSON quebrado, dia inválido, nome vazio, antecedência fora do intervalo', () => {
    localStorage.setItem('nancy:reminders', '{quebrado')
    expect(readReminders()).toEqual({ bills: {}, custom: [] })
    localStorage.setItem('nancy:reminders', JSON.stringify({
      bills: { b1: { on: false, lead: 99 }, b2: 'x' },
      custom: [
        { id: 'a', name: 'Ok', day: 31, month: 13, lead: -1, on: false },
        { id: 'b', name: '   ', day: 5 },
        { id: 'c', name: 'Dia zero', day: 0 },
        { id: 'd', name: 'Dia 32', day: 32 },
        { name: 'sem id', day: 5 },
      ],
    }))
    const s = readReminders()
    expect(s.bills).toEqual({ b1: { on: false, lead: DEFAULT_LEAD } })
    expect(s.custom).toEqual([{ id: 'a', name: 'Ok', day: 31, month: null, lead: DEFAULT_LEAD, on: false }])
  })
})

describe('lembretes — datas', () => {
  const now = new Date(2026, 9, 21, 15) // 21/out/2026

  it('conta mensal: hoje conta; dia que já passou vai pro mês que vem; dia 31 num mês curto cai no último dia', () => {
    expect(nextOccurrence(21, null, now)).toEqual(new Date(2026, 9, 21))
    expect(nextOccurrence(5, null, now)).toEqual(new Date(2026, 10, 5))
    expect(nextOccurrence(31, null, new Date(2026, 10, 30))).toEqual(new Date(2026, 10, 30))
    expect(nextOccurrence(30, null, new Date(2027, 0, 31))).toEqual(new Date(2027, 1, 28))
  })

  it('lembrete anual: este ano se ainda não passou, senão o ano que vem', () => {
    expect(nextOccurrence(10, 12, now)).toEqual(new Date(2026, 11, 10))
    expect(nextOccurrence(15, 1, now)).toEqual(new Date(2027, 0, 15))
    expect(nextOccurrence(29, 2, new Date(2027, 0, 5))).toEqual(new Date(2027, 1, 28))
  })

  it('daysBetween ignora a hora do dia', () => {
    expect(daysBetween(new Date(2026, 9, 21, 23, 59), new Date(2026, 9, 23, 0, 1))).toBe(2)
  })

  it('textos', () => {
    expect([0, 1, 2, 7].map(leadLabel)).toEqual(['no dia', '1 dia antes', '2 dias antes', '7 dias antes'])
    expect([0, 1, 3].map(dueText)).toEqual(['vence hoje', 'vence amanhã', 'vence em 3 dias'])
    expect([0, 1, 3].map(whenText)).toEqual(['hoje', 'amanhã', 'em 3 dias'])
  })
})
