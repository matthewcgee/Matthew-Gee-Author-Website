// Acuitas™ data service — request handling.
//
// One small HTTP API in front of the organization's database. It stores each
// record as JSON in a single table keyed by (collection, id), exactly the
// shape the app has always used, and enforces the access rules on every call.
//
//   GET    /api/health                       liveness (no identity needed)
//   GET    /api/me                           the caller as the service sees them
//   GET    /api/changes?since=N              which collections changed after N
//   GET    /api/data/{collection}            every record the caller may read
//   GET    /api/data/{collection}/{id}       one record
//   PUT    /api/data/{collection}/{id}       create or replace ({ data, merge })
//   PATCH  /api/data/{collection}/{id}       update fields ({ set, increment })
//   DELETE /api/data/{collection}/{id}       remove
//   POST   /api/data/{collection}/_replace   replace the whole collection ({ items })
//   POST   /api/GetRoles                     Static Web Apps rolesSource hook

import { allowed, contentRule, isKnownCollection } from './rules.js'
import { principalFrom, rolesForSignIn } from './principal.js'

const ID_RE = /^[A-Za-z0-9_\-:.]{1,128}$/
export const MAX_BODY_BYTES = 5 * 1024 * 1024

const json = (status, body, extra = {}) => ({ status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra }, body: JSON.stringify(body) })
const fail = (status, message, extra = {}) => json(status, { error: message, ...extra })

class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra }
}

const GENESIS = '0'.repeat(64)
const AUDIT_HEAD = ['_audit', 'head']

// The latest audit entry: { seq, hash }. Kept as its own record so every
// append can lock it; built from the log itself the first time.
async function auditHead(tx) {
  const head = await tx.get(...AUDIT_HEAD, { lock: true })
  if (head) return head
  const all = await tx.list('auditLog')
  let top = null
  for (const { data } of all) {
    if (!top || data.seq > top.seq || (data.seq === top.seq && ((data.at || 0) > (top.at || 0) || ((data.at || 0) === (top.at || 0) && String(data.id) > String(top.id))))) top = data
  }
  return top ? { seq: top.seq, hash: top.hash } : { seq: 0, hash: GENESIS }
}

function isPlainObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v)
}

// JSON round-trip: drops undefined and functions, the same way the app cleans
// records before writing them.
function cleanData(v) {
  return JSON.parse(JSON.stringify(v ?? null))
}

