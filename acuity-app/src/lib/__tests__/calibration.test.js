import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  ADULT_ACUITY_CRITERIA,
  DEFAULT_THRESHOLDS,
  PEDIATRIC_ED_THRESHOLDS,
  computeStage,
  entryStage,
  thresholdsFor,
  zoneSetFor,
} from '../model.js'
import {
  LOCKED_CORE,
  LOCKED_ITEM_IDS,
  SHIPPED_POINTS,
  SHIPPED_RESPONSES,
  SHIPPED_ZONES,
  WEIGHT_LIMIT_PCT,
  activeCalibration,
  calibratedCriteria,
  calibratedThresholds,
  calibrationByVersion,
  calibrationState,
  initialCalibration,
  orgScopedLocation,
  pointLimits,
  proposeCalibration,
  resetCalibration,
  stampEntry,
  validateBands,
  validatePoints,
  validateZones,
  withLegacyStamps,
  zoneBands,
  zoneResponse,
} from '../calibration.js'
import { ROLE_ORDER, can } from '../roles.js'
import { makeAuditEntry, verifyAuditChain, actionLabel } from '../audit.js'
import { audit, setAuditSink } from '../store.js'
import { buildSeries } from '../forecast.js'
import { costSummary } from '../cost.js'
import { scoreFor } from '../../components/AcuityCalculator.jsx'

const ADMIN = { actor: 'Admin One', role: 'admin', reason: 'Night shift nurses rate 1:1 observation as heavier work', reviewers: ['4 West night charge RN', 'ED staff RN'], at: 1_800_000_000_000 }

const fresh = () => calibrationState(null)

function propose(state, draft, meta = ADMIN) {
  return proposeCalibration(state, draft, meta)
}

const IP = { id: 'ip1', name: '4 West', type: 'inpatient', thresholds: null }
const ED = { id: 'ed1', name: 'Main ED', type: 'ed', thresholds: null }
const PEDS = { id: 'ed2', name: 'Peds ED', type: 'ed', zoneSet: 'pedsEd', thresholds: null }

/* ------------------------------------------------- today's scoring unchanged */

describe('shipped calibration reproduces current scoring', () => {
  it('v1 is the shipped defaults when nothing has been changed', () => {
    const v1 = activeCalibration(fresh())
    expect(v1.version).toBe(1)
    expect(v1.kind).toBe('shipped')
    expect(v1.points).toEqual(SHIPPED_POINTS)
    for (const g of ADULT_ACUITY_CRITERIA) for (const i of g.items) expect(v1.points[i.id]).toBe(i.points)
  })

  it('keeps the production zone cutoffs as the shipped defaults', () => {
    expect(SHIPPED_ZONES.inpatient).toEqual({ greenMax: 1.5, yellowMax: 2.5 })
    expect(SHIPPED_ZONES.ed).toEqual({ greenMax: 21, yellowMax: 27 })
    expect(SHIPPED_ZONES.pedsEd).toEqual({ greenMax: PEDIATRIC_ED_THRESHOLDS.greenMax, yellowMax: PEDIATRIC_ED_THRESHOLDS.yellowMax })
  })

  it('gives every AcuiCalc™ selection the same score as before', () => {
    const criteria = calibratedCriteria(activeCalibration(fresh()))
    const ids = LOCKED_ITEM_IDS
    // Every single item, and a few combinations.
    for (let mask = 1; mask < 2 ** 6; mask++) {
      const sel = {}
      ids.forEach((id, i) => { sel[id] = !!(mask & (1 << (i % 6))) && i % 3 !== 2 })
      expect(scoreFor(criteria, sel)).toBe(scoreFor(ADULT_ACUITY_CRITERIA, sel))
    }
  })

  it('stages every value exactly as the previous thresholds did', () => {
    const th = calibratedThresholds(activeCalibration(fresh()))
    for (let v = 0; v <= 4; v += 0.05) {
      expect(computeStage(v, thresholdsFor(IP, th))).toBe(computeStage(v, DEFAULT_THRESHOLDS.inpatient))
    }
    for (let v = 0; v <= 90; v++) {
      expect(computeStage(v, thresholdsFor(ED, th))).toBe(computeStage(v, DEFAULT_THRESHOLDS.ed))
      expect(computeStage(v, thresholdsFor(PEDS, th))).toBe(computeStage(v, PEDIATRIC_ED_THRESHOLDS))
    }
  })

  it('carries forward region thresholds that were already changed before calibration existed', () => {
    const v1 = initialCalibration({ inpatient: { greenMax: 1.4, yellowMax: 2.4 }, ed: { greenMax: 21, yellowMax: 27 } })
    expect(v1.kind).toBe('migrated')
    expect(v1.zones.inpatient).toEqual({ greenMax: 1.4, yellowMax: 2.4 })
    expect(v1.zones.ed).toEqual(SHIPPED_ZONES.ed)
  })
})

