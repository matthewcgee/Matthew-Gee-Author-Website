// Acuitas™ Deployment Optimizer
//
// Answers the question the Status Board can only pose: given what every unit
// looks like right now — or is forecast to look like next shift — where should
// the next available staff member actually go?
//
// This is solved exactly, not greedily. Allocating interchangeable staff across
// units is a resource-allocation problem, and because crossing a stage boundary
// is a step change in risk (a unit needing three staff to climb out of RED gets
// no credit for the first two), marginal-benefit greedy can and does pick the
// wrong answer. A dynamic program over the staffing budget returns the true
// optimum for the risk model below, and the problem is small enough — dozens of
// units, tens of staff — that exactness costs microseconds.
//
// Pulling staff off a unit is modeled as a negative allocation, so a donor is
// only tapped when the receiving unit's gain genuinely outweighs the donor's
// loss. Every recommendation carries the before/after numbers behind it.

import { computeStage, thresholdsFor, safeDiv } from './model.js'
import { probabilityAbove } from './risk.js'

// Crossing into RED is not "a bit worse than YELLOW" — it is the condition the
// whole tool exists to prevent. Weights encode that, and the continuous excess
// term keeps improvements *within* a stage from scoring as worthless.
export const STAGE_WEIGHT = { GREEN: 0, YELLOW: 1, RED: 4, NONE: 0 }

// Charged per staff member moved, in the same units as risk. Stops the
// optimizer from recommending churn for a rounding-error improvement.
export const DEFAULT_MOVE_COST = 0.05

// Never strip a unit below this many staff, whatever the math says.
export const DEFAULT_STAFF_FLOOR = 1

// Guards against a pathological pull recommendation on a large, quiet system.
const MAX_PULL_PER_UNIT = 3

/**
 * Risk contributed by one inpatient unit at a hypothetical staffing level.
 *
 * Exposure-weighted: a 20-bed unit sitting in RED puts more patients at risk
 * than a 6-bed unit in RED, and the optimizer should feel that difference.
 */
export function unitRisk({ points, staff, th, exposure = 1 }) {
  const s = Number(staff) || 0
  const p = Number(points) || 0
  if (s <= 0) return { uai: Infinity, stage: 'RED', risk: STAGE_WEIGHT.RED * 4 * exposure }

  const uai = safeDiv(p, s)
  const stage = computeStage(uai, th)
  const greenMax = th.greenMax > 0 ? th.greenMax : 1
  const excess = Math.max(0, (uai - greenMax) / greenMax)
  const risk = exposure * (STAGE_WEIGHT[stage] + excess)
  return { uai, stage, risk }
}

/**
 * Build the optimizable view of each unit.
 *
 * `mode: 'current'` optimizes against the latest logged reading. `mode:
 * 'forecast'` optimizes against the next predicted shift — deploying ahead of
 * the surge rather than after it, which is the entire point of forecasting.
 */
export function buildUnitStates({ locations, entries, thresholds, forecasts = {}, mode = 'current', staffFloor = DEFAULT_STAFF_FLOOR }) {
  const latestByLoc = new Map()
  for (const e of entries || []) {
    const prev = latestByLoc.get(e.locId)
    const key = `${e.date}#${e.shift}`
    const prevKey = prev ? `${prev.date}#${prev.shift}` : ''
    if (!prev || key > prevKey || (key === prevKey && (e.createdAt || 0) >= (prev.createdAt || 0))) {
      latestByLoc.set(e.locId, e)
    }
  }

  const states = []
  for (const loc of locations || []) {
    // ED acuity is a raw point total with no staffing denominator, so moving a
    // staff member does not change its score. It is reported, never optimized.
    if (loc.type === 'ed') continue

    const latest = latestByLoc.get(loc.id)
    if (!latest) continue

    const th = thresholdsFor(loc, thresholds)
    const staff = Number(latest.staff) || 0
    if (staff <= 0) continue

    const forecast = forecasts[loc.id]
    const nextPoint = forecast?.ok ? forecast.points?.[0] : null

    // Forecast mode predicts acuity-per-staff; multiplying by current staffing
    // recovers the point load that staffing decisions actually act on.
    const points = mode === 'forecast' && nextPoint
      ? Math.max(0, nextPoint.p50 * staff)
      : Number(latest.points) || 0

    const exposure = Number(latest.census) > 0 ? Number(latest.census) : 1
    const base = unitRisk({ points, staff, th, exposure })

    states.push({
      loc,
      th,
      latest,
      mode,
      points,
      staff,
      exposure,
      baseUai: base.uai,
      baseStage: base.stage,
      baseRisk: base.risk,
      forecastPoint: nextPoint,
      // How many staff this unit could release while still holding GREEN.
      releasable: releasableStaff({ points, staff, th, staffFloor }),
    })
  }

  return states
}

