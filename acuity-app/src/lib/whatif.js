// Acuitas™ What-If Planner
//
// Leaders ask questions the live board can't answer: what happens if we close
// four beds on 3 West, add two floats on Monday mornings, or a surge pushes
// acuity up 20%? This module projects the next shift under those changes,
// using the same per-unit forecasts, breach probabilities and exact optimizer
// as the Command Center. Baseline and scenario therefore differ only by the
// change being tested.
//
// What a scenario can change:
//   staffDelta[locId]       staff added (+) or removed (−) on that unit
//   bedDelta[locId]         beds opened (+) or closed (−) against the census cap
//   acuityMultiplier[locId] scale that unit's predicted acuity (1.2 = +20%)
//   regionAcuity            scale every unit's predicted acuity
//   floatStaff              float staff available to the optimizer

import { computeStage, thresholdsFor } from './model.js'
import { probabilityAbove } from './risk.js'
import { recommendDeployment } from './optimize.js'

function latestByLoc(entries) {
  const m = new Map()
  for (const e of entries || []) {
    const prev = m.get(e.locId)
    const key = `${e.date}#${e.shift}`
    const prevKey = prev ? `${prev.date}#${prev.shift}` : ''
    if (!prev || key > prevKey || (key === prevKey && (e.createdAt || 0) >= (prev.createdAt || 0))) m.set(e.locId, e)
  }
  return m
}

function scenarioUnit({ loc, latest, forecast, censusForecast, cap, thresholds, scenario }) {
  const th = thresholdsFor(loc, thresholds)
  const point = forecast?.ok ? forecast.points?.[0] : null
  const baseStaff = Number(latest?.staff) || 0
  if (!point || baseStaff <= 0) return null

  const staff = Math.max(0, baseStaff + (Number(scenario.staffDelta?.[loc.id]) || 0))
  const mult = (Number(scenario.acuityMultiplier?.[loc.id]) || 1) * (Number(scenario.regionAcuity) || 1)
  // The forecast is acuity per staff at today's staffing; recover the point
  // load, scale it, and spread it over the scenario's staffing.
  const points = point.p50 * baseStaff * mult
  const uai = staff > 0 ? points / staff : Infinity
  const stage = staff > 0 ? computeStage(uai, th) : 'RED'
  const pRed = staff > 0 ? probabilityAbove({ ...point, p50: uai }, th.yellowMax) : 1

  const baseCap = cap ?? loc.censusCap ?? null
  const newCap = baseCap == null ? null : Math.max(0, baseCap + (Number(scenario.bedDelta?.[loc.id]) || 0))
  const cPoint = censusForecast?.ok ? censusForecast.points?.[0] : null
  const pOverCap = newCap != null && cPoint ? probabilityAbove(cPoint, newCap) : null

  return {
    loc,
    staff,
    baseStaff,
    points,
    uai,
    stage,
    pRed,
    cap: newCap,
    census: cPoint ? cPoint.p50 : null,
    pOverCap,
    // Rebased forecast for the optimizer: forecast-mode multiplies p50 by the
    // logged staffing, so p50 must be expressed per scenario staff member.
    rebasedForecast: { ...forecast, points: [{ ...point, p50: staff > 0 ? points / staff : point.p50 }, ...forecast.points.slice(1)] },
  }
}

/** Next-shift projection for every staffed inpatient unit under a scenario. */
export function projectNextShift({ locations, entries, thresholds, forecasts = {}, censusForecasts = {}, caps = {}, scenario = {} }) {
  const latest = latestByLoc(entries)
  const units = []
  for (const loc of locations || []) {
    if (loc.type === 'ed') continue
    const u = scenarioUnit({
      loc,
      latest: latest.get(loc.id),
      forecast: forecasts[loc.id],
      censusForecast: censusForecasts[loc.id],
      cap: caps?.[loc.id],
      thresholds,
      scenario,
    })
    if (u) units.push(u)
  }
  return {
    units,
    totals: {
      units: units.length,
      red: units.filter((u) => u.stage === 'RED').length,
      expectedRed: units.reduce((s, u) => s + (u.pRed ?? 0), 0),
      overCapLikely: units.filter((u) => (u.pOverCap ?? 0) >= 0.5).length,
      expectedOverCap: units.reduce((s, u) => s + (u.pOverCap ?? 0), 0),
      staff: units.reduce((s, u) => s + u.staff, 0),
      beds: units.reduce((s, u) => s + (u.cap ?? 0), 0),
    },
  }
}

/**
 * Baseline vs scenario, plus the staffing plan the optimizer would recommend
 * under the scenario. The plan answers "and what would we do about it?".
 */
export function runScenario({ locations, entries, thresholds, forecasts = {}, censusForecasts = {}, caps = {}, scenario = {}, floatStaff = 0 }) {
  const common = { locations, entries, thresholds, forecasts, censusForecasts, caps }
  const baseline = projectNextShift({ ...common, scenario: {} })
  const projected = projectNextShift({ ...common, scenario })

  // Feed the optimizer the scenario: staffing changes as fresh latest
  // readings, acuity changes through the rebased forecasts.
  const latest = latestByLoc(entries)
  const synthetic = projected.units.map((u) => {
    const e = latest.get(u.loc.id)
    return { ...e, id: `${e.id || u.loc.id}_whatif`, staff: u.staff, createdAt: (e.createdAt || 0) + 1 }
  })
  const rebased = { ...forecasts }
  for (const u of projected.units) rebased[u.loc.id] = u.rebasedForecast

  const plan = recommendDeployment({
    locations,
    entries: [...(entries || []), ...synthetic],
    thresholds,
    forecasts: rebased,
    floatStaff: scenario.floatStaff != null ? Number(scenario.floatStaff) : floatStaff,
    mode: 'forecast',
  })

  const d = (k) => projected.totals[k] - baseline.totals[k]
  return {
    baseline,
    scenario: projected,
    plan,
    delta: { red: d('red'), expectedRed: d('expectedRed'), overCapLikely: d('overCapLikely'), expectedOverCap: d('expectedOverCap'), staff: d('staff'), beds: d('beds') },
  }
}

export function isEmptyScenario(s) {
  if (!s) return true
  const any = (o) => Object.values(o || {}).some((v) => Number(v) && Number(v) !== 0)
  const anyMult = Object.values(s.acuityMultiplier || {}).some((v) => Number(v) && Number(v) !== 1)
  return !any(s.staffDelta) && !any(s.bedDelta) && !anyMult && (Number(s.regionAcuity) || 1) === 1
}
