'use strict'
const crypto = require('crypto')

// Confirmação de ações destrutivas da Nancy IA (excluir/editar transação). O modelo NUNCA executa essas ações sozinho:
// ao pedir, o servidor só PREPARA a ação e devolve um token assinado; quem executa é POST /api/agent/confirm, que o
// app só chama quando o usuário toca em "Confirmar". Não depende de o modelo obedecer ao prompt nem de estado em
// memória (o Cloud Run pode trocar de instância entre as duas chamadas): o token carrega tudo e é verificável.
//
// O token amarra: usuário (outra conta não consegue usar), ferramenta, argumentos já validados (executa exatamente o
// que foi mostrado) e validade. Assinado com HMAC-SHA256, com uma chave derivada do JWT_SECRET (uso próprio).
const CONFIRM_TTL_MS = 10 * 60 * 1000
const CONFIRMABLE_TOOLS = new Set(['update_transaction', 'delete_transaction'])

function signingKey() {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET ausente: não dá para assinar a confirmação.')
  return crypto.createHmac('sha256', secret).update('nancy-agent-confirm-v1').digest()
}

const sign = (payload) => crypto.createHmac('sha256', signingKey()).update(payload).digest()

function signPendingAction({ userId, tool, args, label, changes }, now = Date.now()) {
  if (!CONFIRMABLE_TOOLS.has(tool)) throw new Error(`Ferramenta sem fluxo de confirmação: ${tool}`)
  const payload = Buffer.from(JSON.stringify({ v: 1, u: userId, t: tool, a: args, l: label, c: changes, e: now + CONFIRM_TTL_MS })).toString('base64url')
  return `${payload}.${sign(payload).toString('base64url')}`
}

// { ok: true, tool, args, label, changes } ou { ok: false, reason: 'invalid' | 'wrong_user' | 'expired' }
function verifyPendingAction(token, userId, now = Date.now()) {
  const invalid = { ok: false, reason: 'invalid' }
  if (typeof token !== 'string' || token.length > 4000) return invalid
  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return invalid

  const expected = sign(parts[0])
  const given    = Buffer.from(parts[1], 'base64url')
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return invalid

  let data
  try { data = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) } catch { return invalid }
  if (!data || data.v !== 1 || !CONFIRMABLE_TOOLS.has(data.t) || typeof data.u !== 'string' || typeof data.a !== 'object' || data.a === null) return invalid
  if (data.u !== userId) return { ok: false, reason: 'wrong_user' }
  if (typeof data.e !== 'number' || data.e < now) return { ok: false, reason: 'expired' }
  return {
    ok: true, tool: data.t, args: data.a,
    label: typeof data.l === 'string' ? data.l : 'a transação',
    changes: typeof data.c === 'string' ? data.c : '',
  }
}

module.exports = { signPendingAction, verifyPendingAction, CONFIRMABLE_TOOLS, CONFIRM_TTL_MS }
