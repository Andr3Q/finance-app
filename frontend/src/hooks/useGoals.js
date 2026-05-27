import { useState, useCallback } from 'react'
import { goalsAPI }              from '../services/api'
import { getCache, setCache, invalidateCache } from '../services/cache'

const CACHE_KEY = 'goals:list'
const CACHE_TTL = 60_000 // 1 minuto

/**
 * useGoals — hook que encapsula toda a lógica de estado de metas.
 *
 * Separa responsabilidades:
 *   - Pages/componentes: apenas chamam as funções e exibem o estado
 *   - useGoals: gerencia fetch, cache, loading, erros e invalidação
 *
 * @returns {{
 *   goals: Goal[],
 *   loading: boolean,
 *   fetchGoals: (force?: boolean) => Promise<void>,
 *   createGoal: (data: object) => Promise<Goal>,
 *   updateGoal: (id: string, data: object) => Promise<Goal>,
 *   deleteGoal: (id: string) => Promise<void>,
 * }}
 */
export function useGoals() {
  const [goals,   setGoals]   = useState([])
  const [loading, setLoading] = useState(true)

  const fetchGoals = useCallback(async (force = false) => {
    if (!force) {
      const cached = getCache(CACHE_KEY)
      if (cached) { setGoals(cached); setLoading(false); return }
    }
    setLoading(true)
    try {
      const { data } = await goalsAPI.list()
      setCache(CACHE_KEY, data, CACHE_TTL)
      setGoals(data)
    } finally {
      setLoading(false)
    }
  }, [])

  const createGoal = useCallback(async (body) => {
    const { data } = await goalsAPI.create(body)
    invalidateCache(CACHE_KEY)
    await fetchGoals(true)
    return data
  }, [fetchGoals])

  const updateGoal = useCallback(async (id, body) => {
    const { data } = await goalsAPI.update(id, body)
    invalidateCache(CACHE_KEY)
    await fetchGoals(true)
    return data
  }, [fetchGoals])

  const deleteGoal = useCallback(async (id) => {
    await goalsAPI.remove(id)
    invalidateCache(CACHE_KEY)
    await fetchGoals(true)
  }, [fetchGoals])

  return { goals, loading, fetchGoals, createGoal, updateGoal, deleteGoal }
}
