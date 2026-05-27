'use strict'
const AppError = require('./AppError')

/** Acesso não autorizado (HTTP 403) */
class ForbiddenError extends AppError {
  // Apenas estas chaves são permitidas em `extra` para evitar
  // que um chamador sobrescreva isAppError, statusCode ou code.
  static #ALLOWED_EXTRA = ['limitReached', 'plan']

  constructor(message = 'Acesso negado.', extra = {}) {
    super(message, 403, 'FORBIDDEN')
    ForbiddenError.#ALLOWED_EXTRA.forEach(k => {
      if (k in extra) this[k] = extra[k]
    })
  }
}

module.exports = ForbiddenError
