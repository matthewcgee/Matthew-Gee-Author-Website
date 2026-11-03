import { describe, it, expect } from 'vitest'
import {
  planTarget, snapshotPlan, evaluatePlan, adherenceSummary,
  calibrationPairs, calibrationSummary, regionCalibration,
  opOutcomeSummary, thresholdFeedback, FIRST_VISIT,
} from '../outcomes.js'
import { dayIndex } from '../forecast.js'
import { DEFAULT_THRESHOLDS } from '../model.js'
import { buildDemoScenario } from '../demoData.js'

const TH = DEFAULT_THRESHOLDS
const U1 = { id: 'u1', name: '1 South A', type: 'inpatient', thresholds: null }
const U2 = { id: 'u2', name: '2 North', type: 'inpatient', thresholds: null }

function makeEntries(locId, count, valueFn, { staff = 4, startDate = '2026-01-05' } = {}) {
  const out = []
  const start = dayIndex(startDate)
  for (let i = 0; i < count; i++) {
    const day = start + Math.floor(i / 2)
    out.push({
      id: `${locId}_${i}`, locId,
      date: new Date(day * 86400000).toISOString().slice(0, 10),
      shift: i % 2 === 0 ? 'AM' : 'PM',
      census: 12, points: valueFn(i) * staff, staff, createdAt: 1000 + i,
    })
  }
  return out
}

const plan = {
  ok: true,
  mode: 'forecast',
  moves: [
    { toLocId: 'u1', toName: '1 South A', fromLocId: null, fromName: 'Float pool', staff: 1, stageBefore: 'RED', stageAfter: 'YELLOW', pRedBefore: 0.8, pRedAfter: 0.3 },
    { toLocId: 'u2', toName: '2 North', fromLocId: null, fromName: 'Float pool', staff: 2, stageBefore: 'RED', stageAfter: 'GREEN', pRedBefore: 0.7, pRedAfter: 0.1 },
  ],
  summary: { redBefore: 2, redAfter: 0, staffPlaced: 3 },
}

describe('plan snapshots and targets', () => {
  it('targets the shift after the newest reading in forecast mode, the newest shift itself in current mode', () => {
    const entries = makeEntries('u1', 3, () => 1) // AM, PM, AM on consecutive days
    const last = entries[entries.length - 1]
    expect(planTarget(entries, 'current')).toEqual({ date: last.date, shift: last.shift })
    expect(planTarget(entries, 'forecast')).toEqual({ date: last.date, shift: 'PM' })
    expect(planTarget([], 'forecast')).toBeNull()
  })

  it('freezes the moves and predictions of a plan', () => {
    const snap = snapshotPlan({ plan, target: { date: '2026-02-01', shift: 'AM' }, mode: 'forecast', floatStaff: 3, now: 5 })
    expect(snap.targetDate).toBe('2026-02-01')
    expect(snap.moves).toHaveLength(2)
    expect(snap.moves[0].pRedBefore).toBe(0.8)
    expect(snap.summary.staffPlaced).toBe(3)
  })

  it('records nothing for an empty or failed plan', () => {
    expect(snapshotPlan({ plan: { ok: true, moves: [] }, target: { date: 'x', shift: 'AM' } })).toBeNull()
    expect(snapshotPlan({ plan: { ok: false }, target: { date: 'x', shift: 'AM' } })).toBeNull()
  })
})

describe('evaluating a recorded plan', () => {
  const snap = snapshotPlan({ plan, target: { date: '2026-02-01', shift: 'AM' }, mode: 'forecast', now: 1 })
  const locations = [U1, U2]

  it('marks a move followed when enough deployments were logged, and reads the outcome from the next reading', () => {
    const deployments = [{ toLocId: 'u1', date: '2026-02-01', shift: 'AM' }]
    const entries = [
      { locId: 'u1', date: '2026-02-01', shift: 'AM', points: 8, staff: 5, createdAt: 1 },  // 1.6 → YELLOW
      { locId: 'u2', date: '2026-02-01', shift: 'AM', points: 14, staff: 5, createdAt: 1 }, // 2.8 → RED
    ]
    const ev = evaluatePlan(snap, { entries, deployments, locations, thresholds: TH })
    expect(ev.moves[0].followed).toBe('full')
    expect(ev.moves[0].outcome).toBe('avoided')
    expect(ev.moves[1].followed).toBe('none')
    expect(ev.moves[1].outcome).toBe('red')
    expect(ev.resolved).toBe(true)
    expect(ev.adherence).toBe(0.5)
  })

  it('reports partial adherence and keeps outcomes pending until the shift is logged', () => {
    const deployments = [{ toLocId: 'u2', date: '2026-02-01', shift: 'AM' }]
    const ev = evaluatePlan(snap, { entries: [], deployments, locations, thresholds: TH })
    expect(ev.moves[1].followed).toBe('partial')
    expect(ev.moves.every((m) => m.outcome === 'pending')).toBe(true)
    expect(ev.resolved).toBe(false)
  })

  it('compares followed with not-followed moves against what each side was predicted to do', () => {
    const evals = [
      { moves: [
        { followed: 'full', outcome: 'avoided', pRedBefore: 0.8, pRedAfter: 0.2 },
        { followed: 'full', outcome: 'avoided', pRedBefore: 0.6, pRedAfter: 0.2 },
        { followed: 'none', outcome: 'red', pRedBefore: 0.7, pRedAfter: 0.2 },
        { followed: 'none', outcome: 'avoided', pRedBefore: 0.5, pRedAfter: 0.1 },
        { followed: 'none', outcome: 'pending', pRedBefore: 0.5, pRedAfter: 0.1 },
      ] },
    ]
    const s = adherenceSummary(evals)
    expect(s.moves).toBe(5)
    expect(s.resolvedMoves).toBe(4)
    expect(s.pendingMoves).toBe(1)
    expect(s.followed.redRate).toBe(0)
    expect(s.notFollowed.redRate).toBe(0.5)
    expect(s.redReduction).toBe(0.5)
    expect(s.followed.predictedRedRate).toBeCloseTo(0.2)
    expect(s.notFollowed.predictedRedRate).toBeCloseTo(0.6)
    expect(s.adherenceRate).toBeCloseTo(0.4)
  })
})