function releasableStaff({ points, staff, th, staffFloor = DEFAULT_STAFF_FLOOR }) {
  let k = 0
  while (k < MAX_PULL_PER_UNIT && staff - (k + 1) >= staffFloor) {
    const { stage } = unitRisk({ points, staff: staff - (k + 1), th })
    if (stage !== 'GREEN') break
    k++
  }
  return k
}

/**
 * Exact optimal allocation of `floatStaff` additional staff across units,
 * allowing safe pulls from units that can spare someone.
 *
 * Returns per-unit deltas plus the objective value, solved by dynamic
 * programming over the net staffing budget.
 */
export function optimizeAllocation(states, { floatStaff = 0, moveCost = DEFAULT_MOVE_COST, maxAddPerUnit = 6 } = {}) {
  const m = states.length
  const float = Math.max(0, Math.floor(floatStaff))

  if (!m) {
    return { ok: false, reason: 'no-units', deltas: [], baseRisk: 0, optimizedRisk: 0 }
  }

  const maxPull = states.reduce((s, u) => s + u.releasable, 0)
  const baseRisk = states.reduce((s, u) => s + u.baseRisk, 0)

  if (float === 0 && maxPull === 0) {
    return {
      ok: true,
      deltas: states.map(() => 0),
      baseRisk,
      optimizedRisk: baseRisk,
      improvement: 0,
      // With nothing to move, the do-nothing plan *is* the optimum, and its
      // objective is just the current risk — no moves, so no move cost.
      objective: baseRisk,
      floatStaff: float,
      maxPull,
      netUsed: 0,
      exact: true,
    }
  }

  // Net staffing used runs from -maxPull (everything pulled, nothing placed) up
  // to everything that could possibly be placed (the float pool plus every
  // releasable nurse). The upper bound has to cover *intermediate* sums, not
  // just the final one: a plan that gives three staff to one unit and pulls two
  // back from donors ends at a net of one, but passes through three on the way,
  // and clipping that state would hide the plan entirely.
  const offset = maxPull
  const maxPlace = float + maxPull
  const width = offset + maxPlace + 1

  // cost[i][k] for k in [-releasable_i, +maxAdd]
  const options = states.map((u) => {
    const opts = []
    for (let k = -u.releasable; k <= Math.min(maxAddPerUnit, float + maxPull); k++) {
      const staff = u.staff + k
      if (staff < DEFAULT_STAFF_FLOOR) continue
      const { uai, stage, risk } = unitRisk({ points: u.points, staff, th: u.th, exposure: u.exposure })
      // `k || 0` normalizes the -0 that appears when releasable is 0.
      opts.push({ k: k || 0, staff, uai, stage, cost: risk + Math.abs(k) * moveCost })
    }
    return opts
  })

  const INF = Infinity
  // dp[j] = min cost for units processed so far using net j-offset staff.
  let dp = new Array(width).fill(INF)
  dp[offset] = 0
  const choice = []

  for (let i = 0; i < m; i++) {
    const next = new Array(width).fill(INF)
    const pick = new Array(width).fill(null)
    for (let j = 0; j < width; j++) {
      if (dp[j] === INF) continue
      for (const opt of options[i]) {
        const nj = j + opt.k
        if (nj < 0 || nj >= width) continue
        const cost = dp[j] + opt.cost
        if (cost < next[nj]) {
          next[nj] = cost
          pick[nj] = { from: j, k: opt.k }
        }
      }
    }
    dp = next
    choice.push(pick)
  }

  // Any net usage at or below the float pool is feasible; pick the cheapest.
  let bestJ = -1
  let bestCost = INF
  for (let j = 0; j <= offset + float; j++) {
    if (dp[j] < bestCost) {
      bestCost = dp[j]
      bestJ = j
    }
  }

  if (bestJ === -1) {
    return { ok: false, reason: 'infeasible', deltas: states.map(() => 0), baseRisk, optimizedRisk: baseRisk }
  }

  // Walk the choices back to recover per-unit deltas.
  const deltas = new Array(m).fill(0)
  let j = bestJ
  for (let i = m - 1; i >= 0; i--) {
    const pick = choice[i][j]
    if (!pick) break
    deltas[i] = pick.k
    j = pick.from
  }

  const optimizedRisk = states.reduce((sum, u, i) => {
    const { risk } = unitRisk({ points: u.points, staff: u.staff + deltas[i], th: u.th, exposure: u.exposure })
    return sum + risk
  }, 0)

  return {
    ok: true,
    deltas,
    baseRisk,
    optimizedRisk,
    improvement: baseRisk - optimizedRisk,
    objective: bestCost,
    floatStaff: float,
    maxPull,
    netUsed: bestJ - offset,
    exact: true,
  }
}

