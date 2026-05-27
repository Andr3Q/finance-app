'use strict'
const Goal                = require('../../domain/entities/Goal')
const { ForbiddenError }  = require('../../domain/errors')
const goalRepository      = require('../../infrastructure/repositories/GoalRepository')
const { sendPushToUser }  = require('../../services/pushService')

/**
 * GoalService — Casos de uso de Metas Financeiras.
 * Orquestra regras de domínio e repositório.
 * Nunca conhece req/res do Express.
 */
class GoalService {
  /**
   * Lista todas as metas do usuário.
   * @param {string} userId
   * @returns {Promise<Goal[]>}
   */
  async list(userId) {
    return goalRepository.findAllByUser(userId)
  }

  /**
   * Cria uma nova meta respeitando os limites do plano.
   * @param {string} userId
   * @param {object} body   - dados brutos da requisição
   * @returns {Promise<Goal>}
   * @throws {ValidationError|ForbiddenError}
   */
  async create(userId, body) {
    // 1. Validar dados (pode lançar ValidationError)
    const payload = Goal.validateCreate(body)

    // 2. Verificar limite do plano — query isolada no repositório
    const { plan, count } = await goalRepository.findUserPlanAndCount(userId)
    const limit = Goal.limitForPlan(plan)

    if (count >= limit) {
      const messages = {
        free: 'Crie mais metas com o plano Pro ou Elite.',
        pro:  'Limite de 4 metas atingido no plano Pro.',
      }
      throw new ForbiddenError(messages[plan] ?? 'Limite de metas atingido.', {
        limitReached: true,
        plan,
      })
    }

    // 3. Persistir
    return goalRepository.create(userId, payload)
  }

  /**
   * Atualiza uma meta existente.
   * Emite notificação push em marcos de progresso (50%, 75%, 100%).
   * @param {string} userId
   * @param {string} goalId
   * @param {object} body
   * @returns {Promise<Goal>}
   */
  async update(userId, goalId, body) {
    // 1. Validar
    const payload = Goal.validateUpdate(body)

    // 2. Capturar estado anterior para detectar marcos de progresso
    const prev = await goalRepository.findByIdAndUser(goalId, userId)

    // 3. Persistir
    const updated = await goalRepository.update(goalId, userId, payload)

    // 4. Disparar notificações push de progresso (fire-and-forget)
    this._notifyProgress(userId, prev, updated).catch(() => {})

    return updated
  }

  /**
   * Remove uma meta.
   * @param {string} userId
   * @param {string} goalId
   * @returns {Promise<void>}
   */
  async delete(userId, goalId) {
    return goalRepository.delete(goalId, userId)
  }

  // ── Privado ─────────────────────────────────────────────────────

  /**
   * Envia notificação push ao atingir marcos (50%, 75%, 100%).
   * @private
   */
  async _notifyProgress(userId, prev, updated) {
    if (!prev || !updated || updated.targetAmount <= 0) return

    const prevPct = prev.currentAmount   / prev.targetAmount
    const newPct  = updated.currentAmount / updated.targetAmount
    const title   = updated.title

    if      (prevPct < 0.5 && newPct >= 0.5 && newPct < 1)
      await sendPushToUser(userId, { title: '🎯 Metade do caminho!', body: `Você já chegou a 50% da meta "${title}". Continue assim!`, url: '/goals' })
    else if (prevPct < 0.75 && newPct >= 0.75 && newPct < 1)
      await sendPushToUser(userId, { title: '🚀 Quase lá!', body: `Falta pouco! Você atingiu 75% da meta "${title}".`, url: '/goals' })
    else if (prevPct < 1 && newPct >= 1)
      await sendPushToUser(userId, { title: '🏆 Meta concluída!', body: `Parabéns! Você atingiu sua meta "${title}".`, url: '/goals' })
  }
}

module.exports = new GoalService()
