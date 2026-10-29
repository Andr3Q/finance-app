'use strict'

// ── Timeout de resposta maior que o global (30s, definido em server.js) ──
// /chat, /predict e /monthly-report chamam o Groq (que já tem seu próprio
// timeout de 30s por tentativa) — sem esse ajuste, o timeout global do
// Express corta a conexão com 503 antes do Groq responder, mesmo quando a
// resposta terminaria com sucesso segundos depois. /chat pode encadear até
// MAX_TOOL_ITERATIONS chamadas sequenciais ao Groq, por isso ganha uma
// janela maior que as outras duas (que fazem só 1 chamada).
function withResponseTimeout(ms) {
  return (req, res, next) => {
    res.setTimeout(ms, () => {
      // timeout:true — o servidor pode ter continuado (e feito ações) depois desta resposta: o app NÃO deve oferecer "tentar de novo"
      if (!res.headersSent) res.status(503).json({ error: 'Tempo de resposta esgotado.', timeout: true })
    })
    next()
  }
}

module.exports = { withResponseTimeout }