/* ------------------------------------------------------- 1. locked core */

describe('1. locked core', () => {
  it('names exactly the four AcuiCalc™ domains', () => {
    expect(LOCKED_CORE.map((g) => g.group)).toEqual([
      'Observation Status',
      'Behavioral Risk (last 24 hours)',
      'Clinical Complexity',
      'Behavioral Severity – MASS (Last 24 Hours)',
    ])
  })

  it('is frozen, so domains and level descriptions cannot be edited in code', () => {
    expect(Object.isFrozen(LOCKED_CORE)).toBe(true)
    expect(() => { LOCKED_CORE[0].group = 'Something else' }).toThrow(TypeError)
    expect(() => { LOCKED_CORE[0].items[0].label = 'Edited' }).toThrow(TypeError)
    expect(() => { LOCKED_CORE.push({ group: 'New domain', items: [] }) }).toThrow(TypeError)
    expect(() => { SHIPPED_POINTS.obs_1to1 = 99 }).toThrow(TypeError)
  })

  it('rejects any attempt to edit domains or descriptions, even by an administrator', () => {
    for (const draft of [
      { criteria: [{ group: 'Observation Status', items: [] }] },
      { domains: ['A', 'B'] },
      { labels: { obs_1to1: 'Edited wording' } },
      { points: { ...SHIPPED_POINTS }, notes: { mass: 'Edited' } },
    ]) {
      const r = propose(fresh(), draft)
      expect(r.ok).toBe(false)
      expect(r.errors.join(' ')).toMatch(/core is locked/)
    }
  })

  it('rejects adding a new scored item', () => {
    const r = propose(fresh(), { points: { ...SHIPPED_POINTS, new_item: 2 } })
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/not an AcuiCalc™ item/)
  })

  it('keeps the locked labels when point values are calibrated', () => {
    const r = propose(fresh(), { points: { ...SHIPPED_POINTS, obs_1to1: 6 } })
    expect(r.ok).toBe(true)
    const criteria = calibratedCriteria(r.version)
    expect(criteria.map((g) => g.group)).toEqual(LOCKED_CORE.map((g) => g.group))
    criteria.forEach((g, gi) => g.items.forEach((i, ii) => expect(i.label).toBe(LOCKED_CORE[gi].items[ii].label)))
    expect(criteria[0].items[0].points).toBe(6)
  })
})

/* ------------------------------------------------------ 2. weight limits */

