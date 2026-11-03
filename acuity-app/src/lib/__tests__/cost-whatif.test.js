import { describe, it, expect } from 'vitest'
import {
  DEFAULT_COST_RATES, normalizeRates, deploymentSource, deploymentCost,
  costSummary, planValue, realizedValue, formatMoney,
} from '../cost.js'
import { runScenario, projectNextShift, isEmptyScenario } from '../whatif.js'
import { forecastLocation } from '../forecast.js'
import { DEFAULT_THRESHOLDS } from '../model.js'
import { buildDemoScenario } from '../demoData.js'

const TH = DEFAULT_THRESHOLDS

describe('cost rates', () => {
  it('fills missing rates from the defaults and ignores invalid ones', () => {
    const r = normalizeRates({ floatHourly: '60', agencyHourly: -5, nonsense: 9 })
    expect(r.floatHourly).toBe(60)
    expect(r.agencyHourly).toBe(DEFAULT_COST_RATES.agencyHourly)
    expect(r.nonsense).toBeUndefined()
  })

  it('infers the source of a deployment and prices its hours', () => {
    expect(deploymentSource({ fromLocId: null })).toBe('float')
    expect(deploymentSource({ fromLocId: 'u2' })).toBe('internal')
    expect(deploymentSource({ source: 'agency' })).toBe('agency')
    expect(deploymentCost({ source: 'overtime', hours: 4 }, {}).cost).toBe(4 * DEFAULT_COST_RATES.overtimeHourly)
    // no hours logged → one full shift
    expect(deploymentCost({ fromLocId: null }, {}).hours).toBe(DEFAULT_COST_RATES.shiftHours)
    expect(deploymentCost({ fromLocId: 'u2', hours: 8 }, {}).cost).toBe(0)
  })
})

describe('cost summary', () => {
  const locations = [
    { id: 'u1', name: '1 South A', type: 'inpatient' },
    { id: 'ed', name: 'ED', type: 'ed' },
  ]
  const entries = [
    { locId: 'u1', date: '2026-03-01', shift: 'AM', points: 15, staff: 5, createdAt: 1 }, // 3.0 RED
    { locId: 'u1', date: '2026-03-01', shift: 'PM', points: 6, staff: 5, createdAt: 1 },  // 1.2 GREEN
    { locId: 'u1', date: '2026-03-02', shift: 'AM', points: 14, staff: 5, createdAt: 1 }, // 2.8 RED
    { locId: 'u1', date: '2026-03-09', shift: 'AM', points: 14, staff: 5, createdAt: 1 }, // outside window
    { locId: 'ed', date: '2026-03-01', shift: 'AM', points: 20, boardingHours: 10, createdAt: 1 },
    { locId: 'ed', date: '2026-03-02', shift: 'PM', points: 20, boardingHours: 6, createdAt: 1 },
  ]
  const deployments = [
    { toLocId: 'u1', date: '2026-03-01', fromLocId: null, hours: 12 },
    { toLocId: 'u1', date: '2026-03-02', source: 'agency', hours: 12 },
  ]

  it('counts RED shifts, boarding hours and deployment labor inside the window and shows the arithmetic', () => {
    const s = costSummary({ entries, deployments, locations, thresholds: TH, rates: {}, from: '2026-03-01', to: '2026-03-07' })
    expect(s.redShifts).toBe(2)
    expect(s.redCost).toBe(2 * DEFAULT_COST_RATES.redShiftCost)
    expect(s.boardingHours).toBe(16)
    expect(s.boardingCost).toBe(16 * DEFAULT_COST_RATES.boardingHourCost)
    expect(s.bySource.float.hours).toBe(12)
    expect(s.bySource.agency.cost).toBe(12 * DEFAULT_COST_RATES.agencyHourly)
    expect(s.total).toBe(s.redCost + s.boardingCost + s.deploymentSpend)
    expect(s.byUnit.find((u) => u.loc.id === 'u1').deployedHours).toBe(24)
  })
})

