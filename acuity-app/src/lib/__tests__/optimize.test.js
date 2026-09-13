import { describe, it, expect } from 'vitest'
import {
  unitRisk,
  buildUnitStates,
  optimizeAllocation,
  planMoves,
  recommendDeployment,
  donorEligibility,
  STAGE_WEIGHT,
  DEFAULT_MOVE_COST,
  DEFAULT_STAFF_FLOOR,
  DONOR_MIN_HISTORY,
  DONOR_INELIGIBLE,
} from '../optimize.js'
import { DEFAULT_THRESHOLDS } from '../model.js'
import { dayIndex, SHIFTS } from '../forecast.js'

const TH = DEFAULT_THRESHOLDS.inpatient

function loc(id, over = {}) {
  return { id, name: id, type: 'inpatient', censusCap: 18, thresholds: null, ...over }
}

// Give each unit a full track record by default, so tests that are not about
// the donor history rule are not silently governed by it. `shifts` overrides
// the count for a single unit.
function entriesFor(units, { shifts = DONOR_MIN_HISTORY } = {}) {
  const end = dayIndex('2026-03-02') * SHIFTS.length + 1
  const out = []
  units.forEach((u, i) => {
    const count = u.shifts ?? shifts
    for (let k = 0; k < count; k++) {
      const slot = end - (count - 1 - k)
      const day = Math.floor(slot / SHIFTS.length)
      out.push({
        id: `e${i}_${k}`,
        locId: u.id,
        date: new Date(day * 86400000).toISOString().slice(0, 10),
        shift: SHIFTS[slot - day * SHIFTS.length],
        points: u.points,
        staff: u.staff,
        census: u.census ?? 12,
        createdAt: 1000 + k,
      })
    }
  })
  return out
}

/**
 * Independent brute-force optimum over the same option space the DP searches.
 * If the DP is correct these must agree on every case.
 */
function bruteForce(states, { floatStaff, moveCost = DEFAULT_MOVE_COST, maxAddPerUnit = 6 }) {
  const maxPull = states.reduce((s, u) => s + u.releasable, 0)
  const options = states.map((u) => {
    const opts = []
    for (let k = -u.releasable; k <= Math.min(maxAddPerUnit, floatStaff + maxPull); k++) {
      const staff = u.staff + k
      if (staff < DEFAULT_STAFF_FLOOR) continue
      const { risk } = unitRisk({ points: u.points, staff, th: u.th, exposure: u.exposure })
      opts.push({ k, cost: risk + Math.abs(k) * moveCost })
    }
    return opts
  })

  let best = Infinity
  let bestDeltas = null
  const walk = (i, used, cost, picks) => {
    if (i === states.length) {
      if (used <= floatStaff && cost < best) {
        best = cost
        bestDeltas = picks.slice()
      }
      return
    }
    for (const opt of options[i]) {
      picks.push(opt.k)
      walk(i + 1, used + opt.k, cost + opt.cost, picks)
      picks.pop()
    }
  }
  walk(0, 0, 0, [])
  return { cost: best, deltas: bestDeltas }
}

describe('unitRisk', () => {
  it('classifies stages off acuity per staff', () => {
    expect(unitRisk({ points: 4, staff: 4, th: TH }).stage).toBe('GREEN')
    expect(unitRisk({ points: 8, staff: 4, th: TH }).stage).toBe('YELLOW')
    expect(unitRisk({ points: 16, staff: 4, th: TH }).stage).toBe('RED')
  })

  it('scores GREEN as zero risk and escalates from there', () => {
    const green = unitRisk({ points: 4, staff: 4, th: TH })
    const yellow = unitRisk({ points: 8, staff: 4, th: TH })
    const red = unitRisk({ points: 16, staff: 4, th: TH })
    expect(green.risk).toBe(0)
    expect(yellow.risk).toBeGreaterThan(green.risk)
    expect(red.risk).toBeGreaterThan(yellow.risk)
    expect(STAGE_WEIGHT.RED).toBeGreaterThan(STAGE_WEIGHT.YELLOW)
  })

  it('weights by patients exposed', () => {
    const small = unitRisk({ points: 16, staff: 4, th: TH, exposure: 6 })
    const large = unitRisk({ points: 16, staff: 4, th: TH, exposure: 20 })
    expect(large.risk).toBeGreaterThan(small.risk)
    expect(large.uai).toBeCloseTo(small.uai)
  })

  it('treats an unstaffed unit as maximally risky rather than dividing by zero', () => {
    const r = unitRisk({ points: 10, staff: 0, th: TH })
    expect(r.uai).toBe(Infinity)
    expect(r.stage).toBe('RED')
    expect(Number.isFinite(r.risk)).toBe(true)
  })

  it('falls monotonically as staff are added', () => {
    let prev = Infinity
    for (let s = 1; s <= 10; s++) {
      const r = unitRisk({ points: 16, staff: s, th: TH })
      expect(r.risk).toBeLessThanOrEqual(prev)
      prev = r.risk
    }
  })
})

