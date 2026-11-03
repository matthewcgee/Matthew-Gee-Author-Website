import { describe, it, expect } from 'vitest'
import { capacityOutlook, boardingHistory, CAPACITY_STATUS } from '../capacity.js'
import { eventRatesByStage, nextShiftEventRisk, unitEventRisks, eventCounts, VIOLENCE_TYPES } from '../safety.js'
import {
  buildDemoScenario, buildSampleData, buildSampleOutpatient, sampleOutcomeHistory,
} from '../demoData.js'
import { forecastLocation } from '../forecast.js'
import { assessForecast } from '../risk.js'
import { DEFAULT_THRESHOLDS } from '../model.js'
import { evaluatePlan, adherenceSummary, opOutcomeSummary, thresholdFeedback } from '../outcomes.js'
import { fuhRates, fuhWorklist } from '../fuh.js'
import { caseloadMbc } from '../mbc.js'
import { today } from '../storage.js'

const TH = DEFAULT_THRESHOLDS
const demo = buildDemoScenario()

describe('capacity and boarding outlook', () => {
  it('sets projected open beds against forecast ED boarding, shift by shift', () => {
    const o = capacityOutlook({ locations: demo.locations, entries: demo.entries, thresholds: TH, caps: demo.caps, horizon: 6 })
    expect(o.ok).toBe(true)
    expect(o.horizons).toHaveLength(6)
    for (const h of o.horizons) {
      expect(h.openBeds).toBeGreaterThanOrEqual(0)
      expect(h.boarders).toBeGreaterThanOrEqual(0)
      expect(h.gap).toBeCloseTo(h.openBeds - h.boarders)
      expect(Object.values(CAPACITY_STATUS)).toContain(h.status)
      expect(h.pBoarding).toBeGreaterThanOrEqual(0)
      expect(h.pBoarding).toBeLessThanOrEqual(1)
    }
    expect(o.beds.length).toBeGreaterThan(3)
  })

  it('says why when there is no boarding history to forecast from', () => {
    const noBoarding = demo.entries.map(({ boarders, boardingHours, bhArrivals, ...e }) => e)
    const o = capacityOutlook({ locations: demo.locations, entries: noBoarding, thresholds: TH, caps: demo.caps })
    expect(o.ok).toBe(false)
    expect(o.reason).toBe('no-boarding-history')
  })

  it('reports a daily boarding trend', () => {
    const h = boardingHistory(demo.entries, demo.locations, TH, { days: 7 })
    expect(h).toHaveLength(7)
    expect(h.every((d) => d.boardingHours >= 0)).toBe(true)
  })
})

