// Mensagem do chat da Nancy IA para uma falha da API + se vale oferecer "Tentar de novo".
//
// retry só é true quando é seguro repetir sem lançar nada em dobro:
//  - erro do servidor (5xx/429 de sobrecarga): o servidor garante que nenhuma ação ficou feita (se ficou, ele responde 200
//    avisando — ver /agent/chat);
//  - sem conexão: o pedido muito provavelmente nem saiu do aparelho.
// Não é true quando o servidor pode ter feito o que foi pedido e a resposta se perdeu (tempo esgotado) nem quando repetir
// não adianta (limite por hora, plano, sessão, validação).
const waitText = (seconds) => (seconds >= 3600 ? 'cerca de 1 hora' : `${Math.max(1, Math.ceil(seconds / 60))} min`)

const SLOW = { message: 'A resposta demorou mais que o esperado. Se você pediu para registrar ou pagar algo, confira o Extrato antes de tentar de novo.', retry: false }

// confirming: é o toque em "Confirmar" (excluir/editar) — repetir é seguro (a ação é idempotente), então sem conexão continua com "tentar de novo".
export function chatError(err, { confirming = false } = {}) {
  const res = err?.response
  const serverMsg = typeof res?.data?.error === 'string' ? res.data.error : ''

  if (!res) {
    if (err?.code === 'ECONNABORTED') return SLOW
    if (confirming) return { message: 'Sem conexão com o servidor.', retry: true }
    // Sem internet de verdade: o pedido nem saiu, repetir é seguro. Com internet, a conexão caiu NO MEIO do pedido: o servidor
    // pode ter feito o que foi pedido (registrar/pagar) e a resposta se perdeu — repetir lançaria em dobro.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return { message: 'Sem conexão com a internet. Tente de novo quando voltar.', retry: true }
    return { message: 'A conexão caiu no meio do pedido. Se você pediu para registrar ou pagar algo, confira o Extrato antes de tentar de novo.', retry: false }
  }
  // O servidor respondeu "tempo esgotado" mas pode ter continuado trabalhando (ações da IA) depois disso.
  if (res.data?.timeout === true) return SLOW

  if (res.status === 429) {
    const wait = Number(res.headers?.['retry-after'])
    if (wait >= 60) return { message: `Você atingiu o limite de mensagens da IA por agora. Tente de novo em ${waitText(wait)}.`, retry: false }
    if (/\b1 hora\b/.test(serverMsg)) return { message: serverMsg, retry: false } // limite por hora sem o cabeçalho de espera
    return { message: serverMsg || 'Muitas mensagens seguidas. Aguarde alguns segundos.', retry: true }
  }
  // 403 com limitReached é o gate de plano (agent.js requirePlan), não sessão expirada — o interceptor global (api.js) já
  // sabe dessa distinção e não desloga o usuário nesse caso; a mensagem local precisa concordar.
  if (res.data?.limitReached) return { message: serverMsg || 'Recurso exclusivo do plano Elite.', retry: false }
  if (res.status === 401 || res.status === 403) return { message: 'Sessão expirada. Faça login novamente.', retry: false }
  // Erro do servidor nunca mostra o texto cru do corpo — já apareceu a palavra "internal" no chat.
  if (res.status >= 500) return { message: 'Não consegui falar com a Nancy agora. Tente de novo em instantes.', retry: true }
  return { message: serverMsg || 'Não consegui processar a mensagem. Tente de novo.', retry: false }
}
