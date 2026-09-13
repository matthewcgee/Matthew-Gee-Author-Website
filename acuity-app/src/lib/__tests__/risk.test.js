import { describe, it, expect } from 'vitest'
import {
  normalCdf,
  probabilityAbove,
  stageProbabilities,
  assessForecast,
  driftSignal,
  explainForecast,
  decomposeUai,
  assessCensus,
  riskBand,
} from '../risk.js'
import { buildSeries, forecastSeries, dayIndex } from '../forecast.js'
import { DEFAULT_THRESHOLDS, thresholdsFor } from '../model.js'

const IP = { id: 'u1', name: '1 South A', type: 'inpatient', censusCap: 18, thresholds: null }
const TH = DEFAULT_THRESHOLDS.inpatient

function makeEntries(locId, count, valueFn, { staff = 4, census = 12, startDate = '2026-01-05' } = {}) {
  const out = []
  const start = dayIndex(startDate)
  for (let i = 0; i < count; i++) {
    const day = start + Math.floor(i / 2)
    const date = new Date(day * 86400000).toISOString().slice(0, 10)
    const uai = valueFn(i)
    out.push({
      id: `e${i}`,
      locId,
      date,
      shift: i % 2 === 0 ? 'AM' : 'PM',
      census,
      points: uai * staff,
      staff,
      createdAt: 1000 + i,
    })
  }
  return out
}

// A forecast point with a controllable spread, for testing probabilities in
// isolation from the forecasting machinery.
function point(p50, residuals = [], residualScale = 1) {
  return { p50, residuals, residualScale, slot: 1000, horizon: 1 }
}

const SPREAD = [-0.6, -0.4, -0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6]

describe('normalCdf', () => {
  it('matches known values', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6)
    expect(normalCdf(1.6449)).toBeCloseTo(0.95, 3)
    expect(normalCdf(-1.6449)).toBeCloseTo(0.05, 3)
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3)
  })

  it('is monotonic and bounded', () => {
    let prev = 0
    for (let z = -4; z <= 4; z += 0.25) {
      const v = normalCdf(z)
      expect(v).toBeGreaterThanOrEqual(prev)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
      prev = v
    }
  })
})

describe('probabilityAbove', () => {
  it('falls as the threshold rises', () => {
    const p = point(2.0, SPREAD)
    const low = probabilityAbove(p, 1.5)
    const mid = probabilityAbove(p, 2.0)
    const high = probabilityAbove(p, 2.5)
    expect(low).toBeGreaterThan(mid)
    expect(mid).toBeGreaterThan(high)
  })

  it('sits near one half when the threshold equals the prediction', () => {
    expect(probabilityAbove(point(2.0, SPREAD), 2.0)).toBeCloseTo(0.5, 1)
  })

  it('stays strictly between 0 and 1 so a small sample cannot imply certainty', () => {
    const p = point(1.0, SPREAD)
    expect(probabilityAbove(p, 99)).toBeGreaterThan(0)
    expect(probabilityAbove(p, 99)).toBeLessThan(1)
    expect(probabilityAbove(p, -99)).toBeLessThan(1)
  })

  it('widens with the horizon scale factor', () => {
    const near = probabilityAbove(point(2.0, SPREAD, 1), 2.4)
    const far = probabilityAbove(point(2.0, SPREAD, 2), 2.4)
    expect(far).toBeGreaterThan(near)
  })

  it('falls back to a normal approximation when residuals are scarce', () => {
    const p = probabilityAbove(point(2.0, [0.1, -0.1]), 2.0)
    expect(p).toBeCloseTo(0.5, 1)
  })

  it('returns null when there is nothing to compare against', () => {
    expect(probabilityAbove(null, 2)).toBeNull()
    expect(probabilityAbove(point(2, SPREAD), null)).toBeNull()
  })
})

