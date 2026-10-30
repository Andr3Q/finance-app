// Rota protegida que a pessoa tentou abrir (link de cobrança, notificação, favorito) quando a sessão já tinha expirado.
// Ao abrir o app num aparelho que já teve conta, a sessão é conferida com o servidor; se ela expirou, a resposta força o
// login com um redirecionamento COMPLETO da página, que perde o state do roteador — sem isto o login sempre caía no Início
// e o destino original se perdia (achado N2-1). O destino fica na sessionStorage (só desta aba) até o login devolver a pessoa.
const KEY = 'nancy_return_to'

// Só caminho interno do app: "//outro-site" e "/\outro-site" seriam lidos pelo navegador como outro endereço.
const isInternalPath = (p) => typeof p === 'string' && p.startsWith('/') && !p.startsWith('//') && !p.startsWith('/\\')

export function rememberReturnTo({ pathname, search = '' } = {}) {
  try { if (isInternalPath(pathname)) sessionStorage.setItem(KEY, `${pathname}${search || ''}`) } catch { /* armazenamento bloqueado: o login cai no Início */ }
}

export function peekReturnTo() {
  try {
    const v = sessionStorage.getItem(KEY)
    return isInternalPath(v) ? v : null
  } catch { return null }
}

export function clearReturnTo() {
  try { sessionStorage.removeItem(KEY) } catch { /* idem */ }
}
