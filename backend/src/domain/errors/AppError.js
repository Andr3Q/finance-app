'use strict'

/**
 * Base error class para todos os erros de domínio.
 * @extends Error
 */
class AppError extends Error {
  /**
   * @param {string} message   - Mensagem de erro legível
   * @param {number} statusCode - HTTP status code correspondente
   * @param {string} [code]    - Código interno para identificação programática
   */
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message)
    this.name       = this.constructor.name
    this.statusCode = statusCode
    this.code       = code
    this.isAppError = true
    Error.captureStackTrace(this, this.constructor)
  }
}

module.exports = AppError
