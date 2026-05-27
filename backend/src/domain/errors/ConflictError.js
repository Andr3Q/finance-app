'use strict'
const AppError = require('./AppError')

/** Conflito de estado (HTTP 409) */
class ConflictError extends AppError {
  constructor(message = 'Conflito de dados.') {
    super(message, 409, 'CONFLICT')
  }
}

module.exports = ConflictError
