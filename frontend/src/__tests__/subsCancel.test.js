import { readCancelFlags, setCancelFlag, cancelReminders, subKey } from '../utils/subsCancel.js'

beforeEach(() => localStorage.clear())
const NOW = Date.UTC(2026, 9, 21)
const DAY = 24 * 60 * 60 * 1000

describe('subsCancel', () => {
  it('a chave ignora maiúsculas e espaços nas pontas', () => {
    expect(subKey('  Streaming de Vídeo ')).toBe('streaming de vídeo')
    expect(subKey(undefined)).toBe('')
  })

  it('marcar guarda nome e valor; desmarcar remove', () => {
    setCancelFlag({ description: ' Música ', amount: 21.9 }, true, NOW)
    expect(readCancelFlags(NOW)).toEqual({ música: { name: 'Música', amount: 21.9, at: NOW } })
    setCancelFlag({ description: 'música', amount: 21.9 }, false, NOW)
    expect(readCancelFlags(NOW)).toEqual({})
  })

  it('marcações com mais de 90 dias deixam de valer', () => {
    setCancelFlag({ description: 'Velha', amount: 10 }, true, NOW - 91 * DAY)
    setCancelFlag({ description: 'Nova', amount: 10 }, true, NOW - 10 * DAY)
    expect(Object.keys(readCancelFlags(NOW))).toEqual(['nova'])
  })

  it('conteúdo corrompido ou inesperado vira vazio', () => {
    localStorage.setItem('nancy:subs-cancel', '{quebrado')
    expect(readCancelFlags(NOW)).toEqual({})
    localStorage.setItem('nancy:subs-cancel', '[1,2]')
    expect(readCancelFlags(NOW)).toEqual({})
    localStorage.setItem('nancy:subs-cancel', JSON.stringify({ x: 'não é objeto', y: { name: 'ok', amount: 1, at: NOW } }))
    expect(Object.keys(readCancelFlags(NOW))).toEqual(['y'])
  })

  it('cancelReminders entrega no formato do montador de avisos', () => {
    setCancelFlag({ description: 'Música', amount: 21.9 }, true, NOW)
    expect(cancelReminders(readCancelFlags(NOW))).toEqual([{ key: 'música', name: 'Música', amount: 21.9 }])
  })
})
