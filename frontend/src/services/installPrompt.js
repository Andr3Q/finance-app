// Captura precoce no index.html (window.__installPrompt) garante que o evento
// beforeinstallprompt nunca seja perdido por chegar antes do React montar.
let _prompt = null

export function setInstallPrompt(e) { _prompt = e; window.__installPrompt = e }
export function getInstallPrompt()  { return _prompt || window.__installPrompt || null }
export function clearInstallPrompt(){ _prompt = null; window.__installPrompt = null }

export function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches || !!navigator.standalone
}
