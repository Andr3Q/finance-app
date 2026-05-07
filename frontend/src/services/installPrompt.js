// Armazena o deferredPrompt globalmente — qualquer componente pode usar
let _prompt = null

export function setInstallPrompt(e) { _prompt = e }
export function getInstallPrompt()  { return _prompt }
export function clearInstallPrompt(){ _prompt = null }

export function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches || !!navigator.standalone
}
