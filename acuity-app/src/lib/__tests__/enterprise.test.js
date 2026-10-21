import { describe, it, expect, beforeEach } from 'vitest'
import {
  ROLES, ROLE_ORDER, can, canSeeTab, permissionsFor, identityFromPrincipal, parseRoleMap, DEFAULT_ROLE_MAP,
} from '../roles.js'
import { canonical, sha256Hex, makeAuditEntry, verifyAuditChain, GENESIS, actionLabel } from '../audit.js'
import { parseFhirCensus, planCensusApply, exampleFhirBundle } from '../fhir.js'
import { collectionApi, setAuditSink, __resetStores } from '../store.js'

describe('roles and permissions', () => {
  it('gives admins everything and viewers read-only access', () => {
    expect(can('admin', 'settings')).toBe(true)
    expect(can('admin', 'audit-view')).toBe(true)
    expect(can('viewer', 'view')).toBe(true)
    expect(can('viewer', 'enter-shift')).toBe(false)
    expect(canSeeTab('viewer', 'settings')).toBe(false)
  })

  it('separates clinical, operational and analytic duties', () => {
    expect(can('screener', 'op-screen')).toBe(true)
    expect(can('screener', 'deploy')).toBe(false)
    expect(can('charge', 'safety-log')).toBe(true)
    expect(can('charge', 'op-screen')).toBe(false)
    expect(can('analyst', 'cost-edit')).toBe(true)
    expect(can('analyst', 'enter-shift')).toBe(false)
    expect(canSeeTab('screener', 'levelofcare')).toBe(true)
    expect(canSeeTab('charge', 'outcomes')).toBe(false)
  })

  it('treats an unknown role as a viewer', () => {
    expect([...permissionsFor('mystery')]).toEqual(['view'])
    expect(ROLE_ORDER.every((r) => ROLES[r])).toBe(true)
  })
})

describe('identity from a sign-in gateway', () => {
  it('reads Azure Static Web Apps /.auth/me and picks the most capable mapped role', () => {
    const id = identityFromPrincipal({ clientPrincipal: { userDetails: 'nurse@example.org', userRoles: ['anonymous', 'authenticated', 'acuitas-charge', 'acuitas-supervisor'] } })
    expect(id).toMatchObject({ name: 'nurse@example.org', role: 'supervisor', source: 'gateway' })
  })

  it('reads a generic userinfo document with groups', () => {
    const id = identityFromPrincipal({ email: 'a@x.org', groups: ['acuitas-screener'] })
    expect(id.role).toBe('screener')
  })

  it('never grants more than viewer to a signed-in user with no mapped role', () => {
    expect(identityFromPrincipal({ clientPrincipal: { userDetails: 'x', userRoles: ['authenticated'] } }).role).toBe('viewer')
  })

  it('returns null when nobody is signed in', () => {
    expect(identityFromPrincipal({ clientPrincipal: null })).toBeNull()
    expect(identityFromPrincipal(null)).toBeNull()
  })

  it('accepts an organization role map and ignores invalid targets', () => {
    const m = parseRoleMap('{"BH-Leads":"supervisor","Bad":"superuser"}')
    expect(m).toEqual({ 'BH-Leads': 'supervisor' })
    expect(identityFromPrincipal({ email: 'l@x.org', roles: ['BH-Leads'] }, m).role).toBe('supervisor')
    expect(parseRoleMap('not json')).toBe(DEFAULT_ROLE_MAP)
  })
})