describe('2. point value limits', () => {
  it('defaults to ±25%, held in one constant', () => {
    expect(WEIGHT_LIMIT_PCT).toBe(0.25)
    expect(pointLimits('obs_1to1')).toEqual({ default: 5, min: 3.75, max: 6.25 })
    expect(pointLimits('mass_mild')).toEqual({ default: 1, min: 0.75, max: 1.25 })
  })

  it('accepts values at the limits', () => {
    expect(validatePoints({ ...SHIPPED_POINTS, obs_1to1: 6.25, mass_mild: 0.75 })).toEqual([])
  })

  it('rejects and explains values outside the limit', () => {
    const above = propose(fresh(), { points: { ...SHIPPED_POINTS, obs_1to1: 6.5 } })
    expect(above.ok).toBe(false)
    expect(above.errors[0]).toContain('Constant Observation (1:1)')
    expect(above.errors[0]).toContain('outside the allowed range 3.75–6.25')
    expect(above.errors[0]).toContain('shipped default 5, ±25%')

    const below = propose(fresh(), { points: { ...SHIPPED_POINTS, risk_hi: 2 } })
    expect(below.ok).toBe(false)
    expect(below.errors[0]).toContain('2.25–3.75')
  })

  it('rejects values that are not numbers', () => {
    expect(validatePoints({ ...SHIPPED_POINTS, obs_q15: 'three' }).join(' ')).toMatch(/enter a number/)
    expect(validatePoints({ ...SHIPPED_POINTS, obs_q15: NaN }).join(' ')).toMatch(/enter a number/)
  })

  it('follows the constant when the limit is changed', () => {
    expect(validatePoints({ ...SHIPPED_POINTS, obs_1to1: 6 }, 0.1).join(' ')).toContain('4.5–5.5')
    expect(validatePoints({ ...SHIPPED_POINTS, obs_1to1: 6 }, 0.25)).toEqual([])
  })
})

/* ------------------------------------------------- 3. zones and responses */

describe('3. zone cutoffs and responses', () => {
  it('accepts edited cutoffs that stay in order', () => {
    const r = propose(fresh(), { zones: { ...SHIPPED_ZONES, inpatient: { greenMax: 1.4, yellowMax: 2.6 } } })
    expect(r.ok).toBe(true)
    expect(r.version.zones.inpatient).toEqual({ greenMax: 1.4, yellowMax: 2.6 })
  })

  it('rejects zones that overlap or are reversed', () => {
    for (const z of [{ greenMax: 2.5, yellowMax: 2.5 }, { greenMax: 3, yellowMax: 2 }]) {
      const r = propose(fresh(), { zones: { ...SHIPPED_ZONES, inpatient: z } })
      expect(r.ok).toBe(false)
      expect(r.errors.join(' ')).toMatch(/must be higher than the GREEN cutoff/)
    }
  })

  it('rejects a GREEN zone that starts at or below zero, and missing numbers', () => {
    expect(validateZones({ ...SHIPPED_ZONES, ed: { greenMax: 0, yellowMax: 10 } }).join(' ')).toMatch(/above zero/)
    expect(validateZones({ ...SHIPPED_ZONES, ed: { greenMax: '', yellowMax: 10 } }).join(' ')).toMatch(/enter a number/)
    expect(validateZones({ inpatient: SHIPPED_ZONES.inpatient, ed: SHIPPED_ZONES.ed }).join(' ')).toMatch(/Pediatric emergency departments: cutoffs are missing/)
  })

  it('derives bands with no gaps or overlaps', () => {
    for (const set of Object.keys(SHIPPED_ZONES)) expect(validateBands(zoneBands(SHIPPED_ZONES[set]))).toEqual([])
    // Each boundary value belongs to exactly one band, the same one computeStage picks.
    const bands = zoneBands({ greenMax: 21, yellowMax: 27 })
    const inBand = (v) => bands.filter((b) => (b.minInclusive ? v >= b.min : v > b.min) && (b.maxInclusive ? v <= b.max : v < b.max))
    for (const v of [0, 20.99, 21, 21.01, 26.99, 27, 27.01, 100]) {
      const hits = inBand(v)
      expect(hits).toHaveLength(1)
      expect(hits[0].stage).toBe(computeStage(v, { greenMax: 21, yellowMax: 27 }))
    }
  })

  it('detects gaps, overlaps, double-counted boundaries and wrong order', () => {
    const ok = zoneBands({ greenMax: 2, yellowMax: 4 })
    const gap = ok.map((b) => (b.stage === 'YELLOW' ? { ...b, min: 2.5 } : b))
    const overlap = ok.map((b) => (b.stage === 'YELLOW' ? { ...b, min: 1.5 } : b))
    const doubled = ok.map((b) => (b.stage === 'YELLOW' ? { ...b, minInclusive: true } : b))
    const order = [ok[1], ok[0], ok[2]]
    expect(validateBands(gap).join(' ')).toMatch(/gap between GREEN and YELLOW/)
    expect(validateBands(overlap).join(' ')).toMatch(/GREEN and YELLOW overlap/)
    expect(validateBands(doubled).join(' ')).toMatch(/exactly one of GREEN or YELLOW/)
    expect(validateBands(order).join(' ')).toMatch(/GREEN, YELLOW, RED in that order/)
  })

  it('saves edited zone responses and requires one for every zone', () => {
    const r = propose(fresh(), { responses: { ...SHIPPED_RESPONSES, RED: 'Call the house supervisor and open the surge plan' } })
    expect(r.ok).toBe(true)
    expect(zoneResponse(r.version, 'RED')).toBe('Call the house supervisor and open the surge plan')
    const blank = propose(fresh(), { responses: { ...SHIPPED_RESPONSES, YELLOW: '   ' } })
    expect(blank.ok).toBe(false)
    expect(blank.errors.join(' ')).toMatch(/YELLOW: describe the action/)
  })

  it('ships the GREEN response the board has always shown', () => {
    expect(SHIPPED_RESPONSES.GREEN).toBe('Staffing is at target for current acuity')
  })
})

