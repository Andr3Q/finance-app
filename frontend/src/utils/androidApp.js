// Detecta quando o site roda DENTRO do app Android da Play Store (Trusted Web Activity). Ali a política de pagamentos do Google não
// permite vender plano por fora da Play: o app não mostra preço, compra, upgrade nem caminho para pagar; só o plano atual.
// A assinatura continua existindo no site. Como o Chrome abre o TWA com o referrer "android-app://<pacote>", vale a primeira carga;
// o resultado fica no sessionStorage (a aba do app) para valer nas navegações e recargas seguintes, sem contaminar o Chrome comum
// (um localStorage seria compartilhado com o site aberto no navegador do mesmo aparelho).
export const ANDROID_APP_PACKAGE = 'br.com.myfinancepro.app'
export const ANDROID_APP_KEY = 'nancy-android-app'

export function isAndroidApp() {
  try {
    if (sessionStorage.getItem(ANDROID_APP_KEY) === '1') return true
    if (typeof document !== 'undefined' && (document.referrer || '').startsWith(`android-app://${ANDROID_APP_PACKAGE}`)) {
      sessionStorage.setItem(ANDROID_APP_KEY, '1')
      return true
    }
  } catch { /* armazenamento bloqueado: segue como site comum */ }
  return false
}

// grava a detecção já na carga do módulo: o referrer só existe na primeira navegação
isAndroidApp()