describe('hash-chained audit log', () => {
  it('serializes objects canonically so key order cannot change a hash', () => {
    expect(canonical({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe(canonical({ a: [2, { c: 4, d: 3 }], b: 1 }))
  })

  it('hashes with SHA-256', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  async function chain(n) {
    const out = []
    let prev = null
    for (let i = 0; i < n; i++) {
      prev = await makeAuditEntry(prev, { actor: 'A', role: 'admin', action: 'entry.add', target: `e${i}`, at: 1000 + i })
      out.push(prev)
    }
    return out
  }

  it('links each entry to the one before it and verifies clean', async () => {
    const c = await chain(5)
    expect(c[0].prevHash).toBe(GENESIS)
    expect(c[1].prevHash).toBe(c[0].hash)
    expect(c[4].seq).toBe(5)
    expect(await verifyAuditChain(c)).toMatchObject({ ok: true, checked: 5 })
  })

  it('detects an edited entry', async () => {
    const c = await chain(5)
    c[2] = { ...c[2], target: 'forged' }
    expect(await verifyAuditChain(c)).toMatchObject({ ok: false, brokenAt: 3, reason: 'tampered' })
  })

  it('detects a deleted entry', async () => {
    const c = await chain(5)
    c.splice(2, 1)
    expect(await verifyAuditChain(c)).toMatchObject({ ok: false, brokenAt: 4, reason: 'broken' })
  })

  it('reports concurrent writers as a fork, not tampering', async () => {
    const c = await chain(3)
    const twin = await makeAuditEntry(c[1], { actor: 'B', role: 'charge', action: 'deployment.add', at: 5000 })
    const r = await verifyAuditChain([...c, twin])
    expect(r.forks).toBe(1)
    expect(r.reason).not.toBe('tampered')
  })

  it('labels actions in plain words', () => {
    expect(actionLabel('entry.add')).toBe('Logged a shift entry')
    expect(actionLabel('opPatients.remove')).toBe('Removed op patients')
  })
})

describe('FHIR census import', () => {
  const locations = [
    { id: 'u1', name: '1 South A', type: 'inpatient' },
    { id: 'u2', name: '2 North', type: 'inpatient' },
    { id: 'ed', name: 'Emergency Department', type: 'ed' },
  ]

  it('counts in-progress inpatient encounters per location and matches units by name', () => {
    const r = parseFhirCensus(exampleFhirBundle(locations), { locations })
    expect(r.ok).toBe(true)
    expect(r.matched).toHaveLength(2)
    expect(r.matched.find((x) => x.locId === 'u1').census).toBe(8)
    expect(r.skipped).toBe(1) // the finished encounter
  })

  it('prefers an explicit location mapping, and lists what it could not match', () => {
    const bundle = {
      resourceType: 'Bundle',
      entry: [
        { resource: { resourceType: 'Location', id: 'L9', name: 'BH West Wing' } },
        { resource: { resourceType: 'Location', id: 'L7', name: 'Somewhere else' } },
        { resource: { resourceType: 'Encounter', status: 'in-progress', class: { code: 'IMP' }, location: [{ location: { reference: 'Location/L9' } }] } },
        { resource: { resourceType: 'Encounter', status: 'in-progress', class: { code: 'IMP' }, location: [{ location: { reference: 'Location/L7' } }] } },
        { resource: { resourceType: 'Encounter', status: 'in-progress', class: { code: 'AMB' }, location: [{ location: { reference: 'Location/L9' } }] } },
      ],
    }
    const r = parseFhirCensus(bundle, { locations, mapping: { L9: 'u2' } })
    expect(r.matched).toHaveLength(1)
    expect(r.matched[0]).toMatchObject({ locId: 'u2', census: 1, matchedBy: 'mapping' })
    expect(r.unmatched.map((x) => x.name)).toEqual(['Somewhere else'])
    expect(r.skipped).toBe(1) // ambulatory
  })

  it('rejects anything that is not a Bundle with a clear reason', () => {
    expect(parseFhirCensus({ resourceType: 'Patient' }).ok).toBe(false)
  })

  it('updates entries already logged for the shift and pre-fills the rest', () => {
    const parsed = { matched: [{ locId: 'u1', census: 14 }, { locId: 'u2', census: 9 }] }
    const entries = [{ id: 'x', locId: 'u1', date: '2026-03-01', shift: 'AM', census: 12, createdAt: 1 }]
    const plan = planCensusApply(parsed, entries, { date: '2026-03-01', shift: 'AM' })
    expect(plan.updates).toEqual([{ entryId: 'x', locId: 'u1', census: 14, previous: 12 }])
    expect(plan.prefills.u2.census).toBe(9)
  })
})

describe('synced store (local mode)', () => {
  beforeEach(() => __resetStores())

  it('applies changes, persists them, and hands each one to the audit sink', () => {
    const logged = []
    setAuditSink((action, target) => logged.push([action, target]))
    const store = { value: [], listeners: new Set(), set(v) { this.value = v } }
    const api = collectionApi('safetyEvents', 'bhai:test', store)
    api.add({ id: 'a', type: 'restraint' })
    api.upsert({ id: 'a', type: 'seclusion' })
    api.add({ id: 'b', type: 'restraint' })
    api.remove('b')
    expect(store.value).toEqual([{ id: 'a', type: 'seclusion' }])
    expect(logged.map((l) => l[0])).toEqual(['safetyEvents.add', 'safetyEvents.update', 'safetyEvents.add', 'safetyEvents.remove'])
  })

  it('keeps free text out of the audit trail', () => {
    const details = []
    setAuditSink((action, target, detail) => details.push(detail))
    const store = { value: [], listeners: new Set(), set(v) { this.value = v } }
    collectionApi('x', 'bhai:test2', store).add({ id: 'a', notes: 'free text that must not be logged', type: 'restraint' })
    expect(details[0]).toEqual({ id: 'a', type: 'restraint' })
  })
})