/* ------------------------------------------------------- 4. org scope */

describe('4. one calibration for the whole health system', () => {
  it('strips per-unit overrides so every unit reads the system zones', () => {
    const custom = { ...IP, thresholds: { greenMax: 0.5, yellowMax: 0.9, unit: 'custom' } }
    const org = orgScopedLocation(custom)
    expect(org.thresholds).toBe(null)
    const th = calibratedThresholds(activeCalibration(fresh()))
    expect(thresholdsFor(org, th)).toEqual(thresholdsFor(IP, th))
  })

  it('moves an ED that used the pediatric override onto the system pediatric ED zones', () => {
    const legacyPeds = { ...ED, thresholds: { greenMax: 53, yellowMax: 71, unit: 'x' } }
    const org = orgScopedLocation(legacyPeds)
    expect(org.zoneSet).toBe('pedsEd')
    expect(zoneSetFor(org)).toBe('pedsEd')
  })

  it('applies one change to every unit and ED of its type at once', () => {
    const r = propose(fresh(), { zones: { ...SHIPPED_ZONES, ed: { greenMax: 20, yellowMax: 26 } } })
    const th = calibratedThresholds(r.version)
    const eds = [ED, { ...ED, id: 'ed3' }, { ...ED, id: 'ed4', thresholds: { greenMax: 30, yellowMax: 40 } }].map(orgScopedLocation)
    for (const loc of eds) expect(thresholdsFor(loc, th)).toMatchObject({ greenMax: 20, yellowMax: 26 })
  })

  it('rejects zone sets keyed to a single unit', () => {
    const r = propose(fresh(), { zones: { ...SHIPPED_ZONES, ip1: { greenMax: 1, yellowMax: 2 } } })
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/"ip1" is not a zone set/)
  })
})

/* ---------------------------------------------------- 5. change control */

