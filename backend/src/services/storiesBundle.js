'use strict'
const { buildMonthlyRecap, shiftMonth } = require('./monthlyRecap')
const { nowBrasilia } = require('../utils/helpers')

// Tudo o que os círculos do Início abrem (resumo do mês, resumo do mês anterior e metas) numa resposta só, com UMA ida ao
// banco. Antes eram 3 chamadas (monthly-recap ×2 + goals), cada uma com autenticação + 1 a 4 consultas: o banco atende uma
// consulta por vez e cada uma leva ~0,6 s, então os stories levavam ~8 s para ficar prontos e a pessoa via "Montando seu
// resumo…". Aqui são uma consulta SQL só (subconsultas por usuário, parâmetros ligados — nada concatenado) e a conta é feita
// em memória, com as mesmas funções puras da rota monthly-recap: o resultado tem que ser idêntico ao dela e ao de GET /goals.
async function loadStoriesRows(prisma, userId, fromYear) {
  const [row] = await prisma.$queryRaw`
    SELECT
      (SELECT to_jsonb(u) FROM (
         SELECT "salary", "autoLaunchMonth", "autoLaunchYear" FROM "User" WHERE "id" = ${userId}) u) AS "user",
      (SELECT COALESCE(jsonb_agg(b), '[]'::jsonb) FROM (
         SELECT "id", "amount" FROM "Budget" WHERE "userId" = ${userId}) b) AS "budgets",
      (SELECT COALESCE(jsonb_agg(g ORDER BY g."createdAt" DESC), '[]'::jsonb) FROM (
         SELECT "id", "title", "targetAmount", "currentAmount", "color",
                to_char("deadline", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "deadline",
                to_char("createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt", "userId"
         FROM "Goal" WHERE "userId" = ${userId}) g) AS "goals",
      (SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) FROM (
         SELECT "type", "amount", "category", "month", "year", "budgetId"
         FROM "Transaction" WHERE "userId" = ${userId} AND "year" >= ${fromYear}) t) AS "transactions"`
  return row
}

// (as datas saem no formato do Date.toISOString(): o Prisma guarda DateTime em UTC, timestamp(3))
// Mesmos mapeamentos de GET /goals (normalizeGoal) e da rota monthly-recap.
function buildStoriesBundle({ userId, row, now = nowBrasilia() }) {
  if (!row?.user) return null
  const targets = [shiftMonth(now, 0), shiftMonth(now, -1)]
  const recapGoals = row.goals.map(g => ({ title: g.title, targetAmount: g.targetAmount, currentAmount: g.currentAmount }))
  const resumo = targets.map(target => buildMonthlyRecap({
    target,
    transactions: row.transactions.filter(t => t.year >= target.year - 1), // as mesmas transações que a rota monthly-recap lê
    budgets: row.budgets,
    goals: recapGoals,
    salary: Number(row.user.salary),
    autoLaunch: { month: row.user.autoLaunchMonth, year: row.user.autoLaunchYear },
  }))
  const metas = row.goals.map(g => ({ ...g, targetAmount: Number(g.targetAmount), currentAmount: Number(g.currentAmount) }))
  return { userId, resumo, metas }
}

async function getStoriesBundle(prisma, userId, now = nowBrasilia()) {
  const fromYear = shiftMonth(now, -1).year - 1 // cobre o mais antigo dos dois resumos
  const row = await loadStoriesRows(prisma, userId, fromYear)
  return buildStoriesBundle({ userId, row, now })
}

module.exports = { getStoriesBundle, buildStoriesBundle, loadStoriesRows }
