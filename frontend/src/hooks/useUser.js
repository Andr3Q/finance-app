import { useState, useEffect } from 'react'

function readUser() {
  try { return JSON.parse(localStorage.getItem('user') || '{}') } catch { return {} }
}

export function useUser() {
  const [user, setUser] = useState(readUser)

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'user') setUser(e.newValue ? (JSON.parse(e.newValue) || {}) : {})
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return user
}
