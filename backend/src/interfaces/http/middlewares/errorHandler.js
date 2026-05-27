'use strict'
const { AppError } = require('../../../domain/errors')

/**
 * Middleware centralizado de tratamento de erros.
 * Mapeia AppError (domínio) → resposta HTTP padronizada.
 * Deve ser registrado ANTES do handler global existente no Express.
 *
 * @type {import('express').ErrorRequestHandler}
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  // Erros de domínio conhecidos (AppError e subclasses)
  if (err.isAppError) {
    const body = { error: err.message }
    // Propaga campos extras do ForbiddenError (limitReached, plan, etc.)
    const extras = ['limitReached', 'plan', 'field', 'resource']
    extras.forEach(k => { if (err[k] !== undefined) body[k] = err[k] })
    return res.status(err.statusCode).json(body)
  }

  // Passa para o próximo handler (handler global existente no server.js)
  next(err)
}

module.exports = errorHandler
