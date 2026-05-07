// Cache em memória com TTL — persiste entre navegações, zera ao fechar o app
const _store = new Map()

export function getCache(key) {
  const entry = _store.get(key)
  if (!entry) return null
  if (Date.now() > entry.expires) { _store.delete(key); return null }
  return entry.data
}

export function setCache(key, data, ttlMs = 60_000) {
  _store.set(key, { data, expires: Date.now() + ttlMs })
}

export function invalidateCache(...keys) {
  keys.forEach(k => _store.delete(k))
}