describe('5. change control', () => {
  it('only the Administrator role holds the calibrate permission', () => {
    for (const role of ROLE_ORDER) expect(can(role, 'calibrate')).toBe(role === 'admin')
  })

  it('rejects changes and resets from every other role', () => {
    const draft = { points: { ...SHIPPED_POINTS, obs_q15: 3.5 } }
    for (const role of ROLE_ORDER.filter((r) => r !== 'admin').concat([undefined, 'unknown'])) {
      const r = propose(fresh(), draft, { ...ADMIN, role })
      expect(r.ok).toBe(false)
      expect(r.errors.join(' ')).toMatch(/Only an Administrator/)
      const reset = resetCalibration(fresh(), { ...ADMIN, role })
      expect(reset.ok).toBe(false)
    }
    expect(propose(fresh(), draft).ok).toBe(true)
  })

  it('requires a written reason and the reviewing frontline nurses', () => {
    const draft = { points: { ...SHIPPED_POINTS, obs_q15: 3.5 } }
    expect(propose(fresh(), draft, { ...ADMIN, reason: '' }).errors.join(' ')).toMatch(/Write a reason/)
    expect(propose(fresh(), draft, { ...ADMIN, reason: 'short' }).errors.join(' ')).toMatch(/Write a reason/)
    expect(propose(fresh(), draft, { ...ADMIN, reviewers: [] }).errors.join(' ')).toMatch(/frontline nurses/)
    expect(propose(fresh(), draft, { ...ADMIN, reviewers: ' , ' }).errors.join(' ')).toMatch(/frontline nurses/)
    const ok = propose(fresh(), draft, { ...ADMIN, reviewers: 'Charge RN 4W, ED RN' })
    expect(ok.version.reviewers).toEqual(['Charge RN 4W', 'ED RN'])
  })

  it('builds an audit entry with old values, new values, reason and reviewers', () => {
    const r = propose(fresh(), { points: { ...SHIPPED_POINTS, obs_1to1: 6 } })
    expect(r.audit.action).toBe('calibration.update')
    expect(r.audit.target).toBe('v2')
    const d = r.audit.detail
    expect(d.version).toBe(2)
    expect(d.previousVersion).toBe(1)
    expect(d.reason).toBe(ADMIN.reason)
    expect(d.reviewers).toEqual(ADMIN.reviewers)
    expect(d.old.points.obs_1to1).toBe(5)
    expect(d.new.points.obs_1to1).toBe(6)
    expect(d.changes).toEqual([{ field: 'points.obs_1to1', label: 'Constant Observation (1:1)', from: 5, to: 6 }])
    expect(actionLabel('calibration.update')).toMatch(/AcuiCalc™ calibration/)
  })

  describe('written to the hash-chained audit log', () => {
    let written
    beforeEach(() => {
      written = []
      setAuditSink((action, target, detail) => written.push({ action, target, detail }))
    })

    it('records who, when, the old and new values and the reason, and the chain verifies', async () => {
      const r = propose(fresh(), { zones: { ...SHIPPED_ZONES, ed: { greenMax: 20, yellowMax: 26 } } })
      audit(r.audit.action, r.audit.target, r.audit.detail)
      setAuditSink(null)
      expect(written).toHaveLength(1)

      const first = await makeAuditEntry(null, { actor: 'Charge', role: 'charge', action: 'entry.add', target: 'e1', at: 1000 })
      const entry = await makeAuditEntry(first, { actor: ADMIN.actor, role: ADMIN.role, at: 2000, ...written[0] })
      expect(entry.actor).toBe('Admin One')
      expect(entry.role).toBe('admin')
      expect(entry.at).toBe(2000)
      expect(entry.detail.old.zones.ed).toEqual({ greenMax: 21, yellowMax: 27 })
      expect(entry.detail.new.zones.ed).toEqual({ greenMax: 20, yellowMax: 26 })
      expect(entry.detail.reason).toBe(ADMIN.reason)
      expect((await verifyAuditChain([first, entry])).ok).toBe(true)

      // Editing the recorded reason afterwards breaks the chain.
      const tampered = { ...entry, detail: { ...entry.detail, reason: 'something else' } }
      expect((await verifyAuditChain([first, tampered])).ok).toBe(false)
    })
  })

  it('refuses to save a change that changes nothing', () => {
    const r = propose(fresh(), { points: { ...SHIPPED_POINTS } })
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toMatch(/Nothing has changed/)
  })
})

/* ------------------------------------------------------- 6. versioning */