describe('buildUnitStates', () => {
  it('excludes ED locations, whose score has no staffing denominator', () => {
    const locations = [loc('a'), loc('ed', { type: 'ed' })]
    const entries = entriesFor([{ id: 'a', points: 8, staff: 4 }, { id: 'ed', points: 25, staff: null }])
    const states = buildUnitStates({ locations, entries, thresholds: DEFAULT_THRESHOLDS })
    expect(states.map((s) => s.loc.id)).toEqual(['a'])
  })

  it('skips units with no logged shift and units with no staff', () => {
    const locations = [loc('a'), loc('b'), loc('c')]
    const entries = entriesFor([{ id: 'a', points: 8, staff: 4 }, { id: 'b', points: 8, staff: 0 }])
    const states = buildUnitStates({ locations, entries, thresholds: DEFAULT_THRESHOLDS })
    expect(states.map((s) => s.loc.id)).toEqual(['a'])
  })

  it('uses the most recent shift when a unit has several', () => {
    const entries = [
      { id: 'old', locId: 'a', date: '2026-03-01', shift: 'AM', points: 4, staff: 4, census: 10, createdAt: 1 },
      { id: 'new', locId: 'a', date: '2026-03-02', shift: 'PM', points: 16, staff: 4, census: 10, createdAt: 2 },
    ]
    const states = buildUnitStates({ locations: [loc('a')], entries, thresholds: DEFAULT_THRESHOLDS })
    expect(states[0].points).toBe(16)
    expect(states[0].baseStage).toBe('RED')
  })

  it('orders AM before PM within the same day', () => {
    const entries = [
      { id: 'pm', locId: 'a', date: '2026-03-02', shift: 'PM', points: 16, staff: 4, census: 10, createdAt: 1 },
      { id: 'am', locId: 'a', date: '2026-03-02', shift: 'AM', points: 4, staff: 4, census: 10, createdAt: 2 },
    ]
    const states = buildUnitStates({ locations: [loc('a')], entries, thresholds: DEFAULT_THRESHOLDS })
    expect(states[0].points).toBe(16)
  })

  it('counts releasable staff only while the donor holds GREEN', () => {
    // 4 points over 4 staff = 1.0; dropping to 3 gives 1.33 (still green),
    // dropping to 2 gives 2.0 (yellow) so only one is releasable.
    const entries = entriesFor([{ id: 'a', points: 4, staff: 4 }])
    const states = buildUnitStates({ locations: [loc('a')], entries, thresholds: DEFAULT_THRESHOLDS })
    expect(states[0].releasable).toBe(1)
  })

  it('releases nobody from a unit that is not green', () => {
    const entries = entriesFor([{ id: 'a', points: 16, staff: 4 }])
    const states = buildUnitStates({ locations: [loc('a')], entries, thresholds: DEFAULT_THRESHOLDS })
    expect(states[0].releasable).toBe(0)
  })

  it('never releases a unit below the staffing floor', () => {
    const entries = entriesFor([{ id: 'a', points: 0.5, staff: 1 }])
    const states = buildUnitStates({ locations: [loc('a')], entries, thresholds: DEFAULT_THRESHOLDS })
    expect(states[0].releasable).toBe(0)
  })

  it('optimizes against the forecast when asked', () => {
    const entries = entriesFor([{ id: 'a', points: 4, staff: 4 }])
    const forecasts = { a: { ok: true, points: [{ p50: 3.0, residuals: [], residualScale: 1, slot: 1 }] } }
    const current = buildUnitStates({ locations: [loc('a')], entries, thresholds: DEFAULT_THRESHOLDS, mode: 'current' })
    const ahead = buildUnitStates({ locations: [loc('a')], entries, thresholds: DEFAULT_THRESHOLDS, forecasts, mode: 'forecast' })
    expect(current[0].baseStage).toBe('GREEN')
    // Forecast says 3.0 acuity per staff next shift — that is RED.
    expect(ahead[0].points).toBeCloseTo(12)
    expect(ahead[0].baseStage).toBe('RED')
  })
})

