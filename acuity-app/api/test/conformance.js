// One behavior suite, run against every store: in-memory always, and the real
// PostgreSQL and SQL Server stores when a test database is configured.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createService } from '../src/core/service.js'
import { principalConfig } from '../src/core/principal.js'

const ROLES = ['admin', 'supervisor', 'charge', 'screener', 'analyst', 'viewer']

export function conformance(label, makeRepo) {
  describe(`data service on ${label}`, () => {
    let repo
    let handle

    beforeAll(async () => {
      repo = await makeRepo()
      handle = createService({ repo, auth: principalConfig({ ACUITAS_AUTH: 'dev' }), log: { error() {} } })
    })
    afterAll(async () => { await repo?.close?.() })

    const as = (role, name = `${role}@example.org`) => async (method, url, body) => {
      const res = await handle({ method, url, headers: { 'x-acuitas-dev-user': name, 'x-acuitas-dev-role': role }, body })
      return { status: res.status, body: res.body ? JSON.parse(res.body) : null }
    }
    const admin = as('admin')
    const charge = as('charge')
    const viewer = as('viewer')
    const uniq = (p) => `${p}_${Math.random().toString(36).slice(2, 10)}`

    it('refuses callers with no verified identity', async () => {
      const r = await handle({ method: 'GET', url: '/api/data/entries', headers: {} })
      expect(r.status).toBe(401)
    })

    it('reports health and the caller', async () => {
      expect((await handle({ method: 'GET', url: '/api/health', headers: {} })).status).toBe(200)
      const me = await charge('GET', '/api/me')
      expect(me.body).toEqual({ name: 'charge@example.org', role: 'charge', source: 'dev' })
    })

    it('creates, reads, merges, updates and deletes a record', async () => {
      const id = uniq('e')
      expect((await charge('PUT', `/api/data/entries/${id}`, { data: { id, points: 10, staff: 5, notes: 'x' } })).status).toBe(200)
      expect((await viewer('GET', `/api/data/entries/${id}`)).body.data).toEqual({ id, points: 10, staff: 5, notes: 'x' })
      await charge('PUT', `/api/data/entries/${id}`, { data: { staff: 6 }, merge: true })
      expect((await viewer('GET', `/api/data/entries/${id}`)).body.data).toEqual({ id, points: 10, staff: 6, notes: 'x' })
      await charge('PATCH', `/api/data/entries/${id}`, { set: { census: 12 }, increment: { points: 3 } })
      expect((await viewer('GET', `/api/data/entries/${id}`)).body.data).toMatchObject({ points: 13, census: 12 })
      // Charge nurses log entries but cannot delete them.
      expect((await charge('DELETE', `/api/data/entries/${id}`)).status).toBe(403)
      expect((await as('supervisor')('DELETE', `/api/data/entries/${id}`)).body).toEqual({ deleted: true })
      expect((await viewer('GET', `/api/data/entries/${id}`)).status).toBe(404)
    })

    it('keeps concurrent AcuiCalc pushes from overwriting each other', async () => {
      const id = uniq('ed')
      await charge('PUT', `/api/data/entries/${id}`, { data: { id, points: 0 } })
      await Promise.all(Array.from({ length: 20 }, () => charge('PATCH', `/api/data/entries/${id}`, { increment: { points: 2 } })))
      expect((await viewer('GET', `/api/data/entries/${id}`)).body.data.points).toBe(40)
    })

    it('enforces read permissions per collection', async () => {
      expect((await viewer('GET', '/api/data/entries')).status).toBe(200)
      expect((await charge('GET', '/api/data/planLog')).status).toBe(403)
      expect((await viewer('GET', '/api/data/opPatients')).status).toBe(403)
      expect((await as('screener')('GET', '/api/data/opPatients')).status).toBe(200)
      expect((await as('supervisor')('GET', '/api/data/opAssessments')).status).toBe(403)
      expect((await charge('GET', '/api/data/auditLog')).status).toBe(403)
      expect((await as('analyst')('GET', '/api/data/auditLog')).status).toBe(200)
    })

    it('enforces write permissions per role', async () => {
      expect((await viewer('PUT', `/api/data/entries/${uniq('e')}`, { data: { points: 1 } })).status).toBe(403)
      expect((await charge('PUT', '/api/data/appState/main', { data: { locations: [] } })).status).toBe(403)
      expect((await as('analyst')('PUT', '/api/data/appConfig/costRates', { data: { value: { red: 1 } } })).status).toBe(200)
      expect((await as('analyst')('PUT', '/api/data/appConfig/opPrograms', { data: { value: [] } })).status).toBe(403)
      expect((await as('supervisor')('PUT', '/api/data/appConfig/censusPrefill', { data: { value: {} } })).status).toBe(200)
      expect((await charge('PUT', '/api/data/locationCaps/u1', { data: { censusCap: 18 } })).status).toBe(200)
    })

    // Append an audit entry the way the app does: extend the latest entry,
    // and if someone else got there first, take the head the service returns
    // and try again.
    async function appendAudit(who, fields) {
      let head = null
      for (let attempt = 0; attempt < 20; attempt++) {
        const seq = head ? head.seq + 1 : 1
        const prevHash = head ? head.hash : '0'.repeat(64)
        const hash = `h_${Math.random().toString(36).slice(2)}`
        const id = `${String(seq).padStart(7, '0')}_${hash.slice(2, 12)}`
        const r = await who('PUT', `/api/data/auditLog/${id}`, { data: { id, seq, prevHash, hash, ...fields } })
        if (r.status !== 409) return { ...r, id, seq, prevHash, hash }
        head = r.body.head
      }
      throw new Error('audit append never settled')
    }

    it('keeps the audit log append-only and attributed to the caller', async () => {
      const ok = await appendAudit(charge, { actor: 'charge@example.org', role: 'charge', action: 'entry.add' })
      expect(ok.status).toBe(200)
      const { id } = ok
      const entry = (await as('analyst')('GET', '/api/data/auditLog')).body.items.find((x) => x.id === id).data
      // Same id again is an edit: refused, even for an administrator.
      expect((await charge('PUT', `/api/data/auditLog/${id}`, { data: { ...entry, action: 'x' } })).status).toBe(403)
      expect((await admin('PATCH', `/api/data/auditLog/${id}`, { set: { action: 'x' } })).status).toBe(403)
      expect((await admin('DELETE', `/api/data/auditLog/${id}`)).status).toBe(403)
      expect((await admin('POST', '/api/data/auditLog/_replace', { items: [] })).status).toBe(403)
      // Someone else's name, or a role the caller does not hold, is refused.
      expect((await appendAudit(charge, { actor: 'admin@example.org', role: 'charge', action: 'x' })).status).toBe(403)
      expect((await appendAudit(charge, { actor: 'charge@example.org', role: 'admin', action: 'x' })).status).toBe(403)
    })

    it('keeps the audit log one strict sequence when people write at once', async () => {
      // A writer that has not seen the latest entry is told where the head is.
      const stale = await charge('PUT', '/api/data/auditLog/stale_1', { data: { id: 'stale_1', seq: 1, prevHash: '0'.repeat(64), hash: 'x', actor: 'charge@example.org', role: 'charge' } })
      expect(stale.status).toBe(409)
      expect(stale.body.head.seq).toBeGreaterThan(0)
      // Six people append at the same moment; every entry lands, none share a position.
      const people = ['admin', 'supervisor', 'charge', 'screener', 'analyst', 'viewer']
      const results = await Promise.all(people.map((r) => appendAudit(as(r), { actor: `${r}@example.org`, role: r, action: 'identity.signin' })))
      expect(results.every((r) => r.status === 200)).toBe(true)
      const all = (await as('analyst')('GET', '/api/data/auditLog')).body.items.map((x) => x.data)
      const seqs = all.map((e) => e.seq)
      expect(new Set(seqs).size).toBe(seqs.length)
      const byHash = new Map(all.map((e) => [e.hash, e]))
      for (const e of all) if (e.seq > 1) expect(byHash.get(e.prevHash)?.seq).toBe(e.seq - 1)
    })

    it('refuses audit edits and deletes in the store itself, beneath the service', async () => {
      const id = uniq('a')
      await repo.tx((t) => t.put('auditLog', id, { id, actor: 'x' }, 'x'))
      await expect(repo.tx((t) => t.del('auditLog', id))).rejects.toThrow(/append-only/)
      await expect(repo.tx((t) => t.put('auditLog', id, { id, actor: 'edited' }, 'x'))).rejects.toThrow(/append-only/)
      expect(await repo.get('auditLog', id)).toEqual({ id, actor: 'x' })
    })

    it('keeps AcuiCalc™ calibration versions append-only and administrator-only', async () => {
      const v = (n) => ({ version: n, points: { obs_1to1: 5 }, zones: {}, responses: {}, reason: `v${n}` })
      const url = '/api/data/appConfig/acuiCalibration'
      expect((await as('supervisor')('PUT', url, { data: { value: { versions: [v(1), v(2)] } } })).status).toBe(403)
      const existing = (await viewer('GET', url)).body?.data?.value?.versions || []
      const base = existing.length ? existing : [v(1)]
      if (!existing.length) expect((await admin('PUT', url, { data: { value: { versions: base } } })).status).toBe(200)
      const n = base.length
      expect((await admin('PUT', url, { data: { value: { versions: [...base, v(n + 1)] } } })).status).toBe(200)
      const now = [...base, v(n + 1)]
      // Rewriting an earlier version, skipping ahead, or deleting: refused.
      expect((await admin('PUT', url, { data: { value: { versions: [{ ...now[0], reason: 'edited' }, ...now.slice(1), v(n + 2)] } } })).status).toBe(403)
      expect((await admin('PUT', url, { data: { value: { versions: [...now, v(n + 2), v(n + 3)] } } })).status).toBe(403)
      expect((await admin('PUT', url, { data: { value: { versions: now.slice(0, -1) } } })).status).toBe(403)
      expect((await admin('DELETE', url)).status).toBe(403)
      expect((await viewer('GET', url)).body.data.value.versions).toHaveLength(n + 1)
    })

    it('replaces a whole collection in one step', async () => {
      const items = [{ id: 'p1', data: { id: 'p1', n: 1 } }, { id: 'p2', data: { id: 'p2', n: 2 } }]
      expect((await admin('POST', '/api/data/planLog/_replace', { items })).body).toEqual({ count: 2 })
      expect((await admin('GET', '/api/data/planLog')).body.items.map((x) => x.id)).toEqual(['p1', 'p2'])
      expect((await as('supervisor')('POST', '/api/data/planLog/_replace', { items: [] })).status).toBe(403)
      await admin('POST', '/api/data/planLog/_replace', { items: [] })
      expect((await admin('GET', '/api/data/planLog')).body.items).toEqual([])
    })

    it('tells pollers which collections changed', async () => {
      const start = (await viewer('GET', '/api/changes?since=0')).body.seq
      await charge('PUT', `/api/data/deployments/${uniq('d')}`, { data: { hours: 4 } })
      const c = (await viewer('GET', `/api/changes?since=${start}`)).body
      expect(c.changed).toContain('deployments')
      expect(c.changed).not.toContain('entries')
      expect(c.seq).toBeGreaterThan(start)
      expect((await viewer('GET', `/api/changes?since=${c.seq}`)).body.changed).toEqual([])
      // Collections a role cannot read are not even named to it.
      await as('screener')('PUT', `/api/data/opPatients/${uniq('p')}`, { data: { case: 'A' } })
      expect((await viewer('GET', `/api/changes?since=${c.seq}`)).body.changed).not.toContain('opPatients')
    })

    it('rejects unknown collections, bad ids and malformed bodies', async () => {
      expect((await admin('GET', '/api/data/users')).status).toBe(404)
      expect((await admin('PUT', '/api/data/entries/bad id!', { data: {} })).status).toBe(400)
      expect((await admin('PUT', '/api/data/entries/x1', { notData: 1 })).status).toBe(400)
      expect((await admin('PATCH', '/api/data/entries/x1', { increment: { points: 'two' } })).status).toBe(400)
      expect((await admin('PATCH', `/api/data/entries/${uniq('missing')}`, { set: { a: 1 } })).status).toBe(404)
    })

    it('applies every rule to every role', async () => {
      // Expected matrix, transcribed independently from firestore.rules.
      const W = { entries: ['admin', 'supervisor', 'charge'], safetyEvents: ['admin', 'supervisor', 'charge'], opProviders: ['admin'], opOutcomes: ['admin', 'screener'] }
      for (const [col, writers] of Object.entries(W)) {
        for (const role of ROLES) {
          const r = await as(role)('PUT', `/api/data/${col}/${uniq('m')}`, { data: { x: 1 } })
          expect([col, role, r.status]).toEqual([col, role, writers.includes(role) ? 200 : 403])
        }
      }
    })
  })
}
