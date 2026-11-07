'use strict'

// Disjuntores da IA: UM POR MODELO (chave), em memória por instância do servidor (reseta em cold start do Cloud Run).
//
// Para que serve: sem isso, cada pedido novo tenta o Groq do zero mesmo que ele já tenha falhado nas últimas tentativas, e paga o
// custo cheio de timeout + retry contra um serviço que já sabemos que está fora. Depois de `failureThreshold` quedas seguidas, o
// disjuntor abre e recusa rápido por `openMs`; passado esse tempo deixa UMA chamada de teste passar (meia-abertura).
//
// O que NÃO é queda do provedor: 429 (o Groq pediu para desacelerar: ele está de pé), 413 e 400. Contar 429 como falha fazia um
// limite parcial virar queda total (o disjuntor recusava até o que o Groq ainda aceitaria). Um modelo limitado também não pode
// derrubar os outros: cada modelo tem o seu limite e o seu disjuntor.
function createBreakers({ failureThreshold = 5, openMs = 30_000, now = () => Date.now() } = {}) {
  const states = new Map()
  const st = (key) => {
    let s = states.get(key)
    if (!s) { s = { failures: 0, openedAt: null, probing: false }; states.set(key, s) }
    return s
  }

  return {
    // true = pode chamar o provedor. Fechado: sempre. Aberto: não, até passar `openMs`; depois só UMA chamada de teste por vez.
    acquire(key) {
      const s = st(key)
      if (s.openedAt === null) return true
      if (now() - s.openedAt <= openMs) return false
      if (s.probing) return false
      s.probing = true
      return true
    },
    // O provedor RESPONDEU (sucesso, 429, 400…): ele está de pé. Fecha o disjuntor e zera a contagem.
    answered(key) {
      const s = st(key)
      s.failures = 0; s.openedAt = null; s.probing = false
    },
    // O provedor está fora ou inacessível (veja isProviderDown). Abre ao chegar no limite, ou reabre se era a chamada de teste.
    failed(key) {
      const s = st(key)
      s.failures++; s.probing = false
      if (s.failures >= failureThreshold || s.openedAt !== null) s.openedAt = now()
    },
    // Só leitura (não consome a chamada de teste): o disjuntor está recusando pedidos agora?
    isOpen(key) {
      const s = st(key)
      return s.openedAt !== null && (now() - s.openedAt <= openMs || s.probing)
    },
    reset() { states.clear() },
  }
}

// Só isto conta como queda do provedor: sem resposta (timeout, rede), 5xx, e credencial/modelo recusados (401, 403, 404).
function isProviderDown(err) {
  const s = err?.status
  return s === undefined || s === null || s >= 500 || s === 401 || s === 403 || s === 404
}

// Segundos pedidos pelo Groq no cabeçalho retry-after (o SDK entrega `headers` como Headers ou como objeto), ou null.
function retryAfterSeconds(err) {
  const h = err?.headers
  const raw = typeof h?.get === 'function' ? h.get('retry-after') : h?.['retry-after']
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

module.exports = { createBreakers, isProviderDown, retryAfterSeconds }