describe('donor track-record rule', () => {
  const build = (units, opts = {}) =>
    buildUnitStates({
      locations: units.map((u) => loc(u.id)),
      entries: entriesFor(units),
      thresholds: DEFAULT_THRESHOLDS,
      ...opts,
    })

  it('requires a full weekly cycle of history by default', () => {
    expect(DONOR_MIN_HISTORY).toBe(14)
  })

  it('refuses to treat a brand-new unit as a donor even when it looks quiet', () => {
    const states = build([{ id: 'newbie', points: 4, staff: 4, shifts: 3 }])
    expect(states[0].baseStage).toBe('GREEN')
    expect(states[0].observations).toBe(3)
    expect(states[0].donor.eligible).toBe(false)
    expect(states[0].donor.reason).toBe(DONOR_INELIGIBLE.THIN_HISTORY)
    expect(states[0].releasable).toBe(0)
  })

  it('allows a donor once it has the history behind it', () => {
    const states = build([{ id: 'established', points: 4, staff: 4, shifts: 14 }])
    expect(states[0].donor.eligible).toBe(true)
    expect(states[0].releasable).toBe(1)
  })

  it('still lets a brand-new unit receive staff', () => {
    // Receiving is never gated: a new unit in trouble needs help most.
    const locations = [loc('newbie')]
    const entries = entriesFor([{ id: 'newbie', points: 20, staff: 4, shifts: 2 }])
    const plan = recommendDeployment({ locations, entries, thresholds: DEFAULT_THRESHOLDS, floatStaff: 2 })
    expect(plan.ok).toBe(true)
    expect(plan.moves.length).toBeGreaterThan(0)
    expect(plan.moves[0].toName).toBe('newbie')
    expect(plan.moves[0].fromName).toBe('Float pool')
  })

  it('sends the float nurse instead of raiding a unit it cannot vouch for', () => {
    const locations = [loc('newbie'), loc('critical')]
    const entries = entriesFor([
      { id: 'newbie', points: 4, staff: 4, shifts: 3 },
      { id: 'critical', points: 20, staff: 4 },
    ])
    const plan = recommendDeployment({ locations, entries, thresholds: DEFAULT_THRESHOLDS, floatStaff: 1 })
    expect(plan.moves).toHaveLength(1)
    expect(plan.moves[0].toName).toBe('critical')
    expect(plan.moves[0].fromLocId).toBeNull()
    expect(plan.summary.fromUnits).toBe(0)
  })

  it('leaves a RED unit short rather than pull from an unproven one', () => {
    // No float pool at all: the only theoretical donor is too new, so the
    // correct answer is to recommend nothing and say why.
    const locations = [loc('newbie'), loc('critical')]
    const entries = entriesFor([
      { id: 'newbie', points: 4, staff: 4, shifts: 3 },
      { id: 'critical', points: 20, staff: 4 },
    ])
    const plan = recommendDeployment({ locations, entries, thresholds: DEFAULT_THRESHOLDS, floatStaff: 0 })
    expect(plan.moves).toHaveLength(0)
    expect(plan.heldBack.map((h) => h.loc.id)).toEqual(['newbie'])
    expect(plan.heldBack[0].observations).toBe(3)
    expect(plan.heldBack[0].required).toBe(14)
  })

  it('prefers an established donor over a new one', () => {
    const locations = [loc('newbie'), loc('established'), loc('critical')]
    const entries = entriesFor([
      { id: 'newbie', points: 4, staff: 4, shifts: 3 },
      { id: 'established', points: 4, staff: 4 },
      { id: 'critical', points: 26, staff: 4, census: 20 },
    ])
    const plan = recommendDeployment({ locations, entries, thresholds: DEFAULT_THRESHOLDS, floatStaff: 0 })
    expect(plan.moves.length).toBeGreaterThan(0)
    expect(plan.moves.every((m) => m.fromLocId !== 'newbie')).toBe(true)
    expect(plan.moves.some((m) => m.fromLocId === 'established')).toBe(true)
  })

  it('reports a held-back unit only for thin history, not for being busy', () => {
    const locations = [loc('busy'), loc('critical')]
    const entries = entriesFor([
      { id: 'busy', points: 9, staff: 4 },
      { id: 'critical', points: 20, staff: 4 },
    ])
    const plan = recommendDeployment({ locations, entries, thresholds: DEFAULT_THRESHOLDS, floatStaff: 0 })
    // 'busy' is simply not GREEN — that is obvious on the board and needs no
    // explanation, so it is not listed as held back.
    expect(plan.heldBack).toHaveLength(0)
  })

  it('lets the history bar be tuned', () => {
    const units = [{ id: 'newbie', points: 4, staff: 4, shifts: 6 }]
    expect(build(units, { donorMinHistory: 14 })[0].donor.eligible).toBe(false)
    expect(build(units, { donorMinHistory: 4 })[0].donor.eligible).toBe(true)
  })

  it('names the blocking reason for each ineligible case', () => {
    const green = { observations: 20, points: 4, staff: 4, th: TH }
    expect(donorEligibility(green).eligible).toBe(true)
    expect(donorEligibility({ ...green, observations: 2 }).reason).toBe(DONOR_INELIGIBLE.THIN_HISTORY)
    expect(donorEligibility({ ...green, points: 16 }).reason).toBe(DONOR_INELIGIBLE.NOT_GREEN)
    expect(donorEligibility({ ...green, staff: 1, points: 0.5 }).reason).toBe(DONOR_INELIGIBLE.AT_FLOOR)
  })
})