export function createService({ repo, auth, log = console }) {
  const ensure = (principal, op, collection, id) => {
    if (!allowed(principal.role, op, collection, id)) {
      throw new HttpError(403, `Your role (${principal.role}) may not ${op} ${collection}${id ? `/${id}` : ''}.`)
    }
  }

  const checkContent = (principal, collection, id, before, after) => {
    const reason = contentRule({ principal, collection, id, before, after })
    if (reason) throw new HttpError(403, reason)
  }

  async function put(principal, collection, id, body) {
    if (!isPlainObject(body) || !isPlainObject(body.data)) throw new HttpError(400, 'Send { "data": { ... } }.')
    return repo.tx(async (tx) => {
      const before = await tx.get(collection, id, { lock: true })
      ensure(principal, before ? 'update' : 'create', collection, id)
      const after = cleanData(body.merge && before ? { ...before, ...body.data } : body.data)
      checkContent(principal, collection, id, before, after)
      if (collection === 'auditLog') {
        // One strict sequence: each entry must extend the latest one. A writer
        // that raced another gets the latest entry back and tries again.
        const head = await auditHead(tx)
        if (after.seq !== head.seq + 1 || after.prevHash !== head.hash) {
          throw new HttpError(409, 'The audit log has a newer entry; extend the latest one.', { head })
        }
        await tx.put(...AUDIT_HEAD, { seq: after.seq, hash: after.hash }, principal.name)
      }
      await tx.put(collection, id, after, principal.name)
      return after
    })
  }

  async function patch(principal, collection, id, body) {
    if (!isPlainObject(body)) throw new HttpError(400, 'Send { "set": { ... }, "increment": { ... } }.')
    const set = body.set ?? {}
    const inc = body.increment ?? {}
    if (!isPlainObject(set) || !isPlainObject(inc)) throw new HttpError(400, '"set" and "increment" must be objects.')
    for (const [k, v] of Object.entries(inc)) {
      if (typeof v !== 'number' || !Number.isFinite(v)) throw new HttpError(400, `increment.${k} must be a number.`)
    }
    return repo.tx(async (tx) => {
      const before = await tx.get(collection, id, { lock: true })
      if (!before) throw new HttpError(404, `${collection}/${id} does not exist.`)
      ensure(principal, 'update', collection, id)
      const after = cleanData({ ...before, ...set })
      for (const [k, v] of Object.entries(inc)) after[k] = (Number(before[k]) || 0) + v
      checkContent(principal, collection, id, before, after)
      await tx.put(collection, id, after, principal.name)
      return after
    })
  }

  async function remove(principal, collection, id) {
    return repo.tx(async (tx) => {
      const before = await tx.get(collection, id, { lock: true })
      ensure(principal, 'delete', collection, id)
      if (before) await tx.del(collection, id)
      return { deleted: !!before }
    })
  }

  async function replace(principal, collection, body) {
    const items = body?.items
    if (!Array.isArray(items)) throw new HttpError(400, 'Send { "items": [ { "id": ..., "data": { ... } } ] }.')
    for (const it of items) {
      if (!isPlainObject(it) || !ID_RE.test(String(it.id)) || !isPlainObject(it.data)) throw new HttpError(400, 'Each item needs an id and a data object.')
    }
    ensure(principal, 'delete', collection)
    ensure(principal, 'create', collection)
    ensure(principal, 'update', collection)
    return repo.tx(async (tx) => {
      const existing = await tx.list(collection)
      for (const r of existing) {
        checkContent(principal, collection, r.id, r.data, null)
        await tx.del(collection, r.id)
      }
      for (const it of items) {
        const after = cleanData(it.data)
        checkContent(principal, collection, it.id, null, after)
        await tx.put(collection, it.id, after, principal.name)
      }
      return { count: items.length }
    })
  }

  async function route(req) {
    const url = new URL(req.url, 'http://acuitas.local')
    const parts = url.pathname.replace(/^\/+|\/+$/g, '').split('/').map(decodeURIComponent)
    if (parts[0] === 'api') parts.shift()
    const method = req.method.toUpperCase()

    if (parts[0] === 'health' && method === 'GET') {
      await repo.ping()
      return json(200, { ok: true })
    }
    if (parts[0] === 'GetRoles' && method === 'POST') {
      // Called by Static Web Apps itself during sign-in, before a principal exists.
      return json(200, rolesForSignIn(req.body, auth.roleMap))
    }

    const principal = principalFrom(req.headers, auth)
    if (!principal) return fail(401, 'Sign in through your organization\'s single sign-on to use Acuitas.')

    if (parts[0] === 'me' && method === 'GET') return json(200, { name: principal.name, role: principal.role, source: principal.source })

    if (parts[0] === 'changes' && method === 'GET') {
      const since = Number(url.searchParams.get('since') || 0)
      const r = await repo.changes(Number.isFinite(since) ? since : 0)
      return json(200, { seq: r.seq, changed: r.changed.filter((c) => allowed(principal.role, 'read', c) || c === 'appConfig') })
    }

    if (parts[0] !== 'data') return fail(404, 'Not found.')
    const [, collection, id, extra] = parts
    if (!collection || !isKnownCollection(collection)) return fail(404, `Unknown collection "${collection || ''}".`)
    if (extra !== undefined) return fail(404, 'Not found.')

    if (!id) {
      if (method !== 'GET') return fail(405, 'Method not allowed.')
      if (collection !== 'appConfig') ensure(principal, 'read', collection)
      const r = await repo.list(collection)
      const items = collection === 'appConfig' ? r.items.filter((it) => allowed(principal.role, 'read', 'appConfig', it.id)) : r.items
      return json(200, { items, seq: r.seq })
    }

    if (id === '_replace') {
      if (method !== 'POST') return fail(405, 'Method not allowed.')
      return json(200, await replace(principal, collection, req.body))
    }
    if (!ID_RE.test(id)) return fail(400, 'Record ids may use letters, digits and _ - : . (up to 128 characters).')

    switch (method) {
      case 'GET': {
        ensure(principal, 'read', collection, id)
        const data = await repo.get(collection, id)
        return data ? json(200, { id, data }) : fail(404, `${collection}/${id} does not exist.`)
      }
      case 'PUT': return json(200, { id, data: await put(principal, collection, id, req.body) })
      case 'PATCH': return json(200, { id, data: await patch(principal, collection, id, req.body) })
      case 'DELETE': return json(200, await remove(principal, collection, id))
      default: return fail(405, 'Method not allowed.')
    }
  }

  /** req: { method, url, headers, body (parsed JSON or undefined) } → { status, headers, body } */
  return async function handle(req) {
    try {
      return await route(req)
    } catch (e) {
      if (e instanceof HttpError) return fail(e.status, e.message, e.extra)
      log.error('acuitas data service error', e)
      return fail(500, 'The data service could not complete that request.')
    }
  }
}
