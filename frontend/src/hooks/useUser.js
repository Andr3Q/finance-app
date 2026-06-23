import { useState, useEffect } from 'react'

// Campos sensíveis que não devem persistir em sessionStorage (XSS os lê).
// Ficam apenas no event dispatch (memória React) e vêm do servidor a cada /auth/me.
const SENSITIVE = new Set(['salary', 'reportEmail'])

function toStoredUser(u) {
  const safe = { ...u }
  SENSITIVE.forEach(k => delete safe[k])
  return safe
}

function readUser() {
  try { return JSON.parse(sessionStorage.getItem('user') || '{}') } catch { return {} }
}

export function saveUser(data) {
  try { sessionStorage.setItem('user', JSON.stringify(toStoredUser(data))) } catch {}
  window.dispatchEvent(new CustomEvent('user-updated', { detail: data }))
}

export function useUser() {
  const [user, setUser] = useState(readUser)

  useEffect(() => {
    const onUpdated = (e) => setUser(e.detail || {})
    window.addEventListener('user-updated', onUpdated)
    return () => window.removeEventListener('user-updated', onUpdated)
  }, [])

  return user
}
