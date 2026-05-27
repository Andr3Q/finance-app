'use strict'
const AppError = require('./AppError')

/** Erro de validação de entrada (HTTP 400) */
class ValidationError extends AppError {
  constructor(message, field = null) {
    super(message, 400, 'VALIDATION_ERROR')
    this.field = field
  }
}

module.exports = ValidationError
