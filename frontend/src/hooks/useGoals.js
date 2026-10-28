import { useState, useCallback, useRef } from 'react'
import { goalsAPI }              from '../services/api'
import { getCache, setCache, invalidateCache } from '../services/cache'
import { invalidateStories } from '../services/storiesData'

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
 *   error: Error|null,
 *   fetchGoals: (force?: boolean) => Promise<void>,
 *   createGoal: (data: object) => Promise<Goal>,
 *   updateGoal: (id: string, data: object) => Promise<Goal>,
 *   deleteGoal: (id: string) => Promise<void>,
 * }}
 */
export function useGoals() {
  const [goals,   setGoals]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  // Só a PRIMEIRA carga mostra "carregando" no lugar da lista. Recarregar depois de criar/editar/depositar atualiza no
  // lugar: antes a lista inteira sumia por ~2 s a cada depósito (trocada pelo spinner) e voltava com o valor novo.
  const loadedOnce = useRef(false)

  const fetchGoals = useCallback(async (force = false) => {
    if (!force) {
      const cached = getCache(CACHE_KEY)
      if (cached) { setGoals(cached); setLoading(false); return }
    }
    if (!loadedOnce.current) setLoading(true)
    setError(null)
    try {
      const { data } = await goalsAPI.list()
      // Coalescência nula defensiva: garante Array mesmo que backend retorne {} ou null
      const safeGoals = Array.isArray(data) ? data : (data ?? [])
      setCache(CACHE_KEY, safeGoals, CACHE_TTL)
      setGoals(safeGoals)
      loadedOnce.current = true
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  const createGoal = useCallback(async (body) => {
    const { data } = await goalsAPI.create(body)
    invalidateCache(CACHE_KEY)
    invalidateStories() // o story de metas não pode mostrar a lista de antes
    await fetchGoals(true)
    return data
  }, [fetchGoals])

  const updateGoal = useCallback(async (id, body) => {
    const { data } = await goalsAPI.update(id, body)
    invalidateCache(CACHE_KEY)
    invalidateStories()
    await fetchGoals(true)
    return data
  }, [fetchGoals])

  const deleteGoal = useCallback(async (id) => {
    await goalsAPI.remove(id)
    invalidateCache(CACHE_KEY)
    invalidateStories()
    await fetchGoals(true)
  }, [fetchGoals])

  return { goals, loading, error, fetchGoals, createGoal, updateGoal, deleteGoal }
}
