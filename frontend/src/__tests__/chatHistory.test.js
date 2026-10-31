import { buildApiHistory, HISTORY_MAX_MESSAGES, HISTORY_ITEM_MAX_CHARS, HISTORY_TOTAL_MAX_CHARS } from '../utils/chatHistory.js'

const u = (content) => ({ role: 'user', content })
const a = (content) => ({ role: 'assistant', content })
const err = (content = 'erro') => ({ role: 'assistant', content, error: true })

describe('buildApiHistory — contexto que vai para a IA', () => {
  it('só role e content, na ordem', () => {
    expect(buildApiHistory([u('oi'), { ...a('olá'), pending: { token: 'segredo' } }])).toEqual([u('oi'), a('olá')]) // o token nunca vai para a IA
  })

  it('no máximo as últimas 10 mensagens', () => {
    const list = Array.from({ length: 30 }, (_, i) => (i % 2 ? a(`a${i}`) : u(`u${i}`)))
    const out = buildApiHistory(list)
    expect(out).toHaveLength(HISTORY_MAX_MESSAGES)
    expect(out[0].content).toBe('u20')
    expect(out.at(-1).content).toBe('a29')
  })

  it('cada mensagem é cortada em 600 caracteres (com reticências)', () => {
    const [m] = buildApiHistory([a('x'.repeat(5000))])
    expect(m.content).toBe(`${'x'.repeat(HISTORY_ITEM_MAX_CHARS)}…`)
    expect(buildApiHistory([a('x'.repeat(HISTORY_ITEM_MAX_CHARS))])[0].content).toHaveLength(HISTORY_ITEM_MAX_CHARS) // no limite exato não corta
  })

  it('o total nunca passa de 6000: descarta as mais antigas primeiro', () => {
    const list = Array.from({ length: 12 }, (_, i) => (i % 2 ? a('y'.repeat(900)) : u('z'.repeat(900))))
    const out = buildApiHistory(list)
    expect(out.reduce((s, m) => s + m.content.length, 0)).toBeLessThanOrEqual(HISTORY_TOTAL_MAX_CHARS)
    expect(out.at(-1).role).toBe('assistant')
  })

  it('mensagens de erro e perguntas que falharam não entram', () => {
    expect(buildApiHistory([u('p1'), a('r1'), u('p2'), err(), u('p3'), a('r3')])).toEqual([u('p1'), a('r1'), u('p3'), a('r3')])
  })

  it('mensagens vazias ou sem papel são ignoradas; lista vazia dá lista vazia', () => {
    expect(buildApiHistory([{ role: 'user', content: '' }, { content: 'x' }, u('ok')])).toEqual([u('ok')])
    expect(buildApiHistory([])).toEqual([])
  })
})