describe('6. versioning and historical scores', () => {
  it('numbers each saved calibration v1, v2, v3 ...', () => {
    let state = fresh()
    const a = propose(state, { points: { ...SHIPPED_POINTS, obs_q15: 3.5 } })
    state = a.state
    const b = propose(state, { points: { ...a.version.points, obs_los: 2.5 } })
    state = b.state
    expect(state.versions.map((v) => v.version)).toEqual([1, 2, 3])
    expect(activeCalibration(state).version).toBe(3)
    expect(calibrationByVersion(state, 2).points.obs_los).toBe(2)
  })

  it('stamps every new shift score with the version it was calculated under', () => {
    const v1 = activeCalibration(fresh())
    const e = stampEntry({ id: 'e1', locId: 'ip1', points: 20, staff: 10 }, IP, v1)
    expect(e.calibrationVersion).toBe(1)
    expect(e.zoneSet).toBe('inpatient')
    expect(e.zones).toEqual({ greenMax: 1.5, yellowMax: 2.5 })

    const peds = stampEntry({ id: 'e2', locId: 'ed2', points: 60 }, PEDS, v1)
    expect(peds.zones).toEqual({ greenMax: 53, yellowMax: 71 })
  })

  it('never re-scores saved shifts when the calibration changes', () => {
    let state = fresh()
    const v1 = activeCalibration(state)
    // 2.0 acuity per staff: YELLOW under v1.
    const saved = stampEntry({ id: 'e1', locId: 'ip1', date: '2026-10-20', shift: 'AM', points: 20, staff: 10, createdAt: 1 }, IP, v1)
    const before = entryStage(saved, IP, calibratedThresholds(v1))
    expect(before).toBe('YELLOW')

    const r = propose(state, { zones: { ...SHIPPED_ZONES, inpatient: { greenMax: 1, yellowMax: 1.875 } } })
    state = r.state
    const v2 = activeCalibration(state)
    const th2 = calibratedThresholds(v2)
    // The saved shift still reads YELLOW under the new calibration...
    expect(entryStage(saved, IP, th2)).toBe('YELLOW')
    expect(saved.calibrationVersion).toBe(1)
    // ...while the same score saved today reads RED under v2.
    const today = stampEntry({ ...saved, id: 'e2', date: '2026-10-21' }, IP, v2)
    expect(today.calibrationVersion).toBe(2)
    expect(entryStage(today, IP, th2)).toBe('RED')
    // Earlier versions are left exactly as they were.
    expect(calibrationByVersion(state, 1)).toEqual(v1)
  })

  it('reads scores saved before calibration existed as v1, whatever is active now', () => {
    const legacy = [
      { id: 'a', locId: 'ip1', date: '2026-10-19', shift: 'AM', points: 20, staff: 10 },
      { id: 'b', locId: 'ed1', date: '2026-10-19', shift: 'AM', points: 24 },
      { id: 'c', locId: 'ed2', date: '2026-10-19', shift: 'AM', points: 60 },
    ]
    const state = propose(fresh(), { zones: { inpatient: { greenMax: 1, yellowMax: 1.875 }, ed: { greenMax: 10, yellowMax: 15 }, pedsEd: { greenMax: 40, yellowMax: 50 } } }).state
    const v1 = calibrationByVersion(state, 1)
    const thNow = calibratedThresholds(activeCalibration(state))
    const locs = [IP, ED, PEDS]
    const read = withLegacyStamps(legacy, locs, v1)
    expect(read.map((e) => e.calibrationVersion)).toEqual([1, 1, 1])
    expect(read.map((e, i) => entryStage(e, locs[i], thNow))).toEqual(['YELLOW', 'YELLOW', 'YELLOW'])
    // Stamped entries pass through untouched.
    expect(withLegacyStamps(read, locs, v1)).toBe(read)
  })

  it('keeps a unit\'s earlier per-unit override for the shifts that were scored under it', () => {
    const custom = { ...IP, thresholds: { greenMax: 0.5, yellowMax: 0.9 } }
    const [e] = withLegacyStamps([{ id: 'a', locId: 'ip1', points: 10, staff: 10 }], [custom], activeCalibration(fresh()))
    expect(e.zones).toEqual({ greenMax: 0.5, yellowMax: 0.9 })
    expect(entryStage(e, orgScopedLocation(custom), calibratedThresholds(activeCalibration(fresh())))).toBe('RED')
  })

  it('keeps historical RED counts in cost and series analytics', () => {
    const v1 = activeCalibration(fresh())
    const entries = [
      stampEntry({ id: 'a', locId: 'ip1', date: '2026-10-19', shift: 'AM', points: 28, staff: 10, createdAt: 1 }, IP, v1), // 2.8 RED
      stampEntry({ id: 'b', locId: 'ip1', date: '2026-10-19', shift: 'PM', points: 22, staff: 10, createdAt: 2 }, IP, v1), // 2.2 YELLOW
    ]
    const v2 = propose(fresh(), { zones: { ...SHIPPED_ZONES, inpatient: { greenMax: 1, yellowMax: 2 } } }).version
    const th2 = calibratedThresholds(v2)
    expect(buildSeries(entries, IP, th2).map((p) => p.stage)).toEqual(['RED', 'YELLOW'])
    const cost = costSummary({ entries, deployments: [], locations: [IP], thresholds: th2, rates: {}, from: '2026-10-01', to: '2026-10-31' })
    expect(cost.redShifts).toBe(1)
  })
})