describe('stageProbabilities', () => {
  it('sums to one', () => {
    for (const v of [0.5, 1.5, 2.0, 2.5, 4.0]) {
      const probs = stageProbabilities(point(v, SPREAD), TH)
      expect(probs.GREEN + probs.YELLOW + probs.RED).toBeCloseTo(1, 6)
    }
  })

  it('puts the most weight on the stage the prediction lands in', () => {
    expect(stageProbabilities(point(0.8, SPREAD), TH).GREEN).toBeGreaterThan(0.5)
    expect(stageProbabilities(point(4.0, SPREAD), TH).RED).toBeGreaterThan(0.5)
  })

  it('shifts weight toward RED as the prediction climbs', () => {
    const low = stageProbabilities(point(1.0, SPREAD), TH).RED
    const high = stageProbabilities(point(3.0, SPREAD), TH).RED
    expect(high).toBeGreaterThan(low)
  })
})

describe('riskBand', () => {
  it('escalates with probability', () => {
    expect(riskBand(0.05).id).toBe('low')
    expect(riskBand(0.35).id).toBe('elevated')
    expect(riskBand(0.65).id).toBe('high')
    expect(riskBand(0.95).id).toBe('critical')
  })
})

describe('assessForecast', () => {
  it('reports no assessment when the forecast could not run', () => {
    const a = assessForecast({ ok: false, reason: 'thin-history' }, IP, DEFAULT_THRESHOLDS)
    expect(a.ok).toBe(false)
    expect(a.reason).toBe('thin-history')
  })

  it('flags a unit forecast to cross into RED and gives its runway', () => {
    // Climbing steadily from green through the 2.5 red line.
    const series = buildSeries(makeEntries('u1', 60, (i) => 1.0 + i * 0.03), IP, DEFAULT_THRESHOLDS)
    const f = forecastSeries(series, { horizon: 6 })
    const a = assessForecast(f, IP, DEFAULT_THRESHOLDS)
    expect(a.ok).toBe(true)
    expect(a.horizons.length).toBe(6)
    expect(a.next.pRed).toBeGreaterThan(0)
    expect(a.peak.pRed).toBeGreaterThanOrEqual(a.next.pRed)
  })

  it('leaves a calm green unit with no breach projected', () => {
    const series = buildSeries(makeEntries('u1', 60, () => 0.8), IP, DEFAULT_THRESHOLDS)
    const a = assessForecast(forecastSeries(series, { horizon: 4 }), IP, DEFAULT_THRESHOLDS)
    expect(a.breachPoint).toBeNull()
    expect(a.shiftsToBreach).toBeNull()
    expect(a.next.stage).toBe('GREEN')
    expect(a.next.pRed).toBeLessThan(0.2)
  })

  it('uses ED thresholds for an ED location', () => {
    const ED = { id: 'ed1', name: 'ED', type: 'ed', thresholds: null }
    const entries = makeEntries('ed1', 40, () => 1).map((e) => ({ ...e, points: 25, staff: null }))
    const series = buildSeries(entries, ED, DEFAULT_THRESHOLDS)
    const a = assessForecast(forecastSeries(series), ED, DEFAULT_THRESHOLDS)
    expect(a.thresholds).toEqual(thresholdsFor(ED, DEFAULT_THRESHOLDS))
    expect(a.thresholds.greenMax).toBe(21)
    // 25 points is above green (21) but at or below yellow (27).
    expect(a.next.stage).toBe('YELLOW')
  })

  it('honors a location-specific threshold override', () => {
    const strict = { ...IP, thresholds: { greenMax: 0.5, yellowMax: 0.9, unit: 'custom' } }
    const series = buildSeries(makeEntries('u1', 40, () => 1.0), strict, DEFAULT_THRESHOLDS)
    const a = assessForecast(forecastSeries(series), strict, DEFAULT_THRESHOLDS)
    expect(a.thresholds.greenMax).toBe(0.5)
    expect(a.next.stage).toBe('RED')
  })
})

