// Acuitas™ Capacity & Boarding Outlook
//
// Behavioral health patients waiting in the ED for an inpatient bed is one of
// the most painful problems in the field. This module sets two forecasts the
// app already knows how to make against each other:
//
//   supply  — open inpatient beds: each unit's nursing-driven census cap minus
//             its forecast census, summed across the region
//   demand  — BH patients boarding in the ED awaiting a bed, forecast from the
//             ED's own logged history
//
// It then reports, shift by shift, whether demand is expected to exceed
// supply, how likely that is, and the boarding hours that follow.
//
// The probability treats projected open beds as fixed and asks how likely
// boarding demand is to exceed them. Demand uncertainty comes from the ED's
// own measured forecast error, the same empirical method the rest of Acuitas
// uses. With several EDs, demand is summed and the error spread of the largest
// ED stands in for the region. That is a deliberate, stated simplification.

import { forecastLocation, buildSeries } from './forecast.js'
import { probabilityAbove } from './risk.js'

export const CAPACITY_STATUS = {
  OK: 'ok',
  TIGHT: 'tight',
  BOARDING: 'boarding',
}

export const CAPACITY_LABEL = {
  ok: 'Beds cover demand',
  tight: 'Tight — under 2 beds of margin',
  boarding: 'Boarding expected',
}

const sum = (xs) => xs.reduce((s, x) => s + x, 0)

export function capacityOutlook({ locations, entries, thresholds, caps = {}, horizon = 6 }) {
  const beds = []
  for (const loc of locations || []) {
    if (loc.type === 'ed') continue
    const cap = caps?.[loc.id] !== undefined ? caps[loc.id] : loc.censusCap
    if (cap == null) continue
    const f = forecastLocation(entries, loc, thresholds, { metric: 'census', horizon })
    if (f.ok) beds.push({ loc, cap, forecast: f })
  }

  const eds = []
  for (const loc of locations || []) {
    if (loc.type !== 'ed') continue
    const boarders = forecastLocation(entries, loc, thresholds, { metric: 'boarders', horizon })
    if (!boarders.ok) continue
    eds.push({
      loc,
      boarders,
      hours: forecastLocation(entries, loc, thresholds, { metric: 'boardingHours', horizon }),
      arrivals: forecastLocation(entries, loc, thresholds, { metric: 'bhArrivals', horizon }),
    })
  }

  if (!beds.length) return { ok: false, reason: 'no-bed-forecast', beds, eds }
  if (!eds.length) return { ok: false, reason: 'no-boarding-history', beds, eds }

  // The ED with the most boarding carries the error spread for the region.
  const anchor = eds.reduce((a, b) =>
    (b.boarders.points[0]?.p50 ?? 0) > (a.boarders.points[0]?.p50 ?? 0) ? b : a)

  const horizons = []
  for (let h = 0; h < horizon; h++) {
    const bedPts = beds.map((b) => ({ b, p: b.forecast.points[h] })).filter((x) => x.p)
    if (!bedPts.length) break
    const openBeds = sum(bedPts.map(({ b, p }) => Math.max(0, b.cap - p.p50)))
    const boarders = sum(eds.map((e) => e.boarders.points[h]?.p50 ?? 0))
    const hours = sum(eds.map((e) => (e.hours.ok ? e.hours.points[h]?.p50 ?? 0 : 0)))
    const arrivals = sum(eds.map((e) => (e.arrivals.ok ? e.arrivals.points[h]?.p50 ?? 0 : 0)))
    const ap = anchor.boarders.points[h]
    const pBoarding = ap ? probabilityAbove({ ...ap, p50: boarders }, openBeds) : null
    const gap = openBeds - boarders
    horizons.push({
      horizon: h + 1,
      label: ap?.label || bedPts[0].p.label,
      date: ap?.date || bedPts[0].p.date,
      shift: ap?.shift || bedPts[0].p.shift,
      openBeds,
      boarders,
      gap,
      pBoarding,
      boardingHours: hours,
      arrivals,
      status: gap < 0 ? CAPACITY_STATUS.BOARDING : gap < 2 ? CAPACITY_STATUS.TIGHT : CAPACITY_STATUS.OK,
    })
  }

  const firstBoarding = horizons.find((x) => x.status === CAPACITY_STATUS.BOARDING) || null
  return {
    ok: true,
    horizons,
    beds: beds.map((b) => ({ loc: b.loc, cap: b.cap, nextCensus: b.forecast.points[0]?.p50 ?? null })),
    eds: eds.map((e) => ({ loc: e.loc, nextBoarders: e.boarders.points[0]?.p50 ?? null, method: e.boarders.method })),
    firstBoarding,
    shiftsToBoarding: firstBoarding ? firstBoarding.horizon : null,
    peakPBoarding: horizons.reduce((m, x) => Math.max(m, x.pBoarding ?? 0), 0),
    expectedBoardingHours: sum(horizons.map((x) => x.boardingHours)),
  }
}

/** Daily boarding totals across every ED, for the trend chart. */
export function boardingHistory(entries, locations, thresholds, { days = 14 } = {}) {
  const byDate = new Map()
  for (const loc of locations || []) {
    if (loc.type !== 'ed') continue
    for (const metric of ['boarders', 'boardingHours']) {
      for (const p of buildSeries(entries, loc, thresholds, metric)) {
        if (!byDate.has(p.date)) byDate.set(p.date, { date: p.date, boarders: 0, boardingHours: 0 })
        byDate.get(p.date)[metric] += p.value
      }
    }
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-days)
}
