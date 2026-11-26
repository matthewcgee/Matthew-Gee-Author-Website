// Acuitas data service backend (VITE_BACKEND=api).
//
// Talks to the data service in api/ on the same site (/api by default). The
// browser sends no credentials of its own: the organization's sign-in (Azure
// Static Web Apps with Entra ID, or a sign-in proxy) attaches the user's
// session, and the service checks the user's role on every call.
//
// Live updates: the app asks the service every few seconds which collections
// have changed (one small request) and reloads only those. Saving something
// reloads that collection at once, so your own changes appear immediately and
// other people's within a few seconds. A full refresh runs once a minute as a
// safety net.

import { isIncrement } from './index.js'

const env = import.meta.env || {}

export function createApiBackend({
  fetchImpl = (...a) => fetch(...a),
  base = env.VITE_API_BASE || '/api',
  pollMs = Number(env.VITE_API_POLL_MS) || 4000,
  fullRefreshMs = 60000,
  isHidden = () => typeof document !== 'undefined' && document.hidden,
} = {}) {
  const root = String(base).replace(/\/+$/, '')
  const watchers = new Map() // collection -> Set<{ id|null, onData, onError }>
  const cache = new Map() // collection -> { items, json }
  const denied = new Set()
  const inflight = new Map()
  let cursor = null
  let timer = null
  let stopped = false
  let lastFull = Date.now()

  async function call(method, path, body) {
    const res = await fetchImpl(root + path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await res.text()
    let payload = null
    try { payload = text ? JSON.parse(text) : null } catch { payload = null }
    if (!res.ok) {
      const err = new Error(payload?.error || `The data service returned ${res.status}.`)
      err.status = res.status
      err.payload = payload
      throw err
    }
    return payload
  }

  const path = (col, id) => `/data/${encodeURIComponent(col)}${id != null ? `/${encodeURIComponent(id)}` : ''}`

  function deliver(col) {
    const entry = cache.get(col)
    for (const w of watchers.get(col) || []) {
      if (w.id == null) w.onData(entry.items)
      else {
        const hit = entry.items.find((it) => it.id === w.id)
        w.onData(hit ? hit.data : null)
      }
    }
  }

  function refresh(col) {
    if (denied.has(col) || stopped) return Promise.resolve()
    if (inflight.has(col)) return inflight.get(col)
    const p = call('GET', path(col))
      .then((r) => {
        const items = r.items || []
        const json = JSON.stringify(items)
        if (cache.get(col)?.json === json) return
        cache.set(col, { items, json })
        deliver(col)
      })
      .catch((e) => {
        if (e.status === 403) denied.add(col) // this role may not read it; stop asking
        for (const w of watchers.get(col) || []) w.onError(e)
      })
      .finally(() => inflight.delete(col))
    inflight.set(col, p)
    return p
  }

  async function poll() {
    timer = null
    if (stopped) return
    try {
      if (cursor == null) {
        cursor = (await call('GET', '/changes?since=0')).seq
      } else {
        const r = await call('GET', `/changes?since=${cursor}`)
        cursor = r.seq
        const full = Date.now() - lastFull > fullRefreshMs
        if (full) lastFull = Date.now()
        await Promise.all([...watchers.keys()].filter((c) => full || r.changed.includes(c)).map(refresh))
      }
    } catch (e) {
      if (e.status === 401) {
        for (const set of watchers.values()) for (const w of set) w.onError(e)
      }
    }
    schedule()
  }

  function schedule() {
    if (stopped || timer) return
    timer = setTimeout(poll, isHidden() ? pollMs * 4 : pollMs)
  }

  function watch(col, id, onData, onError) {
    if (!watchers.has(col)) watchers.set(col, new Set())
    const w = { id, onData, onError: onError || (() => {}) }
    watchers.get(col).add(w)
    if (cache.has(col)) {
      const items = cache.get(col).items
      if (id == null) onData(items)
      else onData(items.find((it) => it.id === id)?.data ?? null)
    }
    refresh(col)
    if (cursor == null && !timer) poll()
    else schedule()
    return () => {
      const set = watchers.get(col)
      if (set) { set.delete(w); if (!set.size) watchers.delete(col) }
    }
  }

  const after = (col) => (r) => { refresh(col); return r }

  return {
    watchCollection(col, onItems, onError) { return watch(col, null, onItems, onError) },
    watchDoc(col, id, onData, onError) { return watch(col, id, onData, onError) },
    setRecord(col, id, data, { merge = false } = {}) {
      return call('PUT', path(col, id), { data, merge }).then(after(col))
    },
    updateRecord(col, id, patch) {
      const set = {}
      const increment = {}
      for (const [k, v] of Object.entries(patch || {})) {
        if (isIncrement(v)) increment[k] = v.__acuitasIncrement
        else set[k] = v
      }
      return call('PATCH', path(col, id), { set, increment }).then(after(col))
    },
    deleteRecord(col, id) {
      return call('DELETE', path(col, id)).then(after(col))
    },
    async listRecords(col) {
      return (await call('GET', path(col))).items || []
    },
    replaceCollection(col, items) {
      return call('POST', `${path(col)}/_replace`, { items }).then(after(col))
    },
    /** Stop polling (tests, sign-out). */
    stop() {
      stopped = true
      if (timer) clearTimeout(timer)
    },
  }
}
