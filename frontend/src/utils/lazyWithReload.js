import { lazy } from 'react'

// Depois de um deploy, uma aba/PWA aberta antes dele continua com o código ANTIGO. Ao abrir uma tela que ainda não tinha sido
// baixada, ela pede /assets/Tela-<hash antigo>.js — arquivo que a versão nova não tem mais — e o servidor responde com o
// index.html (o "catch-all" do app). O import falha e o cliente caía na tela de erro. Aqui, esse erro específico recarrega a
// página UMA vez (pega o index.html e os arquivos novos) e a pessoa cai na tela que pediu.
const KEY = 'nancy:chunk-reload-at'
const WINDOW_MS = 60_000 // no máximo um recarregamento por minuto: se continuar falhando, mostra o erro em vez de ficar em laço

export const reloader = { reload: () => window.location.reload() } // separado pra teste conseguir trocar

export function isChunkLoadError(err) {
  const msg = String(err?.message || err || '')
  return err?.name === 'ChunkLoadError' ||
    /dynamically imported module|Importing a module script failed|Loading chunk|Loading CSS chunk|error loading dynamically|Unexpected token '<'|MIME type/i.test(msg)
}

// true se disparou o recarregamento. Sem armazenamento (aba privada bloqueada) não dá pra limitar a frequência: não recarrega.
export function reloadOnceForNewVersion(now = Date.now()) {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0)
    if (now - last < WINDOW_MS) return false
    sessionStorage.setItem(KEY, String(now))
  } catch { return false }
  reloader.reload()
  return true
}

export function loadWithReload(factory) {
  return factory().catch(err => {
    if (isChunkLoadError(err) && reloadOnceForNewVersion()) return new Promise(() => {}) // segue no loader até a página recarregar
    throw err
  })
}

export const lazyWithReload = (factory) => lazy(() => loadWithReload(factory))
