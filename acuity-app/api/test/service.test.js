import { describe, it, expect } from 'vitest'
import { conformance } from './conformance.js'
import { createMemoryRepo } from '../src/repo/memory.js'
import { createPostgresRepo, createSqlServerRepo } from '../src/repo/sql.js'
import { postgresSchema, sqlServerBatches } from '../src/config.js'
import { principalConfig, principalFrom, rolesForSignIn, DEFAULT_ROLE_MAP, ROLE_ORDER } from '../src/core/principal.js'
import { allowed } from '../src/core/rules.js'
import * as clientRoles from '../../src/lib/roles.js'
import * as clientCal from '../../src/lib/calibration.js'
import * as serverCal from '../src/core/acuicalc.js'

conformance('the in-memory store', async () => createMemoryRepo())

// Real databases, when a test database is supplied (see api/README.md).
const PG = process.env.ACUITAS_TEST_PG
const MSSQL = process.env.ACUITAS_TEST_MSSQL
if (PG) conformance('PostgreSQL', () => createPostgresRepo({ connectionString: PG, autoSchema: true, schemaSql: postgresSchema() }))
if (MSSQL) conformance('SQL Server', () => createSqlServerRepo({ connectionString: MSSQL, autoSchema: true, schemaBatches: sqlServerBatches() }))

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64')

describe('who is calling', () => {
  it('reads the Static Web Apps principal and maps roles', () => {
    const cfg = principalConfig({ ACUITAS_AUTH: 'swa' })
    const p = principalFrom({ 'x-ms-client-principal': b64({ userDetails: 'rn@example.org', userRoles: ['anonymous', 'authenticated', 'acuitas-charge'] }) }, cfg)
    expect(p).toMatchObject({ name: 'rn@example.org', role: 'charge' })
    expect(principalFrom({}, cfg)).toBe(null)
    expect(principalFrom({ 'x-ms-client-principal': 'not-base64-json' }, cfg)).toBe(null)
    // Signed in but no Acuitas role: viewer, never more.
    expect(principalFrom({ 'x-ms-client-principal': b64({ userDetails: 'x@example.org', userRoles: ['authenticated'] }) }, cfg).role).toBe('viewer')
  })

  it('turns Entra ID group claims into Acuitas roles at sign-in', () => {
    const map = { 'b1c2-group-id': 'supervisor', 'a9f0-group-id': 'admin' }
    expect(rolesForSignIn({ claims: [{ typ: 'groups', val: 'b1c2-group-id' }] }, map)).toEqual({ roles: ['acuitas-supervisor'] })
    expect(rolesForSignIn({ claims: [{ typ: 'groups', val: 'b1c2-group-id' }, { typ: 'groups', val: 'a9f0-group-id' }] }, map)).toEqual({ roles: ['acuitas-admin'] })
    expect(rolesForSignIn({ claims: [{ typ: 'name', val: 'a9f0-group-id' }] }, map)).toEqual({ roles: ['acuitas-viewer'] })
    // ...and the API honors those roles even with an organization map configured.
    const cfg = principalConfig({ ACUITAS_AUTH: 'swa', ACUITAS_ROLE_MAP: JSON.stringify(map) })
    expect(principalFrom({ 'x-ms-client-principal': b64({ userDetails: 's@example.org', userRoles: ['acuitas-supervisor'] }) }, cfg).role).toBe('supervisor')
  })

  it('trusts proxy headers only with the shared secret, when one is set', () => {
    const cfg = principalConfig({ ACUITAS_AUTH: 'proxy', ACUITAS_PROXY_SECRET: 's3cret', ACUITAS_ROLE_MAP: '{"BH-Charge":"charge"}' })
    const h = { 'x-forwarded-email': 'rn@example.org', 'x-forwarded-groups': 'Staff,BH-Charge' }
    expect(principalFrom(h, cfg)).toBe(null)
    expect(principalFrom({ ...h, 'x-acuitas-proxy-secret': 's3cret' }, cfg)).toMatchObject({ name: 'rn@example.org', role: 'charge' })
  })

  it('refuses the development sign-in in production', () => {
    expect(() => principalConfig({ ACUITAS_AUTH: 'dev', NODE_ENV: 'production' })).toThrow(/refused/)
    expect(() => principalConfig({ ACUITAS_AUTH: 'none' })).toThrow(/Unknown/)
  })

  it('maps roles exactly as the browser does', () => {
    expect(ROLE_ORDER).toEqual(clientRoles.ROLE_ORDER)
    expect(DEFAULT_ROLE_MAP).toEqual(clientRoles.DEFAULT_ROLE_MAP)
  })

  it('gives the calibration to administrators only, matching the app\'s permission', () => {
    for (const role of ROLE_ORDER) {
      expect(allowed(role, 'update', 'appConfig', 'acuiCalibration')).toBe(clientRoles.can(role, 'calibrate'))
    }
  })
})

describe('server and app agree on the AcuiCalc™ rules', () => {
  it('uses the same shipped points, limit, zone sets and minimum reason length', () => {
    expect(serverCal.SHIPPED_POINTS).toEqual(clientCal.SHIPPED_POINTS)
    expect(serverCal.WEIGHT_LIMIT_PCT).toBe(clientCal.WEIGHT_LIMIT_PCT)
    expect(serverCal.MIN_REASON_LENGTH).toBe(clientCal.MIN_REASON_LENGTH)
    expect(serverCal.ZONE_SET_IDS).toEqual([...clientCal.ZONE_SET_IDS])
  })

  it('accepts every version the app itself produces', () => {
    let state = clientCal.calibrationState(null)
    const meta = { actor: 'admin@example.org', role: 'admin', reason: 'Agreed at the staffing committee', reviewers: ['Charge RN'], at: 1 }
    const r1 = clientCal.proposeCalibration(state, { points: { ...clientCal.SHIPPED_POINTS, obs_1to1: 6.25 } }, meta)
    state = r1.state
    const r2 = clientCal.resetCalibration(state, meta)
    expect(serverCal.versionProblems(state.versions[0])).toEqual([])
    expect(serverCal.appendedVersionProblem(state.versions.slice(0, 1), r1.version, { name: 'admin@example.org' })).toBe(null)
    expect(serverCal.appendedVersionProblem(state.versions, r2.version, { name: 'admin@example.org' })).toBe(null)
  })
})
