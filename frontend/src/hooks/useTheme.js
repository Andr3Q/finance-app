import { useState, useEffect, useLayoutEffect, useSyncExternalStore } from 'react'

// As telas do Nancy 2 (Início, Extrato...) são desenhadas só no tema claro.
// Enquanto uma delas está na tela, o tema é imposto como "light" SEM mexer na
// preferência salva do usuário — as telas antigas, ainda não redesenhadas,
// continuam no tema que ele escolheu. É um contador (e não um booleano) porque
// numa navegação entre duas telas forçadas a que sai e a que entra existem ao
// mesmo tempo, e o tema escuro não pode piscar entre elas.
let forcedCount = 0
const listeners = new Set()
const emit      = () => listeners.forEach(l => l())
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l) }
const isForced  = () => forcedCount > 0

function storedTheme() {
  try { return localStorage.getItem('theme') || 'dark' } catch { return 'dark' }
}

// Único ponto que escreve data-theme: assim nenhum useTheme() montado depois
// (a Navbar monta junto de cada tela) desfaz o tema imposto.
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', isForced() ? 'light' : theme)
}

// Chamado pelas telas do Nancy 2. useLayoutEffect: o tema muda antes da
// primeira pintura da tela, sem um quadro no tema errado.
export function useForcedLightTheme() {
  useLayoutEffect(() => {
    forcedCount++
    applyTheme(storedTheme())
    emit()
    return () => {
      forcedCount--
      applyTheme(storedTheme())
      emit()
    }
  }, [])
}

// true enquanto o tema está imposto — a Navbar esconde o botão de trocar tema
// (ele não teria efeito nessas telas).
export function useThemeForced() {
  return useSyncExternalStore(subscribe, isForced, () => false)
}

export function useTheme() {
  const [theme, setTheme] = useState(storedTheme)

  useEffect(() => {
    applyTheme(theme)
    try { localStorage.setItem('theme', theme) } catch { /* storage bloqueado */ }
  }, [theme])

  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  return { theme, toggle }
}
