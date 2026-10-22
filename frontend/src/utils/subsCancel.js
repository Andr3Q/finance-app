// "Lembrar de cancelar" das Assinaturas (Nancy 2, tela 21). Fica neste aparelho (localStorage): o
// lembrete aparece nas Notificações enquanto a assinatura estiver marcada. Cada marcação guarda o
// nome e o valor da hora em que foi feita, pra Notificações não precisar buscar as assinaturas.
const KEY = 'nancy:subs-cancel'
const KEEP_MS = 90 * 24 * 60 * 60 * 1000 // marcações com mais de 90 dias deixam de lembrar (a cobrança provavelmente já parou)

export const subKey = (description) => String(description || '').trim().toLowerCase()

export function readCancelFlags(now = Date.now()) {
  try {
    const v = JSON.parse(localStorage.getItem(KEY))
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
    return Object.fromEntries(Object.entries(v).filter(([, f]) => f && typeof f.name === 'string' && now - f.at <= KEEP_MS))
  } catch {
    return {}
  }
}

export function setCancelFlag(sub, on, now = Date.now()) {
  try {
    const flags = readCancelFlags(now)
    const key = subKey(sub.description)
    if (on) flags[key] = { name: String(sub.description).trim(), amount: Number(sub.amount) || 0, at: now }
    else delete flags[key]
    localStorage.setItem(KEY, JSON.stringify(flags))
  } catch {
    // storage indisponível: o interruptor só não fica guardado
  }
}

// no formato que o montador de avisos espera
export const cancelReminders = (flags = readCancelFlags()) =>
  Object.entries(flags).map(([key, f]) => ({ key, name: f.name, amount: f.amount }))
