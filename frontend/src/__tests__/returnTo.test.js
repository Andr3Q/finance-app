import { rememberReturnTo, peekReturnTo, clearReturnTo } from '../utils/returnTo.js'

beforeEach(() => sessionStorage.clear())

describe('returnTo — destino de uma sessão que expirou', () => {
  it('guarda o caminho com a query e devolve', () => {
    rememberReturnTo({ pathname: '/settings/pagamentos', search: '?plano=pro' })
    expect(peekReturnTo()).toBe('/settings/pagamentos?plano=pro')
  })

  it('sem query, guarda só o caminho (a query pode vir indefinida)', () => {
    rememberReturnTo({ pathname: '/goals' })
    expect(peekReturnTo()).toBe('/goals')
  })

  it('clear apaga', () => {
    rememberReturnTo({ pathname: '/goals' })
    clearReturnTo()
    expect(peekReturnTo()).toBeNull()
  })

  it.each(['//outro-site.example', 'https://outro-site.example', '/\\outro-site.example', 'goals', '', undefined, null, 42])('não guarda %s (não é caminho interno)', (pathname) => {
    rememberReturnTo({ pathname })
    expect(peekReturnTo()).toBeNull()
  })

  it('ao ler, ignora um valor adulterado na sessão', () => {
    sessionStorage.setItem('nancy_return_to', '//outro-site.example')
    expect(peekReturnTo()).toBeNull()
  })

  it('armazenamento bloqueado (aba privada): não quebra', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado') })
    expect(() => rememberReturnTo({ pathname: '/goals' })).not.toThrow()
    spy.mockRestore()
  })
})
