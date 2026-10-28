import { useState, useEffect } from 'react'
import { useUser } from './useUser.js'
import { loadStory } from '../services/storiesData.js'
import { buildRecapSlides } from '../utils/storySlides.js'
import { PREV_RECAP_UNTIL_DAY } from '../utils/notificationsFeed.js'

/**
 * Quantas histórias tem o resumo do mês anterior — só nos primeiros dias do mês (quando ele vira aviso)
 * e só se o aviso estiver ligado; `null` = ainda não carregou, não há dados ou não é época.
 * O Início (sino) e as Notificações usam o mesmo hook, então concordam.
 */
export function usePrevMonthRecap(enabled, now = new Date()) {
  const user = useUser()
  const [slides, setSlides] = useState(null)
  const active = !!enabled && now.getDate() <= PREV_RECAP_UNTIL_DAY

  useEffect(() => {
    if (!active) { setSlides(null); return undefined }
    let cancelled = false
    loadStory(user.id, 'resumo', -1) // o mesmo que o Início pré-carrega pro story: uma busca só
      .then(d => { if (!cancelled) setSlides(d?.hasData ? buildRecapSlides(d, -1).length : null) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [active, user.id])

  return active ? slides : null
}
