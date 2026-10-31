// Quais stories o usuário já abriu — o círculo correspondente no Início fica
// com o anel apagado (como o "Outubro" do design). É só um indicador visual
// guardado no aparelho (localStorage), não um dado da conta.
//
// Cada story tem uma chave por período, então volta a aparecer como nova
// quando o período vira: resumo → por mês, dicas → por semana, metas → por mês.
// Início e StoriesResumo usam as MESMAS funções de chave pra sempre concordarem.

const STORAGE_KEY = 'nancy:stories-seen'
const KEEP_MS = 120 * 24 * 60 * 60 * 1000 // descarta registros com mais de 120 dias

const pad = (n) => String(n).padStart(2, '0')

// offset 0 = mês atual, -1 = mês anterior.
export function resumoKey(offset = 0, now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  return `resumo:${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

export function metasKey(now = new Date()) {
  return `metas:${now.getFullYear()}-${pad(now.getMonth() + 1)}`
}

// "Dica da semana": semana ISO 8601 (a que contém a quinta-feira).
export function dicasKey(now = new Date()) {
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const week = Math.ceil(((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7)
  return `dicas:${d.getUTCFullYear()}-W${pad(week)}`
}

export function readSeen() {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY))
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch {
    return {}
  }
}

export function markSeen(key, now = Date.now()) {
  try {
    const seen = readSeen()
    seen[key] = now
    for (const k of Object.keys(seen)) if (now - seen[k] > KEEP_MS) delete seen[k]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seen))
  } catch {
    // storage indisponível (janela privada, bloqueado...): só perde o anel apagado
  }
}
