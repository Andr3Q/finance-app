import api from '../services/api.js'

// Acessa o handler de erro registrado via interceptor diretamente — testa a
// lógica real sem precisar de um servidor/mock de rede. `handlers` é um
// array interno do axios (mesma técnica usada por libs como
// axios-mock-adapter), estável na 1.x.
function getRejectedHandler() {
  return api.interceptors.response.handlers[0].rejected
}

function makeError(status, url, data = {}) {
  return { response: { status, data }, config: { url } }
}

beforeEach(() => {
  sessionStorage.setItem('user', JSON.stringify({ id: 'u1' }))
  delete window.location
  window.location = { href: '', pathname: '/dashboard' }
})

describe('interceptor de resposta — 401/403 vs credencial errada', () => {
  const rejected = () => getRejectedHandler()

  test('401 em /auth/me (sessão de fato inválida) limpa sessão e redireciona', async () => {
    await expect(rejected()(makeError(401, '/auth/me'))).rejects.toBeTruthy()
    expect(sessionStorage.getItem('user')).toBeNull()
    expect(window.location.href).toBe('/login')
  })

  test.each([
    '/auth/login',
    '/auth/2fa/verify-login',
    '/auth/2fa/use-backup-code',
    '/auth/2fa/disable',
    '/auth/2fa/regenerate-backup-codes',
  ])('401 em %s (credencial errada) NÃO limpa sessão nem redireciona', async (url) => {
    await expect(rejected()(makeError(401, url))).rejects.toBeTruthy()
    expect(sessionStorage.getItem('user')).not.toBeNull()
    expect(window.location.href).toBe('')
  })

  test('403 com limitReached (gate de plano) não é tratado como erro de sessão', async () => {
    await expect(
      rejected()(makeError(403, '/agent/chat', { limitReached: true }))
    ).rejects.toBeTruthy()
    expect(sessionStorage.getItem('user')).not.toBeNull()
    expect(window.location.href).toBe('')
  })

  test('403 sem limitReached em rota comum (não credencial) ainda redireciona — regra geral preservada', async () => {
    await expect(rejected()(makeError(403, '/transactions'))).rejects.toBeTruthy()
    expect(sessionStorage.getItem('user')).toBeNull()
    expect(window.location.href).toBe('/login')
  })

  test('erro de rede (sem response) não mexe em sessão nem redireciona', async () => {
    await expect(rejected()({ config: { url: '/auth/me' } })).rejects.toBeTruthy()
    expect(sessionStorage.getItem('user')).not.toBeNull()
    expect(window.location.href).toBe('')
  })
})