describe('optimizeAllocation', () => {
  const build = (units, opts = {}) =>
    buildUnitStates({
      locations: units.map((u) => loc(u.id)),
      entries: entriesFor(units),
      thresholds: DEFAULT_THRESHOLDS,
      ...opts,
    })

  it('does nothing when there is nobody to move', () => {
    const states = build([{ id: 'a', points: 16, staff: 4 }])
    const a = optimizeAllocation(states, { floatStaff: 0 })
    expect(a.ok).toBe(true)
    expect(a.deltas).toEqual([0])
    expect(a.improvement).toBe(0)
  })

  it('reports no units when given none', () => {
    expect(optimizeAllocation([], { floatStaff: 3 }).ok).toBe(false)
  })

  it('sends staff to the unit in the worst shape, using the float pool and any safe donor', () => {
    const states = build([
      { id: 'calm', points: 4, staff: 4 },
      { id: 'critical', points: 16, staff: 4 },
    ])
    const a = optimizeAllocation(states, { floatStaff: 1 })
    const critical = states.findIndex((s) => s.loc.id === 'critical')
    const calm = states.findIndex((s) => s.loc.id === 'calm')
    // The float nurse goes to the RED unit, and the calm unit's spare goes too:
    // it can drop to 3 staff and still hold GREEN, so holding them back would
    // leave the RED unit worse off for nothing.
    expect(a.deltas[critical]).toBe(2)
    expect(a.deltas[calm]).toBe(-1)
    expect(a.deltas.reduce((s, d) => s + d, 0)).toBeLessThanOrEqual(1)
    expect(a.improvement).toBeGreaterThan(0)
  })

  it('places only what the float pool holds when no unit can spare anyone', () => {
    const states = build([
      { id: 'busy', points: 9, staff: 4 },
      { id: 'critical', points: 16, staff: 4 },
    ])
    const a = optimizeAllocation(states, { floatStaff: 1 })
    const critical = states.findIndex((s) => s.loc.id === 'critical')
    expect(states.every((s) => s.releasable === 0)).toBe(true)
    expect(a.deltas[critical]).toBe(1)
    expect(a.deltas.reduce((s, d) => s + d, 0)).toBe(1)
  })

  it('breaks a tie toward the unit with more patients exposed', () => {
    const states = build([
      { id: 'small', points: 16, staff: 4, census: 6 },
      { id: 'large', points: 16, staff: 4, census: 20 },
    ])
    const a = optimizeAllocation(states, { floatStaff: 1 })
    const large = states.findIndex((s) => s.loc.id === 'large')
    expect(a.deltas[large]).toBe(1)
  })

  it('pulls from a unit that can spare someone when the gain is real', () => {
    const states = build([
      { id: 'donor', points: 4, staff: 4 },
      { id: 'critical', points: 20, staff: 4 },
    ])
    const a = optimizeAllocation(states, { floatStaff: 0 })
    const donor = states.findIndex((s) => s.loc.id === 'donor')
    const critical = states.findIndex((s) => s.loc.id === 'critical')
    expect(a.deltas[donor]).toBe(-1)
    expect(a.deltas[critical]).toBe(1)
    expect(a.improvement).toBeGreaterThan(0)
  })

  it('leaves a fully green system alone rather than churning staff', () => {
    const states = build([
      { id: 'a', points: 4, staff: 4 },
      { id: 'b', points: 4, staff: 4 },
    ])
    const a = optimizeAllocation(states, { floatStaff: 2 })
    expect(a.deltas.every((d) => d === 0)).toBe(true)
  })

  it('declines a move whose benefit is below the disruption it causes', () => {
    // Sitting just barely into YELLOW: one extra nurse buys very little.
    const states = build([{ id: 'a', points: 6.1, staff: 4 }])
    const cheap = optimizeAllocation(states, { floatStaff: 1, moveCost: 0.001 })
    const costly = optimizeAllocation(states, { floatStaff: 1, moveCost: 50 })
    expect(cheap.deltas[0]).toBeGreaterThan(0)
    expect(costly.deltas[0]).toBe(0)
  })

  it('never pushes a unit below the staffing floor', () => {
    const states = build([
      { id: 'tiny', points: 0.5, staff: 1 },
      { id: 'critical', points: 20, staff: 4 },
    ])
    const a = optimizeAllocation(states, { floatStaff: 0 })
    states.forEach((s, i) => expect(s.staff + a.deltas[i]).toBeGreaterThanOrEqual(DEFAULT_STAFF_FLOOR))
  })

  it('never places more staff than the float pool holds', () => {
    const states = build([
      { id: 'a', points: 20, staff: 4 },
      { id: 'b', points: 20, staff: 4 },
      { id: 'c', points: 20, staff: 4 },
    ])
    for (const floatStaff of [0, 1, 2, 5]) {
      const a = optimizeAllocation(states, { floatStaff })
      const net = a.deltas.reduce((s, d) => s + d, 0)
      expect(net).toBeLessThanOrEqual(floatStaff)
    }
  })

  it('improves monotonically as the float pool grows', () => {
    const states = build([
      { id: 'a', points: 20, staff: 4 },
      { id: 'b', points: 14, staff: 4 },
    ])
    let prev = -Infinity
    for (const floatStaff of [0, 1, 2, 3, 4]) {
      const a = optimizeAllocation(states, { floatStaff })
      expect(a.improvement).toBeGreaterThanOrEqual(prev - 1e-9)
      prev = a.improvement
    }
  })

  it('matches an independent brute-force search on every case', () => {
    // Mixed systems: reds needing several staff (where marginal-benefit greedy
    // is known to go wrong), safe donors, tiny units, and ties.
    const scenarios = [
      [{ id: 'a', points: 16, staff: 4 }, { id: 'b', points: 4, staff: 4 }],
      [{ id: 'a', points: 20, staff: 4, census: 20 }, { id: 'b', points: 6, staff: 4, census: 6 }],
      [{ id: 'a', points: 30, staff: 4 }, { id: 'b', points: 9, staff: 4 }, { id: 'c', points: 3, staff: 4 }],
      [{ id: 'a', points: 11, staff: 4 }, { id: 'b', points: 11, staff: 4 }, { id: 'c', points: 11, staff: 4 }],
      [{ id: 'a', points: 0.5, staff: 1 }, { id: 'b', points: 26, staff: 4 }],
      [{ id: 'a', points: 7, staff: 3, census: 15 }, { id: 'b', points: 2, staff: 5, census: 4 }],
    ]

    for (const units of scenarios) {
      const states = build(units)
      for (const floatStaff of [0, 1, 2, 3]) {
        const dp = optimizeAllocation(states, { floatStaff })
        const bf = bruteForce(states, { floatStaff })
        expect(dp.ok).toBe(true)
        // The objective must match exactly; ties may pick different allocations.
        expect(dp.objective).toBeCloseTo(bf.cost, 9)
      }
    }
  })

  it('beats marginal-benefit greedy where a stage boundary needs several staff', () => {
    // 'stuck' needs 3 staff to leave RED; 'near' leaves YELLOW with 1. Greedy
    // spends its first pick on whichever looks best one staff at a time and can
    // strand the RED unit; the DP considers the whole budget at once.
    const states = build([
      { id: 'stuck', points: 26, staff: 4, census: 20 },
      { id: 'near', points: 6.4, staff: 4, census: 6 },
    ])
    const dp = optimizeAllocation(states, { floatStaff: 3 })
    const bf = bruteForce(states, { floatStaff: 3 })
    expect(dp.objective).toBeCloseTo(bf.cost, 9)

    const greedy = greedyAllocate(states, 3)
    expect(dp.objective).toBeLessThanOrEqual(greedy.cost + 1e-9)
  })
})

