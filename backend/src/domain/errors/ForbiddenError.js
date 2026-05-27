'use strict'
const AppError = require('./AppError')

/** Acesso não autorizado (HTTP 403) */
class ForbiddenError extends AppError {
  constructor(message = 'Acesso negado.', extra = {}) {
    super(message, 403, 'FORBIDDEN')
    Object.assign(this, extra)
  }
}

module.exports = ForbiddenError
