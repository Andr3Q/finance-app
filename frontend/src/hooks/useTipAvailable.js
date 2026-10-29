import { useState, useEffect } from 'react'
import { transactionsAPI } from '../services/api.js'

// A "Dica da Nancy IA" só existe quando há base de comparação (GET /transactions/weekly-tip-available).
// Devolve true / false e null enquanto não se sabe (ou se a consulta falhou): quem usa só anuncia a dica com true,
// então nunca promete uma dica que o story não vai ter. O resultado fica guardado alguns minutos pra Início e Notificações
// não perguntarem de novo a cada ida e volta.
const TTL_MS = 10 * 60 * 1000
let cached = null // { value, at, userKey }

export function resetTipAvailableCache() { cached = null }

// Quem já perguntou (ex.: a abertura do app, que também deixa a dica pronta) guarda a resposta aqui: o Início não pergunta de novo.
export function rememberTipAvailable(userKey, value) { cached = { value: value === true, at: Date.now(), userKey } }

export function useTipAvailable(userKey = '') {
  const fresh = cached && cached.userKey === userKey && Date.now() - cached.at < TTL_MS
  const [available, setAvailable] = useState(fresh ? cached.value : null)

  useEffect(() => {
    if (!userKey) return undefined // sem usuário logado não há o que perguntar
    if (cached && cached.userKey === userKey && Date.now() - cached.at < TTL_MS) { setAvailable(cached.value); return undefined }
    let cancelled = false
    transactionsAPI.weeklyTipAvailable()
      .then(r => {
        const value = r.data?.available === true
        cached = { value, at: Date.now(), userKey }
        if (!cancelled) setAvailable(value)
      })
      .catch(() => { if (!cancelled) setAvailable(null) })
    return () => { cancelled = true }
  }, [userKey])

  return available
}