/* ---------------------------------------------------------- 8. reset */

describe('8. reset to shipped defaults', () => {
  it('restores the shipped defaults as a new version', () => {
    let state = propose(fresh(), {
      points: { ...SHIPPED_POINTS, obs_1to1: 6 },
      zones: { ...SHIPPED_ZONES, ed: { greenMax: 20, yellowMax: 26 } },
      responses: { ...SHIPPED_RESPONSES, RED: 'Open the surge plan' },
    }).state
    const r = resetCalibration(state, ADMIN)
    expect(r.ok).toBe(true)
    expect(r.version.version).toBe(3)
    expect(r.version.kind).toBe('reset')
    expect(r.version.points).toEqual(SHIPPED_POINTS)
    expect(r.version.zones).toEqual(SHIPPED_ZONES)
    expect(r.version.responses).toEqual(SHIPPED_RESPONSES)
    expect(r.audit.action).toBe('calibration.reset')
    expect(r.audit.detail.old.points.obs_1to1).toBe(6)
    expect(r.audit.detail.new.points.obs_1to1).toBe(5)
    state = r.state
    expect(state.versions).toHaveLength(3)
    expect(calibrationByVersion(state, 2).points.obs_1to1).toBe(6)
  })

  it('needs a reason and reviewers like any other change', () => {
    const state = propose(fresh(), { points: { ...SHIPPED_POINTS, obs_1to1: 6 } }).state
    expect(resetCalibration(state, { ...ADMIN, reason: '' }).ok).toBe(false)
    expect(resetCalibration(state, { ...ADMIN, reviewers: [] }).ok).toBe(false)
  })

  it('says so when the calibration is already at the shipped defaults', () => {
    const r = resetCalibration(fresh(), ADMIN)
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toMatch(/already at the shipped defaults/)
  })
})

/* -------------------------------------------------------- 9. terminology */

describe('9. terminology', () => {
  const root = path.resolve(__dirname, '../..')
  const files = []
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name)
      if (fs.statSync(p).isDirectory()) { if (name !== '__tests__') walk(p) } else if (/\.(jsx?|css|html)$/.test(name)) files.push(p)
    }
  }
  walk(root)

  it('has no BHAI text outside internal browser storage key names', () => {
    for (const f of files) {
      const text = fs.readFileSync(f, 'utf8').replace(/(['"`])bhai:[^'"`]*\1/g, '')
      expect(text, path.relative(root, f)).not.toMatch(/bhai/i)
    }
  })

  it('calls the instrument AcuiCalc™, not "Acuity Calculator"', () => {
    for (const f of files) {
      const text = fs.readFileSync(f, 'utf8')
      expect(text, path.relative(root, f)).not.toMatch(/Acuity Calculator/)
      expect(text, path.relative(root, f)).not.toMatch(/AcuiCalc(?![™&\\]|\.js|\.jsx)(?=[\s'".,:;)—-])/)
    }
  })
})