describe('forecast calibration', () => {
  it('scores a perfect forecaster as perfectly calibrated and a constant one with no skill', () => {
    const perfect = [
      { p: 1, y: 1 }, { p: 0, y: 0 }, { p: 1, y: 1 }, { p: 0, y: 0 },
    ]
    const s = calibrationSummary(perfect)
    expect(s.brier).toBe(0)
    expect(s.skill).toBe(1)
    const constant = [{ p: 0.5, y: 1 }, { p: 0.5, y: 0 }]
    expect(calibrationSummary(constant).skill).toBeCloseTo(0)
  })

  it('returns an empty summary when there is nothing to score', () => {
    expect(calibrationSummary([])).toMatchObject({ n: 0, brier: null })
  })

  it('bins predictions so predicted and observed rates can be compared band by band', () => {
    const pairs = [
      { p: 0.05, y: 0 }, { p: 0.05, y: 0 }, { p: 0.95, y: 1 }, { p: 0.95, y: 0 },
    ]
    const s = calibrationSummary(pairs)
    const low = s.bins.find((b) => b.lo === 0)
    const high = s.bins.find((b) => b.lo === 0.9)
    expect(low.n).toBe(2)
    expect(low.observed).toBe(0)
    expect(high.n).toBe(2)
    expect(high.observed).toBe(0.5)
  })

  it('uses only genuine one-shift-ahead predictions built from earlier shifts', () => {
    const entries = makeEntries('u1', 40, (i) => (i % 4 === 3 ? 3.0 : 1.2))
    const pairs = calibrationPairs(entries, U1, TH, { window: 20 })
    expect(pairs.length).toBeGreaterThan(10)
    for (const q of pairs) {
      expect(q.p).toBeGreaterThanOrEqual(0)
      expect(q.p).toBeLessThanOrEqual(1)
      expect([0, 1]).toContain(q.y)
    }
  })

  it('runs across the demonstration region and earns positive skill on its predictable units', () => {
    const demo = buildDemoScenario()
    const t0 = Date.now()
    const { overall, perUnit } = regionCalibration(demo.entries, demo.locations, TH, { window: 24 })
    expect(Date.now() - t0).toBeLessThan(15000)
    expect(perUnit.length).toBeGreaterThan(3)
    expect(overall.n).toBeGreaterThan(50)
    expect(overall.skill).toBeGreaterThan(0.3)
    expect(overall.ece).toBeLessThan(0.1)
  })
})

describe('outpatient placement outcomes', () => {
  const patients = [
    ...Array.from({ length: 10 }, (_, i) => ({ id: `d${i}`, tier: '1-direct', requiresAttending: false, program: 'Therapy only' })),
    ...Array.from({ length: 10 }, (_, i) => ({ id: `f${i}`, tier: '2-full', requiresAttending: i < 5, program: 'Medication management' })),
  ]
  const outcomes = [
    ...Array.from({ length: 10 }, (_, i) => ({ patientId: `d${i}`, firstVisit: i < 5 ? FIRST_VISIT.NO_SHOW : FIRST_VISIT.ATTENDED, retained30: i >= 5, steppedUp: i < 4 })),
    ...Array.from({ length: 10 }, (_, i) => ({ patientId: `f${i}`, firstVisit: FIRST_VISIT.ATTENDED, retained30: true, steppedUp: i === 0 })),
  ]

  it('computes attendance, retention and step-up rates by tier, physician level and clinic', () => {
    const s = opOutcomeSummary(patients, outcomes)
    expect(s.overall.tracked).toBe(20)
    expect(s.byTier['1-direct'].stepUpRate).toBeCloseTo(0.4)
    expect(s.byTier['2-full'].stepUpRate).toBeCloseTo(0.1)
    expect(s.byTier['1-direct'].attendedRate).toBeCloseTo(0.5)
    expect(s.byClinic['Medication management'].retainedRate).toBe(1)
    expect(s.byPhysician.attending.tracked).toBe(5)
  })

  it('raises a review prompt only when the evidence clears both the sample and the gap', () => {
    const s = opOutcomeSummary(patients, outcomes)
    const fb = thresholdFeedback(s, { minN: 8 })
    expect(fb.map((f) => f.id)).toContain('tier1-permissive')
    expect(fb.map((f) => f.id)).toContain('noshow-Therapy only')
    // too little data → silent
    expect(thresholdFeedback(s, { minN: 50 })).toEqual([])
  })
})

describe('closed cases', () => {
  it('keeps counting an outcome after its case leaves the caseload, from the placement snapshot', async () => {
    const { placementSnapshot } = await import('../outcomes.js')
    const p = { id: 'gone', tier: '1-direct', requiresAttending: false, program: 'Therapy only' }
    const outcomes = [{ patientId: 'gone', placement: placementSnapshot(p), firstVisit: 'attended', steppedUp: true }]
    const s = opOutcomeSummary([], outcomes)
    expect(s.overall.tracked).toBe(1)
    expect(s.byTier['1-direct'].stepUpRate).toBe(1)
    expect(s.byPhysician.resident.tracked).toBe(1)
  })
})
