'use strict'
const goalService         = require('../../../application/goals/GoalService')
const { UUID_REGEX }      = require('../../../utils/constants')
const { ValidationError } = require('../../../domain/errors')

/**
 * GoalController — camada HTTP de Metas.
 * Responsabilidade única: parsing de req/res.
 * Toda lógica de negócio está no GoalService.
 */
class GoalController {
  /**
   * GET /api/goals
   */
  async list(req, res, next) {
    try {
      const goals = await goalService.list(req.userId)
      res.json(goals)
    } catch (err) {
      next(err)
    }
  }

  /**
   * POST /api/goals
   */
  async create(req, res, next) {
    try {
      const goal = await goalService.create(req.userId, req.userPlan, req.body)
      res.status(201).json(goal)
    } catch (err) {
      next(err)
    }
  }

  /**
   * PATCH /api/goals/:id
   */
  async update(req, res, next) {
    try {
      if (!UUID_REGEX.test(req.params.id))
        throw new ValidationError('ID inválido.', 'id')

      const goal = await goalService.update(req.userId, req.params.id, req.body)
      res.json(goal)
    } catch (err) {
      next(err)
    }
  }

  /**
   * DELETE /api/goals/:id
   */
  async delete(req, res, next) {
    try {
      if (!UUID_REGEX.test(req.params.id))
        throw new ValidationError('ID inválido.', 'id')

      await goalService.delete(req.userId, req.params.id)
      res.json({ ok: true })
    } catch (err) {
      next(err)
    }
  }
}

module.exports = new GoalController()
