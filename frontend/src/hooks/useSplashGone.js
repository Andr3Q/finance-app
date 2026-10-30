import { useEffect, useState } from 'react'

// A splash de abertura (vídeo, ~4s) cobre a tela. O campo de senha NÃO pode existir por baixo dela: o gerenciador de senhas do
// celular (iOS/Chrome) abre o "Iniciar a sessão com a senha de ...?" por cima do vídeo assim que vê o formulário. Já havia essa
// proteção para quem chega pela raiz do app, mas o recarregamento para /login (sessão que expirou) montava o formulário na hora.
// main.jsx marca window.__nancySplashGone e avisa com o evento 'nancy:splash-gone' quando a splash começa a sair.
const splashIsGone = () => {
  if (typeof document === 'undefined') return true
  if (window.__nancySplashGone === true) return true
  const splash = document.getElementById('app-splash')
  return !splash || splash.classList.contains('splash-hide')
}

export function useSplashGone() {
  const [gone, setGone] = useState(splashIsGone)
  useEffect(() => {
    if (gone) return undefined
    const onGone = () => setGone(true)
    window.addEventListener('nancy:splash-gone', onGone)
    if (splashIsGone()) onGone() // saiu entre a primeira leitura e este efeito
    return () => window.removeEventListener('nancy:splash-gone', onGone)
  }, [gone])
  return gone
}
