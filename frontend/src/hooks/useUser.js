import { useState, useEffect } from 'react'

function readUser() {
  try { return JSON.parse(sessionStorage.getItem('user') || '{}') } catch { return {} }
}

export function saveUser(data) {
  try { sessionStorage.setItem('user', JSON.stringify(data)) } catch {}
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