/**
 * Convert an allocation into the concrete moves a house supervisor can execute,
 * each annotated with what it is predicted to accomplish.
 *
 * Staff are interchangeable, so which donor feeds which recipient does not
 * change the objective value — pairing largest-need to largest-availability
 * simply keeps the instruction list short.
 */
export function planMoves(states, allocation, { forecasts = {} } = {}) {
  if (!allocation?.ok) return { ok: false, reason: allocation?.reason || 'no-allocation', moves: [], units: [] }

  const units = states.map((u, i) => {
    const delta = allocation.deltas[i] || 0
    const after = unitRisk({ points: u.points, staff: u.staff + delta, th: u.th, exposure: u.exposure })
    const forecast = forecasts[u.loc.id]
    const point = forecast?.ok ? forecast.points?.[0] : null

    // Breach risk is a property of the predicted distribution, so re-center it
    // on the post-move acuity to show what the move buys.
    const pRedBefore = point ? probabilityAbove({ ...point, p50: u.baseUai }, u.th.yellowMax) : null
    const pRedAfter = point ? probabilityAbove({ ...point, p50: after.uai }, u.th.yellowMax) : null

    return {
      loc: u.loc,
      delta,
      staffBefore: u.staff,
      staffAfter: u.staff + delta,
      uaiBefore: u.baseUai,
      uaiAfter: after.uai,
      stageBefore: u.baseStage,
      stageAfter: after.stage,
      riskBefore: u.baseRisk,
      riskAfter: after.risk,
      pRedBefore,
      pRedAfter,
      exposure: u.exposure,
      th: u.th,
      mode: u.mode,
    }
  })

  const recipients = units
    .filter((u) => u.delta > 0)
    .map((u) => ({ ...u, remaining: u.delta }))
    .sort((a, b) => b.riskBefore - b.riskAfter - (a.riskBefore - a.riskAfter))

  const donors = units
    .filter((u) => u.delta < 0)
    .map((u) => ({ ...u, remaining: -u.delta }))
    .sort((a, b) => a.riskAfter - a.riskBefore - (b.riskAfter - b.riskBefore))

  const moves = []
  for (const r of recipients) {
    while (r.remaining > 0) {
      const donor = donors.find((d) => d.remaining > 0)
      const count = donor ? Math.min(r.remaining, donor.remaining) : r.remaining
      moves.push({
        fromLocId: donor ? donor.loc.id : null,
        fromName: donor ? donor.loc.name : 'Float pool',
        toLocId: r.loc.id,
        toName: r.loc.name,
        staff: count,
        uaiBefore: r.uaiBefore,
        uaiAfter: r.uaiAfter,
        stageBefore: r.stageBefore,
        stageAfter: r.stageAfter,
        pRedBefore: r.pRedBefore,
        pRedAfter: r.pRedAfter,
        donorStageAfter: donor ? donor.stageAfter : null,
        donorUaiAfter: donor ? donor.uaiAfter : null,
        riskDrop: r.riskBefore - r.riskAfter,
        mode: r.mode,
      })
      if (donor) donor.remaining -= count
      r.remaining -= count
    }
  }

  const stageCount = (key) => units.reduce((n, u) => n + (u[key] === 'RED' ? 1 : 0), 0)

  return {
    ok: true,
    moves,
    units,
    summary: {
      redBefore: stageCount('stageBefore'),
      redAfter: stageCount('stageAfter'),
      yellowBefore: units.filter((u) => u.stageBefore === 'YELLOW').length,
      yellowAfter: units.filter((u) => u.stageAfter === 'YELLOW').length,
      riskBefore: allocation.baseRisk,
      riskAfter: allocation.optimizedRisk,
      improvement: allocation.improvement,
      staffPlaced: moves.reduce((s, m) => s + m.staff, 0),
      fromFloat: moves.filter((m) => !m.fromLocId).reduce((s, m) => s + m.staff, 0),
      fromUnits: moves.filter((m) => m.fromLocId).reduce((s, m) => s + m.staff, 0),
      exact: allocation.exact,
    },
  }
}

/**
 * One call from raw app state to an executable deployment plan.
 */
export function recommendDeployment({
  locations,
  entries,
  thresholds,
  forecasts = {},
  floatStaff = 0,
  mode = 'current',
  moveCost = DEFAULT_MOVE_COST,
  staffFloor = DEFAULT_STAFF_FLOOR,
}) {
  const states = buildUnitStates({ locations, entries, thresholds, forecasts, mode, staffFloor })
  if (!states.length) {
    return { ok: false, reason: 'no-staffed-units', moves: [], units: [], states }
  }
  const allocation = optimizeAllocation(states, { floatStaff, moveCost })
  const plan = planMoves(states, allocation, { forecasts })
  return { ...plan, allocation, states, mode }
}
