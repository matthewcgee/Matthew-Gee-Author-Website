import { describe, it, expect, afterEach } from 'vitest'
import { createApiBackend } from '../backend/apiBackend.js'
import { increment } from '../backend/index.js'
import { createService } from '../../../api/src/core/service.js'
import { createMemoryRepo } from '../../../api/src/repo/memory.js'
import { principalConfig } from '../../../api/src/core/principal.js'

// The browser backend wired straight to the real data service (in-memory
// store), so both halves are tested together without a network.
function setup() {
  const repo = createMemoryRepo()
  const handle = createService({ repo, auth: principalConfig({ ACUITAS_AUTH: 'dev' }), log: { error() {} } })
  const clients = []
  const client = (name, role, opts = {}) => {
    const fetchImpl = async (url, init) => {
      const res = await handle({
        method: init.method,
        url,
        headers: { 'x-acuitas-dev-user': name, 'x-acuitas-dev-role': role },
        body: init.body ? JSON.parse(init.body) : undefined,
      })
      return { ok: res.status < 400, status: res.status, text: async () => res.body }
    }
    const b = createApiBackend({ fetchImpl, base: '/api', pollMs: 20, isHidden: () => false, ...opts })
    clients.push(b)
    return b
  }
  return { client, stopAll: () => clients.forEach((c) => c.stop()) }
}

const until = async (check, ms = 2000) => {
  const start = Date.now()
  for (;;) {
    const v = check()
    if (v) return v
    if (Date.now() - start > ms) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 10))
  }
}

let env
afterEach(() => env?.stopAll())

describe('data service backend in the browser', () => {
  it('shows one nurse\'s entry on another nurse\'s screen', async () => {
    env = setup()
    const a = env.client('rn.a@example.org', 'charge')
    const b = env.client('rn.b@example.org', 'charge')
    let seen = []
    b.watchCollection('entries', (items) => { seen = items })
    await a.setRecord('entries', 'e1', { id: 'e1', points: 12, staff: 6 })
    await until(() => seen.length === 1)
    expect(seen[0]).toEqual({ id: 'e1', data: { id: 'e1', points: 12, staff: 6 } })
  })

  it('adds AcuiCalc™ points atomically from several screens', async () => {
    env = setup()
    const a = env.client('a@example.org', 'charge')
    const b = env.client('b@example.org', 'charge')
    await a.setRecord('entries', 'ed1', { id: 'ed1', points: 0 })
    await Promise.all([
      ...Array.from({ length: 5 }, () => a.updateRecord('entries', 'ed1', { points: increment(3) })),
      ...Array.from({ length: 5 }, () => b.updateRecord('entries', 'ed1', { points: increment(4) })),
    ])
    const [rec] = await a.listRecords('entries')
    expect(rec.data.points).toBe(35)
  })

  it('watches a single settings record and merges partial saves', async () => {
    env = setup()
    const admin = env.client('admin@example.org', 'admin')
    let state = 'unset'
    admin.watchDoc('appState', 'main', (d) => { state = d })
    await until(() => state === null)
    await admin.setRecord('appState', 'main', { locations: [{ id: 'u1' }], thresholds: { a: 1 } })
    await admin.setRecord('appState', 'main', { locations: [{ id: 'u2' }] }, { merge: true })
    await until(() => state && state.locations[0].id === 'u2')
    expect(state.thresholds).toEqual({ a: 1 })
  })

  it('reports a refused write to the caller and keeps working', async () => {
    env = setup()
    const viewer = env.client('v@example.org', 'viewer')
    await expect(viewer.setRecord('entries', 'x', { id: 'x' })).rejects.toMatchObject({ status: 403 })
    let errors = 0
    viewer.watchCollection('planLog', () => {}, () => { errors++ })
    await until(() => errors === 1)
    // A collection the role may not read is not asked for again.
    await new Promise((r) => setTimeout(r, 120))
    expect(errors).toBe(1)
  })

  it('replaces and deletes', async () => {
    env = setup()
    const admin = env.client('admin@example.org', 'admin')
    await admin.replaceCollection('safetyEvents', [{ id: 's1', data: { id: 's1' } }, { id: 's2', data: { id: 's2' } }])
    expect((await admin.listRecords('safetyEvents')).map((r) => r.id)).toEqual(['s1', 's2'])
    await admin.deleteRecord('safetyEvents', 's1')
    expect((await admin.listRecords('safetyEvents')).map((r) => r.id)).toEqual(['s2'])
  })
})
