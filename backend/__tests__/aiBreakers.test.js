'use strict'
const { createBreakers, isProviderDown, retryAfterSeconds } = require('../src/lib/aiBreakers')

// Regras do disjuntor da IA, com relógio falso. O que o teste de estresse mostrou: um limite PARCIAL do Groq (429) abria o
// disjuntor GLOBAL e a IA inteira (inclusive modelos saudáveis) recusava pedido que o Groq ainda aceitaria.
describe('createBreakers', () => {
  let t, b
  const fail = (key, n) => { for (let i = 0; i < n; i++) { b.acquire(key); b.failed(key) } }
  beforeEach(() => { t = 1_000_000; b = createBreakers({ failureThreshold: 5, openMs: 30_000, now: () => t }) })

  it('começa fechado: deixa chamar', () => {
    expect(b.acquire('m')).toBe(true)
    expect(b.isOpen('m')).toBe(false)
  })

  it('abre depois de 5 quedas seguidas e recusa enquanto estiver aberto', () => {
    fail('m', 4)
    expect(b.acquire('m')).toBe(true)          // 4 quedas: ainda fechado
    b.failed('m')                              // 5ª queda
    expect(b.acquire('m')).toBe(false)
    expect(b.isOpen('m')).toBe(true)
    t += 29_000
    expect(b.acquire('m')).toBe(false)         // ainda dentro dos 30 s
  })

  it('cada modelo tem o seu disjuntor: um aberto não recusa os outros', () => {
    fail('gpt-oss-120b', 5)
    expect(b.acquire('gpt-oss-120b')).toBe(false)
    expect(b.acquire('gpt-oss-20b')).toBe(true)
    expect(b.acquire('whisper-large-v3-turbo')).toBe(true)
  })

  it('uma resposta do provedor (inclusive 429) zera a contagem: 4 quedas + resposta + 4 quedas não abre', () => {
    fail('m', 4)
    b.answered('m')
    fail('m', 4)
    expect(b.acquire('m')).toBe(true)
  })

  it('meia-abertura: passado o tempo deixa UMA chamada de teste; as outras esperam o resultado dela', () => {
    fail('m', 5)
    t += 30_001
    expect(b.isOpen('m')).toBe(false)          // só leitura: não gasta a chamada de teste
    expect(b.acquire('m')).toBe(true)          // a chamada de teste
    expect(b.acquire('m')).toBe(false)         // enquanto ela está no ar, as outras recusam
    expect(b.isOpen('m')).toBe(true)
  })

  it('teste que dá certo fecha o disjuntor para todos', () => {
    fail('m', 5)
    t += 30_001
    b.acquire('m'); b.answered('m')
    expect(b.acquire('m')).toBe(true)
    expect(b.acquire('m')).toBe(true)
    expect(b.isOpen('m')).toBe(false)
  })

  it('teste que falha reabre por mais 30 s', () => {
    fail('m', 5)
    t += 30_001
    b.acquire('m'); b.failed('m')
    expect(b.acquire('m')).toBe(false)
    t += 29_000
    expect(b.acquire('m')).toBe(false)
    t += 2_000
    expect(b.acquire('m')).toBe(true)          // nova meia-abertura
  })

  it('reset() limpa tudo', () => {
    fail('m', 5)
    b.reset()
    expect(b.acquire('m')).toBe(true)
  })
})

describe('isProviderDown — o que conta como queda do provedor', () => {
  it.each([[undefined], [null], [500], [502], [503], [529], [401], [403], [404]])('status %s conta como queda', (status) => {
    expect(isProviderDown({ status })).toBe(true)
  })
  it.each([[400], [413], [422], [429]])('status %s NÃO conta (o provedor respondeu)', (status) => {
    expect(isProviderDown({ status })).toBe(false)
  })
  it('erro sem status (timeout, rede) conta como queda', () => {
    expect(isProviderDown(new Error('socket hang up'))).toBe(true)
  })
})

describe('retryAfterSeconds', () => {
  it('lê de Headers e de objeto simples', () => {
    expect(retryAfterSeconds({ headers: new Headers({ 'retry-after': '12' }) })).toBe(12)
    expect(retryAfterSeconds({ headers: { 'retry-after': '7' } })).toBe(7)
  })
  it('ausente, zero ou não numérico → null', () => {
    expect(retryAfterSeconds({})).toBeNull()
    expect(retryAfterSeconds({ headers: new Headers() })).toBeNull()
    expect(retryAfterSeconds({ headers: { 'retry-after': '0' } })).toBeNull()
    expect(retryAfterSeconds({ headers: { 'retry-after': 'amanhã' } })).toBeNull()
  })
})