describe('plan value', () => {
  it('prices the expected RED shifts a plan avoids against the labor it uses', () => {
    const plan = {
      ok: true,
      moves: [
        { staff: 1, fromLocId: null, pRedBefore: 0.8, pRedAfter: 0.3 },
        { staff: 1, fromLocId: 'u3', pRedBefore: 0.4, pRedAfter: 0.1 },
      ],
    }
    const calledIn = planValue(plan, { floatOnShift: false })
    expect(calledIn.expectedRedAvoided).toBeCloseTo(0.8)
    expect(calledIn.riskValue).toBeCloseTo(0.8 * DEFAULT_COST_RATES.redShiftCost)
    expect(calledIn.laborCost).toBe(DEFAULT_COST_RATES.shiftHours * DEFAULT_COST_RATES.floatHourly)
    expect(calledIn.net).toBeCloseTo(calledIn.riskValue - calledIn.laborCost)
  })

  it('adds no labor for a float pool already on shift, the default', () => {
    const plan = { ok: true, moves: [{ staff: 2, fromLocId: null, pRedBefore: 0.7, pRedAfter: 0.2 }] }
    expect(planValue(plan, {}).laborCost).toBe(0)
    expect(normalizeRates({ floatOnShift: 'yes' }).floatOnShift).toBe(true)
    expect(normalizeRates({ floatOnShift: false }).floatOnShift).toBe(false)
  })

  it('is zero for an empty plan', () => {
    expect(planValue({ ok: true, moves: [] }, {}).net).toBe(0)
  })

  it('reports an observed value only once both groups have enough outcomes', () => {
    const evals = [{ moves: [{ followed: 'full', outcome: 'avoided', pRedBefore: 0.6, pRedAfter: 0.2 }] }]
    const thin = { followed: { moves: 1 }, notFollowed: { moves: 1 }, redReduction: 0.5 }
    const v = realizedValue(thin, evals, {}, { minN: 5 })
    expect(v.modeledRedAvoided).toBeCloseTo(0.4)
    expect(v.observedValue).toBeNull()
    const rich = { followed: { moves: 10 }, notFollowed: { moves: 10 }, redReduction: 0.3 }
    expect(realizedValue(rich, evals, {}, { minN: 5 }).observedRedAvoided).toBeCloseTo(3)
  })

  it('formats money plainly', () => {
    expect(formatMoney(1234.4)).toBe('$1,234')
    expect(formatMoney(-50)).toBe('−$50')
    expect(formatMoney(null)).toBe('—')
  })
})

describe('what-if planner', () => {
  const demo = buildDemoScenario()
  const forecasts = {}
  const censusForecasts = {}
  for (const loc of demo.locations) {
    forecasts[loc.id] = forecastLocation(demo.entries, loc, TH, { horizon: 1 })
    if (loc.type !== 'ed') censusForecasts[loc.id] = forecastLocation(demo.entries, loc, TH, { metric: 'census', horizon: 1 })
  }
  const inputs = { locations: demo.locations, entries: demo.entries, thresholds: TH, forecasts, censusForecasts, caps: demo.caps }

  it('reproduces the baseline when nothing changes', () => {
    const r = runScenario({ ...inputs, scenario: {} })
    expect(r.delta.expectedRed).toBeCloseTo(0)
    expect(r.delta.red).toBe(0)
    expect(isEmptyScenario({})).toBe(true)
  })

  it('raises RED risk when a unit loses staff, and lowers it when staff are added', () => {
    const lose = runScenario({ ...inputs, scenario: { staffDelta: { demo_3w: -2 } } })
    const gain = runScenario({ ...inputs, scenario: { staffDelta: { demo_1sa: 2 } } })
    const unit = (r, id) => r.scenario.units.find((u) => u.loc.id === id)
    const base = (r, id) => r.baseline.units.find((u) => u.loc.id === id)
    expect(unit(lose, 'demo_3w').pRed).toBeGreaterThan(base(lose, 'demo_3w').pRed)
    expect(unit(gain, 'demo_1sa').pRed).toBeLessThan(base(gain, 'demo_1sa').pRed)
    expect(lose.delta.staff).toBe(-2)
  })

  it('makes running over the census cap more likely when beds close', () => {
    const r = runScenario({ ...inputs, scenario: { bedDelta: { demo_3w: -4 } } })
    const before = r.baseline.units.find((u) => u.loc.id === 'demo_3w')
    const after = r.scenario.units.find((u) => u.loc.id === 'demo_3w')
    expect(after.cap).toBe(before.cap - 4)
    expect(after.pOverCap).toBeGreaterThan(before.pOverCap)
    expect(r.delta.beds).toBe(-4)
  })

  it('a region-wide acuity surge pushes more units toward RED and the optimizer responds', () => {
    const r = runScenario({ ...inputs, scenario: { regionAcuity: 1.3, floatStaff: 3 } })
    expect(r.scenario.totals.expectedRed).toBeGreaterThan(r.baseline.totals.expectedRed)
    expect(r.plan.ok).toBe(true)
    expect(r.plan.moves.length).toBeGreaterThan(0)
  })

  it('treats ED as reported but not staffed', () => {
    const p = projectNextShift({ ...inputs })
    expect(p.units.some((u) => u.loc.type === 'ed')).toBe(false)
  })
})
