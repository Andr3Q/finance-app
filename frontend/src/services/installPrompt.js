let _prompt = null
const INSTALLED_KEY = 'pwa-installed'

export function setInstallPrompt(e) { _prompt = e; window.__installPrompt = e }
export function getInstallPrompt()  { return _prompt || window.__installPrompt || null }
export function clearInstallPrompt(){ _prompt = null; window.__installPrompt = null }

// Persiste o estado de instalação entre sessões
export function markInstalled()   { localStorage.setItem(INSTALLED_KEY, '1') }
export function clearInstalled()  { localStorage.removeItem(INSTALLED_KEY) }

export function isInstalled() {
  if (window.matchMedia('(display-mode: standalone)').matches || !!navigator.standalone) return true
  return localStorage.getItem(INSTALLED_KEY) === '1'
}
