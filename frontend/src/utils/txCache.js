// Chave do cache da lista de transações de um mês (compartilhada entre o Extrato e as telas que
// criam/removem transações por fora dele, como as compras parceladas).
export const txCacheKey = (m, y) => `transactions:list:${y}-${m}`

// /installments/:id/pay e /unpay sempre criam ou removem a transação no mês REAL atual
// (nowBrasilia() no backend), não no mês que o usuário está vendo na tela. Quem invalida
// cache depois de pagar/desfazer parcela precisa invalidar também o mês real.
export function currentBrasiliaMonthYear() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: 'numeric',
  }).formatToParts(new Date())
  const get = (type) => Number(parts.find(p => p.type === type).value)
  return { month: get('month'), year: get('year') }
}
