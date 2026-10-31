'use strict'
const { signPendingAction, verifyPendingAction, CONFIRM_TTL_MS } = require('../src/services/agentConfirm')

const base = { userId: 'user-1', tool: 'delete_transaction', args: { id: 'tx-1' }, label: 'a transação X' }

describe('token de confirmação da Nancy IA', () => {
  test('ida e volta: devolve exatamente o que foi assinado', () => {
    const token = signPendingAction(base)
    expect(verifyPendingAction(token, 'user-1')).toEqual({ ok: true, tool: 'delete_transaction', args: { id: 'tx-1' }, label: 'a transação X', changes: '' })
  })

  test('leva também o resumo do que muda (a confirmação do app repete o novo valor)', () => {
    const token = signPendingAction({ ...base, tool: 'update_transaction', changes: 'valor de R$ 150,00 para R$ 175,00' })
    expect(verifyPendingAction(token, 'user-1')).toMatchObject({ ok: true, tool: 'update_transaction', changes: 'valor de R$ 150,00 para R$ 175,00' })
  })

  test('só vale para o usuário que pediu', () => {
    expect(verifyPendingAction(signPendingAction(base), 'user-2')).toEqual({ ok: false, reason: 'wrong_user' })
  })

  test('expira em 10 minutos (e não antes)', () => {
    const t0 = 1_800_000_000_000
    const token = signPendingAction(base, t0)
    expect(verifyPendingAction(token, 'user-1', t0 + CONFIRM_TTL_MS - 1).ok).toBe(true)
    expect(verifyPendingAction(token, 'user-1', t0 + CONFIRM_TTL_MS + 1)).toEqual({ ok: false, reason: 'expired' })
    expect(CONFIRM_TTL_MS).toBe(10 * 60 * 1000)
  })

  test('adulterar qualquer parte invalida: conteúdo, assinatura, formato', () => {
    const [payload, sig] = signPendingAction(base).split('.')
    const forge = (patch) => Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), ...patch })).toString('base64url')
    for (const bad of [
      `${forge({ a: { id: 'tx-2' } })}.${sig}`,      // trocou o alvo
      `${forge({ u: 'user-2' })}.${sig}`,            // trocou o dono
      `${forge({ e: Date.now() + 1e12 })}.${sig}`,   // estendeu a validade
      `${forge({ t: 'create_transaction' })}.${sig}`,
      `${payload}.${sig.slice(0, -2)}AA`, `${payload}.`, `.${sig}`, payload, `${payload}.${sig}.extra`, '', 'a.b',
    ]) expect(verifyPendingAction(bad, 'user-1')).toEqual({ ok: false, reason: 'invalid' })
  })

  test('entrada que não é string é inválida', () => {
    for (const v of [undefined, null, 1, {}, [], 'x'.repeat(4001)]) expect(verifyPendingAction(v, 'user-1')).toEqual({ ok: false, reason: 'invalid' })
  })

  test('só as ferramentas de editar/excluir têm fluxo de confirmação', () => {
    for (const tool of ['create_transaction', 'pay_fixed_bill', 'get_summary', 'qualquer']) {
      expect(() => signPendingAction({ ...base, tool })).toThrow(/sem fluxo de confirmação/)
    }
    expect(() => signPendingAction({ ...base, tool: 'update_transaction' })).not.toThrow()
  })

  test('assinado com o segredo do servidor: outro segredo não valida', () => {
    const token = signPendingAction(base)
    const original = process.env.JWT_SECRET
    process.env.JWT_SECRET = 'outro-segredo-qualquer-bem-longo-para-o-teste'
    try { expect(verifyPendingAction(token, 'user-1')).toEqual({ ok: false, reason: 'invalid' }) }
    finally { process.env.JWT_SECRET = original }
  })

  test('sem JWT_SECRET não assina (falha fechada)', () => {
    const original = process.env.JWT_SECRET
    delete process.env.JWT_SECRET
    try { expect(() => signPendingAction(base)).toThrow(/JWT_SECRET/) }
    finally { process.env.JWT_SECRET = original }
  })
})
