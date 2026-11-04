import { useEffect, useState } from 'react'

// O subtítulo da barra de cima (desktop) vem da rota (utils/desktopNav). Quando ele depende dos dados da tela — "4 novas" em
// Notificações — a tela publica o texto aqui e a barra o mostra no lugar do padrão; ao sair da tela, volta ao padrão.
const EVENT = 'nancy:page-subtitle'
let subtitle = null

const publish = (text) => {
  if (text === subtitle) return
  subtitle = text
  window.dispatchEvent(new Event(EVENT))
}

// text: string para trocar o subtítulo; null/undefined = usa o padrão da rota
export function usePageSubtitle(text) {
  useEffect(() => {
    publish(text || null)
    return () => publish(null)
  }, [text])
}

export function usePageSubtitleOverride() {
  const [value, setValue] = useState(() => subtitle)
  useEffect(() => {
    const sync = () => setValue(subtitle)
    window.addEventListener(EVENT, sync)
    sync()
    return () => window.removeEventListener(EVENT, sync)
  }, [])
  return value
}
