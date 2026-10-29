import { chatError } from '../utils/chatErrors.js'

const http = (status, data = {}, headers = {}) => ({ response: { status, data, headers } })

describe('chatError — mensagem e se pode tentar de novo', () => {
  it('erro do servidor (5xx) nunca mostra o texto cru e pode tentar de novo', () => {
    for (const status of [500, 502, 503, 504]) {
      expect(chatError(http(status, { error: 'internal' }))).toEqual({ message: 'Não consegui falar com a Nancy agora. Tente de novo em instantes.', retry: true })
    }
    expect(chatError(http(502, '<html>Bad Gateway</html>')).message).toMatch(/Não consegui falar com a Nancy/)
  })

  it('limite por hora (Retry-After de ~42 min): diz quanto esperar e NÃO oferece tentar de novo', () => {
    expect(chatError(http(429, { error: 'Limite de mensagens para a IA atingido. Tente novamente em 1 hora.' }, { 'retry-after': '2544' }))).toEqual({
      message: 'Você atingiu o limite de mensagens da IA por agora. Tente de novo em 43 min.', retry: false,
    })
    expect(chatError(http(429, {}, { 'retry-after': '3600' })).message).toMatch(/em cerca de 1 hora\./)
    expect(chatError(http(429, {}, { 'retry-after': '60' })).message).toMatch(/em 1 min\./)
  })

  it('limite por hora sem o cabeçalho: usa o texto do servidor e não oferece tentar de novo', () => {
    expect(chatError(http(429, { error: 'Limite de mensagens para a IA atingido. Tente novamente em 1 hora.' }))).toEqual({
      message: 'Limite de mensagens para a IA atingido. Tente novamente em 1 hora.', retry: false,
    })
  })

  it('IA sobrecarregada (429 curto, sem Retry-After longo): mostra a causa real e pode tentar de novo', () => {
    expect(chatError(http(429, { error: 'Serviço de IA sobrecarregado. Aguarde alguns segundos e tente novamente.' }, { 'retry-after': '2' }))).toEqual({
      message: 'Serviço de IA sobrecarregado. Aguarde alguns segundos e tente novamente.', retry: true,
    })
    expect(chatError(http(429))).toEqual({ message: 'Muitas mensagens seguidas. Aguarde alguns segundos.', retry: true })
  })

  it('tempo esgotado no aparelho: pode ter sido feito no servidor — manda conferir o Extrato e NÃO oferece tentar de novo', () => {
    const r = chatError({ code: 'ECONNABORTED', message: 'timeout of 95000ms exceeded' })
    expect(r.retry).toBe(false)
    expect(r.message).toMatch(/confira o Extrato antes de tentar de novo/)
  })

  describe('sem resposta do servidor', () => {
    const online = (value) => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value)
    afterEach(() => vi.restoreAllMocks())

    it('SEM internet de verdade: o pedido nem saiu, repetir é seguro', () => {
      online(false)
      expect(chatError({ code: 'ERR_NETWORK', message: 'Network Error' })).toEqual({ message: 'Sem conexão com a internet. Tente de novo quando voltar.', retry: true })
    })

    // Revisão independente: com internet, a conexão pode ter caído DEPOIS de o servidor registrar o que foi pedido.
    it('COM internet a conexão caiu no meio: o servidor pode ter feito a ação — confira o Extrato e NÃO ofereça tentar de novo', () => {
      online(true)
      for (const err of [{ code: 'ERR_NETWORK', message: 'Network Error' }, {}]) {
        const r = chatError(err)
        expect(r.retry).toBe(false)
        expect(r.message).toMatch(/caiu no meio do pedido.*confira o Extrato antes de tentar de novo/)
      }
    })

    it('ao confirmar excluir/editar a repetição é segura (a ação é idempotente): continua com "tentar de novo"', () => {
      online(true)
      expect(chatError({ code: 'ERR_NETWORK' }, { confirming: true })).toEqual({ message: 'Sem conexão com o servidor.', retry: true })
    })
  })

  it('o servidor respondeu "tempo esgotado" (503 com timeout:true): ele pode ter continuado — confira o Extrato, sem tentar de novo', () => {
    const r = chatError(http(503, { error: 'Tempo de resposta esgotado.', timeout: true }))
    expect(r.retry).toBe(false)
    expect(r.message).toMatch(/confira o Extrato antes de tentar de novo/)
  })

  it('503 comum (IA indisponível, sem timeout:true) continua seguro para tentar de novo', () => {
    expect(chatError(http(503, { error: 'Serviço de IA temporariamente indisponível.' })).retry).toBe(true)
  })

  it('plano (403 limitReached), sessão (401/403) e validação (400): sem tentar de novo', () => {
    expect(chatError(http(403, { limitReached: true, error: 'Disponível no plano Elite.' }))).toEqual({ message: 'Disponível no plano Elite.', retry: false })
    expect(chatError(http(403, { limitReached: true }))).toEqual({ message: 'Recurso exclusivo do plano Elite.', retry: false })
    expect(chatError(http(401))).toEqual({ message: 'Sessão expirada. Faça login novamente.', retry: false })
    expect(chatError(http(403))).toEqual({ message: 'Sessão expirada. Faça login novamente.', retry: false })
    expect(chatError(http(400, { error: 'Mensagem muito longa.' }))).toEqual({ message: 'Mensagem muito longa.', retry: false })
    expect(chatError(http(400))).toEqual({ message: 'Não consegui processar a mensagem. Tente de novo.', retry: false })
  })
})
