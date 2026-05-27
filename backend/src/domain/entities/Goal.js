'use strict'
const { ValidationError } = require('../errors')

const MAX_AMOUNT = 999_999_999.99
const MAX_TITLE  = 80
const HEX_COLOR  = /^#[0-9A-Fa-f]{6}$/
const DEFAULT_COLOR = '#4ac46e'

const PLAN_LIMITS = { free: 1, pro: 4, elite: Infinity }

/**
 * Entidade Goal — encapsula regras de negócio de Metas Financeiras.
 * Sem dependências de framework ou banco de dados.
 */
class Goal {
  /**
   * Valida dados de criação e retorna payload limpo.
   * @param {object} data
   * @returns {{ title, targetAmount, currentAmount, color, deadline }}
   * @throws {ValidationError}
   */
  static validateCreate(data) {
    const { title, targetAmount, currentAmount, color, deadline } = data ?? {}

    if (!title || typeof title !== 'string' || !title.trim())
      throw new ValidationError('Título é obrigatório.', 'title')
    if (title.trim().length > MAX_TITLE)
      throw new ValidationError(`Título deve ter no máximo ${MAX_TITLE} caracteres.`, 'title')

    const parsed = parseFloat(targetAmount)
    if (!parsed || parsed <= 0)
      throw new ValidationError('Valor-alvo deve ser maior que zero.', 'targetAmount')
    if (parsed > MAX_AMOUNT)
      throw new ValidationError('Valor-alvo muito alto.', 'targetAmount')

    const parsedCurrent = Math.max(0, parseFloat(currentAmount) || 0)
    if (parsedCurrent > MAX_AMOUNT)
      throw new ValidationError('Valor atual muito alto.', 'currentAmount')

    if (color !== undefined && !HEX_COLOR.test(color))
      throw new ValidationError('Cor inválida. Use formato #RRGGBB.', 'color')

    let parsedDeadline = null
    if (deadline !== undefined && deadline !== null && deadline !== '') {
      parsedDeadline = new Date(deadline)
      if (isNaN(parsedDeadline.getTime()))
        throw new ValidationError('Data de prazo inválida.', 'deadline')
    }

    return {
      title:         title.trim(),
      targetAmount:  parsed,
      currentAmount: parsedCurrent,
      color:         HEX_COLOR.test(color) ? color : DEFAULT_COLOR,
      deadline:      parsedDeadline,
    }
  }

  /**
   * Valida dados de atualização (todos opcionais) e retorna payload limpo.
   * @param {object} data
   * @returns {object} payload de atualização
   * @throws {ValidationError}
   */
  static validateUpdate(data) {
    const { title, targetAmount, currentAmount, color, deadline } = data ?? {}
    const payload = {}

    if (title !== undefined) {
      const t = String(title).trim()
      if (t.length > MAX_TITLE)
        throw new ValidationError(`Título deve ter no máximo ${MAX_TITLE} caracteres.`, 'title')
      payload.title = t
    }

    if (targetAmount !== undefined) {
      const v = parseFloat(targetAmount)
      if (isNaN(v) || v <= 0) throw new ValidationError('Valor-alvo inválido.', 'targetAmount')
      if (v > MAX_AMOUNT)     throw new ValidationError('Valor-alvo muito alto.', 'targetAmount')
      payload.targetAmount = v
    }

    if (currentAmount !== undefined) {
      const v = parseFloat(currentAmount)
      if (isNaN(v) || v < 0) throw new ValidationError('Valor atual inválido.', 'currentAmount')
      if (v > MAX_AMOUNT)    throw new ValidationError('Valor atual muito alto.', 'currentAmount')
      payload.currentAmount = v
    }

    if (color !== undefined) {
      if (!HEX_COLOR.test(color)) throw new ValidationError('Cor inválida. Use formato #RRGGBB.', 'color')
      payload.color = color
    }

    if (deadline !== undefined) {
      if (deadline === null || deadline === '') {
        payload.deadline = null
      } else {
        const d = new Date(deadline)
        if (isNaN(d.getTime())) throw new ValidationError('Data de prazo inválida.', 'deadline')
        payload.deadline = d
      }
    }

    if (Object.keys(payload).length === 0)
      throw new ValidationError('Nenhum campo para atualizar.')

    return payload
  }

  /**
   * Retorna o limite de metas para o plano informado.
   * @param {string} plan - 'free' | 'pro' | 'elite'
   * @returns {number}
   */
  static limitForPlan(plan) {
    return PLAN_LIMITS[plan] ?? 0
  }

  /**
   * Calcula o percentual de progresso de uma meta.
   * @param {{ currentAmount: number, targetAmount: number }} goal
   * @returns {number} 0–100
   */
  static progressPercent({ currentAmount, targetAmount }) {
    if (!targetAmount || targetAmount <= 0) return 0
    return Math.min(100, Math.round((currentAmount / targetAmount) * 100))
  }
}

module.exports = Goal
