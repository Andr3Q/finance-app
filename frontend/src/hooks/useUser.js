import { useState, useEffect } from 'react'

// Campos sensíveis que não devem persistir em sessionStorage (XSS os lê).
// Ficam apenas no event dispatch (memória React) e vêm do servidor a cada /auth/me.
const SENSITIVE = new Set(['salary', 'reportEmail'])

function toStoredUser(u) {
  const safe = { ...u }
  SENSITIVE.forEach(k => delete safe[k])
  return safe
}

// Os campos sensíveis vivem só na memória do módulo (nunca no storage) e valem pro usuário que os trouxe. Antes eles só
// chegavam pelo evento "user-updated": quem montava DEPOIS do /auth/me (toda tela aberta pela navegação, e todas depois do
// boot, que só libera as rotas quando o /auth/me volta) nascia sem salário — o campo "Salário mensal" aparecia vazio.
let memory = { id: null, fields: {} }

function remember(data) {
  if (!data || !data.id) return
  if (memory.id !== data.id) memory = { id: data.id, fields: {} }
  SENSITIVE.forEach(k => { if (k in data) memory.fields[k] = data[k] })
}

function withMemory(u) {
  return u && u.id && memory.id === u.id ? { ...u, ...memory.fields } : u
}

function readUser() {
  try { return withMemory(JSON.parse(sessionStorage.getItem('user') || '{}')) } catch { return {} }
}

export function saveUser(data) {
  remember(data)
  try { sessionStorage.setItem('user', JSON.stringify(toStoredUser(data))) } catch {}
  // Sobrevive ao fechar a aba e ao logout — marca que este navegador já teve
  // uma conta Nancy, pra HomeRoute pular a landing e cair direto no login.
  try { localStorage.setItem('nancy_has_account', '1') } catch {}
  window.dispatchEvent(new CustomEvent('user-updated', { detail: data }))
}

export function useUser() {
  const [user, setUser] = useState(readUser)

  useEffect(() => {
    const onUpdated = (e) => setUser(withMemory(e.detail || {}))
    window.addEventListener('user-updated', onUpdated)
    return () => window.removeEventListener('user-updated', onUpdated)
  }, [])

  return user
}