describe('safety-event risk', () => {
  const sample = buildSampleData()

  it('measures event rates per acuity stage against the same unit-shift readings', () => {
    const r = eventRatesByStage({ events: sample.safetyEvents, entries: sample.entries, locations: sample.locations, thresholds: TH })
    expect(r.totalEvents).toBeGreaterThan(20)
    expect(r.unmatched).toBe(0)
    expect(r.byStage.GREEN.shifts).toBeGreaterThan(0)
    // The sample is built so events rise with acuity; the module must see it.
    expect(r.byStage.RED.rate).toBeGreaterThan(r.byStage.GREEN.rate)
    expect(r.byStage.RED.relativeRisk).toBeGreaterThan(1.5)
  })

  it('filters by event type', () => {
    const all = eventRatesByStage({ events: sample.safetyEvents, entries: sample.entries, locations: sample.locations, thresholds: TH })
    const violent = eventRatesByStage({ events: sample.safetyEvents, entries: sample.entries, locations: sample.locations, thresholds: TH, types: VIOLENCE_TYPES })
    expect(violent.totalEvents).toBeLessThanOrEqual(all.totalEvents)
  })

  it('turns forecast stage probabilities into a chance of at least one event', () => {
    const rates = { overallRate: 0.05, byStage: { GREEN: { rate: 0.02 }, YELLOW: { rate: 0.06 }, RED: { rate: 0.2 } } }
    const calm = nextShiftEventRisk({ GREEN: 1, YELLOW: 0, RED: 0 }, rates)
    const hot = nextShiftEventRisk({ GREEN: 0, YELLOW: 0.2, RED: 0.8 }, rates)
    expect(calm.expectedEvents).toBeCloseTo(0.02)
    expect(hot.pAtLeastOne).toBeGreaterThan(calm.pAtLeastOne)
    expect(hot.pAtLeastOne).toBeCloseTo(1 - Math.exp(-(0.2 * 0.06 + 0.8 * 0.2)))
    expect(nextShiftEventRisk(null, rates)).toBeNull()
  })

  it('ranks units by next-shift risk, putting the drifting unit near the top', () => {
    const rates = eventRatesByStage({ events: sample.safetyEvents, entries: sample.entries, locations: sample.locations, thresholds: TH })
    const units = sample.locations.map((loc) => ({ loc, assessment: assessForecast(forecastLocation(sample.entries, loc, TH, { horizon: 2 }), loc, TH) }))
    const ranked = unitEventRisks(units, rates)
    expect(ranked.length).toBeGreaterThan(3)
    expect(ranked.slice(0, 3).map((r) => r.loc.id)).toContain('demo_1sa')
  })

  it('counts events by type and unit in a window', () => {
    const c = eventCounts([{ type: 'restraint', locId: 'a', date: '2026-01-02' }, { type: 'restraint', locId: 'b', date: '2025-12-01' }], { from: '2026-01-01' })
    expect(c.total).toBe(1)
    expect(c.byType.restraint).toBe(1)
  })
})

describe('sample outcome history', () => {
  const sample = buildSampleData()

  it('records real optimizer plans, follows about two-thirds of moves, and shows following them worked', () => {
    expect(sample.planLog.length).toBeGreaterThan(8)
    const evals = sample.planLog.map((p) => evaluatePlan(p, { entries: sample.entries, deployments: sample.deployments, locations: sample.locations, thresholds: TH }))
    const s = adherenceSummary(evals)
    expect(s.resolvedMoves).toBeGreaterThan(8)
    expect(s.adherenceRate).toBeGreaterThan(0.4)
    expect(s.adherenceRate).toBeLessThan(0.9)
    expect(s.followed.redRate).toBeLessThan(s.notFollowed.redRate)
  })

  it('leaves the current board exactly as the live scenario draws it', () => {
    const h = sampleOutcomeHistory(demo)
    const lastTwo = (es) => es.filter((e) => e.date === demo.entries.at(-1).date)
    expect(lastTwo(h.entries).map((e) => e.staff)).toEqual(lastTwo(demo.entries).map((e) => e.staff))
  })
})

describe('sample outpatient additions', () => {
  const op = buildSampleOutpatient()

  it('gives a plausible FUH picture with a worklist to act on', () => {
    const r = fuhRates(op.discharges, today())
    expect(r.fuh7.rate).toBeGreaterThan(0.3)
    expect(r.fuh7.rate).toBeLessThan(0.9)
    expect(r.fuh30.rate).toBeGreaterThan(r.fuh7.rate)
    const list = fuhWorklist(op.discharges, today())
    expect(list.length).toBeGreaterThanOrEqual(4)
    expect(list[0].action).toMatch(/Not scheduled/)
  })

  it('includes an urgent self-harm flag and a worsening score on the MBC caseload', () => {
    const rows = caseloadMbc(op.patients, op.assessments, { asOf: today() })
    expect(rows[0].top).toBe('urgent')
    expect(rows.some((r) => r.triggers.some((t) => t.id.startsWith('worse-')))).toBe(true)
    expect(rows.some((r) => r.phq?.response)).toBe(true)
  })

  it('produces review prompts from the historical outcomes', () => {
    const fb = thresholdFeedback(opOutcomeSummary(op.patients, op.outcomes))
    const ids = fb.map((f) => f.id)
    expect(ids).toContain('tier1-permissive')
    expect(ids).toContain('noshow-Substance use program')
    expect(ids).not.toContain('attending-threshold-high')
  })
})
