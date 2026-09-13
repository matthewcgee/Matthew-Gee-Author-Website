import { describe, it, expect } from 'vitest'
import {
  dayIndex,
  slotIndex,
  slotToDateShift,
  weekdayOf,
  slotOfWeek,
  labelSlotOfWeek,
  quantile,
  median,
  buildSeries,
  seasonalProfile,
  forecastSeries,
  forecastLocation,
  SEASON_LENGTH,
} from '../forecast.js'
import { DEFAULT_THRESHOLDS } from '../model.js'

const IP = { id: 'u1', name: '1 South A', type: 'inpatient', censusCap: 18, thresholds: null }
const ED = { id: 'ed1', name: 'Emergency Department', type: 'ed', censusCap: null, thresholds: null }

// Walk forward from a start date, emitting one entry per AM/PM shift.
function makeEntries(locId, count, valueFn, { startDate = '2026-01-05', staff = 4 } = {}) {
  const out = []
  const start = dayIndex(startDate)
  for (let i = 0; i < count; i++) {
    const day = start + Math.floor(i / 2)
    const shift = i % 2 === 0 ? 'AM' : 'PM'
    const date = new Date(day * 86400000).toISOString().slice(0, 10)
    const uai = valueFn(i, date, shift)
    out.push({
      id: `e${i}`,
      locId,
      date,
      shift,
      census: 12,
      points: uai * staff,
      staff,
      createdAt: 1000 + i,
    })
  }
  return out
}

describe('time index', () => {
  it('parses dates as UTC so local timezone cannot shift the day', () => {
    expect(dayIndex('1970-01-01')).toBe(0)
    expect(dayIndex('1970-01-02')).toBe(1)
    expect(dayIndex('2026-01-05') - dayIndex('2026-01-04')).toBe(1)
  })

  it('returns null for unusable dates', () => {
    expect(dayIndex(null)).toBeNull()
    expect(dayIndex('')).toBeNull()
    expect(dayIndex('not-a-date')).toBeNull()
  })

  it('orders AM before PM within a day', () => {
    expect(slotIndex('2026-01-05', 'AM')).toBeLessThan(slotIndex('2026-01-05', 'PM'))
    expect(slotIndex('2026-01-05', 'PM')).toBeLessThan(slotIndex('2026-01-06', 'AM'))
  })

  it('round-trips a slot back to its date and shift', () => {
    for (const [date, shift] of [['2026-01-05', 'AM'], ['2026-03-14', 'PM'], ['2026-12-31', 'AM']]) {
      expect(slotToDateShift(slotIndex(date, shift))).toEqual({ date, shift })
    }
  })

  it('maps weekdays correctly (1970-01-01 was a Thursday)', () => {
    expect(weekdayOf('1970-01-01')).toBe(4)
    // 2026-01-05 is a Monday.
    expect(weekdayOf('2026-01-05')).toBe(1)
    expect(weekdayOf('2026-01-11')).toBe(0)
  })

  it('labels shift-of-week slots consistently with the weekday', () => {
    expect(labelSlotOfWeek(slotOfWeek(slotIndex('2026-01-05', 'AM')))).toBe('Mon AM')
    expect(labelSlotOfWeek(slotOfWeek(slotIndex('2026-01-05', 'PM')))).toBe('Mon PM')
    expect(labelSlotOfWeek(slotOfWeek(slotIndex('2026-01-11', 'AM')))).toBe('Sun AM')
  })

  it('repeats the shift-of-week cycle every week', () => {
    const a = slotOfWeek(slotIndex('2026-01-05', 'AM'))
    const b = slotOfWeek(slotIndex('2026-01-12', 'AM'))
    expect(a).toBe(b)
    expect(SEASON_LENGTH).toBe(14)
  })
})

describe('summary statistics', () => {
  it('interpolates quantiles', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5)
    expect(quantile([1, 2, 3], 0)).toBe(1)
    expect(quantile([1, 2, 3], 1)).toBe(3)
  })

  it('handles degenerate input without throwing', () => {
    expect(quantile([], 0.5)).toBe(0)
    expect(quantile([7], 0.9)).toBe(7)
    expect(median([])).toBe(0)
  })
})

