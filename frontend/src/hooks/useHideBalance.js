import { useEffect, useState, useCallback } from 'react'

// "Ocultar valores" (olho do Início no celular e da barra de cima no desktop): a mesma preferência, guardada no aparelho e
// sincronizada entre quem a mostra e quem a usa (os dois podem estar na tela ao mesmo tempo).
const KEY = 'hide-balance'
const EVENT = 'nancy:hide-balance'

let current = false
// O aparelho recusou gravar (aba privada): daí em diante vale o valor em memória, que dura enquanto o app está aberto.
let memoryOnly = false

// true/false se o armazenamento responde; null se está bloqueado
const readStored = () => {
  try { return localStorage.getItem(KEY) === '1' } catch { return null }
}

// o armazenamento é a fonte da verdade (outra aba, outro componente, o próprio teste podem ter mudado o valor)
const refresh = () => {
  if (memoryOnly) return
  const stored = readStored()
  if (stored !== null) current = stored
}

export function useHideBalance() {
  const [hidden, setHidden] = useState(() => { refresh(); return current })

  useEffect(() => {
    const sync = () => setHidden(current)
    const onStorage = (e) => { if (e.key === KEY || e.key === null) { refresh(); sync() } }
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', onStorage)
    refresh()
    sync() // pode ter mudado entre o primeiro render e a montagem do efeito
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const toggle = useCallback(() => {
    refresh()
    current = !current
    try { localStorage.setItem(KEY, current ? '1' : '0') } catch { memoryOnly = true }
    window.dispatchEvent(new Event(EVENT))
  }, [])

  return [hidden, toggle]
}
