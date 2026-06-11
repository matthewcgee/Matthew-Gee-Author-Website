export const KEYS = {
  locations: 'bhai:locations',
  entries: 'bhai:entries',
  deployments: 'bhai:deployments',
  thresholds: 'bhai:thresholds',
  seed: 'bhai:seeded:v2',
}

export function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (raw != null) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return fallback
}

export function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (e) {
    console.error('storage', e)
    return false
  }
}

export const uid = () =>
  Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4)

export const today = () => new Date().toISOString().slice(0, 10)
