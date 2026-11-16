import { useSyncExternalStore } from 'react'
import { getPlayBilling, subscribePlayBilling } from '../services/playBilling.js'

// { status, details } da cobrança da Google Play no app Android. Quem usa re-renderiza quando o app descobre que dá (ou não) para vender.
export function usePlayBilling() {
  return useSyncExternalStore(subscribePlayBilling, getPlayBilling, getPlayBilling)
}