describe('driftSignal', () => {
  it('needs some history before charting', () => {
    const series = buildSeries(makeEntries('u1', 4, () => 1), IP, DEFAULT_THRESHOLDS)
    expect(driftSignal(series).ok).toBe(false)
  })

  it('stays stable on a flat unit', () => {
    const series = buildSeries(makeEntries('u1', 40, (i) => 1.2 + (i % 2 === 0 ? 0.02 : -0.02)), IP, DEFAULT_THRESHOLDS)
    const d = driftSignal(series)
    expect(d.ok).toBe(true)
    expect(d.rising).toBe(false)
    expect(d.signal).toBe('stable')
  })

  it('catches a sustained upward shift that no single reading would flag', () => {
    // First half quiet, second half nudged up by well under one threshold step.
    const series = buildSeries(
      makeEntries('u1', 40, (i) => (i < 20 ? 1.0 : 1.35)),
      IP,
      DEFAULT_THRESHOLDS
    )
    const d = driftSignal(series)
    expect(d.ok).toBe(true)
    expect(d.rising).toBe(true)
    expect(d.signal).toBe('rising')
    // Still nowhere near the RED line — that is the point of an early warning.
    expect(Math.max(...series.map((p) => p.value))).toBeLessThan(TH.yellowMax)
  })

  it('builds control limits from the baseline half so drift cannot inflate them', () => {
    const series = buildSeries(makeEntries('u1', 40, (i) => (i < 20 ? 1.0 : 2.0)), IP, DEFAULT_THRESHOLDS)
    const d = driftSignal(series)
    expect(d.mu).toBeCloseTo(1.0, 1)
    expect(d.ucl).toBeGreaterThan(d.mu)
    expect(d.ewma).toBeGreaterThan(d.ucl)
  })

  it('ignores a sustained but clinically trivial creep', () => {
    // A long run above center, but the whole move is a fraction of the unit's
    // own noise — statistically detectable, not worth anyone's attention.
    const series = buildSeries(
      makeEntries('u1', 40, (i) => (i < 20 ? 1.2 : 1.22) + (i % 2 ? 0.05 : -0.05)),
      IP,
      DEFAULT_THRESHOLDS
    )
    const d = driftSignal(series)
    expect(d.runAboveCenter).toBeGreaterThanOrEqual(8)
    expect(d.runSignal).toBe(true)
    expect(d.shiftSigmas).toBeLessThan(1)
    expect(d.drifting).toBe(false)
    expect(d.signal).toBe('stable')
  })

  it('reports how far the unit moved in units of its own noise', () => {
    const series = buildSeries(makeEntries('u1', 40, (i) => (i < 20 ? 1.0 : 1.6)), IP, DEFAULT_THRESHOLDS)
    const d = driftSignal(series)
    expect(d.shift).toBeGreaterThan(0)
    expect(d.shiftSigmas).toBeGreaterThan(1)
  })

  it('charts one point per observation', () => {
    const series = buildSeries(makeEntries('u1', 24, () => 1.1), IP, DEFAULT_THRESHOLDS)
    expect(driftSignal(series).chart).toHaveLength(24)
  })
})

describe('explainForecast', () => {
  it('decomposes a prediction into parts that sum back to it exactly', () => {
    const series = buildSeries(makeEntries('u1', 60, (i) => 1.4 + i * 0.01), IP, DEFAULT_THRESHOLDS)
    const f = forecastSeries(series, { horizon: 4 })
    const e = explainForecast(f, f.points[0])
    const sum = e.parts.reduce((s, p) => s + p.value, 0)
    expect(sum).toBeCloseTo(e.total, 9)
    expect(e.parts.map((p) => p.id)).toEqual(['baseline', 'seasonal', 'momentum'])
  })

  it('attributes a rising forecast to momentum', () => {
    const series = buildSeries(makeEntries('u1', 60, (i) => 1.0 + i * 0.03), IP, DEFAULT_THRESHOLDS)
    const f = forecastSeries(series, { horizon: 4 })
    const e = explainForecast(f, f.points[3])
    expect(e.parts.find((p) => p.id === 'momentum').value).toBeGreaterThan(0)
  })

  it('reports how much evidence backs the shift-of-week term', () => {
    const series = buildSeries(makeEntries('u1', 60, () => 1.5), IP, DEFAULT_THRESHOLDS)
    const f = forecastSeries(series)
    const e = explainForecast(f, f.points[0])
    expect(e.parts.find((p) => p.id === 'seasonal').evidence).toBeGreaterThan(0)
  })

  it('returns null without a forecast', () => {
    expect(explainForecast({ ok: false }, null)).toBeNull()
  })
})