// Marginal-benefit greedy, for comparison only: place each staff member where
// it buys the most risk reduction right now.
function greedyAllocate(states, floatStaff, moveCost = DEFAULT_MOVE_COST) {
  const deltas = states.map(() => 0)
  for (let placed = 0; placed < floatStaff; placed++) {
    let bestI = -1
    let bestGain = 0
    states.forEach((u, i) => {
      const before = unitRisk({ points: u.points, staff: u.staff + deltas[i], th: u.th, exposure: u.exposure }).risk
      const after = unitRisk({ points: u.points, staff: u.staff + deltas[i] + 1, th: u.th, exposure: u.exposure }).risk
      const gain = before - after - moveCost
      if (gain > bestGain) {
        bestGain = gain
        bestI = i
      }
    })
    if (bestI === -1) break
    deltas[bestI]++
  }
  const cost = states.reduce(
    (s, u, i) =>
      s + unitRisk({ points: u.points, staff: u.staff + deltas[i], th: u.th, exposure: u.exposure }).risk + Math.abs(deltas[i]) * moveCost,
    0
  )
  return { deltas, cost }
}

describe('planMoves', () => {
  const build = (units) =>
    buildUnitStates({
      locations: units.map((u) => loc(u.id)),
      entries: entriesFor(units),
      thresholds: DEFAULT_THRESHOLDS,
    })

  it('turns an allocation into moves that conserve staff', () => {
    const states = build([
      { id: 'donor', points: 4, staff: 4 },
      { id: 'critical', points: 20, staff: 4 },
    ])
    const allocation = optimizeAllocation(states, { floatStaff: 1 })
    const plan = planMoves(states, allocation)
    const placed = plan.moves.reduce((s, m) => s + m.staff, 0)
    const positive = allocation.deltas.filter((d) => d > 0).reduce((s, d) => s + d, 0)
    expect(placed).toBe(positive)
  })

  it('labels a float-pool move when no donor is needed', () => {
    const states = build([{ id: 'critical', points: 20, staff: 4 }])
    const plan = planMoves(states, optimizeAllocation(states, { floatStaff: 1 }))
    expect(plan.moves[0].fromLocId).toBeNull()
    expect(plan.moves[0].fromName).toBe('Float pool')
    expect(plan.summary.fromFloat).toBe(1)
  })

  it('names the donor unit and confirms it stays green', () => {
    const states = build([
      { id: 'donor', points: 4, staff: 4 },
      { id: 'critical', points: 20, staff: 4 },
    ])
    const plan = planMoves(states, optimizeAllocation(states, { floatStaff: 0 }))
    expect(plan.moves).toHaveLength(1)
    expect(plan.moves[0].fromName).toBe('donor')
    expect(plan.moves[0].donorStageAfter).toBe('GREEN')
    expect(plan.summary.fromUnits).toBe(1)
  })

  it('shows the acuity each move buys', () => {
    const states = build([{ id: 'critical', points: 16, staff: 4 }])
    const plan = planMoves(states, optimizeAllocation(states, { floatStaff: 2 }))
    const m = plan.moves[0]
    expect(m.uaiBefore).toBeCloseTo(4)
    expect(m.uaiAfter).toBeLessThan(m.uaiBefore)
    expect(m.staff).toBe(2)
    expect(m.uaiAfter).toBeCloseTo(16 / 6)
  })

  it('counts how many units leave RED', () => {
    const states = build([
      { id: 'a', points: 16, staff: 4 },
      { id: 'b', points: 4, staff: 4 },
    ])
    const plan = planMoves(states, optimizeAllocation(states, { floatStaff: 4 }))
    expect(plan.summary.redBefore).toBe(1)
    expect(plan.summary.redAfter).toBe(0)
  })

  it('returns no moves for a healthy system', () => {
    const states = build([{ id: 'a', points: 4, staff: 4 }])
    const plan = planMoves(states, optimizeAllocation(states, { floatStaff: 2 }))
    expect(plan.moves).toEqual([])
    expect(plan.summary.improvement).toBe(0)
  })

  it('carries breach probability through when a forecast is available', () => {
    const states = build([{ id: 'a', points: 16, staff: 4 }])
    const forecasts = {
      a: { ok: true, points: [{ p50: 4, residuals: [-0.4, -0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.4, 0.5], residualScale: 1, slot: 5 }] },
    }
    const plan = planMoves(states, optimizeAllocation(states, { floatStaff: 3 }), { forecasts })
    const m = plan.moves[0]
    expect(m.pRedBefore).toBeGreaterThan(m.pRedAfter)
  })
})

