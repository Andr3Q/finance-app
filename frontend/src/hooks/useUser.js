import { useState, useEffect } from 'react'

function readUser() {
  try { return JSON.parse(localStorage.getItem('user') || '{}') } catch { return {} }
}

export function saveUser(data) {
  localStorage.setItem('user', JSON.stringify(data))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: data }))
}

export function useUser() {
  const [user, setUser] = useState(readUser)

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'user') setUser(e.newValue ? (JSON.parse(e.newValue) || {}) : {})
    }
    const onUpdated = (e) => setUser(e.detail || {})

    window.addEventListener('storage',      onStorage)
    window.addEventListener('user-updated', onUpdated)
    return () => {
      window.removeEventListener('storage',      onStorage)
      window.removeEventListener('user-updated', onUpdated)
    }
  }, [])

  return user
}
