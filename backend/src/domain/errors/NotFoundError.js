'use strict'
const AppError = require('./AppError')

/** Recurso não encontrado (HTTP 404) */
class NotFoundError extends AppError {
  constructor(resource = 'Recurso') {
    super(`${resource} não encontrado.`, 404, 'NOT_FOUND')
    this.resource = resource
  }
}

module.exports = NotFoundError
