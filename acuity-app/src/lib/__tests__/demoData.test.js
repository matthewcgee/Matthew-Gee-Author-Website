import { describe, it, expect } from 'vitest'
import { buildDemoScenario } from '../demoData.js'
import { forecastLocation, buildSeries, slotIndex } from '../forecast.js'
import { assessForecast, driftSignal, assessCensus } from '../risk.js'
import { recommendDeployment } from '../optimize.js'
import { DEFAULT_THRESHOLDS } from '../model.js'
import { today } from '../storage.js'

const scenario = buildDemoScenario()
const locById = (id) => scenario.locations.find((l) => l.id === id)

describe('demo scenario shape', () => {
  it('is fully stamped as demo data so it cannot be mistaken for live data', () => {
    expect(scenario.locations.every((l) => l.demo === true)).toBe(true)
    expect(scenario.entries.every((e) => e.demo === true)).toBe(true)
    expect(scenario.entries.every((e) => e.pilot === false)).toBe(true)
  })

  it('is deterministic', () => {
    const again = buildDemoScenario()
    expect(again.entries.length).toBe(scenario.entries.length)
    expect(again.entries[0].points).toBe(scenario.entries[0].points)
    expect(again.entries.at(-1).points).toBe(scenario.entries.at(-1).points)
  })

  it('ends at the current shift so forecasts project from now', () => {
    const newest = Math.max(...scenario.entries.map((e) => slotIndex(e.date, e.shift)))
    expect(newest).toBe(slotIndex(today(), 'PM'))
  })

  it('produces consecutive slots with no duplicates per unit', () => {
    for (const loc of scenario.locations) {
      const slots = scenario.entries
        .filter((e) => e.locId === loc.id)
        .map((e) => slotIndex(e.date, e.shift))
        .sort((a, b) => a - b)
      expect(new Set(slots).size).toBe(slots.length)
      for (let i = 1; i < slots.length; i++) expect(slots[i] - slots[i - 1]).toBe(1)
    }
  })

  it('keeps every value physically plausible', () => {
    for (const e of scenario.entries) {
      expect(e.points).toBeGreaterThanOrEqual(0)
      if (e.staff != null) expect(e.staff).toBeGreaterThanOrEqual(2)
      if (e.census != null) expect(e.census).toBeGreaterThanOrEqual(1)
    }
  })

  it('gives the new unit only a few shifts of history', () => {
    expect(scenario.entries.filter((e) => e.locId === 'demo_new')).toHaveLength(4)
  })
})

describe('engine behavior across the scenario', () => {
  it('forecasts the drifting unit upward and flags breach risk', () => {
    const loc = locById('demo_1sa')
    const f = forecastLocation(scenario.entries, loc, DEFAULT_THRESHOLDS, { horizon: 6 })
    expect(f.ok).toBe(true)
    const a = assessForecast(f, loc, DEFAULT_THRESHOLDS)
    expect(a.ok).toBe(true)
    // A unit climbing for nine weeks should register meaningful RED risk.
    expect(a.peak.pRed).toBeGreaterThan(0.2)
  })

  it('detects the upward drift on the control chart', () => {
    const series = buildSeries(scenario.entries, locById('demo_1sa'), DEFAULT_THRESHOLDS)
    const d = driftSignal(series)
    expect(d.ok).toBe(true)
    expect(['rising', 'drifting-up']).toContain(d.signal)
  })

  it('holds the stable unit calm and quiet', () => {
    const loc = locById('demo_2n')
    const f = forecastLocation(scenario.entries, loc, DEFAULT_THRESHOLDS, { horizon: 4 })
    const a = assessForecast(f, loc, DEFAULT_THRESHOLDS)
    expect(a.next.stage).toBe('GREEN')
    expect(a.breachPoint).toBeNull()
    expect(driftSignal(f.series).signal).toBe('stable')
  })

  it('learns the Monday AM pattern on the weekly-rhythm unit', () => {
    const loc = locById('demo_3w')
    const f = forecastLocation(scenario.entries, loc, DEFAULT_THRESHOLDS, { horizon: 14 })
    const mondayAmSow = 1 * 2 + 0
    const offsets = f.seasonal.offsets
    // Monday AM should carry the largest positive seasonal offset of the week.
    expect(offsets[mondayAmSow]).toBe(Math.max(...offsets))
    expect(offsets[mondayAmSow]).toBeGreaterThan(0.2)
  })

  it('refuses to claim confidence on the erratic unit', () => {
    const f = forecastLocation(scenario.entries, locById('demo_4e'), DEFAULT_THRESHOLDS)
    expect(f.ok).toBe(true)
    expect(['low', 'moderate']).toContain(f.confidence)
  })

  it('says plainly that the new unit has too little history', () => {
    const f = forecastLocation(scenario.entries, locById('demo_new'), DEFAULT_THRESHOLDS)
    expect(f.ok).toBe(false)
    expect(f.reason).toBe('thin-history')
    expect(f.confidence).toBe('insufficient')
  })

  it('sees the pediatric unit filling toward its cap', () => {
    const loc = locById('demo_5ped')
    const f = forecastLocation(scenario.entries, loc, DEFAULT_THRESHOLDS, { metric: 'census', horizon: 6 })
    const c = assessCensus(f, loc.censusCap)
    expect(c.ok).toBe(true)
    expect(c.peakPOverCap).toBeGreaterThan(0.3)
  })

  it('forecasts ED behavioral health volume', () => {
    const loc = locById('demo_ed')
    const f = forecastLocation(scenario.entries, loc, DEFAULT_THRESHOLDS, { horizon: 4 })
    expect(f.ok).toBe(true)
    expect(f.points[0].p50).toBeGreaterThan(5)
    const a = assessForecast(f, loc, DEFAULT_THRESHOLDS)
    expect(a.thresholds.greenMax).toBe(21)
  })

  it('produces a deployment plan that reduces system risk', () => {
    const forecasts = {}
    for (const loc of scenario.locations) {
      forecasts[loc.id] = forecastLocation(scenario.entries, loc, DEFAULT_THRESHOLDS, { horizon: 4 })
    }
    const plan = recommendDeployment({
      locations: scenario.locations,
      entries: scenario.entries,
      thresholds: DEFAULT_THRESHOLDS,
      forecasts,
      floatStaff: 2,
      mode: 'forecast',
    })
    expect(plan.ok).toBe(true)
    expect(plan.summary.riskAfter).toBeLessThanOrEqual(plan.summary.riskBefore)
    expect(plan.summary.exact).toBe(true)
    // The ED has no staffing denominator, so it is never a move target.
    expect(plan.moves.every((m) => m.toLocId !== 'demo_ed')).toBe(true)
    // Never recommends more from the float pool than exists.
    expect(plan.summary.fromFloat).toBeLessThanOrEqual(2)
  })

  it('runs the whole pipeline for every unit without throwing', () => {
    for (const loc of scenario.locations) {
      const f = forecastLocation(scenario.entries, loc, DEFAULT_THRESHOLDS, { horizon: 4 })
      const a = assessForecast(f, loc, DEFAULT_THRESHOLDS)
      expect(typeof a.ok).toBe('boolean')
      const series = buildSeries(scenario.entries, loc, DEFAULT_THRESHOLDS)
      expect(() => driftSignal(series)).not.toThrow()
    }
  })
})
