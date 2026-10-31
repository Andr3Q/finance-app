// Contexto que o chat manda para a IA a cada pergunta. O servidor só usa as últimas 10 mensagens e o corpo do pedido tem teto:
// uma conversa com respostas longas (a IA lista dezenas de transações) estourava o teto e TODA mensagem nova dava erro até
// recarregar a página. Por isso cada mensagem vai cortada (a IA só precisa do essencial) e o total tem limite.
export const HISTORY_MAX_MESSAGES = 10
export const HISTORY_ITEM_MAX_CHARS = 600
export const HISTORY_TOTAL_MAX_CHARS = 6000

// Turnos que falharam (pergunta que ficou sem resposta) e mensagens de erro não são contexto.
export function buildApiHistory(messages) {
  const kept = messages
    .filter((m, i) => m.role && m.content && !m.error && !(m.role === 'user' && messages[i + 1]?.error))
    .map(m => ({
      role: m.role,
      content: m.content.length > HISTORY_ITEM_MAX_CHARS ? `${m.content.slice(0, HISTORY_ITEM_MAX_CHARS)}…` : m.content,
    }))
    .slice(-HISTORY_MAX_MESSAGES)
  let total = kept.reduce((sum, m) => sum + m.content.length, 0)
  while (kept.length > 1 && total > HISTORY_TOTAL_MAX_CHARS) total -= kept.shift().content.length
  return kept
}
