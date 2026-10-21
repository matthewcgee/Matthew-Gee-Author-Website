// Acuitas™ Cost & ROI
//
// Puts a dollar figure on what acuity costs and what acting on Acuitas saves,
// in terms a CFO and an innovation committee can check.
//
// Every rate is an input the organization sets. The defaults are round
// illustrative figures for a first look, not benchmarks, and the app labels
// them as estimates until someone replaces them with finance's own numbers.
// Every result shows its arithmetic: a count, multiplied by a rate.

import { buildSeries } from './forecast.js'
import { thresholdsFor } from './model.js'

export const DEFAULT_COST_RATES = {
  shiftHours: 12,
  // Labor, per staff hour, by where a deployed staff member came from.
  floatHourly: 55,
  overtimeHourly: 80,
  agencyHourly: 115,
  // Moving someone already on shift between units adds no new labor cost.
  internalHourly: 0,
  // All-in cost of one unit-shift spent in RED: incident response, overtime
  // backfill, injury and turnover exposure. The hardest figure to pin down,
  // which is why it is an input here rather than an assumption baked in.
  redShiftCost: 1800,
  // Cost of one hour a behavioral health patient spends boarding in the ED.
  boardingHourCost: 125,
  // Whether the float pool the optimizer deploys is already on shift (and so
  // paid whether or not it is used). When true, deploying a float adds no new
  // labor cost to a plan; when false (per diem, called in only when needed),
  // each deployed float is charged at the float rate. Budget reporting of
  // logged deployment hours is unaffected either way.
  floatOnShift: true,
}

export const DEPLOYMENT_SOURCES = {
  float: 'Float pool',
  overtime: 'Overtime',
  agency: 'Agency / travel',
  internal: 'Reassigned from another unit',
}

export function normalizeRates(r) {
  const out = { ...DEFAULT_COST_RATES }
  for (const [k, v] of Object.entries(r || {})) {
    if (!(k in out)) continue
    if (typeof out[k] === 'boolean') {
      if (typeof v === 'boolean') out[k] = v
      continue
    }
    const n = Number(v)
    if (Number.isFinite(n) && n >= 0) out[k] = n
  }
  return out
}

export function deploymentSource(d) {
  if (d?.source && DEPLOYMENT_SOURCES[d.source]) return d.source
  return d?.fromLocId ? 'internal' : 'float'
}

export function hourlyFor(source, rates) {
  const r = normalizeRates(rates)
  return { float: r.floatHourly, overtime: r.overtimeHourly, agency: r.agencyHourly, internal: r.internalHourly }[source] ?? r.floatHourly
}

export function deploymentCost(d, rates) {
  const r = normalizeRates(rates)
  const hours = d?.hours != null && Number.isFinite(Number(d.hours)) ? Number(d.hours) : r.shiftHours
  const source = deploymentSource(d)
  return { source, hours, cost: hours * hourlyFor(source, r) }
}

const inWindow = (date, from, to) => (!from || date >= from) && (!to || date <= to)

/**
 * What acuity cost over a date window: RED unit-shifts, deployment labor by
 * source, and ED boarding hours, each with its count and rate.
 */