describe('buildSeries', () => {
  it('keeps only the requested location', () => {
    const entries = [
      ...makeEntries('u1', 4, () => 1.2),
      ...makeEntries('other', 4, () => 9).map((e, i) => ({ ...e, id: `o${i}` })),
    ]
    const series = buildSeries(entries, IP, DEFAULT_THRESHOLDS)
    expect(series).toHaveLength(4)
    expect(series.every((p) => p.value === 1.2)).toBe(true)
  })

  it('computes acuity per staff for inpatient units', () => {
    const entries = [{ id: 'a', locId: 'u1', date: '2026-01-05', shift: 'AM', points: 12, staff: 4, census: 10, createdAt: 1 }]
    const series = buildSeries(entries, IP, DEFAULT_THRESHOLDS)
    expect(series[0].value).toBeCloseTo(3)
  })

  it('uses raw points for ED locations', () => {
    const entries = [{ id: 'a', locId: 'ed1', date: '2026-01-05', shift: 'AM', points: 24, staff: null, census: null, createdAt: 1 }]
    const series = buildSeries(entries, ED, DEFAULT_THRESHOLDS)
    expect(series[0].value).toBe(24)
  })

  it('resolves duplicate slots to the most recently created entry, matching the Status Board', () => {
    const entries = [
      { id: 'old', locId: 'u1', date: '2026-01-05', shift: 'AM', points: 8, staff: 4, census: 10, createdAt: 100 },
      { id: 'new', locId: 'u1', date: '2026-01-05', shift: 'AM', points: 16, staff: 4, census: 11, createdAt: 200 },
    ]
    const series = buildSeries(entries, IP, DEFAULT_THRESHOLDS)
    expect(series).toHaveLength(1)
    expect(series[0].value).toBeCloseTo(4)
  })

  it('sorts chronologically regardless of input order', () => {
    const entries = makeEntries('u1', 6, (i) => i).reverse()
    const series = buildSeries(entries, IP, DEFAULT_THRESHOLDS)
    const slots = series.map((p) => p.slot)
    expect(slots).toEqual([...slots].sort((a, b) => a - b))
  })

  it('drops entries that cannot produce a finite value', () => {
    const entries = [
      { id: 'a', locId: 'u1', date: '2026-01-05', shift: 'AM', points: 12, staff: 0, census: 10, createdAt: 1 },
      { id: 'b', locId: 'u1', date: 'garbage', shift: 'AM', points: 12, staff: 4, census: 10, createdAt: 2 },
      { id: 'c', locId: 'u1', date: '2026-01-06', shift: 'AM', points: 12, staff: 4, census: 10, createdAt: 3 },
    ]
    const series = buildSeries(entries, IP, DEFAULT_THRESHOLDS)
    // Zero staff yields 0 via safeDiv (finite, kept); the bad date is dropped.
    expect(series.map((p) => p.date)).toEqual(['2026-01-05', '2026-01-06'])
  })

  it('returns an empty series for missing inputs', () => {
    expect(buildSeries(null, IP, DEFAULT_THRESHOLDS)).toEqual([])
    expect(buildSeries([], null, DEFAULT_THRESHOLDS)).toEqual([])
  })

  it('can extract census instead of acuity', () => {
    const entries = makeEntries('u1', 4, () => 1.5)
    const series = buildSeries(entries, IP, DEFAULT_THRESHOLDS, 'census')
    expect(series.every((p) => p.value === 12)).toBe(true)
  })
})

describe('seasonalProfile', () => {
  it('detects a shift-of-week pattern and centers it', () => {
    // Every Monday AM runs 1.0 higher than all other shifts.
    const entries = makeEntries('u1', 56, (i, date, shift) => {
      const mondayAm = weekdayOf(date) === 1 && shift === 'AM'
      return mondayAm ? 3 : 2
    })
    const series = buildSeries(entries, IP, DEFAULT_THRESHOLDS)
    const profile = seasonalProfile(series)
    const mondayAmSow = slotOfWeek(slotIndex('2026-01-05', 'AM'))
    const tuesdayPmSow = slotOfWeek(slotIndex('2026-01-06', 'PM'))
    expect(profile.offsets[mondayAmSow]).toBeGreaterThan(profile.offsets[tuesdayPmSow])
    expect(profile.counts[mondayAmSow]).toBeGreaterThan(1)
  })

  it('shrinks offsets backed by a single observation toward zero', () => {
    // One extreme Monday AM reading, everything else flat.
    const entries = makeEntries('u1', 14, (i, date, shift) =>
      weekdayOf(date) === 1 && shift === 'AM' ? 10 : 2
    )
    const series = buildSeries(entries, IP, DEFAULT_THRESHOLDS)
    const profile = seasonalProfile(series)
    const sow = slotOfWeek(slotIndex('2026-01-05', 'AM'))
    const rawGap = 10 - 2
    // With n=1 the offset is pulled to roughly a third of the raw gap.
    expect(profile.offsets[sow]).toBeLessThan(rawGap * 0.5)
    expect(profile.offsets[sow]).toBeGreaterThan(0)
  })

  it('leaves a flat series with no seasonal structure', () => {
    const series = buildSeries(makeEntries('u1', 28, () => 2), IP, DEFAULT_THRESHOLDS)
    const profile = seasonalProfile(series)
    for (const o of profile.offsets) expect(Math.abs(o)).toBeLessThan(1e-9)
  })
})

