'use strict'
const prisma            = require('../../lib/prisma')
const { NotFoundError } = require('../../domain/errors')

/**
 * GoalRepository — toda a lógica de acesso a dados de metas.
 * A camada de Serviço nunca importa Prisma diretamente.
 */
class GoalRepository {
  /**
   * Lista todas as metas de um usuário.
   * @param {string} userId
   * @returns {Promise<Goal[]>}
   */
  async findAllByUser(userId) {
    return prisma.goal.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
    })
  }

  /**
   * Cria uma nova meta.
   * @param {string} userId
   * @param {object} data - payload validado
   * @returns {Promise<Goal>}
   */
  async create(userId, data) {
    return prisma.goal.create({ data: { ...data, userId } })
  }

  /**
   * Busca meta por ID garantindo que pertence ao usuário.
   * @param {string} id
   * @param {string} userId
   * @returns {Promise<Goal>}
   * @throws {NotFoundError}
   */
  async findByIdAndUser(id, userId) {
    const goal = await prisma.goal.findUnique({ where: { id, userId } })
    if (!goal) throw new NotFoundError('Meta')
    return goal
  }

  /**
   * Atualiza uma meta.
   * @param {string} id
   * @param {string} userId
   * @param {object} data - campos a atualizar
   * @returns {Promise<Goal>}
   * @throws {NotFoundError}
   */
  async update(id, userId, data) {
    try {
      return await prisma.goal.update({ where: { id, userId }, data })
    } catch (err) {
      if (err.code === 'P2025') throw new NotFoundError('Meta')
      throw err
    }
  }

  /**
   * Conta quantas metas o usuário já tem.
   * O plano efetivo (considerando expiração) vem do authMiddleware via
   * req.userPlan — o repositório não decide plano, só conta registros.
   * @param {string} userId
   * @returns {Promise<number>}
   */
  async countByUser(userId) {
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { _count: { select: { goals: true } } },
    })
    return user?._count?.goals ?? 0
  }

  /**
   * Remove uma meta.
   * @param {string} id
   * @param {string} userId
   * @returns {Promise<void>}
   * @throws {NotFoundError}
   */
  async delete(id, userId) {
    const result = await prisma.goal.deleteMany({ where: { id, userId } })
    if (result.count === 0) throw new NotFoundError('Meta')
  }
}

module.exports = new GoalRepository()