describe('recommendDeployment', () => {
  it('goes from raw app state to an executable plan', () => {
    const locations = [loc('calm'), loc('critical'), loc('ed', { type: 'ed' })]
    const entries = entriesFor([
      { id: 'calm', points: 4, staff: 4 },
      { id: 'critical', points: 20, staff: 4, census: 18 },
      { id: 'ed', points: 30, staff: null },
    ])
    const plan = recommendDeployment({ locations, entries, thresholds: DEFAULT_THRESHOLDS, floatStaff: 2 })
    expect(plan.ok).toBe(true)
    expect(plan.moves.length).toBeGreaterThan(0)
    expect(plan.moves.every((m) => m.toName === 'critical')).toBe(true)
    expect(plan.summary.redAfter).toBeLessThanOrEqual(plan.summary.redBefore)
  })

  it('reports when there is nothing it can act on', () => {
    const plan = recommendDeployment({ locations: [loc('a')], entries: [], thresholds: DEFAULT_THRESHOLDS, floatStaff: 2 })
    expect(plan.ok).toBe(false)
    expect(plan.reason).toBe('no-staffed-units')
  })

  it('deploys ahead of a forecast surge that current readings would not trigger', () => {
    const locations = [loc('a')]
    const entries = entriesFor([{ id: 'a', points: 4, staff: 4 }])
    const forecasts = { a: { ok: true, points: [{ p50: 3.0, residuals: [], residualScale: 1, slot: 9 }] } }

    const now = recommendDeployment({ locations, entries, thresholds: DEFAULT_THRESHOLDS, floatStaff: 2, mode: 'current' })
    const ahead = recommendDeployment({ locations, entries, thresholds: DEFAULT_THRESHOLDS, forecasts, floatStaff: 2, mode: 'forecast' })

    expect(now.moves).toHaveLength(0)
    expect(ahead.moves.length).toBeGreaterThan(0)
    expect(ahead.mode).toBe('forecast')
  })
})
