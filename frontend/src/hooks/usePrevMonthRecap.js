import { useState, useEffect } from 'react'
import { transactionsAPI } from '../services/api.js'
import { buildRecapSlides } from '../utils/storySlides.js'
import { PREV_RECAP_UNTIL_DAY } from '../utils/notificationsFeed.js'

/**
 * Quantas histórias tem o resumo do mês anterior — só nos primeiros dias do mês (quando ele vira aviso)
 * e só se o aviso estiver ligado; `null` = ainda não carregou, não há dados ou não é época.
 * O Início (sino) e as Notificações usam o mesmo hook, então concordam.
 */
export function usePrevMonthRecap(enabled, now = new Date()) {
  const [slides, setSlides] = useState(null)
  const active = !!enabled && now.getDate() <= PREV_RECAP_UNTIL_DAY

  useEffect(() => {
    if (!active) { setSlides(null); return undefined }
    let cancelled = false
    transactionsAPI.monthlyRecap(-1)
      .then(r => { if (!cancelled) setSlides(r.data?.hasData ? buildRecapSlides(r.data, -1).length : null) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [active])

  return active ? slides : null
}
