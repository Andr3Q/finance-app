import { resumoKey, dicasKey, metasKey, readSeen, markSeen } from '../utils/storiesSeen.js'

beforeEach(() => { localStorage.clear() })

describe('chaves por período', () => {
  it('resumo: um por mês, com offset pro mês anterior (inclusive na virada de ano)', () => {
    const now = new Date(2026, 9, 21) // 21/out/2026
    expect(resumoKey(0, now)).toBe('resumo:2026-10')
    expect(resumoKey(-1, now)).toBe('resumo:2026-09')
    expect(resumoKey(-1, new Date(2026, 0, 15))).toBe('resumo:2025-12')
  })

  it('metas: uma por mês', () => {
    expect(metasKey(new Date(2026, 9, 21))).toBe('metas:2026-10')
    expect(metasKey(new Date(2026, 10, 1))).toBe('metas:2026-11')
  })

  it('dicas: uma por semana ISO (segunda a domingo)', () => {
    // 19/out/2026 é segunda-feira da semana 43; 25/out é o domingo dela
    expect(dicasKey(new Date(2026, 9, 19))).toBe('dicas:2026-W43')
    expect(dicasKey(new Date(2026, 9, 25))).toBe('dicas:2026-W43')
    expect(dicasKey(new Date(2026, 9, 26))).toBe('dicas:2026-W44')
  })

  it('dicas: semana ISO na virada de ano (1º/jan/2027 ainda é a semana 53 de 2026)', () => {
    expect(dicasKey(new Date(2027, 0, 1))).toBe('dicas:2026-W53')
    expect(dicasKey(new Date(2027, 0, 4))).toBe('dicas:2027-W01')
  })
})

describe('readSeen / markSeen', () => {
  it('começa vazio e acumula o que foi aberto', () => {
    expect(readSeen()).toEqual({})
    markSeen('resumo:2026-10', 1000)
    markSeen('dicas:2026-W43', 2000)
    expect(readSeen()).toEqual({ 'resumo:2026-10': 1000, 'dicas:2026-W43': 2000 })
  })

  it('descarta registros com mais de 120 dias', () => {
    const day = 24 * 60 * 60 * 1000
    const now = 500 * day
    markSeen('resumo:antigo', now - 130 * day)
    markSeen('resumo:recente', now - 10 * day)
    markSeen('resumo:novo', now)
    expect(Object.keys(readSeen()).sort()).toEqual(['resumo:novo', 'resumo:recente'])
  })

  it('conteúdo corrompido ou de tipo errado vira vazio (não quebra o Início)', () => {
    localStorage.setItem('nancy:stories-seen', '{não é json')
    expect(readSeen()).toEqual({})
    localStorage.setItem('nancy:stories-seen', '[1,2]')
    expect(readSeen()).toEqual({})
    localStorage.setItem('nancy:stories-seen', 'null')
    expect(readSeen()).toEqual({})
  })

  it('storage indisponível não lança erro', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado') })
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado') })
    expect(readSeen()).toEqual({})
    expect(() => markSeen('x')).not.toThrow()
    get.mockRestore(); set.mockRestore()
  })
})