describe('decomposeUai', () => {
  it('splits a change exactly into acuity and staffing parts', () => {
    const cases = [
      [{ points: 8, staff: 4 }, { points: 12, staff: 4 }],
      [{ points: 8, staff: 4 }, { points: 8, staff: 3 }],
      [{ points: 8, staff: 4 }, { points: 14, staff: 5 }],
      [{ points: 20, staff: 5 }, { points: 10, staff: 2 }],
    ]
    for (const [prev, curr] of cases) {
      const d = decomposeUai(prev, curr)
      expect(d.fromPoints + d.fromStaff).toBeCloseTo(d.delta, 9)
      expect(d.to - d.from).toBeCloseTo(d.delta, 9)
    }
  })

  it('names acuity as the driver when points rose and staffing held', () => {
    const d = decomposeUai({ points: 8, staff: 4 }, { points: 16, staff: 4 })
    expect(d.driver).toBe('acuity')
    expect(d.fromStaff).toBeCloseTo(0, 9)
    expect(d.pointsChange).toBe(8)
  })

  it('names staffing as the driver when a nurse was pulled', () => {
    const d = decomposeUai({ points: 8, staff: 4 }, { points: 8, staff: 2 })
    expect(d.driver).toBe('staffing')
    expect(d.fromPoints).toBeCloseTo(0, 9)
    expect(d.staffChange).toBe(-2)
    expect(d.delta).toBeCloseTo(2, 9)
  })

  it('declines rather than dividing by zero staff', () => {
    expect(decomposeUai({ points: 8, staff: 0 }, { points: 8, staff: 4 })).toBeNull()
    expect(decomposeUai({ points: 8, staff: 4 }, { points: 8, staff: 0 })).toBeNull()
    expect(decomposeUai(null, { points: 8, staff: 4 })).toBeNull()
  })
})

describe('assessCensus', () => {
  it('needs a cap to assess against', () => {
    const series = buildSeries(makeEntries('u1', 40, () => 1), IP, DEFAULT_THRESHOLDS, 'census')
    const f = forecastSeries(series)
    expect(assessCensus(f, null).reason).toBe('no-cap')
  })

  it('reports headroom and over-cap risk', () => {
    const entries = makeEntries('u1', 40, () => 1, { census: 14 })
    const series = buildSeries(entries, IP, DEFAULT_THRESHOLDS, 'census')
    const c = assessCensus(forecastSeries(series, { horizon: 4 }), 18)
    expect(c.ok).toBe(true)
    expect(c.next.headroom).toBeCloseTo(4, 0)
    expect(c.next.pOverCap).toBeLessThan(0.5)
    expect(c.shiftsToOverCap).toBeNull()
  })

  it('flags a unit forecast to run over its cap', () => {
    // Census climbing past a cap of 18.
    const entries = makeEntries('u1', 60, () => 1).map((e, i) => ({ ...e, census: 10 + i * 0.25 }))
    const series = buildSeries(entries, IP, DEFAULT_THRESHOLDS, 'census')
    const c = assessCensus(forecastSeries(series, { horizon: 4 }), 18)
    expect(c.ok).toBe(true)
    expect(c.next.p50).toBeGreaterThan(18)
    expect(c.shiftsToOverCap).toBe(1)
    expect(c.peakPOverCap).toBeGreaterThan(0.5)
  })
})
