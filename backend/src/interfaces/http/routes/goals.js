'use strict'
const { Router }     = require('express')
const authMiddleware = require('../../../middleware/auth')
const controller     = require('../controllers/GoalController')

const router = Router()
router.use(authMiddleware)

/**
 * Rotas de Metas — apenas registra handlers.
 * Sem lógica de negócio aqui.
 */
router.get ('/',     (req, res, next) => controller.list(req, res, next))
router.post('/',     (req, res, next) => controller.create(req, res, next))
router.patch('/:id', (req, res, next) => controller.update(req, res, next))
router.delete('/:id',(req, res, next) => controller.delete(req, res, next))

module.exports = router