export function costSummary({ entries, deployments, locations, thresholds, rates, from, to }) {
  const r = normalizeRates(rates)

  // RED unit-shifts, one per unit per shift, resolved the same way the board
  // and the forecast resolve duplicate readings.
  const byUnit = []
  let redShifts = 0
  let boardingHours = 0
  for (const loc of locations || []) {
    const th = thresholdsFor(loc, thresholds)
    const series = buildSeries(entries, loc, thresholds, 'acuity').filter((p) => inWindow(p.date, from, to))
    const red = loc.type === 'ed' ? 0 : series.filter((p) => p.value > th.yellowMax).length
    redShifts += red
    let bh = 0
    if (loc.type === 'ed') {
      bh = buildSeries(entries, loc, thresholds, 'boardingHours')
        .filter((p) => inWindow(p.date, from, to))
        .reduce((s, p) => s + p.value, 0)
      boardingHours += bh
    }
    byUnit.push({ loc, redShifts: red, boardingHours: bh, deployedHours: 0, deploymentCost: 0 })
  }

  const bySource = Object.fromEntries(Object.keys(DEPLOYMENT_SOURCES).map((k) => [k, { hours: 0, cost: 0, count: 0 }]))
  for (const d of deployments || []) {
    if (!inWindow(d.date, from, to)) continue
    const c = deploymentCost(d, r)
    bySource[c.source].hours += c.hours
    bySource[c.source].cost += c.cost
    bySource[c.source].count += 1
    const u = byUnit.find((x) => x.loc.id === d.toLocId)
    if (u) {
      u.deployedHours += c.hours
      u.deploymentCost += c.cost
    }
  }

  const deploymentSpend = Object.values(bySource).reduce((s, x) => s + x.cost, 0)
  const redCost = redShifts * r.redShiftCost
  const boardingCost = boardingHours * r.boardingHourCost
  return {
    rates: r,
    from: from || null,
    to: to || null,
    redShifts,
    redCost,
    boardingHours,
    boardingCost,
    bySource,
    deploymentSpend,
    total: redCost + boardingCost + deploymentSpend,
    byUnit,
  }
}

/**
 * The expected value of executing a recommended plan: RED shifts it is
 * expected to avoid, priced at the RED-shift rate, against the new labor it
 * adds. "Expected" means the sum of each move's drop in predicted RED
 * probability. Reassigning someone already on shift adds no labor; neither
 * does a float already on shift, unless the float pool is set as called-in.
 */
export function planValue(plan, rates) {
  const r = normalizeRates(rates)
  if (!plan?.ok || !plan.moves?.length) {
    return { expectedRedAvoided: 0, riskValue: 0, laborCost: 0, net: 0, moves: 0 }
  }
  let expectedRedAvoided = 0
  let laborCost = 0
  for (const m of plan.moves) {
    if (m.pRedBefore != null && m.pRedAfter != null) {
      expectedRedAvoided += Math.max(0, m.pRedBefore - m.pRedAfter)
    }
    const hourly = m.fromLocId ? r.internalHourly : (r.floatOnShift ? 0 : r.floatHourly)
    laborCost += m.staff * r.shiftHours * hourly
  }
  const riskValue = expectedRedAvoided * r.redShiftCost
  return { expectedRedAvoided, riskValue, laborCost, net: riskValue - laborCost, moves: plan.moves.length }
}

/**
 * Value delivered by plans that were actually followed, from the outcome loop.
 *
 * Two independent estimates are reported side by side. The first is
 * model-based: the predicted drop in RED summed over followed moves. The
 * second is observed: how much less often followed moves ended in RED than
 * unfollowed ones, applied to the number of followed moves. The observed
 * figure is reported only once both groups have enough resolved moves.
 */
export function realizedValue(adherence, evaluations, rates, { minN = 5 } = {}) {
  const r = normalizeRates(rates)
  const followed = (evaluations || []).flatMap((e) => e.moves || [])
    .filter((m) => m.followed !== 'none' && m.outcome !== 'pending')
  const modeled = followed.reduce((s, m) =>
    s + (m.pRedBefore != null && m.pRedAfter != null ? Math.max(0, m.pRedBefore - m.pRedAfter) : 0), 0)
  const enough = adherence && adherence.followed.moves >= minN && adherence.notFollowed.moves >= minN
  const observed = enough && adherence.redReduction != null
    ? Math.max(0, adherence.redReduction) * adherence.followed.moves
    : null
  return {
    followedMoves: followed.length,
    modeledRedAvoided: modeled,
    modeledValue: modeled * r.redShiftCost,
    observedRedAvoided: observed,
    observedValue: observed == null ? null : observed * r.redShiftCost,
  }
}

export function formatMoney(n) {
  if (n == null || !Number.isFinite(n)) return '—'
  const sign = n < 0 ? '−' : ''
  return `${sign}$${Math.round(Math.abs(n)).toLocaleString('en-US')}`
}