describe('forecastSeries', () => {
  it('refuses to forecast with no data', () => {
    const f = forecastSeries([])
    expect(f.ok).toBe(false)
    expect(f.reason).toBe('no-data')
    expect(f.confidence).toBe('insufficient')
  })

  it('refuses to forecast on a handful of readings and says what it needs', () => {
    const series = buildSeries(makeEntries('u1', 3, () => 2), IP, DEFAULT_THRESHOLDS)
    const f = forecastSeries(series)
    expect(f.ok).toBe(false)
    expect(f.reason).toBe('thin-history')
    expect(f.needed).toBeGreaterThan(3)
  })

  it('predicts a constant series as that constant', () => {
    const series = buildSeries(makeEntries('u1', 30, () => 2.0), IP, DEFAULT_THRESHOLDS)
    const f = forecastSeries(series, { horizon: 4 })
    expect(f.ok).toBe(true)
    for (const p of f.points) expect(p.p50).toBeCloseTo(2.0, 1)
  })

  it('projects a rising trend upward without extrapolating wildly', () => {
    // Climbs 0.05 per shift over four weeks.
    const series = buildSeries(makeEntries('u1', 56, (i) => 1.0 + i * 0.05), IP, DEFAULT_THRESHOLDS)
    const f = forecastSeries(series, { horizon: 4 })
    const last = series[series.length - 1].value
    expect(f.ok).toBe(true)
    expect(f.points[0].p50).toBeGreaterThan(last)
    // Damping keeps four shifts ahead from overshooting the linear path.
    expect(f.points[3].p50).toBeLessThan(last + 0.05 * 4 * 2)
  })

  it('carries the weekly pattern into the forecast', () => {
    const entries = makeEntries('u1', 84, (i, date, shift) =>
      weekdayOf(date) === 1 && shift === 'AM' ? 3.2 : 1.6
    )
    const series = buildSeries(entries, IP, DEFAULT_THRESHOLDS)
    const f = forecastSeries(series, { horizon: 14 })
    const mondayAm = f.points.filter((p) => p.shift === 'AM' && weekdayOf(p.date) === 1)
    const others = f.points.filter((p) => !(p.shift === 'AM' && weekdayOf(p.date) === 1))
    expect(mondayAm.length).toBeGreaterThan(0)
    expect(Math.max(...mondayAm.map((p) => p.p50))).toBeGreaterThan(Math.max(...others.map((p) => p.p50)))
  })

  it('produces properly nested, non-negative prediction bands', () => {
    const series = buildSeries(
      makeEntries('u1', 60, (i) => 2 + Math.sin(i / 3) * 0.4),
      IP,
      DEFAULT_THRESHOLDS
    )
    const f = forecastSeries(series, { horizon: 4 })
    for (const p of f.points) {
      expect(p.low95).toBeLessThanOrEqual(p.low80 + 1e-9)
      expect(p.low80).toBeLessThanOrEqual(p.p50 + 1e-9)
      expect(p.p50).toBeLessThanOrEqual(p.high80 + 1e-9)
      expect(p.high80).toBeLessThanOrEqual(p.high95 + 1e-9)
      expect(p.low95).toBeGreaterThanOrEqual(0)
    }
  })

  it('never claims certainty on a perfectly flat series', () => {
    const series = buildSeries(makeEntries('u1', 40, () => 2), IP, DEFAULT_THRESHOLDS)
    const f = forecastSeries(series)
    expect(f.points[0].high80).toBeGreaterThan(f.points[0].p50)
  })

  it('widens bands as the horizon lengthens', () => {
    const series = buildSeries(
      makeEntries('u1', 60, (i) => 2 + Math.sin(i / 2) * 0.5),
      IP,
      DEFAULT_THRESHOLDS
    )
    const f = forecastSeries(series, { horizon: 6 })
    const first = f.points[0].high95 - f.points[0].low95
    const last = f.points[5].high95 - f.points[5].low95
    expect(last).toBeGreaterThanOrEqual(first)
  })

  it('forecasts the next shifts in chronological order after the last reading', () => {
    const series = buildSeries(makeEntries('u1', 20, () => 2), IP, DEFAULT_THRESHOLDS)
    const f = forecastSeries(series, { horizon: 4 })
    expect(f.points[0].slot).toBe(series[series.length - 1].slot + 1)
    const slots = f.points.map((p) => p.slot)
    expect(slots).toEqual([...slots].sort((a, b) => a - b))
    expect(f.points.map((p) => p.horizon)).toEqual([1, 2, 3, 4])
  })

  it('reports which estimator won and how it scored against the baseline', () => {
    const series = buildSeries(makeEntries('u1', 60, (i) => 1.5 + i * 0.02), IP, DEFAULT_THRESHOLDS)
    const f = forecastSeries(series)
    expect(['damped-trend', 'seasonal-naive', 'recent-median']).toContain(f.method)
    expect(f.accuracy.mae).toBeGreaterThanOrEqual(0)
    expect(f.accuracy.samples).toBeGreaterThan(0)
    expect(Object.keys(f.accuracy.compared)).toEqual(
      expect.arrayContaining(['damped-trend', 'seasonal-naive', 'recent-median'])
    )
  })

  it('beats the naive baseline on a cleanly trending series', () => {
    const series = buildSeries(makeEntries('u1', 60, (i) => 1.0 + i * 0.04), IP, DEFAULT_THRESHOLDS)
    const f = forecastSeries(series)
    expect(f.method).toBe('damped-trend')
    expect(f.accuracy.skill).toBeGreaterThan(0)
  })

  it('will not claim high confidence on pure noise', () => {
    let seed = 7
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    const series = buildSeries(makeEntries('u1', 60, () => 1 + rand() * 3), IP, DEFAULT_THRESHOLDS)
    const f = forecastSeries(series)
    expect(['low', 'moderate']).toContain(f.confidence)
  })

  it('escalates confidence as history accumulates', () => {
    const short = buildSeries(makeEntries('u1', 8, (i) => 2 + i * 0.01), IP, DEFAULT_THRESHOLDS)
    const long = buildSeries(makeEntries('u1', 60, (i) => 2 + i * 0.01), IP, DEFAULT_THRESHOLDS)
    const tiers = ['insufficient', 'low', 'moderate', 'high']
    expect(tiers.indexOf(forecastSeries(long).confidence)).toBeGreaterThan(
      tiers.indexOf(forecastSeries(short).confidence)
    )
  })

  it('handles gaps in the series without inventing observations', () => {
    // Log only AM shifts — every other slot is missing.
    const entries = makeEntries('u1', 60, () => 2).filter((e) => e.shift === 'AM')
    const series = buildSeries(entries, IP, DEFAULT_THRESHOLDS)
    const f = forecastSeries(series, { horizon: 4 })
    expect(f.ok).toBe(true)
    expect(f.observations).toBe(series.length)
    for (const p of f.points) expect(Number.isFinite(p.p50)).toBe(true)
  })

  it('never predicts a negative acuity', () => {
    const series = buildSeries(makeEntries('u1', 40, (i) => Math.max(0, 3 - i * 0.1)), IP, DEFAULT_THRESHOLDS)
    const f = forecastSeries(series, { horizon: 8 })
    for (const p of f.points) expect(p.p50).toBeGreaterThanOrEqual(0)
  })
})

describe('forecastLocation', () => {
  it('threads location and metric through to the result', () => {
    const entries = makeEntries('u1', 40, () => 2)
    const f = forecastLocation(entries, IP, DEFAULT_THRESHOLDS, { metric: 'census', horizon: 3 })
    expect(f.ok).toBe(true)
    expect(f.metric).toBe('census')
    expect(f.loc).toBe(IP)
    expect(f.points).toHaveLength(3)
    expect(f.points[0].p50).toBeCloseTo(12, 0)
  })
})
