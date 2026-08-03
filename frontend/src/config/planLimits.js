export const PLAN_LIMITS = {
  free:  { transactions: 20, budgets: 15, goals: 1 },
  pro:   { transactions: 35, budgets: 35, goals: 4 },
  elite: { transactions: Infinity, budgets: Infinity, goals: Infinity },
}

export function getLimit(plan, feature) {
  return PLAN_LIMITS[plan]?.[feature] ?? PLAN_LIMITS.free[feature]
}

export function nextPlan(plan) {
  if (plan === 'free') return 'pro'
  if (plan === 'pro')  return 'elite'
  return null
}

export function nextPlanLabel(plan) {
  if (plan === 'free') return 'Pro'
  if (plan === 'pro')  return 'Elite'
  return null
}
